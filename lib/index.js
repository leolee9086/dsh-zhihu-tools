// lib/index.js — dsh-zhihu-tools 宿主半部(纯 ESM,零 @deepseek-ai 导入)。
// 惯例对齐部署内 dsh-tool-websearch:工具以纯对象定义经 ctx.tools.register 注册,
// UI 后端以 webServer.register({kind:'prefix'}) 提供本地 HTTP 路由,浏览器 fetch 直连。
// 网络用 Node 22 全局 fetch(undici),严格白名单仅允许 developer.zhihu.com / www.zhihu.com。
//
// 凭证持久化(平台正规缝,非自造存储):
// - Access Secret 走 CredentialRef 空间:ctx.credentials.set/unset/resolve/describe,
//   由 credentials-local provider 落盘 $DSH_HOME/.credentials.yaml (0600/0700),重启即恢复。
// - 网页会话 Cookie 走 CredentialKey 记录空间:credentialKey("zhihu-tools-static","session")
//   的 GrantRecord payload 经 modifyRecord 持久化;QR 登录成功后自动写入。
// 内存 state 只是每操作的解析缓存,权威在 credentials 服务。

import { readFileSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const name = "dsh-zhihu-tools";
const inject = ["tools", "webServer", "timer", "credentials"];

const SECRET_REF = "ZHIHU_ACCESS_SECRET"; // CredentialRef: ^[A-Za-z_][A-Za-z0-9_]*$
// 注意:此 key 保持 "zhihu-tools-static/session" 不变——包名虽已改为 dsh-zhihu-tools,
// 但这里一旦改名,platform 凭据里已存的网页会话就会读不到(登录态丢失)。它是存储键,不是包名。
const SESSION_KEY = "zhihu-tools-static/session"; // CredentialKey: <scope>/<id>,两段均 ^[a-z][a-z0-9-]*$
// 发布用凭证(官方 ZhihuPublisher 规范):与只读的 Access Secret 是两套东西。
// APP_KEY = 知乎主页 URL 里的用户名(免申请);APP_SECRET = 开放平台访问密钥(内测申请)。
const OPENAPI_KEY_REF = "ZHIHU_OPENAPI_APP_KEY";
const OPENAPI_SECRET_REF = "ZHIHU_OPENAPI_APP_SECRET";

const BASE = "https://developer.zhihu.com";
const WWW = "https://www.zhihu.com";
// 发布接口所在域(官方规范 BASE_URL 默认值,可用 ZHIHU_PUBLISH_BASE_URL 覆盖)。
const OPENAPI = "https://openapi.zhihu.com";
// 网页会话发布走专栏后台(参考 niudai/VSCode-Zhihu:建草稿→写草稿→发布,只需 cookie + x-xsrftoken)。
const ZHUANLAN = "https://zhuanlan.zhihu.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const API_PREFIX = "/api/zhihu";

const ALLOWED = [BASE, WWW, OPENAPI, ZHUANLAN];
function isAllowed(rawUrl) {
  const u = String(rawUrl).split("#")[0].split("?")[0];
  return ALLOWED.some((p) => u === p || u.startsWith(p + "/"));
}

const CODE_TEXT = {
  10001: "请求参数错误",
  20001: "鉴权失败(Access Secret 缺失、无效或无权限)",
  30001: "频率限制,请稍后重试",
  30002: "配额不足",
  40001: "幂等键与请求参数冲突",
  40002: "文件缺失或已过期",
  40003: "活跃任务数超限,请等待已有任务完成",
  40004: "知识库不存在",
  40005: "相同文件正在处理中,请稍后再试",
  40006: "文件解析失败",
  50002: "知识库检索失败,请稍后重试",
  90001: "平台内部错误",
};

function newState() {
  return {
    secret: null,
    secretSource: null,
    // 发布凭证(可选,与只读的 Access Secret 分开):
    // openapiKey/openapiSecret 只是每操作的解析缓存,权威来源见 resolveOpenApiCreds。
    openapiKey: null,
    openapiSecret: null,
    openapiSource: null,
    cookies: {},
    lastCheck: null,
    disposed: false,
    qr: { phase: "idle", token: null, image: null, diag: null, note: null },
  };
}

function maskSecret(s) {
  if (!s) return null;
  if (s.length <= 10) return s.slice(0, 2) + "****";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

function mergeSetCookie(state, lines) {
  for (const line of Array.isArray(lines) ? lines : []) {
    const semi = line.indexOf(";");
    const pair = (semi < 0 ? line : line.slice(0, semi)).trim();
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (!v || v === "deleted") delete state.cookies[k];
    else state.cookies[k] = v;
  }
}

function cookieHeader(state) {
  return Object.entries(state.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function zhFetch(state, url, opts = {}) {
  if (!isAllowed(url)) throw new Error("拒绝访问非知乎域名: " + url);
  const headers = {
    "User-Agent": UA,
    Accept: "application/json",
    ...(opts.headers || {}),
  };
  // bare: 官方的发布类 OpenAPI 用 X-App-Key + X-Sign 自证身份,既不需要 Access Secret
  // 的 Bearer,也不该带上网页会话 Cookie(那是另一套身份,混用可能被平台判为异常)。
  const bare = opts.bare === true;
  const apiRequest = !bare && url.startsWith(BASE);
  if (apiRequest && state.secret) {
    headers["Authorization"] = "Bearer " + state.secret;
    headers["X-Request-Timestamp"] = String(Math.floor(Date.now() / 1000));
  }
  const cookie = bare ? "" : cookieHeader(state);
  if (cookie) headers["Cookie"] = cookie;
  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), opts.timeoutMs || 45000);
  try {
    const init = { method: opts.method || "GET", headers, redirect: "manual", signal: ctl.signal };
    if (opts.body !== undefined) {
      init.body = opts.body;
      if (typeof opts.body === "string" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }
    const res = await fetch(url, init);
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    mergeSetCookie(state, setCookies);
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text.slice(0, 2000000), setCookies };
  } finally {
    clearTimeout(tid);
  }
}

function findSecretString(node, depth) {
  if (depth > 4 || node === null || node === undefined) return null;
  if (typeof node === "string") return /^[A-Za-z0-9_\-]{24,}$/.test(node) ? node : null;
  if (Array.isArray(node)) {
    for (const el of node) { const f = findSecretString(el, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof node === "object") {
    for (const k of Object.keys(node)) if (/secret|token/i.test(k)) { const f = findSecretString(node[k], depth + 1); if (f) return f; }
    for (const k of Object.keys(node)) { const f = findSecretString(node[k], depth + 1); if (f) return f; }
  }
  return null;
}

async function consoleUserInfo(state) {
  const r = await zhFetch(state, BASE + "/console/api/user_info", { headers: { Referer: BASE + "/", "Accept": "application/json" } });
  try { return JSON.parse(r.body); } catch { return null; }
}

async function huntSecret(state) {
  const candidates = ["/console/api/access_secret", "/console/api/access_secrets", "/console/api/v3/access_secret", "/console/api/v3/secrets"];
  for (const p of candidates) {
    if (state.disposed) return null;
    try {
      const r = await zhFetch(state, BASE + p, { headers: { Referer: BASE + "/profile", "Accept": "application/json" }, timeoutMs: 15000 });
      if (r.status !== 200) continue;
      let j = null;
      try { j = JSON.parse(r.body); } catch {}
      if (j && typeof j === "object" && j.success !== false) {
        const found = findSecretString(j, 0);
        if (found) return { path: p, secret: found };
      }
    } catch {
      // 候选端点可能不存在;继续。
    }
  }
  return null;
}

async function startQr(ctx, state) {
  const bid = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const baseHeaders = { Referer: WWW + "/signin", "x-requested-with": "fetch", Accept: "application/json" };
  const variants = [
    { ...baseHeaders, "Content-Type": "application/json", "x-du-bid": bid },
    { ...baseHeaders, "x-du-bid": bid },
    baseHeaders,
  ];
  let token = null;
  let image = null;
  let diag = null;
  for (const headers of variants) {
    if (state.disposed) break;
    try {
      const r = await zhFetch(state, WWW + "/api/v3/account/api/login/qrcode", {
        method: "POST",
        headers,
        body: headers["Content-Type"] ? "{}" : null,
        timeoutMs: 20000,
      });
      diag = { status: r.status, body: String(r.body || "").slice(0, 200) };
      if (r.ok && r.status === 200) {
        let j = null;
        try { j = JSON.parse(r.body); } catch {}
        const inner = j && typeof j === "object" && "data" in j ? j.data : j;
        const t = inner && (inner.token || inner.qr_id || inner.qr_token);
        if (typeof t === "string" && t) {
          token = t;
          image = inner.qr_image_url || inner.qr_image || inner.image_url || inner.qr_code || null;
          break;
        }
      }
    } catch {
      // 变体失败继续。
    }
  }
  if (!token) {
    state.qr = { phase: "failed", token: null, image: null, diag, note: "二维码创建失败" };
    return state.qr;
  }
  state.qr = { phase: "waiting", token, image: typeof image === "string" ? image : null, diag: null, note: null };
  void pollQr(ctx, state, token).catch(() => {});
  return state.qr;
}

async function pollQr(ctx, state, token) {
  const sleep = (ms) => (ctx.timer ? ctx.timer.timeout(ms) : new Promise((res) => setTimeout(res, ms)));
  for (let i = 0; i < 80; i++) {
    if (state.disposed || state.qr.token !== token) return;
    await sleep(1500);
    try {
      const r = await zhFetch(state, WWW + "/api/v3/account/api/login/qrcode/" + encodeURIComponent(token) + "/scan_info", {
        headers: { Referer: WWW + "/signin", Accept: "application/json" },
        timeoutMs: 15000,
      });
      if (state.cookies.z_c0) {
        state.qr = { ...state.qr, phase: "logged_in" };
        const ui = await consoleUserInfo(state);
        const found = await huntSecret(state);
        if (found) {
          state.secret = found.secret;
          state.secretSource = "qr-login-auto";
          if (credAvailable) {
            try { await credSetSecret(credentials, found.secret); } catch { /* 持久化失败不阻塞本次会话 */ }
          }
          await persistSession(ctx, state);
          state.qr = { ...state.qr, phase: "logged_in_with_secret", note: "二维码登录成功,密钥与会话均已持久化: " + found.path };
        } else {
          await persistSession(ctx, state);
          state.qr = { ...state.qr, note: "网页会话已建立并持久化;未能自动取得 Access Secret,请在设置页粘贴密钥完成最后一步" };
        }
        void ui;
        return;
      }
      let payload = null;
      try { payload = JSON.parse(r.body); } catch {}
      if (payload && typeof payload === "object" && payload.status === 1) state.qr = { ...state.qr, phase: "scanned" };
    } catch {
      // 单次轮询失败等下一轮。
    }
  }
  if (state.qr.token === token) state.qr = { ...state.qr, phase: "expired", note: "二维码超时未确认" };
}

function unwrapEnv(r) {
  let data = null;
  try { data = JSON.parse(r.body); } catch {}
  if (!data || typeof data !== "object") return { ok: false, error: "响应不是合法 JSON(HTTP " + r.status + ")" };
  const code = typeof data.Code === "number" ? data.Code : typeof data.code === "number" ? data.code : undefined;
  if (code === undefined || code === 0) return { ok: true, data: data.Data ?? data.data ?? null };
  // 诊断优先:服务器 Message 原文无条件展示;码表仅在没有原文时兜底,并附 HTTP 状态码。
  const msg = String(data.Message ?? data.message ?? "").trim();
  const label = CODE_TEXT[code];
  return {
    ok: false,
    code,
    httpStatus: r.status,
    error: msg ? msg + " [code " + code + ", HTTP " + r.status + "]" : (label || "平台错误码 " + code) + " [HTTP " + r.status + "]",
  };
}

function apiQuery(query) {
  const q = query || {};
  const parts = [];
  for (const k of Object.keys(q)) if (q[k] !== undefined && q[k] !== null && q[k] !== "") parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(q[k])));
  return parts.length ? "?" + parts.join("&") : "";
}

// 30001 的官方语义未经证实(未检索到权威文档)。实测历史:成功调用后静默 16 小时,
// 全部端点仍返回 30001,与「频率窗口」不符,更像是平台侧配额可用量为 0 的通用拒绝码。
// 此处仅做工程防护:对 developer.zhihu.com 的调用串行化 + 30001 退避重试一次;
// 真实失败原因以服务器返回的 Message 原文为准(unwrapEnv 已原样透出)。
const API_MIN_GAP_MS = 1200;
let apiChain = Promise.resolve();
let apiLastAt = 0;

function withPacing(task) {
  const run = async () => {
    const wait = apiLastAt + API_MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    apiLastAt = Date.now();
    return task();
  };
  const queued = apiChain.then(run, run);
  apiChain = queued.then(() => {}, () => {});
  return queued;
}

async function apiJson(state, pathname, opts = {}) {
  return withPacing(async () => {
    const qs = opts.query ? apiQuery(opts.query) : "";
    const url = BASE + pathname + qs;
    const headers = { ...(opts.headers || {}) };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const call = () => zhFetch(state, url, { method: opts.method || "GET", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, timeoutMs: opts.timeoutMs, redirect: "manual" }).then(unwrapEnv);
    let u = await call();
    if (!u.ok && u.code === 30001) {
      // 3 秒退避已远超最小间隔,无需再补等待。
      await new Promise((resolve) => setTimeout(resolve, 3000));
      u = await call();
    }
    return u;
  });
}

async function uploadFile(state, url, filePath, fields) {
  const fileName = filePath.replace(/\\/g, "/").split("/").pop() || "file.bin";
  const buf = readFileSync(filePath);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), fileName);
  for (const k of Object.keys(fields || {})) if (fields[k]) fd.append(k, fields[k]);
  const r = await withPacing(() => zhFetch(state, url, { method: "POST", body: fd, timeoutMs: 600000 }));
  let data = null;
  try { data = JSON.parse(r.body); } catch {}
  if (!data || typeof data !== "object") return { ok: false, error: "上传响应不是 JSON(HTTP " + r.status + ")" };
  const code = typeof data.Code === "number" ? data.Code : typeof data.code === "number" ? data.code : undefined;
  if (code !== 0) return { ok: false, code, error: CODE_TEXT[code] ?? String(data.Message ?? "上传失败") };
  return { ok: true, data: data.Data ?? data.data ?? null };
}

async function pollTask(ctx, state, kind, taskId, budgetMs) {
  const sleep = (ms) => (ctx.timer ? ctx.timer.timeout(ms) : new Promise((res) => setTimeout(res, ms)));
  const deadline = Date.now() + budgetMs;
  let last = null;
  while (Date.now() < deadline) {
    if (state.disposed) throw new Error("插件已卸载");
    await sleep(3000);
    const u = await apiJson(state, "/api/v1/" + kind + "/tasks/" + encodeURIComponent(taskId));
    if (!u.ok) return { task_id: taskId, task_status: "unknown", error: u.error, last };
    last = u.data;
    const st = u.data && typeof u.data === "object" ? (u.data.task_status || u.data.TaskStatus) : undefined;
    if (st === "succeeded" || st === "failed") return u.data;
  }
  return { task_id: taskId, task_status: "timeout", detail: "轮询超时,可用 zhihu_task_query 查询", last };
}

// ── 工具定义工厂(与 dsh-tool-websearch 同构;返回字符串值)─────────────

function toolDef(toolName, description, parameters, execute, present) {
  return {
    name: toolName,
    description,
    parameters,
    output: {
      schema: { type: "string" },
      render(_a, v) { return [{ type: "text", text: String(v) }]; },
    },
    execute,
    ...(present ? { presentCall: present } : {}),
  };
}

const JSON_TEXT_LIMIT = 16000;
const JSON_TEXT_PRESETS = [
  [1200, 20],
  [800, 16],
  [500, 12],
  [320, 8],
  [180, 5],
  [96, 3],
];

function compactJson(value, maxStringChars, maxArrayItems) {
  if (typeof value === "string") {
    return value.length <= maxStringChars ? value : value.slice(0, maxStringChars) + "\n…(已截断)";
  }
  if (Array.isArray(value)) return value.slice(0, maxArrayItems).map((item) => compactJson(item, maxStringChars, maxArrayItems));
  if (value && typeof value === "object") {
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = compactJson(value[key], maxStringChars, maxArrayItems);
    return copy;
  }
  return value;
}

function jsonText(data) {
  const full = JSON.stringify(data, null, 2);
  if (typeof full === "string" && full.length <= JSON_TEXT_LIMIT) return full;

  // Preserve a parseable response shape so result cards can render large payloads.
  for (const [maxStringChars, maxArrayItems] of JSON_TEXT_PRESETS) {
    const compact = compactJson(data, maxStringChars, maxArrayItems);
    const marked = compact && typeof compact === "object" && !Array.isArray(compact)
      ? { ...compact, Truncated: true }
      : { Value: compact, Truncated: true };
    const text = JSON.stringify(marked, null, 2);
    if (text.length <= JSON_TEXT_LIMIT) return text;
  }

  return JSON.stringify({
    Truncated: true,
    Message: "响应内容过大，已省略详细字段。请缩小 count 或增加筛选条件后重试。",
  }, null, 2);
}

function num(args, key, fallback, min, max) {
  const v = args && args[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : fallback;
}
function str(args, key, fallback = "") {
  const v = args && args[key];
  return typeof v === "string" ? v : fallback;
}

async function probe(state) {
  if (!state.secret) return { configured: false, valid: false, source: null, hint: "未配置 Access Secret" };
  try {
    const u = await apiJson(state, "/api/v1/content/hot_list", { query: { Limit: "1" }, timeoutMs: 20000 });
    return {
      configured: true,
      source: state.secretSource,
      valid: u.ok === true,
      ...(u.ok ? {} : { platformCode: u.code, httpStatus: u.httpStatus ?? "无 JSON 响应" }),
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    return { configured: true, source: state.secretSource, valid: false, error: e && e.message ? e.message : String(e), checkedAt: new Date().toISOString() };
  }
}

// ── 发布能力:对齐官方 zhihu/ZhihuPublisher 的 Publish OpenAPI ──────────────
//
// 一手来源:github.com/zhihu/ZhihuPublisher 的 zhihu-publish/reference/publish-openapi.md
//   POST https://openapi.zhihu.com/openapi/publish
//   签名串 = app_key:{X-App-Key}|ts:{X-Timestamp}|logid:{X-Log-Id}|extra_info:{X-Extra-Info}
//   X-Sign = Base64(HMAC-SHA256(签名串, ZHIHU_OPENAPI_APP_SECRET))
// 三个必须遵守的细节:
//   1. X-Extra-Info 即使为空串也必须发送该 header,并且已经参与签名计算;
//   2. HTTP 200 不代表发布成功,必须看 body JSON 的 status === 0;成功时 data.url 才是文章地址;
//   3. 密钥与 X-Sign 绝不写入任何产物、日志或工具返回值。

/** 读取发布凭证。优先级:插件缓存(credentials 缝) > 环境变量 > 官方共享文件。 */
function resolveOpenApiCreds(state) {
  if (state.openapiKey && state.openapiSecret) {
    return { key: state.openapiKey, secret: state.openapiSecret, source: state.openapiSource || "stored" };
  }
  let key = String(process.env.ZHIHU_OPENAPI_APP_KEY || "").trim();
  let secret = String(process.env.ZHIHU_OPENAPI_APP_SECRET || "").trim();
  if (key && secret) return { key, secret, source: "env" };
  try {
    // 官方推荐的共享凭证文件,供多个知乎 OpenAPI skill 复用(文件权限应为仅当前用户可读写)。
    const raw = readFileSync(join(homedir(), ".zhihu", "openapi-credentials.json"), "utf8");
    const j = JSON.parse(raw);
    if (!key) key = String(j.ZHIHU_OPENAPI_APP_KEY || "").trim();
    if (!secret) secret = String(j.ZHIHU_OPENAPI_APP_SECRET || "").trim();
    if (key && secret) return { key, secret, source: "shared-file" };
  } catch {
    // 文件不存在或不可解析,按未配置处理。
  }
  return null;
}

/** 生成 X-Sign。密钥只在内存里参与一次 HMAC,不落盘、不回显。 */
function makePublishSign(appKey, appSecret, ts, logId, extraInfo) {
  const signString = "app_key:" + appKey + "|ts:" + ts + "|logid:" + logId + "|extra_info:" + extraInfo;
  return createHmac("sha256", appSecret).update(signString, "utf8").digest("base64");
}

/** 调用发布 OpenAPI。成功判定只认 body.status === 0。 */
async function publishOpenApi(state, envelope) {
  const creds = resolveOpenApiCreds(state);
  if (!creds) {
    return {
      ok: false,
      error: "未配置发布凭证。需要 ZHIHU_OPENAPI_APP_KEY(你的知乎主页用户名)+ ZHIHU_OPENAPI_APP_SECRET(去 https://www.zhihu.com/playground/zhihu-publisher 申请)。可设同名环境变量,或写入 ~/.zhihu/openapi-credentials.json。",
    };
  }
  const base = String(process.env.ZHIHU_PUBLISH_BASE_URL || OPENAPI).replace(/\/+$/, "");
  if (!isAllowed(base)) return { ok: false, error: "ZHIHU_PUBLISH_BASE_URL 指向非白名单域名,已拒绝: " + base };

  const ts = String(Math.floor(Date.now() / 1000));
  const logId = "dsh-zhihu-tools-" + ts + "-" + randomBytes(4).toString("hex");
  const extraInfo = String(process.env.ZHIHU_PUBLISH_EXTRA_INFO || "");
  const sign = makePublishSign(creds.key, creds.secret, ts, logId, extraInfo);

  const r = await zhFetch(state, base + "/openapi/publish", {
    method: "POST",
    bare: true, // 不带只读那套的 Bearer 与网页 Cookie:发布身份由 X-App-Key + X-Sign 证明
    timeoutMs: 60000,
    headers: {
      "Content-Type": "application/json",
      "X-App-Key": creds.key,
      "X-Timestamp": ts,
      "X-Log-Id": logId,
      "X-Extra-Info": extraInfo,
      "X-Sign": sign,
    },
    body: JSON.stringify(envelope),
  });

  let body = null;
  try { body = JSON.parse(r.body); } catch {}
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      httpStatus: r.status,
      logId,
      credentialSource: creds.source,
      error: "发布响应不是合法 JSON(HTTP " + r.status + ")",
      raw: String(r.body || "").slice(0, 800),
    };
  }
  if (body.status === 0) {
    const d = body.data && typeof body.data === "object" ? body.data : {};
    return {
      ok: true,
      httpStatus: r.status,
      logId,
      credentialSource: creds.source,
      type: d.type || null,
      url: d.url || null,
      contentToken: d.content_token || null,
      msg: body.msg || "success",
    };
  }
  return {
    ok: false,
    httpStatus: r.status,
    logId,
    credentialSource: creds.source,
    platformStatus: body.status,
    error: String(body.msg || "发布失败(status=" + String(body.status) + ")"),
    hint:
      r.status === 401
        ? "鉴权失败:确认 APP_KEY 是你的知乎主页用户名、APP_SECRET 有效且未泄露后重置"
        : r.status === 429
          ? "发布频率超限:官方 skill 每人每天最多发布 50 次"
          : null,
  };
}

/**
 * 网页会话发布(参考 niudai/VSCode-Zhihu 的实现):建草稿 → 写草稿 → 发布,三步。
 * 认证只要 cookie 里的 z_c0(登录态)与 _xsrf(CSRF),不需要 Access Secret,也不需要内测的 OpenAPI 密钥。
 * 返回结构刻意与 publishOpenApi 对齐,便于上层统一处理。
 */
async function publishArticleViaSession(state, { title, html, commentPermission }) {
  if (!state.cookies || !state.cookies.z_c0) {
    return { ok: false, error: "网页会话未登录:请先在设置页用二维码登录,或粘贴包含 z_c0 / _xsrf 的 cookie。" };
  }
  const xsrf = state.cookies._xsrf;
  if (!xsrf) {
    return { ok: false, error: "会话里缺少 _xsrf,过不了 CSRF 校验;请重新登录一次。" };
  }
  // 专栏后台是 same-origin 的写接口:除 cookie 外还要带 x-xsrftoken 与来源头。
  const baseHeaders = {
    "Content-Type": "application/json",
    "x-xsrftoken": xsrf,
    "x-requested-with": "fetch",
    Origin: ZHUANLAN,
    Referer: ZHUANLAN + "/write",
  };
  const draftBase = ZHUANLAN + "/api/articles";
  // 网页接口的评论权限用 "anyone",官方 OpenAPI 那边叫 "all";两者枚举并不完全一致,
  // 这里只把已知的 all→anyone 做映射,其余原样透传交给平台判定。
  const comment = commentPermission === "all" || !commentPermission ? "anyone" : commentPermission;

  // ① 建草稿:官方前端也是先发一个占位标题,真正的标题在第②步写。
  const created = await zhFetch(state, draftBase + "/drafts", {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ title: "h", delta_time: 0 }),
    timeoutMs: 30000,
  });
  let draft = null;
  try { draft = JSON.parse(created.body); } catch {}
  const articleId = draft && (draft.id || (draft.data && draft.data.id));
  if (!articleId) {
    return {
      ok: false,
      httpStatus: created.status,
      error: "创建草稿失败(未拿到文章 id)",
      raw: String(created.body || "").slice(0, 500),
    };
  }

  // ② 写入正文与标题。content 是 HTML 字符串,语义同官方 OpenAPI 的 content.html。
  const patched = await zhFetch(state, draftBase + "/" + articleId + "/draft", {
    method: "PATCH",
    headers: baseHeaders,
    body: JSON.stringify({ content: html, title, isTitleImageFullScreen: false }),
    timeoutMs: 60000,
  });
  if (patched.status >= 300) {
    return {
      ok: false,
      httpStatus: patched.status,
      articleId,
      error: "写入草稿失败",
      raw: String(patched.body || "").slice(0, 500),
    };
  }

  // ③ 发布。不投专栏时 column 传 null。
  const published = await zhFetch(state, draftBase + "/" + articleId + "/publish", {
    method: "PUT",
    headers: baseHeaders,
    body: JSON.stringify({ column: null, commentPermission: comment }),
    timeoutMs: 60000,
  });
  if (published.status >= 300) {
    return {
      ok: false,
      httpStatus: published.status,
      articleId,
      error: "发布失败",
      raw: String(published.body || "").slice(0, 500),
    };
  }
  return {
    ok: true,
    httpStatus: published.status,
    articleId,
    url: ZHUANLAN + "/p/" + articleId,
    message: "发布成功",
  };
}

// ── credentials 缝封装:所有持久化读写都经 ctx.credentials ────────────

async function credSetSecret(credentials, secret) {
  await credentials.set(SECRET_REF, secret);
}

async function credUnsetSecret(credentials) {
  await credentials.unset(SECRET_REF);
}

async function credResolveSecret(credentials) {
  const resolved = await credentials.resolve(SECRET_REF);
  return resolved && typeof resolved.value === "string" ? { value: resolved.value, source: resolved.source } : null;
}

function grantPayloadOf(state) {
  return { kind: "grant", payload: { version: 1, cookies: state.cookies } };
}

async function persistSession(ctx, state) {
  const credentials = ctx.get("credentials");
  if (!credentials || typeof credentials.modifyRecord !== "function") return false;
  try {
    await credentials.modifyRecord(SESSION_KEY, async () => grantPayloadOf(state));
    return true;
  } catch {
    // 存储不可写(如只读层遮蔽)时会话仍留在内存,不影响本次运行。
    return false;
  }
}

async function loadPersistedSession(ctx, state) {
  const credentials = ctx.get("credentials");
  if (!credentials || typeof credentials.readRecord !== "function") return;
  try {
    const rec = await credentials.readRecord(SESSION_KEY);
    const payload = rec && rec.kind === "grant" && rec.payload && typeof rec.payload === "object" ? rec.payload : null;
    if (payload && payload.cookies && typeof payload.cookies === "object") {
      for (const k of Object.keys(payload.cookies)) {
        if (typeof payload.cookies[k] === "string" && payload.cookies[k]) state.cookies[k] = payload.cookies[k];
      }
    }
  } catch {
    // 记录缺失或不可读按无会话处理。
  }
}

function apply(ctx) {
  const state = newState();
  const credentials = ctx.get("credentials");
  const credAvailable = !!(credentials && typeof credentials.resolve === "function" && typeof credentials.set === "function");

  ctx.effect(() => () => {
    state.disposed = true;
    state.secret = null;
    state.secretSource = null;
  }, "zhihu-tools-static: drop in-memory caches on dispose");

  // 发布是不可撤销的外部副作用,所以「真正发布」必须由用户授权,而不是靠调用方自己传 confirm=true。
  // DSH 的 tools/pre-execute 正是为此设计的:返回 ask 会把决定权交给用户,只有 allowed-once 才放行;
  // 没有审批通道时平台会 fail closed(降级为拒绝),所以这里不需要额外兜底。
  // 只拦真正要发的调用:dry_run 与不带 confirm 的预览都是只读的,不该打扰用户。
  ctx.on("tools/pre-execute", async (exec, next) => {
    if (!exec || exec.name !== "zhihu_publish_article") return next();
    const args = exec.arguments || {};
    if (args.dry_run === true || args.confirm !== true) return next();
    const title = typeof args.title === "string" && args.title.trim() ? args.title.trim() : "(无标题)";
    return {
      kind: "ask",
      reason: "即将把文章《" + title + "》发布到知乎,该操作不可撤销。",
    };
  });

  // 启动即从平台凭据存储恢复持久化状态:Access Secret(ref 空间)+ 网页会话 Cookie(记录空间)。
  if (credAvailable) {
    void (async () => {
      try {
        const resolved = await credResolveSecret(credentials);
        if (resolved) {
          state.secret = resolved.value;
          state.secretSource = resolved.source === "env" ? "env" : "stored";
        }
      } catch { /* 未配置按无密钥处理 */ }
      // 发布凭证(可选):两个都拿到才算配置完整,否则回落到环境变量或 ~/.zhihu/openapi-credentials.json。
      try {
        const [k, s] = await Promise.all([
          credentials.resolve(OPENAPI_KEY_REF).catch(() => null),
          credentials.resolve(OPENAPI_SECRET_REF).catch(() => null),
        ]);
        const kv = k && typeof k.value === "string" ? k.value.trim() : "";
        const sv = s && typeof s.value === "string" ? s.value.trim() : "";
        if (kv && sv) {
          state.openapiKey = kv;
          state.openapiSecret = sv;
          state.openapiSource = "stored";
        }
      } catch { /* 未配置按无发布凭证处理 */ }
      await loadPersistedSession(ctx, state);
    })();
  }

  // 浏览器设置页本地 HTTP 路由(host 白名单):GET/DELETE 状态与会话,POST 配置与扫码。
  const webServer = ctx.get("webServer");
  if (webServer && typeof webServer.register === "function") {
    const json = (res, status, data) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    const trustedHost = (req) => {
      const hostname = String(((req.headers && req.headers.host) || "")).split(":")[0].toLowerCase();
      return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    };
    const readBody = async (req) => {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 65536) break;
      }
      return body;
    };
    ctx.effect(() => webServer.register({
      kind: "prefix",
      path: API_PREFIX,
      handler: async (req, res) => {
        try {
          if (!trustedHost(req)) {
            res.writeHead(403);
            res.end("forbidden");
            return;
          }
          const url = new URL(req.url || "/", "http://localhost");
          const method = (req.method || "GET").toUpperCase();
          const p = url.pathname;

          if (method === "GET" && p === API_PREFIX + "/state") {
            let storeInfo = null;
            if (credAvailable) {
              try { storeInfo = await credentials.describe(SECRET_REF); } catch { storeInfo = null; }
            }
            json(res, 200, {
              hasSecret: !!state.secret,
              maskedSecret: maskSecret(state.secret),
              source: state.secretSource,
              store: credAvailable && storeInfo ? { configured: storeInfo.configured === true, writable: storeInfo.writable === true, source: storeInfo.source ?? null } : null,
              cookieNames: Object.keys(state.cookies),
              lastCheck: state.lastCheck,
              qrPhase: state.qr.phase,
            });
            return;
          }
          if (method === "POST" && p === API_PREFIX + "/secret") {
            if (!credAvailable) {
              json(res, 500, { ok: false, error: "credentials 服务不可用,无法持久化密钥" });
              return;
            }
            let parsed = {};
            try { parsed = JSON.parse(await readBody(req) || "{}"); } catch {}
            const secret = String(parsed.secret || "").trim();
            if (!secret || secret.length < 16 || secret.length > 512) {
              json(res, 400, { ok: false, error: "Access Secret 长度需在 16-512 之间" });
              return;
            }
            try {
              await credSetSecret(credentials, secret);
            } catch (e) {
              const msg = e && e.message ? e.message : String(e);
              json(res, 409, { ok: false, error: "写入凭据存储失败: " + msg });
              return;
            }
            state.secret = secret;
            state.secretSource = "stored";
            const check = await probe(state);
            state.lastCheck = check;
            json(res, 200, { ok: true, persisted: true, check });
            return;
          }
          if (method === "DELETE" && p === API_PREFIX + "/secret") {
            if (credAvailable) {
              try { await credUnsetSecret(credentials); } catch (e) {
                json(res, 409, { ok: false, error: "清除凭据存储失败: " + (e && e.message ? e.message : String(e)) });
                return;
              }
            }
            state.secret = null;
            state.secretSource = null;
            json(res, 200, { ok: true, persisted: true });
            return;
          }
          if (method === "DELETE" && p === API_PREFIX + "/session") {
            state.cookies = {};
            state.qr = newState().qr;
            if (credAvailable) { try { await credentials.deleteRecord(SESSION_KEY); } catch { /* 记录本就不存在视为成功 */ } }
            json(res, 200, { ok: true, persisted: true });
            return;
          }
          if (method === "GET" && p === API_PREFIX + "/probe") {
            const check = await probe(state);
            state.lastCheck = check;
            json(res, 200, check);
            return;
          }
          if (method === "POST" && p === API_PREFIX + "/qr/start") {
            const view = await startQr(ctx, state);
            json(res, 200, view);
            return;
          }
          if (method === "GET" && p === API_PREFIX + "/qr/status") {
            json(res, 200, state.qr);
            return;
          }
          if (method === "POST" && p === API_PREFIX + "/sms") {
            json(res, 200, { ok: false, error: "SMS 登录待真机实测打通", hint: "请先用粘贴 Access Secret 方式完成验证" });
            return;
          }
          if (method === "POST" && p === API_PREFIX + "/password") {
            json(res, 200, { ok: false, error: "密码登录待真机实测打通:需 zsEncrypt 与 x-zse 签名", hint: "请先用粘贴 Access Secret 方式完成验证" });
            return;
          }
          json(res, 404, { ok: false, error: "not found" });
        } catch (error) {
          json(res, 500, { ok: false, error: error && error.message ? error.message : String(error) });
        }
      },
    }), "zhihu-tools-static: settings api routes");
  }

  // ── 17 个工具 ────────────────────────────────────────────────
  const tools = ctx.get("tools");
  if (!tools || typeof tools.register !== "function") return;

  const register = (def) => ctx.effect(() => tools.register(def), "zhihu-tools-static: tool " + def.name);

  register(toolDef(
    "zhihu_hot",
    "获取知乎热榜(官方数据开放平台)。返回标题/链接/缩略图/摘要列表。",
    { type: "object", properties: { limit: { type: "number", description: "返回数量 1-30,默认 30" } }, additionalProperties: false },
    async function execute(args) {
      try {
        const u = await apiJson(state, "/api/v1/content/hot_list", { query: { Limit: String(num(args, "limit", 30, 1, 30)) } });
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    () => ({ card: "generic", title: "知乎热榜", kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_search",
    "知乎站内搜索(官方数据开放平台)。返回相关问题/回答/文章及赞同数、评论数。",
    { type: "object", properties: { query: { type: "string", description: "搜索关键词" }, count: { type: "number", description: "返回数量 1-10,默认 10" } }, required: ["query"], additionalProperties: false },
    async function execute(args) {
      try {
        const q = { Query: str(args, "query") };
        const c = num(args, "count", 10, 1, 10);
        if (c > 1) q.Count = String(c);
        const u = await apiJson(state, "/api/v1/content/zhihu_search", { query: q });
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "知乎搜索: " + str(a, "query", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_global_search",
    "全网搜索(官方数据开放平台)。支持 Filter 高级语法(host/publish_time)与索引库选择。",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词,2-100 字符" },
        count: { type: "number", description: "返回数量 1-20,默认 10" },
        filter: { type: "string", description: "高级语法筛选,如 host=='example.com' AND publish_time>=1778494631" },
        search_db: { type: "string", description: "索引库:all(默认)/realtime/static" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const q = { Query: str(args, "query") };
        const c = num(args, "count", 10, 1, 20);
        if (c > 1) q.Count = String(c);
        if (str(args, "filter")) q.Filter = str(args, "filter");
        if (str(args, "search_db")) q.SearchDB = str(args, "search_db");
        const u = await apiJson(state, "/api/v1/content/global_search", { query: q });
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "全网搜索: " + str(a, "query", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_ask",
    "知乎直答(zhida):对明确的问题快速获得综合回答,OpenAI 兼容接口。",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "问题内容" },
        model: { type: "string", description: "模型档位:zhida-fast-1p5(默认)/zhida-thinking-1p5/zhida-agent" },
        history: { type: "array", items: { type: "object" }, description: "可选多轮历史 [{role,content}],role 为 user 或 assistant" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        if (!state.secret) return "ERROR: 尚未配置凭证:打开「设置 → 知乎」粘贴 Access Secret,或用扫码方式登录后重试";
        const history = [];
        if (Array.isArray(args && args.history)) {
          for (const m of args.history) {
            if (m && typeof m.role === "string" && typeof m.content === "string") history.push({ role: m.role, content: m.content });
          }
        }
        const messages = [...history, { role: "user", content: str(args, "query") }];
        const r = await zhFetch(state, BASE + "/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: str(args, "model", "zhida-fast-1p5"), messages, stream: false }),
          timeoutMs: 240000,
        });
        let data = null;
        try { data = JSON.parse(r.body); } catch {}
        if (!data || typeof data !== "object") return "ERROR: 直答响应不是 JSON(HTTP " + r.status + ")";
        if (data.error && typeof data.error === "object") return "ERROR: 直答错误: " + (String(data.error.message || "") || JSON.stringify(data.error));
        const choice = Array.isArray(data.choices) ? data.choices[0] : null;
        const answer = choice && choice.message && typeof choice.message.content === "string" ? choice.message.content : null;
        if (!answer) return "ERROR: 直答响应缺少 choices[0].message.content";
        return jsonText({ model: data.model, answer, reasoning: choice.message.reasoning_content });
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "知乎直答: " + str(a, "query", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_kb_list",
    "列出直答知识库(scope=all/created/subscribed)。首次使用需先在 zhida.zhihu.com/repositories/square 初始化。",
    { type: "object", properties: { scope: { type: "string", description: "范围:all(默认)/created/subscribed" } }, additionalProperties: false },
    async function execute(args) {
      try {
        const q = {};
        if (str(args, "scope")) q.Scope = str(args, "scope");
        const u = await apiJson(state, "/api/v1/knowledge/bases", { query: q });
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    () => ({ card: "generic", title: "知识库列表", kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_kb_items",
    "分页列出指定知识库中的内容(Cursor 分页,HasMore 判断是否继续)。",
    {
      type: "object",
      properties: {
        knowledge_base_id: { type: "string", description: "知识库 ID" },
        cursor: { type: "string", description: "上一页返回的 NextCursor" },
        limit: { type: "number", description: "每页数量 1-20,默认 20" },
      },
      required: ["knowledge_base_id"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const q = {};
        if (str(args, "cursor")) q.Cursor = str(args, "cursor");
        const l = num(args, "limit", 20, 1, 20);
        if (l !== 20) q.Limit = String(l);
        const u = await apiJson(state, "/api/v1/knowledge/bases/" + encodeURIComponent(str(args, "knowledge_base_id")) + "/items", { query: q });
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "知识库条目: " + str(a, "knowledge_base_id", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_kb_upload",
    "上传本地文件到知识库(同步解析挂载)。支持 pdf/md/txt/ppt/pptx/xlsx/xls/docx/doc/webp/png/jpg/mobi/epub/csv/azw3,≤100MB。",
    {
      type: "object",
      properties: {
        file_path: { type: "string", description: "本地文件绝对路径" },
        knowledge_base_id: { type: "string", description: "目标知识库 ID;缺省进入默认知识库" },
      },
      required: ["file_path"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const fields = {};
        if (str(args, "knowledge_base_id")) fields.KnowledgeBaseID = str(args, "knowledge_base_id");
        const u = await uploadFile(state, BASE + "/api/v1/knowledge/files", str(args, "file_path"), fields);
        return u.ok ? jsonText({ ok: true, message: "上传成功", data: u.data }) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "上传知识库: " + str(a, "file_path", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_kb_search",
    "知识库 RAG 检索(KnowledgeBaseIDs 与 RecallScopes 至少一个非空,缺省限定个人库)。",
    {
      type: "object",
      properties: {
        query: { type: "string", description: "检索问题" },
        knowledge_base_ids: { type: "array", items: { type: "string" }, description: "知识库 ID 数组" },
        recall_scopes: { type: "array", items: { type: "string" }, description: "召回范围数组:personal/subscription/public" },
        limit: { type: "number", description: "返回文档数 1-10,默认 10" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const ids = Array.isArray(args && args.knowledge_base_ids) ? args.knowledge_base_ids.filter((v) => typeof v === "string") : [];
        const scopes = Array.isArray(args && args.recall_scopes) ? args.recall_scopes.filter((v) => typeof v === "string") : [];
        const body = { Query: str(args, "query") };
        if (ids.length) body.KnowledgeBaseIDs = ids;
        if (scopes.length) body.RecallScopes = scopes;
        if (!body.KnowledgeBaseIDs && !body.RecallScopes) body.RecallScopes = ["personal"];
        const l = num(args, "limit", 10, 1, 10);
        if (l !== 10) body.Limit = l;
        const u = await apiJson(state, "/api/v1/knowledge/search", { method: "POST", body });
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "知识库检索: " + str(a, "query", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_pdf_parse",
    "上传并异步解析本地 PDF:上传取 file_id → 建任务 → 轮询至终态,成功返回结果下载链接与任务详情。",
    {
      type: "object",
      properties: {
        file_path: { type: "string", description: "PDF 文件绝对路径,≤100MB" },
        wait: { type: "boolean", description: "是否轮询等待完成,默认 true;false 时只返回 task_id" },
        timeout_s: { type: "number", description: "轮询上限秒数,默认 120" },
      },
      required: ["file_path"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const filePath = str(args, "file_path");
        const up = await uploadFile(state, BASE + "/resources/v1/files", filePath, {});
        if (!up.ok || !up.data) return "ERROR: 文件上传失败: " + (up.error || JSON.stringify(up.data));
        const fileId = up.data.file_id || up.data.FileID;
        if (typeof fileId !== "string") return "ERROR: 上传响应缺少 file_id";
        const cr = await apiJson(state, "/api/v1/pdf-parse/tasks", { method: "POST", body: { file_id: fileId } });
        if (!cr.ok) return "ERROR: " + cr.error;
        const rec = cr.data && typeof cr.data === "object" ? cr.data : {};
        const taskId = rec.task_id || rec.TaskID;
        if (typeof taskId !== "string") return jsonText({ file_id: fileId, data: cr.data, message: "任务创建响应缺少 task_id" });
        if (args && args.wait === false) return jsonText({ file_id: fileId, task_id: taskId, task_status: "created" });
        const final = await pollTask(ctx, state, "pdf-parse", taskId, num(args, "timeout_s", 120, 1, 600) * 1000);
        return jsonText({ file_id: fileId, ...final });
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "PDF 解析: " + str(a, "file_path", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_ppt_generate",
    "由知乎回答/文章链接生成 PPT(异步任务):建任务 → 轮询至终态,成功返回 PPTX 下载链接。页数 6-21。",
    {
      type: "object",
      properties: {
        resource_url: { type: "string", description: "知乎回答或专栏文章链接" },
        num_pages: { type: "number", description: "期望页数 6-21,默认 12" },
        wait: { type: "boolean", description: "是否轮询等待完成,默认 true" },
        timeout_s: { type: "number", description: "轮询上限秒数,默认 180" },
      },
      required: ["resource_url"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const cr = await apiJson(state, "/api/v1/ppt-generation/tasks", {
          method: "POST",
          body: { resource_url: str(args, "resource_url"), num_pages: num(args, "num_pages", 12, 6, 21) },
        });
        if (!cr.ok) return "ERROR: " + cr.error;
        const rec = cr.data && typeof cr.data === "object" ? cr.data : {};
        const taskId = rec.task_id || rec.TaskID;
        if (typeof taskId !== "string") return jsonText({ data: cr.data, message: "任务创建响应缺少 task_id" });
        if (args && args.wait === false) return jsonText({ task_id: taskId, task_status: "created" });
        const final = await pollTask(ctx, state, "ppt-generation", taskId, num(args, "timeout_s", 180, 1, 900) * 1000);
        return jsonText(final);
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "PPT 生成: " + str(a, "resource_url", ""), kind: "execute" }),
  ));

  register(toolDef(
    "zhihu_task_query",
    "查询 PDF 解析或 PPT 生成任务的当前状态(kind=pdf_parse/ppt_generation)。",
    {
      type: "object",
      properties: {
        task_id: { type: "string", description: "任务 ID" },
        kind: { type: "string", description: "pdf_parse(默认)/ppt_generation" },
      },
      required: ["task_id"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const kind = str(args, "kind") === "ppt_generation" ? "ppt-generation" : "pdf-parse";
        const u = await apiJson(state, "/api/v1/" + kind + "/tasks/" + encodeURIComponent(str(args, "task_id")));
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "任务查询: " + str(a, "task_id", ""), kind: "execute" }),
  ));

  // 个人数据类工具:官方参考(api-ref.md L71-77)要求 PascalCase 查询参数
  // (Offset/Limit/ContentType/SortField/SortOrder/FavlistUrlToken),且 /contents 的
  // ContentType 与 /favlist_contents 的 FavlistUrlToken 为必填;参数名映射见 extraQuery。
  const userTool = (toolName, description, extraProps, pathname, title, extraQuery, requiredQuery) => register(toolDef(
    toolName,
    description,
    { type: "object", properties: { offset: { type: "string", description: "分页偏移量,翻页传 Paging.NextOffset" }, limit: { type: "number", description: "数量 1-50,默认 20" }, ...(extraProps || {}) }, ...(requiredQuery && requiredQuery.length ? { required: requiredQuery } : {}), additionalProperties: false },
    async function execute(args) {
      try {
        const q = {};
        if (str(args, "offset")) q.Offset = str(args, "offset");
        q.Limit = String(num(args, "limit", 20, 1, 50));
        for (const k of Object.keys(extraProps || {})) if (str(args, k)) q[extraQuery && extraQuery[k] ? extraQuery[k] : k] = str(args, k);
        const u = await apiJson(state, pathname, { query: q });
        return u.ok ? jsonText(u.data) : "ERROR: " + u.error;
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    () => ({ card: "generic", title, kind: "execute" }),
  ));

  userTool("zhihu_my_contents", "获取本人创作内容(回答/文章/视频/想法/问题)。ContentType 必填:all/answer/article/zvideo/pin/question。", { content_type: { type: "string", enum: ["all", "answer", "article", "zvideo", "pin", "question"], description: "内容类型(必填)" }, sort_field: { type: "string", enum: ["like_count", "ts"], description: "排序字段(默认 ts)" }, sort_order: { type: "string", enum: ["asc", "desc"], description: "排序方向(默认 desc)" } }, "/api/v1/user/contents", "我的创作", { content_type: "ContentType", sort_field: "SortField", sort_order: "SortOrder" }, ["content_type"]);
  userTool("zhihu_my_followees", "获取本人的关注列表(分页)。仅限 Access Secret 所属账号。", null, "/api/v1/user/followees", "我的关注");
  userTool("zhihu_my_collections", "获取本人近期收藏。仅限 Access Secret 所属账号。", null, "/api/v1/user/collections", "我的收藏");
  userTool("zhihu_my_favlists", "获取本人的收藏夹列表。仅限 Access Secret 所属账号。", null, "/api/v1/user/favlists", "我的收藏夹");
  userTool("zhihu_favlist_contents", "获取本人指定收藏夹的内容(FavlistUrlToken 从 zhihu_my_favlists 获得,必填)。", { favlist_url_token: { type: "string", description: "收藏夹 url_token(必填)" } }, "/api/v1/user/favlist_contents", "收藏夹内容", { favlist_url_token: "FavlistUrlToken" }, ["favlist_url_token"]);

  register(toolDef(
    "zhihu_auth_status",
    "检测当前凭证配置与有效性(hot_list Limit=1 探测),回显登录方式。无参数。",
    { type: "object", properties: {}, additionalProperties: false },
    async function execute() {
      try {
        const check = await probe(state);
        state.lastCheck = check;
        return jsonText(check);
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    () => ({ card: "generic", title: "知乎凭证检测", kind: "execute" }),
  ));

  // ── 发布类工具(官方 Publish OpenAPI)──────────────────────────────────
  //
  // 设计取舍:发布不可撤销,所以本工具默认「不发布」。
  //   不传 confirm → 回显将要发送的完整请求体 + 凭证来源,让人复核;
  //   传 dry_run   → 同上,但语义更明确;
  //   传 confirm=true → 才真正调用发布接口。
  // 这样 Agent 必须先给出一次可见的请求体,再由人点头,避免误发。
  register(toolDef(
    "zhihu_publish_article",
    "发布文章到知乎,支持两种授权:官方 Publish OpenAPI(需 ZHIHU_OPENAPI_APP_KEY/APP_SECRET)与网页会话(扫码登录后的 cookie)。必须显式传 confirm=true 才会真正发布。正文传 HTML(知乎后端直接收 HTML,不接受 Markdown)。",
    {
      type: "object",
      properties: {
        title: { type: "string", description: "文章标题(必填,不能为空)" },
        html: { type: "string", description: "文章正文 HTML(必填,不能为空)。如 <p>段落</p><h2>小标题</h2><ul><li>项</li></ul>" },
        auth_mode: { type: "string", enum: ["auto", "openapi", "session"], description: "授权方式:auto(默认,有 OpenAPI 凭证就用它,否则用网页会话)/ openapi(官方 Publish OpenAPI)/ session(网页会话,需已扫码登录)" },
        confirm: { type: "boolean", description: "必须显式传 true 才真正发布;不传或 false 时只回显请求体供复核" },
        dry_run: { type: "boolean", description: "仅组装并回显请求体,绝不发请求" },
        comment_permission: { type: "string", enum: ["all", "nobody", "followee", "censor", "follower"], description: "评论权限,默认 all(任何人都可以评论)" },
        table_of_contents_enabled: { type: "boolean", description: "是否生成文章目录,默认 false" },
        creation_statement: { type: "string", enum: ["spoiler", "medical_advice", "fictional_creation", "contain_finance", "ai_creation"], description: "创作声明;不传则完全不发送该字段。内容有 AI 参与时建议 ai_creation(不声明可能影响 AI 识别与分发)" },
        topics: { type: "array", items: { type: "string" }, description: "知乎话题链接(最多 3 个),如 https://www.zhihu.com/topic/19555547/hot" },
      },
      required: ["title", "html"],
      additionalProperties: false,
    },
    async function execute(args) {
      try {
        const title = str(args, "title").trim();
        const html = str(args, "html");
        if (!title) return "ERROR: title 不能为空";
        if (!html || !html.trim()) return "ERROR: html 正文不能为空";

        // 话题:官方只接受从话题链接提取的 token,topic_id 固定空串,最多 3 个。
        const topicTokens = [];
        if (Array.isArray(args && args.topics)) {
          for (const raw of args.topics) {
            if (typeof raw !== "string" || !raw.trim()) continue;
            const m = /\/topic\/(\d+)/.exec(raw.trim());
            if (!m) return "ERROR: 无法从话题链接提取 topic_token: " + raw + " (应形如 https://www.zhihu.com/topic/19555547/hot)";
            if (!topicTokens.includes(m[1])) topicTokens.push(m[1]);
          }
        }
        if (topicTokens.length > 3) return "ERROR: 话题最多 3 个,当前给了 " + topicTokens.length + " 个";

        const content = {
          title,
          html,
          comment_permission: str(args, "comment_permission", "all") || "all",
          table_of_contents_enabled: args && args.table_of_contents_enabled === true,
        };
        const statement = str(args, "creation_statement");
        if (statement) content.creation_statement = statement; // 不选就完全不发该字段,也不发空串
        if (topicTokens.length) {
          content.topics = topicTokens.map((t) => ({ topic_id: "", topic_token: t, topic_name: "" }));
        }

        const envelope = {
          type: "article",
          confirmed: true,
          confirm_note: "confirmed by user after local preview",
          content,
        };

        // 选路:auto 时优先官方 OpenAPI(若已配置凭证),否则回落到网页会话。
        const creds = resolveOpenApiCreds(state);
        const sessionReady = !!(state.cookies && state.cookies.z_c0 && state.cookies._xsrf);
        const requested = str(args, "auth_mode", "auto") || "auto";
        const mode = requested === "auto" ? (creds ? "openapi" : "session") : requested;
        if (mode === "openapi" && !creds) {
          return "ERROR: 指定了 openapi 授权,但没有可用的 ZHIHU_OPENAPI_APP_KEY / ZHIHU_OPENAPI_APP_SECRET。可改用 auth_mode=session 走网页会话。";
        }
        if (mode === "session" && !sessionReady) {
          return requested === "auto"
            ? "ERROR: 两条授权路都不可用——官方 OpenAPI 缺 ZHIHU_OPENAPI_APP_KEY / ZHIHU_OPENAPI_APP_SECRET,网页会话也未登录(缺 z_c0 或 _xsrf)。任选其一即可:① 配置 OpenAPI 凭证;② 在设置页扫码登录。"
            : "ERROR: 指定了 session 授权,但网页会话未就绪(缺 z_c0 或 _xsrf)。请先在设置页用二维码登录。";
        }

        const preview = {
          authMode: mode,
          authModeRequested: requested,
          openapi: {
            configured: !!creds,
            source: creds ? creds.source : null,
            appKey: creds ? creds.key : null, // APP_KEY 是公开信息(主页用户名);secret 与 X-Sign 永不回显
            endpoint: OPENAPI + "/openapi/publish",
          },
          session: {
            ready: sessionReady,
            cookieNames: Object.keys(state.cookies || {}),
            endpoint: ZHUANLAN + "/api/articles (drafts → draft → publish)",
          },
          request: envelope,
          bodyChars: html.length,
        };

        if (args && args.dry_run === true) return jsonText({ dry_run: true, ...preview });
        if (!(args && args.confirm === true)) {
          return jsonText({
            published: false,
            needConfirm: true,
            ...preview,
            hint: "先复核上面的 request 与选定的授权方式。确认无误后带 confirm=true 重新调用才会真正发布(发布不可撤销)。",
          });
        }

        const res = mode === "session"
          ? await publishArticleViaSession(state, {
              title,
              html,
              commentPermission: content.comment_permission,
            })
          : await publishOpenApi(state, envelope);

        if (res.ok) {
          return jsonText({
            published: true,
            authMode: mode,
            url: res.url,
            articleId: res.articleId || null,
            contentToken: res.contentToken || null,
            type: res.type || "article",
            httpStatus: res.httpStatus,
            logId: res.logId || null,
            credentialSource: res.credentialSource || null,
            message: "发布成功" + (res.url ? ": " + res.url : ""),
          });
        }
        return "ERROR: " + res.error
          + (res.hint ? " | " + res.hint : "")
          + (res.logId ? " (logId " + res.logId + ")" : "");
      } catch (e) { return "ERROR: " + (e && e.message ? e.message : String(e)); }
    },
    (a) => ({ card: "generic", title: "发布知乎文章: " + str(a, "title", ""), kind: "execute" }),
  ));
}

export { apply, inject, name };
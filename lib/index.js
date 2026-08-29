// lib/index.js — zhihu-tools-static 宿主半部(纯 ESM,零 @deepseek-ai 导入)。
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

const name = "zhihu-tools-static";
const inject = ["tools", "webServer", "timer", "credentials"];

const SECRET_REF = "ZHIHU_ACCESS_SECRET"; // CredentialRef: ^[A-Za-z_][A-Za-z0-9_]*$
const SESSION_KEY = "zhihu-tools-static/session"; // CredentialKey: <scope>/<id>,两段均 ^[a-z][a-z0-9-]*$

const BASE = "https://developer.zhihu.com";
const WWW = "https://www.zhihu.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const API_PREFIX = "/api/zhihu";

const ALLOWED = [BASE, WWW];
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
  const apiRequest = url.startsWith(BASE);
  if (apiRequest && state.secret) {
    headers["Authorization"] = "Bearer " + state.secret;
    headers["X-Request-Timestamp"] = String(Math.floor(Date.now() / 1000));
  }
  const cookie = cookieHeader(state);
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
}

export { apply, inject, name };
// lib/client.js — zhihu-tools-static 浏览器半部(手写 ModuleLoader 格式)。
// 宿主零导入，浏览器侧经 /api/zhihu/* 取数。工具卡片已按真实知乎数据结构重做排版
// （缩略图 / 作者 / 赞同 / 热榜排名），样式贴合 --dsw-alias-* 主题 token。
window.__ModuleLoader__.load({
	id: "zhihu-tools-static",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const inject = ["slots"];
		const API = "/api/zhihu";

		const S = {
			root: { display: "flex", flexDirection: "column", gap: "10px", width: "100%", minWidth: 0 },
			card: { display: "flex", flexDirection: "column", gap: "8px", width: "100%", minWidth: 0, padding: "12px 14px", borderRadius: "10px", border: "1px solid var(--dsw-alias-line-default, #e5e5e5)", background: "var(--dsw-alias-fill-secondary, #fff)" },
			h3: { color: "var(--dsw-alias-label-primary)", fontSize: "14px", fontWeight: 600, lineHeight: "22px", margin: 0 },
			muted: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", lineHeight: "18px" },
			thin: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px", wordBreak: "break-all" },
			row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", minWidth: 0 },
			kv: { display: "flex", gap: "8px", minWidth: 0 },
			kvb: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", minWidth: 72, fontWeight: 600, flex: "none" },
			input: { flex: 1, minWidth: 220, padding: "7px 10px", borderRadius: "8px", border: "1px solid var(--dsw-alias-line-default, #ccc)", background: "var(--dsw-alias-fill-primary, #fff)", color: "var(--dsw-alias-label-primary)", fontFamily: "var(--dsw-font-markdown-code-block-small, ui-monospace, monospace)", fontSize: "12px" },
			btn: { padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--dsw-alias-line-default, #ddd)", background: "var(--dsw-alias-fill-tertiary, #f6f6f6)", color: "var(--dsw-alias-label-primary)", cursor: "pointer", fontSize: "12px" },
			primary: { padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--dsw-alias-state-primary-default, #056de8)", background: "var(--dsw-alias-state-primary-default, #056de8)", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 600 },
			danger: { padding: "6px 12px", borderRadius: "8px", border: "1px solid var(--dsw-alias-state-error-primary, #c5221f)", color: "var(--dsw-alias-state-error-primary, #c5221f)", background: "var(--dsw-alias-fill-primary, #fff)", cursor: "pointer", fontSize: "12px" },
			notice: { color: "var(--dsw-alias-label-tertiary)", fontSize: "12px", lineHeight: "18px", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--dsw-alias-line-default, #eee)", background: "var(--dsw-alias-fill-tertiary, #fafafa)" },
			qr: { width: 180, height: 180, border: "1px solid var(--dsw-alias-line-default, #eee)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", overflow: "hidden" },
			qrImg: { width: "100%", height: "100%", objectFit: "contain" },
			badge: { display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 11, lineHeight: "16px", flex: "none" },
			pre: { whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px", fontFamily: "var(--dsw-font-markdown-code-block-small, ui-monospace, monospace)", maxHeight: 420, overflow: "auto" },
			// tool 卡片 — 严格隔离：仅本插件工具视图生效，不影响其他 toolview（尤其是 ask_user_question）
			toolWrap: { display: "flex", flexDirection: "column", width: "100%", minWidth: 0, borderRadius: 12, border: "1px solid var(--dsw-alias-line-default, #e8e8e8)", background: "var(--dsw-alias-fill-secondary, #fff)", overflow: "hidden", isolation: "isolate", contain: "content", boxSizing: "border-box" },
			toolHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px", background: "var(--dsw-alias-fill-primary, #fff)", borderBottom: "1px solid var(--dsw-alias-line-default, #eee)", minWidth: 0 },
			toolHeadL: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
			toolIcon: { width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#fff", flex: "none" },
			toolTitle: { fontSize: 13, fontWeight: 700, color: "var(--dsw-alias-label-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
			toolSub: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 },
			toolBody: { display: "flex", flexDirection: "column", minWidth: 0 },
			hotRow: { display: "flex", gap: 12, padding: "11px 14px", alignItems: "flex-start", borderBottom: "1px solid var(--dsw-alias-line-default, #f0f0f0)", textDecoration: "none", color: "inherit" },
			rank: { width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flex: "none", marginTop: 1 },
			thumb: { width: 56, height: 56, borderRadius: 8, objectFit: "cover", background: "var(--dsw-alias-fill-tertiary, #f2f2f2)", border: "1px solid var(--dsw-alias-line-default, #eee)", flex: "none" },
			itemTitle: { fontSize: 13, fontWeight: 600, lineHeight: "19px", color: "var(--dsw-alias-label-primary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
			itemSum: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 3 },
			meta: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 },
			pill: { display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 999, fontSize: 11, lineHeight: "16px", border: "1px solid var(--dsw-alias-line-default, #e8e8e8)", background: "var(--dsw-alias-fill-tertiary, #fafafa)", color: "var(--dsw-alias-label-secondary)" },
			pillStrong: { display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 999, fontSize: 11, lineHeight: "16px", border: "1px solid transparent", fontWeight: 600 },
			searchRow: { display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderBottom: "1px solid var(--dsw-alias-line-default, #f0f0f0)" },
			answerBody: { padding: "14px", fontSize: 13, lineHeight: "22px", color: "var(--dsw-alias-label-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" },
			skeleton: { height: 56, borderRadius: 8, background: "var(--dsw-alias-fill-tertiary, #f2f2f2)", opacity: 0.9 },
			foot: { padding: "8px 14px", fontSize: 11, color: "var(--dsw-alias-label-tertiary)", borderTop: "1px solid var(--dsw-alias-line-default, #f0f0f0)", background: "var(--dsw-alias-fill-primary, #fff)" },
			errorBox: { margin: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--dsw-alias-state-error-primary, #f5c6cb)", background: "var(--dsw-alias-state-error-fill, #fce8e6)", color: "var(--dsw-alias-state-error-primary, #a50e0e)", fontSize: 12, lineHeight: "18px", whiteSpace: "pre-wrap", wordBreak: "break-word" },
		};

		function tone(text, kind) {
			const m = {
				ok: { color: "var(--dsw-alias-state-success-primary, #137333)", bg: "var(--dsw-alias-state-success-fill, #e6f4ea)" },
				warn: { color: "var(--dsw-alias-state-warning-primary, #8a6d00)", bg: "var(--dsw-alias-state-warning-fill, #fef7e0)" },
				bad: { color: "var(--dsw-alias-state-error-primary, #a50e0e)", bg: "var(--dsw-alias-state-error-fill, #fce8e6)" },
				brand: { color: "#056de8", bg: "#e8f0fe" },
			}[kind] || { color: "var(--dsw-alias-label-secondary)", bg: "var(--dsw-alias-fill-tertiary, #f2f2f2)" };
			return react.createElement("span", { style: { ...S.badge, color: m.color, background: m.bg, border: "1px solid " + m.bg } }, text);
		}

		function parseArgs(raw) { try { return JSON.parse(raw || "{}"); } catch { return {}; } }
		function blockText(block) {
			const done = "kind" in block;
			if (!done) return { done: false, text: "", isError: false, argsRaw: block.argsRaw || "" };
			let t = "";
			for (const b of block.content || []) if (b.type === "text") t += b.text; else t += JSON.stringify(b);
			if (!t && block.error !== void 0) t = "ERROR: " + ((block.error && block.error.message) || block.error.code || "unknown");
			return { done: true, text: t, isError: block.isError === true, argsRaw: (block.call && block.call.argsRaw) || "" };
		}
		function tryJson(text) { try { const v = JSON.parse(text); return v; } catch { return null; } }
		function pickItems(parsed) {
			if (!parsed || typeof parsed !== "object") return null;
			if (Array.isArray(parsed.Items)) return parsed.Items;
			if (Array.isArray(parsed.items)) return parsed.items;
			if (Array.isArray(parsed.Data)) return parsed.Data;
			if (parsed.Data && Array.isArray(parsed.Data.Items)) return parsed.Data.Items;
			if (Array.isArray(parsed)) return parsed;
			return null;
		}

		// ── 知乎链接卡:整卡可点、新标签页打开原文;题图右置、两行截断、元信息一行 ──
		const RANK_COLORS = ["#f1403c", "#ff9607", "#ffb700"];
		const LINK = {
			row: { display: "flex", gap: 12, alignItems: "stretch", padding: "11px 14px", borderBottom: "1px solid var(--dsw-alias-line-default, #f2f2f2)", textDecoration: "none", color: "inherit", cursor: "pointer", minWidth: 0 },
			rankCol: { width: 20, flex: "none", textAlign: "center", fontSize: 14, fontWeight: 800, lineHeight: "20px", paddingTop: 1 },
			body: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 },
			title: { fontSize: 13, fontWeight: 600, lineHeight: "19px", margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
			sum: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-secondary)", margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
			metaRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0 },
			meta: { fontSize: 11, lineHeight: "16px", color: "var(--dsw-alias-label-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
			thumbWrap: { width: 72, height: 72, borderRadius: 8, overflow: "hidden", background: "var(--dsw-alias-fill-tertiary, #f2f2f2)", border: "1px solid var(--dsw-alias-line-default, #eee)", flex: "none", alignSelf: "center" },
			thumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
		};
		const HOVER_BG = "var(--dsw-alias-fill-hover, rgba(132,133,141,0.08))";
		const LINK_BLUE = "var(--dsw-alias-state-primary-default, #056de8)";

		function zhKindLabel(ct) {
			return ct === "Answer" ? "回答" : ct === "Article" ? "文章" : ct === "Question" ? "问题" : ct === "ZVideo" ? "视频" : ct === "Pin" ? "想法" : "";
		}

		function LinkCard(props) {
			const [hover, setHover] = react.useState(false);
			const it = props.item || {};
			const url = it.Url || it.url || "";
			const rank = props.rank;
			const rankColor = rank && rank <= 3 ? RANK_COLORS[rank - 1] : "var(--dsw-alias-label-quaternary, #c3c3c6)";
			const sum = props.sumText || it.Summary || it.ContentText || it.Excerpt || it.excerpt || "";
			const kl = props.kindLabel || zhKindLabel(it.ContentType || it.contentType || "");
			const metaParts = [];
			if (kl) metaParts.push(kl);
			if (it.AuthorName || it.authorName) metaParts.push(String(it.AuthorName || it.authorName) + (it.AuthorBadgeText ? " · " + it.AuthorBadgeText : ""));
			if (typeof it.VoteUpCount === "number") metaParts.push(it.VoteUpCount + " 赞同");
			if (typeof it.CommentCount === "number") metaParts.push(it.CommentCount + " 评论");
			if (!metaParts.length) metaParts.push(props.fallbackMeta || "点击查看原文");
			return react.createElement("a", {
				href: url || undefined,
				target: "_blank",
				rel: "noopener noreferrer",
				style: { ...LINK.row, background: hover ? HOVER_BG : "transparent", borderBottom: props.isLast ? "none" : LINK.row.borderBottom },
				onMouseEnter: () => setHover(true),
				onMouseLeave: () => setHover(false),
			},
				rank ? react.createElement("span", { style: { ...LINK.rankCol, color: rankColor } }, String(rank)) : null,
				react.createElement("span", { style: LINK.body },
					react.createElement("b", { style: { ...LINK.title, color: hover ? LINK_BLUE : "var(--dsw-alias-label-primary)" } }, it.Title || it.title || "(无标题)"),
					sum ? react.createElement("p", { style: LINK.sum }, String(sum).slice(0, 240)) : null,
					react.createElement("span", { style: LINK.metaRow },
						react.createElement("span", { style: LINK.meta }, metaParts.join(" · ")),
					),
				),
				(it.ThumbnailUrl || it.thumbnailUrl) ? react.createElement("span", { style: LINK.thumbWrap },
					react.createElement("img", { src: it.ThumbnailUrl || it.thumbnailUrl, alt: "", loading: "lazy", style: LINK.thumbImg, onError: (e) => { e.currentTarget.style.display = "none"; } }),
				) : null,
			);
		}

		// ── 设置页 ────────────────────────────────────────
		function ZhihuSettings() {
			const [st, setSt] = react.useState(null);
			const [secret, setSecret] = react.useState("");
			const [msg, setMsg] = react.useState("");
			const [busy, setBusy] = react.useState(false);
			const [qr, setQr] = react.useState(null);
			const refresh = react.useCallback(() => {
				fetch(API + "/state", { headers: { accept: "application/json" } }).then((r) => r.ok ? r.json() : null).then((s) => { if (s && typeof s === "object") setSt(s); }).catch(() => {});
			}, []);
			react.useEffect(() => { refresh(); }, [refresh]);
			const doSetSecret = () => {
				const v = secret.trim(); if (!v) { setMsg("请输入 Access Secret"); return; }
				if (v.length < 16 || v.length > 512) { setMsg("长度异常(需 16-512 字符)"); return; }
				setBusy(true); setMsg("校验中…");
				fetch(API + "/secret", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: v }) }).then((r) => r.json()).then((s) => {
					if (s && s.ok) setMsg(s.check && s.check.valid === true ? "✓ 校验通过" : "已保存,但线上校验未通过");
					else setMsg(s && s.error ? "保存失败: " + s.error : "保存失败");
					setSecret(""); refresh();
				}).catch((e) => setMsg("请求失败: " + String(e))).finally(() => setBusy(false));
			};
			const doProbe = () => { setBusy(true); setMsg("探测中…"); fetch(API + "/probe", { headers: { accept: "application/json" } }).then((r) => r.json()).then((s) => setMsg(s && s.valid === true ? "✓ 凭证有效" : "✗ 未通过: " + JSON.stringify(s))).catch((e) => setMsg("探测失败: " + String(e))).finally(() => { setBusy(false); refresh(); }); };
			const doClearSecret = () => fetch(API + "/secret", { method: "DELETE" }).then((r) => r.ok ? r.json() : null).then(() => { setMsg("已清除本进程内的 Access Secret"); refresh(); }).catch((e) => setMsg(String(e)));
			const doClearSession = () => fetch(API + "/session", { method: "DELETE" }).then((r) => r.ok ? r.json() : null).then(() => { setMsg("已清除网页会话"); setQr(null); refresh(); }).catch((e) => setMsg(String(e)));
			const doQrStart = () => { setBusy(true); setMsg("正在创建二维码…"); fetch(API + "/qr/start", { method: "POST" }).then((r) => r.json()).then((s) => { if (s && typeof s === "object") { setQr(s); setMsg(s.note || (s.phase === "failed" ? "二维码创建失败" : "请用知乎 App 扫码")); } }).catch((e) => setMsg("二维码失败: " + String(e))).finally(() => setBusy(false)); };
			const qrPhase = qr && qr.phase;
			react.useEffect(() => {
				if (!(qrPhase === "waiting" || qrPhase === "scanned")) return;
				const id = setInterval(() => fetch(API + "/qr/status", { headers: { accept: "application/json" } }).then((r) => r.ok ? r.json() : null).then((s) => { if (s && typeof s === "object") setQr(s); }).catch(() => {}), 1800);
				return () => clearInterval(id);
			}, [qrPhase]);
			const qrBadge = tone(qr && qr.phase ? qr.phase : "idle", qrPhase === "logged_in_with_secret" || qrPhase === "logged_in" ? "ok" : (qrPhase === "failed" || qrPhase === "expired" ? "bad" : "warn"));
			return react.createElement("div", { style: S.root },
				react.createElement("div", { style: S.notice }, "密钥经平台凭据服务加密落盘($DSH_HOME/.credentials.yaml,0600),重启自动恢复;网页会话 Cookie 同样持久化。"),
				react.createElement("div", { style: S.card },
					react.createElement("h3", { style: S.h3 }, "凭证状态"),
					!st ? react.createElement("div", { style: S.thin }, "加载中…") :
						react.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
							react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "已配置"), react.createElement("span", { style: S.thin }, st.hasSecret ? "是" : "否")),
							react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "脱敏密钥"), react.createElement("span", { style: S.thin }, st.maskedSecret || "—")),
							react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "来源"), react.createElement("span", { style: S.thin }, st.source || "—")),
							react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "持久层"), react.createElement("span", { style: S.thin }, st.store ? (st.store.configured ? "已存储" + (st.store.writable === false ? "(只读遮蔽)" : "") + " · " + (st.store.source || "store") : "未存储(可写)") : "credentials 服务不可用")),
							react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "Cookies"), react.createElement("span", { style: S.thin }, (st.cookieNames || []).join(", ") || "—")),
							st.lastCheck ? react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "上次校验"), react.createElement("span", { style: S.thin }, JSON.stringify(st.lastCheck))) : null,
						),
					react.createElement("div", { style: S.row },
						react.createElement("button", { style: S.btn, disabled: busy, onClick: doProbe }, busy ? "处理中…" : "探测有效性"),
						react.createElement("button", { style: S.danger, onClick: doClearSecret, disabled: !(st && st.hasSecret) }, "清除密钥"),
						react.createElement("button", { style: S.danger, onClick: doClearSession }, "清除会话"),
					),
					msg ? react.createElement("div", { style: S.thin }, msg) : null,
				),
				react.createElement("div", { style: S.card },
					react.createElement("h3", { style: S.h3 }, "粘贴 Access Secret"),
					react.createElement("div", { style: S.muted }, "前往 developer.zhihu.com 控制台复制 Access Secret,保存后自动以热榜探测校验。"),
					react.createElement("div", { style: S.row },
						react.createElement("input", { style: S.input, type: "password", placeholder: "粘贴 Access Secret(输入时不记录日志)", value: secret, onChange: (e) => setSecret(e.target.value), onKeyDown: (e) => { if (e.key === "Enter") doSetSecret(); } }),
						react.createElement("button", { style: S.primary, disabled: busy || !secret.trim(), onClick: doSetSecret }, busy ? "处理中…" : "保存并校验"),
					),
				),
				react.createElement("div", { style: S.card },
					react.createElement("h3", { style: S.h3 }, "手机扫码登录(实验性)"),
					react.createElement("div", { style: S.muted }, "创建知乎登录二维码,App 扫码后尝试自动拉取 Access Secret;若未自动获取仍可用粘贴方式。"),
					react.createElement("div", { style: S.row }, react.createElement("button", { style: S.primary, disabled: busy, onClick: doQrStart }, busy ? "创建中…" : "生成二维码"), qr ? qrBadge : null),
					qr && qr.image ? react.createElement("div", { style: S.qr }, react.createElement("img", { src: qr.image, alt: "QR", style: S.qrImg })) : (qr ? react.createElement("div", { style: S.thin }, "二维码图片: " + (qr.image || "无")) : null),
					qr && qr.note ? react.createElement("div", { style: S.muted }, qr.note) : null,
					qr && qr.diag ? react.createElement("pre", { style: S.pre }, JSON.stringify(qr.diag, null, 2)) : null,
				),
			);
		}

		// ── 原始参数查看器:所有卡片头部右侧统一的「{ }」展开按钮 ────
		function ArgsViewer(props) {
			const argsRaw = props.argsRaw || "";
			if (!argsRaw || argsRaw === "{}") return null;
			const [open, setOpen] = react.useState(false);
			return react.createElement("span", { style: { position: "relative", flex: "none", display: "inline-flex" } },
				react.createElement("button", {
					title: "原始工具调用参数",
					onClick: () => setOpen((v) => !v),
					style: { ...S.pill, cursor: "pointer", fontFamily: "var(--dsw-font-markdown-code-block-small, ui-monospace, monospace)", padding: "1px 8px" },
				}, "{ }"),
				open ? react.createElement("pre", {
					style: { position: "absolute", top: "22px", right: 0, zIndex: 30, margin: 0, minWidth: 220, maxWidth: 380, maxHeight: 260, overflow: "auto", padding: 8, borderRadius: 8, border: "1px solid var(--dsw-alias-line-default, #ddd)", background: "var(--dsw-alias-fill-primary, #fff)", color: "var(--dsw-alias-label-secondary)", fontSize: 11, lineHeight: "16px", whiteSpace: "pre-wrap", wordBreak: "break-all", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" },
				}, (() => { try { return JSON.stringify(JSON.parse(argsRaw), null, 2); } catch { return argsRaw; } })()) : null,
			);
		}

		// ── 工具卡片通用壳 ───────────────────────────────
		function ToolShell(props) {
			const title = props.title; const iconBg = props.iconBg || "#056de8"; const iconChar = props.iconChar || "知"; const badge = props.badge; const foot = props.foot;
			const head = react.createElement("div", { style: S.toolHead },
				react.createElement("div", { style: S.toolHeadL },
					react.createElement("span", { style: { ...S.toolIcon, background: iconBg } }, iconChar),
					react.createElement("span", { style: S.toolTitle }, title),
					badge || null,
				),
				react.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, flex: "none" } },
					props.headRight || null,
					props.argsRaw !== undefined ? react.createElement(ArgsViewer, { argsRaw: props.argsRaw }) : null,
				),
			);
			return react.createElement("div", { style: S.toolWrap }, head, react.createElement("div", { style: S.toolBody }, props.children), foot ? react.createElement("div", { style: S.foot }, foot) : null);
		}
		function ErrorView(text) { return react.createElement("div", { style: S.errorBox }, text); }
		function Skeleton() {
			return react.createElement("div", { style: { padding: 14, display: "flex", flexDirection: "column", gap: 10 } },
				react.createElement("div", { style: { ...S.skeleton, height: 62 } }),
				react.createElement("div", { style: { ...S.skeleton, height: 62, opacity: 0.7 } }),
				react.createElement("div", { style: { ...S.skeleton, height: 62, opacity: 0.45 } }),
			);
		}

		// ── 热榜 ────────────────────────────────────────
		function ZhihuHotView(props) {
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			const limitLabel = typeof args.limit === "number" ? "· 前 " + args.limit + " 条" : "";
			if (!bt.done) return react.createElement(ToolShell, { title: "知乎热榜 " + limitLabel, iconChar: "热", iconBg: "#ff3b30", badge: tone("加载中", "warn"), argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title: "知乎热榜", iconChar: "热", iconBg: "#ff3b30", badge: tone("失败", "bad"), argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text);
			const items = pickItems(data);
			if (!items || !items.length) return react.createElement(ToolShell, { title: "知乎热榜 " + limitLabel, iconChar: "热", iconBg: "#ff3b30", argsRaw: bt.argsRaw }, react.createElement("div", { style: S.errorBox }, bt.text.slice(0, 800) || "(空结果)"));
			const total = typeof data.Total === "number" ? data.Total : items.length;
			return react.createElement(ToolShell, { title: "知乎热榜 " + limitLabel, iconChar: "热", iconBg: "#ff3b30", badge: tone("共 " + total + " 条", "brand"), foot: "点击整卡在新标签页打开原文 · 排名按平台返回顺序", argsRaw: bt.argsRaw },
				items.map((it, i) => react.createElement(LinkCard, { key: String(i) + (it.Url || ""), item: it, rank: i + 1, isLast: i === items.length - 1 }))
			);
		}

		// ── 站内 / 全网搜索 ─────────────────────────────
		function ZhihuSearchView(props) {
			const isGlobal = props.isGlobal === true;
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			const q = args.query || "";
			const title = isGlobal ? "全网搜索" : "知乎搜索";
			const iconChar = isGlobal ? "全" : "搜";
			const iconBg = isGlobal ? "#0a84ff" : "#056de8";
			const headRight = q ? react.createElement("span", { style: S.toolSub }, '"' + String(q).slice(0, 28) + '"') : null;
			if (!bt.done) return react.createElement(ToolShell, { title, iconChar, iconBg, badge: tone("检索中", "warn"), headRight, argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title, iconChar, iconBg, badge: tone("失败", "bad"), headRight, argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text);
			const items = pickItems(data);
			if (!items || !items.length) return react.createElement(ToolShell, { title, iconChar, iconBg, headRight, argsRaw: bt.argsRaw }, react.createElement("div", { style: S.errorBox }, bt.text.slice(0, 1000) || "无结果"));
			const hasMore = data && data.HasMore === true;
			const truncated = data && data.Truncated === true;
			const badgeText = items.length + " 条" + (hasMore ? " · 还有更多" : "") + (truncated ? " · 已裁剪" : "");
			const foot = [
				data && data.SearchHashId ? "SearchHashId: " + data.SearchHashId : (hasMore ? "还有更多结果，可翻页" : ""),
				truncated ? "内容已结构化裁剪" : "",
			].filter(Boolean).join(" · ");
			return react.createElement(ToolShell, { title, iconChar, iconBg, badge: tone(badgeText, "brand"), headRight, foot, argsRaw: bt.argsRaw },
				items.map((it, i) => react.createElement(LinkCard, { key: String(i) + (it.Url || it.ContentID || ""), item: it, isLast: i === items.length - 1 }))
			);
		}

		// ── 直答 ────────────────────────────────────────
		function ZhihuAskView(props) {
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			const q = args.query || "";
			if (!bt.done) return react.createElement(ToolShell, { title: "知乎直答", iconChar: "答", iconBg: "#5856d6", badge: tone("思考中", "warn"), headRight: q ? react.createElement("span", { style: S.toolSub }, '"' + String(q).slice(0, 24) + '"') : null, argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title: "知乎直答", iconChar: "答", iconBg: "#5856d6", badge: tone("失败", "bad"), argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text);
			if (!data || typeof data.answer !== "string") return react.createElement(ToolShell, { title: "知乎直答", iconChar: "答", iconBg: "#5856d6", argsRaw: bt.argsRaw }, react.createElement("div", { style: S.errorBox }, bt.text.slice(0, 1200)));
			const model = typeof data.model === "string" ? data.model : (args.model || "zhida");
			const [showReason, setShowReason] = react.useState(false);
			return react.createElement(ToolShell, { title: "知乎直答", iconChar: "答", iconBg: "#5856d6", badge: tone(model, "brand"), headRight: q ? react.createElement("span", { style: S.toolSub }, '"' + String(q).slice(0, 24) + '"') : null, foot: "基于知乎直答 OpenAI 兼容接口 · stream:false", argsRaw: bt.argsRaw },
				react.createElement("div", { style: S.answerBody }, data.answer),
				typeof data.reasoning === "string" && data.reasoning ? react.createElement("div", { style: { borderTop: "1px solid var(--dsw-alias-line-default, #eee)", padding: "10px 14px", background: "var(--dsw-alias-fill-tertiary, #fafafa)" } },
					react.createElement("button", { onClick: () => setShowReason((v) => !v), style: { ...S.btn, padding: "4px 10px" } }, showReason ? "收起思考过程" : "展开思考过程"),
					showReason ? react.createElement("pre", { style: { ...S.pre, marginTop: 8, maxHeight: 320, background: "var(--dsw-alias-fill-primary, #fff)", padding: 10, borderRadius: 8, border: "1px solid var(--dsw-alias-line-default, #eee)" } }, data.reasoning) : null,
				) : null,
			);
		}

		// ── 通用数据视图:任意 JSON 的结构化渲染(知识库/任务/个人内容等)──
		function GenericRowsView(props) {
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			if (!bt.done) return react.createElement(ToolShell, { title: props.title, iconChar: props.iconChar, iconBg: props.iconBg, badge: tone("加载中", "warn"), headRight: props.subOf ? props.subOf(args) : null, argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title: props.title, iconChar: props.iconChar, iconBg: props.iconBg, badge: tone("失败", "bad"), argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text);
			const rows = [];
			const pushRow = (k, v) => rows.push([k, v]);
			const collect = (obj, prefix) => {
				for (const key of Object.keys(obj)) {
					const v = obj[key];
					if (v === null || v === undefined || v === "") continue;
					if (Array.isArray(v)) {
						if (!v.length) continue;
						rows.push([prefix + key, v.map((el) => (el && typeof el === "object" ? summarizeObj(el) : String(el)))]);
					} else if (typeof v === "object") {
						rows.push([prefix + key, summarizeObj(v)]);
					} else {
						pushRow(prefix + key, String(v));
					}
				}
			};
			if (data && typeof data === "object" && !Array.isArray(data)) collect(data, "");
			else if (Array.isArray(data)) data.forEach((el, i) => rows.push(["#" + (i + 1), typeof el === "object" ? summarizeObj(el) : String(el)]));
			else rows.push(["结果", bt.text.slice(0, 600)]);
			return react.createElement(ToolShell, { title: props.title, iconChar: props.iconChar, iconBg: props.iconBg, badge: tone(rows.length + " 项", "brand"), headRight: props.subOf ? props.subOf(args) : null, argsRaw: bt.argsRaw },
				react.createElement("div", { style: { padding: "6px 0", maxHeight: 420, overflowY: "auto" } },
					rows.map(([k, v], i) => react.createElement("div", { key: i, style: { display: "flex", gap: 10, padding: "7px 14px", borderBottom: i < rows.length - 1 ? "1px solid var(--dsw-alias-line-default, #f4f4f4)" : "none" } },
						react.createElement("span", { style: { ...S.kvb, minWidth: 92, paddingTop: 1 } }, k),
						react.createElement("span", { style: { ...S.thin, flex: 1, minWidth: 0 } }, Array.isArray(v) ? v.join(" · ") : v),
					)),
				)
			);
		}
		function summarizeObj(obj) {
			if (!obj || typeof obj !== "object") return String(obj);
			const keys = ["Title", "title", "Name", "name", "task_id", "TaskID", "file_id", "FileID", "id", "ID", "KnowledgeBaseID", "status", "Status", "task_status"];
			const parts = [];
			for (const k of keys) if (typeof obj[k] === "string" || typeof obj[k] === "number") parts.push(String(obj[k]));
			if (!parts.length) parts.push(JSON.stringify(obj).slice(0, 120));
			return parts.join(" · ");
		}

		// ── 知识库列表 ─────────────────────────────────
		function ZhihuKbListView(props) {
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			const scope = args.scope ? " · " + args.scope : "";
			if (!bt.done) return react.createElement(ToolShell, { title: "我的知识库" + scope, iconChar: "库", iconBg: "#34a853", badge: tone("加载中", "warn"), argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title: "我的知识库", iconChar: "库", iconBg: "#34a853", badge: tone("失败", "bad"), argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text);
			const items = pickItems(data);
			if (!items || !items.length) return react.createElement(ToolShell, { title: "我的知识库" + scope, iconChar: "库", iconBg: "#34a853", argsRaw: bt.argsRaw }, react.createElement("div", { style: S.errorBox }, "暂无知识库;首次使用请先在 zhida.zhihu.com/repositories/square 初始化"));
			return react.createElement(ToolShell, { title: "我的知识库" + scope, iconChar: "库", iconBg: "#34a853", badge: tone(items.length + " 个", "ok"), argsRaw: bt.argsRaw },
				items.map((it, i) => {
					const kbId = it.KnowledgeBaseID || it.knowledge_base_id || it.id || it.Id || "";
					const count = typeof it.DocCount === "number" ? it.DocCount : (typeof it.doc_count === "number" ? it.doc_count : null);
					return react.createElement("div", { key: kbId || i, style: S.searchRow },
						react.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8 } },
							react.createElement("span", { style: { width: 6, height: 6, borderRadius: 999, background: "#34a853", flex: "none" } }),
							react.createElement("b", { style: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)" } }, it.Name || it.name || "(未命名)"),
							count !== null ? tone(count + " 篇文档", "brand") : null,
						),
						it.Description || it.description ? react.createElement("span", { style: { ...S.itemSum, WebkitLineClamp: 2 } }, it.Description || it.description) : null,
						kbId ? react.createElement("span", { style: { ...S.pill, fontFamily: "var(--dsw-font-markdown-code-block-small, ui-monospace, monospace)", alignSelf: "flex-start" } }, kbId) : null,
					);
				})
			);
		}

		// ── 知识库检索(RAG)─────────────────────────────
		function ZhihuKbSearchView(props) {
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			if (!bt.done) return react.createElement(ToolShell, { title: "知识库检索", iconChar: "库", iconBg: "#34a853", badge: tone("检索中", "warn"), headRight: args.query ? react.createElement("span", { style: S.toolSub }, '"' + String(args.query).slice(0, 24) + '"') : null, argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title: "知识库检索", iconChar: "库", iconBg: "#34a853", badge: tone("失败", "bad"), argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text);
			let docs = pickItems(data);
			if (!docs) {
				for (const k of ["Documents", "documents", "Chunks", "chunks", "Results"]) if (data && Array.isArray(data[k])) { docs = data[k]; break; }
			}
			if (!docs || !docs.length) return react.createElement(ToolShell, { title: "知识库检索", iconChar: "库", iconBg: "#34a853", argsRaw: bt.argsRaw }, react.createElement("div", { style: S.errorBox }, bt.text.slice(0, 800) || "无召回结果"));
			return react.createElement(ToolShell, { title: "知识库检索", iconChar: "库", iconBg: "#34a853", badge: tone(docs.length + " 条召回", "ok"), foot: "按相关度排序 · 内容截断展示", argsRaw: bt.argsRaw },
				docs.map((d, i) => {
					const text = d.ContentText || d.content_text || d.Content || d.content || d.Text || d.text || d.Snippet || "";
					const src = d.Source || d.source || d.Title || d.title || d.FileName || d.file_name || "";
					return react.createElement("div", { key: i, style: S.searchRow },
						react.createElement("span", { style: { display: "flex", alignItems: "center", gap: 8 } },
							tone("#" + (i + 1), "brand"),
							src ? react.createElement("b", { style: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, src) : null,
							typeof d.Score === "number" || typeof d.score === "number" ? react.createElement("span", { style: { ...S.pill, fontFamily: "var(--dsw-font-markdown-code-block-small, ui-monospace, monospace)" } }, "score " + Number(d.Score ?? d.score).toFixed(3)) : null,
						),
						text ? react.createElement("span", { style: { ...S.itemSum, WebkitLineClamp: 4 } }, String(text).slice(0, 400)) : null,
					);
				})
			);
		}

		// ── 异步任务(pdf-parse / ppt-generation)────────
		function ZhihuTaskView(props) {
			const isPdf = props.isPdf === true;
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			const title = isPdf ? "PDF 解析" : "PPT 生成";
			const iconChar = isPdf ? "析" : "幻";
			const iconBg = isPdf ? "#ea4335" : "#9334e6";
			const sub = isPdf
				? (args.file_path ? react.createElement("span", { style: S.toolSub }, String(args.file_path).replace(/\\/g, "/").split("/").pop()) : null)
				: (args.resource_url ? react.createElement("span", { style: S.toolSub }, String(args.resource_url).slice(0, 32)) : null);
			if (!bt.done) return react.createElement(ToolShell, { title, iconChar, iconBg, badge: tone(isPdf ? "上传解析中" : "生成中", "warn"), headRight: sub, argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title, iconChar, iconBg, badge: tone("失败", "bad"), headRight: sub, argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text) || {};
			const status = data.task_status || data.TaskStatus || data.status || "unknown";
			const taskId = data.task_id || data.TaskID || "";
			const dl = data.result_url || data.ResultUrl || data.download_url || data.DownloadUrl || data.pptx_url || data.url || null;
			const stTone = status === "succeeded" ? "ok" : status === "failed" || status === "timeout" ? "bad" : "warn";
			return react.createElement(ToolShell, { title, iconChar, iconBg, badge: tone(status, stTone), headRight: sub, foot: taskId ? "任务 ID: " + taskId + " · 可用 zhihu_task_query 查询进度" : "", argsRaw: bt.argsRaw },
				dl ? react.createElement("a", { href: dl, target: "_blank", rel: "noreferrer", style: { margin: "12px 14px", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--dsw-alias-state-primary-default, #056de8)", background: "var(--dsw-alias-fill-primary, #fff)", color: "#056de8", textDecoration: "none", fontWeight: 600, fontSize: 13, display: "block" } }, isPdf ? "📄 打开解析结果" : "📊 下载 PPTX") : null,
				status !== "succeeded" && !dl ? react.createElement("div", { style: { padding: "14px", display: "flex", alignItems: "center", gap: 10 } },
					react.createElement("span", { style: { width: 10, height: 10, borderRadius: 999, background: "#f5a623", animation: "none", flex: "none" } }),
					react.createElement("span", { style: S.muted }, status === "failed" ? "任务失败,详情见原始输出" : "任务仍在进行中…"),
				) : null,
				Object.keys(data).length ? react.createElement("pre", { style: { ...S.pre, margin: "0 14px 12px", maxHeight: 200, padding: 10, borderRadius: 8, border: "1px solid var(--dsw-alias-line-default, #eee)", background: "var(--dsw-alias-fill-tertiary, #fafafa)" } }, JSON.stringify(data, null, 2)) : null,
			);
		}

		// ── 个人内容 / 关注 / 收藏 / 收藏夹内容 ──────────
		function ZhihuUserListView(props) {
			const kind = props.kind;
			const conf = {
				contents: { title: "我的创作", iconChar: "创", iconBg: "#056de8" },
				followees: { title: "我的关注", iconChar: "关", iconBg: "#0a84ff" },
				collections: { title: "我的收藏", iconChar: "藏", iconBg: "#f5a623" },
				favlists: { title: "我的收藏夹", iconChar: "夹", iconBg: "#e07b39" },
				favlistItems: { title: "收藏夹内容", iconChar: "夹", iconBg: "#e07b39" },
			}[kind] || { title: "知乎数据", iconChar: "知", iconBg: "#056de8" };
			const bt = blockText(props.block);
			const args = parseArgs(bt.argsRaw);
			const page = args.offset ? " · 后页" : "";
			if (!bt.done) return react.createElement(ToolShell, { title: conf.title + page, iconChar: conf.iconChar, iconBg: conf.iconBg, badge: tone("加载中", "warn"), argsRaw: bt.argsRaw }, Skeleton());
			if (bt.isError || bt.text.indexOf("ERROR:") === 0) return react.createElement(ToolShell, { title: conf.title, iconChar: conf.iconChar, iconBg: conf.iconBg, badge: tone("失败", "bad"), argsRaw: bt.argsRaw }, ErrorView(bt.text));
			const data = tryJson(bt.text);
			let items = pickItems(data);
			if (!items) for (const k of ["Data", "List", "list", "Favlists", "favlists"]) if (data && Array.isArray(data[k])) { items = data[k]; break; }
			if (!items || !items.length) return react.createElement(ToolShell, { title: conf.title + page, iconChar: conf.iconChar, iconBg: conf.iconBg, argsRaw: bt.argsRaw }, react.createElement("div", { style: S.errorBox }, "暂无数据"));
			const rowWrap = (key, url, inner) => url
				? react.createElement("a", { key, href: url, target: "_blank", rel: "noreferrer", style: { ...S.searchRow, textDecoration: "none", color: "inherit" } }, inner)
				: react.createElement("div", { key, style: S.searchRow }, inner);
			return react.createElement(ToolShell, { title: conf.title + page, iconChar: conf.iconChar, iconBg: conf.iconBg, badge: tone(items.length + " 条", "brand"), foot: data && data.Paging && data.Paging.IsEnd === false ? "还有更多,可传 offset 翻页" : "", argsRaw: bt.argsRaw },
				items.map((it, i) => {
					const url = it.Url || it.url || "";
					// 关注列表:头像 + 昵称 + 一句话简介 + 关注者数(平台字段 Fullname/AvatarUrl/Headline/FollowerCount)
					if (kind === "followees") {
						const name = it.Fullname || it.fullname || it.Name || it.name || it.UrlToken || "(未知用户)";
						const gender = Number(it.Gender) === 1 ? "♂" : Number(it.Gender) === 2 ? "♀" : null;
						return rowWrap(String(i), url,
							react.createElement("span", { style: { display: "flex", gap: 10, alignItems: "center", minWidth: 0 } },
								it.AvatarUrl ? react.createElement("img", { src: it.AvatarUrl, alt: "", style: { width: 34, height: 34, borderRadius: 999, objectFit: "cover", flex: "none" }, loading: "lazy", onError: (e) => { e.currentTarget.style.display = "none"; } }) : null,
								react.createElement("span", { style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } },
									react.createElement("span", { style: { display: "flex", gap: 6, alignItems: "center" } },
										react.createElement("b", { style: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)" } }, name),
										gender ? react.createElement("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)" } }, gender) : null,
									),
									it.Headline ? react.createElement("span", { style: { ...S.itemSum, WebkitLineClamp: 1 } }, String(it.Headline)) : null,
								),
								typeof it.FollowerCount === "number" ? react.createElement("span", { style: S.pill }, it.FollowerCount + " 关注者") : null,
							)
						);
					}
					// 收藏夹列表:名称 + 描述 + 公开/私密徽
					if (kind === "favlists") {
						const pub = it.IsPublic === true;
						return rowWrap(String(i), url,
							react.createElement("span", { style: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 } },
								react.createElement("span", { style: { display: "flex", gap: 6, alignItems: "center" } },
									tone(pub ? "公开" : "私密", pub ? "ok" : "warn"),
									react.createElement("b", { style: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)" } }, it.Title || it.title || "(未命名收藏夹)"),
								),
								it.Description || it.description ? react.createElement("span", { style: { ...S.itemSum, WebkitLineClamp: 2 } }, it.Description || it.description) : null,
							)
						);
					}
					// 创作/收藏/收藏夹内容:标题 + 摘要 + 类型药丸 + 计数元信息
					const ctRaw = String(it.ContentType || it.content_type || "");
					const ctMap = { answer: ["回答", "#e6f4ea", "#137333"], Answer: ["回答", "#e6f4ea", "#137333"], article: ["文章", "#e8f0fe", "#1a56db"], Article: ["文章", "#e8f0fe", "#1a56db"], zvideo: ["视频", "#fef7e0", "#8a6d00"], ZVideo: ["视频", "#fef7e0", "#8a6d00"], pin: ["想法", "#f3e8fd", "#7c3aed"], Pin: ["想法", "#f3e8fd", "#7c3aed"], question: ["问题", "#fff4e5", "#a05a00"], Question: ["问题", "#fff4e5", "#a05a00"] };
					const ct = ctMap[ctRaw] || null;
					const authorName = it.AuthorName || (it.Author && it.Author.Name) || "";
					const authorAvatar = it.AuthorAvatar || (it.Author && it.Author.Url ? "https://pic.zhimg.com/50/" + it.Author.UrlToken + "_l.jpg" : "") || "";
					const favTime = it.FavTime || it.fav_time;
					const upd = it.UpdatedTime || it.updated_time || it.EditTime || it.edit_time || it.CreatedAt || it.created_at;
					const title = it.Title || it.title || it.Name || it.name || summarizeObj(it);
					const excerpt = it.Excerpt || it.excerpt || it.Summary || it.summary || it.ContentText || it.content_text || "";
					const counts = [];
					for (const [label, key] of [["▲", "VoteUpCount"], ["▲", "voteup_count"], ["❤", "LikeCount"], ["❤", "like_count"], ["💬", "CommentCount"], ["💬", "comment_count"]]) {
						if (typeof it[key] === "number") counts.push(label + " " + it[key]);
					}
					if (typeof it.FavoriteCount === "number") counts.push("★ " + it.FavoriteCount);
					const body = react.createElement("span", { style: { flex: 1, minWidth: 0 } },
						react.createElement("span", { style: { display: "flex", gap: 6, alignItems: "center" } },
							ct ? react.createElement("span", { style: { ...S.pillStrong, background: ct[1], color: ct[2], flex: "none" } }, ct[0]) : null,
							react.createElement("span", { style: { ...S.itemTitle, WebkitLineClamp: 2 } }, title),
						),
						excerpt ? react.createElement("span", { style: { ...S.itemSum, WebkitLineClamp: 2 } }, String(excerpt).slice(0, 160)) : null,
						react.createElement("span", { style: S.meta },
							counts.map((m, j) => react.createElement("span", { key: j, style: S.pill }, m)),
							authorName ? react.createElement("span", { style: { ...S.pill, gap: 6 } },
								authorAvatar ? react.createElement("img", { src: authorAvatar, alt: "", style: { width: 14, height: 14, borderRadius: 999, objectFit: "cover" }, loading: "lazy", onError: (e) => { e.currentTarget.style.display = "none"; } }) : null,
								authorName,
							) : null,
							favTime || upd ? react.createElement("span", { style: { ...S.pill, fontFamily: "var(--dsw-font-markdown-code-block-small, ui-monospace, monospace)" } }, new Date(Number(favTime || upd) * 1000).toLocaleDateString()) : null,
						),
					);
					return rowWrap(String(i) + (url || ""), url, body);
				})
			);
		}

		// ── 凭证检测 ─────────────────────────────────────
		function ZhihuAuthView(props) {
			const bt = blockText(props.block);
			if (!bt.done) return react.createElement(ToolShell, { title: "凭证检测", iconChar: "证", iconBg: "#5f6368", badge: tone("检测中", "warn") }, Skeleton());
			const data = tryJson(bt.text) || {};
			const valid = data.valid === true;
			const configured = data.configured === true;
			return react.createElement(ToolShell, { title: "凭证检测", iconChar: "证", iconBg: valid ? "#137333" : "#c5221f", badge: tone(configured ? (valid ? "有效" : "无效") : "未配置", valid ? "ok" : configured ? "bad" : "warn"), foot: data.checkedAt ? "校验时间: " + data.checkedAt : "" },
				react.createElement("div", { style: { padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 } },
					react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "已配置"), react.createElement("span", { style: S.thin }, configured ? "是" : "否")),
					data.source ? react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "来源"), react.createElement("span", { style: S.thin }, data.source)) : null,
					data.platformCode !== undefined ? react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "平台码"), react.createElement("span", { style: S.thin }, String(data.platformCode) + (Number(data.platformCode) === 30001 ? "(频率限制,非鉴权问题)" : ""))) : null,
					data.hint || data.error ? react.createElement("div", { style: S.kv }, react.createElement("b", { style: S.kvb }, "说明"), react.createElement("span", { style: S.thin }, String(data.hint || data.error))) : null,
				)
			);
		}

		// ── 入口 ────────────────────────────────────────
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "zhihu", order: 30, label: "知乎" }, ZhihuSettings));
			ctx.slots.inject("tool.call.toolview", () => {
				const disposers = [];
				const reg = (key, comp) => disposers.push(ctx.slots.register({ name: "tool.call.toolview", key }, comp));
				reg("zhihu_hot", ZhihuHotView);
				reg("zhihu_search", (p) => react.createElement(ZhihuSearchView, { ...p, isGlobal: false }));
				reg("zhihu_global_search", (p) => react.createElement(ZhihuSearchView, { ...p, isGlobal: true }));
				reg("zhihu_ask", ZhihuAskView);
				reg("zhihu_kb_list", ZhihuKbListView);
				reg("zhihu_kb_items", GenericRowsView.bind(null, { title: "知识库条目", iconChar: "库", iconBg: "#34a853", subOf: (a) => a.knowledge_base_id ? react.createElement("span", { style: S.toolSub }, String(a.knowledge_base_id).slice(0, 20)) : null }));
				reg("zhihu_kb_upload", GenericRowsView.bind(null, { title: "上传知识库", iconChar: "库", iconBg: "#34a853", subOf: (a) => a.file_path ? react.createElement("span", { style: S.toolSub }, String(a.file_path).replace(/\\/g, "/").split("/").pop()) : null }));
				reg("zhihu_kb_search", ZhihuKbSearchView);
				reg("zhihu_pdf_parse", (p) => react.createElement(ZhihuTaskView, { ...p, isPdf: true }));
				reg("zhihu_ppt_generate", (p) => react.createElement(ZhihuTaskView, { ...p, isPdf: false }));
				reg("zhihu_task_query", GenericRowsView.bind(null, { title: "任务查询", iconChar: "析", iconBg: "#ea4335", subOf: (a) => a.task_id ? react.createElement("span", { style: S.toolSub }, String(a.task_id).slice(0, 24)) : null }));
				reg("zhihu_my_contents", (p) => react.createElement(ZhihuUserListView, { ...p, kind: "contents" }));
				reg("zhihu_my_followees", (p) => react.createElement(ZhihuUserListView, { ...p, kind: "followees" }));
				reg("zhihu_my_collections", (p) => react.createElement(ZhihuUserListView, { ...p, kind: "collections" }));
				reg("zhihu_my_favlists", (p) => react.createElement(ZhihuUserListView, { ...p, kind: "favlists" }));
				reg("zhihu_favlist_contents", (p) => react.createElement(ZhihuUserListView, { ...p, kind: "favlistItems" }));
				reg("zhihu_auth_status", ZhihuAuthView);
				return () => { for (const d of disposers) d(); };
			});
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
# 计划：zhihu_publish_article 收 Markdown

**时间**：2026-09-22
**起因**：只收 HTML 是个问题 —— 模型写 HTML 费劲、容易出错，Markdown 才是它的母语。
哥哥指定参考 s-forge 的"复制到知乎"。

## 要改的东西

`D:\dev\zhihu-plugin\lib\index.js` —— 手写源码，1403 行，**没有 src/，源码就在 lib/ 里**。

- 包名 `dsh-zhihu-tools` v0.2.0，**零依赖**（package.json 里没有 dependencies 段）
- `zhihu_publish_article` 定义在 **1239 行起**
- 现在：`html` 必填，`required: ["title", "html"]`
- 目标：收 `markdown`，内部转成知乎能接受的 HTML

发布链路（已读）：
```
args → 校验 → content = { title, html, comment_permission, table_of_contents_enabled }
     → envelope = { type:"article", confirmed:true, content }
     → 选路：auto 优先官方 OpenAPI，否则网页会话（专栏后台 建草稿→写草稿→发布）
```

## 参考实现（s-forge = 思源笔记的个人分叉）

目录：`D:\dev\s-forge\app\src\protyle\preview\`

### `zhihuAdapter.ts`（79 行，两个函数）

1. **表格**：知乎要求表头行在 `tbody` **内部**，不能有独立的 `thead`。
   把 `thead` 的第一行移到 `tbody` 开头（`insertAdjacentElement("afterbegin", ...)`），
   然后删掉 `thead`；没有 `tbody` 就整体包成 `<tbody>...</tbody>`。

2. **引用块**：把**连续的段落合并进 `blockquote`**。
   含图片的段落、非段落元素保持独立；嵌套引用递归处理。

### `platformCopy.ts`

3. **列表拍平**（`flattenUnsupportedLists(root, "zhihu")`）：
   知乎**不支持列表项里的** `img, pre, figure, table, blockquote, section`
   （微信少不支持一个 `img`）。
   只要某个 `<li>` 里有这些、**或者**有嵌套列表且内容块超过一个，
   就把**整个最外层列表**拍平成"段落 + 文字标记"：

   - 无序标记按深度轮换：`•` `◦` `▪` `▫`
   - 有序标记按深度：`1.` → `1)` → `A.` → `a.` → `i.`
   - 任务项：`✅ ` / `▢ `
   - 标记用 `<strong>` 包起来插到段落最前面
   - 深度 > 0 时加 `margin-left: depth*2em`

## 设计决策

- **零依赖**：package.json 没有 dependencies，所以 Markdown 解析器**自己写**，
  不引 marked / markdown-it。要覆盖：围栏代码块、标题、分割线、引用、有序/无序列表
  （含嵌套）、表格、段落；行内：代码、图片、链接、粗体、斜体、删除线。
- **参数**：`markdown` 为主，`html` 作为逃生舱保留（已经是知乎友好 HTML 就直接用）。
  两者至少给一个，执行时校验并给清楚的报错。
- 转换后**一律过一遍知乎适配**（表格 / 引用 / 列表三条），不管来源是 markdown 还是 html。
  —— 嗯，html 是逃生舱，跳过转换但不跳过适配更稳；待定，写的时候再定。

## 完成情况（2026-09-22）

**依赖**（哥哥纠正了两条：html 不挤掉、该引依赖就引）：

- **lute** —— 思源的 Markdown 引擎，npm 上没有任何分发，所以 vendored 进
  `lib/vendor/lute.cjs`（3.6MB，取自 `D:\dev\lute\javascript\lute.min.js`，版本 1.7.6）。
  **扩展名必须是 .cjs**：它是 GopherJS 产物，内部用 `require` 探测 Node 环境，而本包
  `package.json` 是 `"type": "module"` —— 叫 `.js` 会被当 ESM 加载，`require` 未定义，
  直接抛 `ReferenceError`。
- **linkedom** —— 标准 DOM API，用来照搬思源那套 DOM 适配（cheerio 是 jQuery 风格、
  jsdom 有 7MB，都不如它贴合）。
- 中途装过 marked，确认改用 lute 后已卸载。

**新增** `lib/zhihu-markdown.js`：`luteEngine()` / `adaptForZhihu(html)` /
`markdownToZhihuHtml(md)`。三条知乎规则里落地了两条（表格、列表拍平），
引用那条不用做 —— lute 本来就把连续段落合进同一个 blockquote。

**改** `lib/index.js` 的 `zhihu_publish_article`：

- schema 加 `markdown`，`html` 保留（两个都给时以 html 为准）
- `required` 从 `["title","html"]` 改成 `["title"]`，执行时校验"至少给一个"
- 两条路都过一遍 `adaptForZhihu`（适配幂等，已处理过的 html 再走一遍不变样）

**验证**（端到端，stub ctx 加载插件 → 取工具 → execute dry_run）：

- 18 个工具全部注册，`required = ["title"]`，properties 含 markdown/html
- 表格 → `<table><tbody><tr><th>a</th>…`（thead 已并入，空白也清了）
- 含图片的列表 → 整棵列表拍平成 `<p><strong>• </strong>…`
- 普通嵌套列表 → 不拍平（"有嵌套但内容块只有 1"，符合思源判据）
- 引用 → 保持 lute 原样

## 还没做

1. 插件没有测试框架（目录下没有 tests/），这次没加自动化测试。
2. 重新构建/发布：`lib/` 随仓库提交，改动要提交并升版本。
3. `dry_run` 目前也要凭证（授权检查在 dry_run 回显之前，是既有设计）——
   没凭证时连预览都看不到。要不要把 dry_run 提前，另说。

## 另一件事（没做完）

给 dsh-tool-gateway 写的那篇知乎稿已经写好并落盘：
`D:\dev\agent-tool-bloat-research\知乎稿-dsh-tool-gateway.html`
标题「工具装到 100 个以后，我发现问题不是上下文长度」。
**发布卡在授权上**：官方 OpenAPI 缺 `ZHIHU_OPENAPI_APP_KEY` / `ZHIHU_OPENAPI_APP_SECRET`，
网页会话也没登录（缺 `z_c0` / `_xsrf`）。需要在设置页扫码登录，或配 OpenAPI 凭证。

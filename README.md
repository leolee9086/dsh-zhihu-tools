# @leolee9086/zhihu-tools

知乎数据开放平台 (developer.zhihu.com) 静态双面 Cordis 插件，**零 `@deepseek-ai` 运行时导入**。宿主半部 17 个工具 + 本地设置 HTTP 路由，浏览器半部 `settings.section` 知乎设定页 + 4 张隔离式精美工具卡片。

> **联系作者**：逐暝（leolee9086）· 点击链接加入群聊【工具软件爱好者折腾群-综合讨论】：https://qm.qq.com/q/RAHJuyhQQ （群号 1017854502，群主 逐暝）

## 安装

```bash
dsh plugin --profile web add @leolee9086/zhihu-tools
# 或本地链入开发版
# dsh plugin --profile web add link:D:/dev/zhihu-plugin
```

重启 `dsh web` 并刷新 `http://127.0.0.1:3080` 后，`设置 → 知乎` 可配置凭证，工具 `zhihu_hot` 等可在对话中调用。

## 架构

```
lib/index.js   宿主：纯 ESM，仅 node:fs；ctx.tools.register 17 工具，经 webServer.register({kind:'prefix',path:'/api/zhihu'}) 提供设置后端；全局 fetch 白名单 developer.zhihu.com / www.zhihu.com，串行化 + 1.2s 间隔 + 30001 退避
lib/client.js  浏览器：手写 ModuleLoader factory (id: zhihu-tools-static)，require('react'), inject=['slots']，样式 --dsw-alias-* 且 toolWrap 用 isolation:isolate 严格隔离
cordis.patch.yml  包自带 bundle 补丁层
```

## 工具（17）

`zhihu_hot`、`zhihu_search`、`zhihu_global_search`、`zhihu_ask`、`zhihu_kb_list`、`zhihu_kb_items`、`zhihu_kb_upload`、`zhihu_kb_search`、`zhihu_pdf_parse`、`zhihu_ppt_generate`、`zhihu_task_query`、`zhihu_my_contents`、`zhihu_my_followees`、`zhihu_my_collections`、`zhihu_my_favlists`、`zhihu_favlist_contents`、`zhihu_auth_status`

卡片仅前 4 个定制（热榜排名/缩略图/作者头像/赞同评论），其余走通用卡片但仍可用。

## 设置后端

`GET /api/zhihu/state` · `POST /api/zhihu/secret` · `DELETE /api/zhihu/secret|session` · `GET /api/zhihu/probe` · `POST /api/zhihu/qr/start` 等，仅 127.0.0.1 可访。

## 安全

凭证仅内存，卸载即清；掩码 6…4；长度 16-512；严格白名单；全部 try/catch + disposed 守卫。

## 反馈

作者：逐暝 · QQ 群：1017854502 — https://qm.qq.com/q/RAHJuyhQQ

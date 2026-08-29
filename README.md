# @leolee9086/zhihu-tools

知乎数据开放平台 (developer.zhihu.com) 静态双面插件，宿主半部 17 个工具 + 本地设置页，浏览器半部知乎设定页 + 4 张精美工具卡片。

> **联系作者**：逐暝（leolee9086）· 点击链接加入群聊【工具软件爱好者折腾群-综合讨论】：https://qm.qq.com/q/RAHJuyhQQ （群号 1017854502，群主 逐暝）

## 安装

> **⚠️ 安全提示**：任何第三方插件——包括本插件——都应被视为天然不安全、不可信的代码。相比原样安装本插件，**更建议让你的 AI 参考本仓库源码自行重新实现**所需功能；若仍要安装，请先通读全部源码确认无恶意行为。

```bash
dsh plugin --profile web add @leolee9086/zhihu-tools
# 或本地链入开发版
# dsh plugin --profile web add link:D:/dev/zhihu-plugin
```

重启 `dsh web` 并刷新 `http://127.0.0.1:3080` 后，`设置 → 知乎` 可配置凭证，工具 `zhihu_hot` 等可在对话中调用。

## 界面截图

知乎热榜工具卡（真实运行结果）：

![知乎热榜工具卡](zhihu-hot-card.png)

## 架构

```
lib/index.js   宿主：17 工具，本地设置后端，白名单仅限知乎域名，内置限流与退避
lib/client.js  浏览器：ModuleLoader factory，手写卡片样式，工具视图严格隔离
cordis.patch.yml  包自带 bundle 补丁层
```

## 工具（17）

`zhihu_hot`、`zhihu_search`、`zhihu_global_search`、`zhihu_ask`、`zhihu_kb_list`、`zhihu_kb_items`、`zhihu_kb_upload`、`zhihu_kb_search`、`zhihu_pdf_parse`、`zhihu_ppt_generate`、`zhihu_task_query`、`zhihu_my_contents`、`zhihu_my_followees`、`zhihu_my_collections`、`zhihu_my_favlists`、`zhihu_favlist_contents`、`zhihu_auth_status`

17 个工具全部配备定制卡片：热榜（排名徽/缩略图）、搜索×2（类型药丸/作者/赞同评论/score）、直答（模型标签/思考过程折叠）、知识库列表与检索（文档数/召回评分）、任务类（状态徽/结果下载按钮）、个人数据五件套（分页元信息）、凭证检测（平台码解读）。

## 设置后端

`GET /api/zhihu/state` · `POST /api/zhihu/secret` · `DELETE /api/zhihu/secret|session` · `GET /api/zhihu/probe` · `POST /api/zhihu/qr/start` 等，仅 127.0.0.1 可访。

## 安全

- Access Secret 经平台凭据服务 `ctx.credentials` 持久化（`CredentialRef ZHIHU_ACCESS_SECRET` → `$DSH_HOME/.credentials.yaml`，0600/0700），重启自动恢复；设置页保存即落盘、清除即 `unset`。
- 网页会话 Cookie 以 `GrantRecord` 记录（`zhihu-tools-static/session`）经 `modifyRecord` 持久化，QR 登录成功自动写入，「清除会话」同步删除记录。
- 掩码 6…4 回显；长度 16-512 校验；严格域名白名单；全部 try/catch + disposed 守卫。

## 反馈

作者：逐暝 · QQ 群：1017854502 — https://qm.qq.com/q/RAHJuyhQQ

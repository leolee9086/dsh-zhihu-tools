# Zhihu Open Platform API Reference

Base: `https://developer.zhihu.com`. All requests need headers:
`Authorization: Bearer <access_secret>`, `X-Request-Timestamp: <unix_seconds>`, and `Content-Type: application/json` for JSON bodies.

Standard response envelope: `{"Code": 0, "Message": "success", "Data": ...}`.
Error codes: 0 ok · 10001 bad params · 20001 auth failed · 30001 rate limit · 30002 quota exhausted · 90001 internal error.

## 知乎搜索 — GET /api/v1/content/zhihu_search

Query params: `Query` (required), `Count` (1-10, default 10).

`Data`: `HasMore` (currently always false), `SearchHashId`, `EmptyReason`, `Items[]`.
Item: `Title`, `ContentType` (Answer/Article), `ContentID`, `ContentText` (may contain `<em>` highlights), `Url` (with utm params), `CommentCount`, `VoteUpCount`, `AuthorName`, `AuthorAvatar`, `AuthorBadge`, `AuthorBadgeText`, `EditTime` (unix sec), `AuthorityLevel` ("1"-"4"), `RankingScore`, `CommentInfoList[].Content`.

## 全网搜索 — GET /api/v1/content/global_search

Query params: `Query` (required), `Count` (1-20, default 10), `SearchDB` (`all`|`realtime`|`static`), `Filter` (URL-encoded advanced expression).

Filter syntax: `host=="example.com"` (`==`/`!=`, double-quoted strings; zhihu.com not supported — use zhihu_search), `publish_time>=1778494631` (unix sec, `== != > >= < <=`), combinable with uppercase `AND`/`OR` and parentheses; `AND` binds tighter.

Response: same Item shape as zhihu_search (no RankingScore). `AuthorityLevel`: 1 low / 2 mid / 3 high / 4 very high.

## 热榜 — GET /api/v1/content/hot_list

Query params: `Limit` (1-30, default 30).
`Data`: `Total`, `Items[]`: `Title`, `Url`, `ThumbnailUrl` (may be ""), `Summary` (may be "").

## 直答 — POST /v1/chat/completions

Note: URL has NO `/api` prefix. JSON body:

| field | required | notes |
| --- | --- | --- |
| `model` | yes | `zhida-fast-1p5` (fast) · `zhida-thinking-1p5` (deep) · `zhida-agent` (agent). Availability subject to tenant config. |
| `messages` | yes | `[{"role": "user", "content": "..."}]`; multi-turn supported by fast/thinking models |
| `stream` | no | default false |

Non-stream response: OpenAI-style `choices[0].message.content` plus optional `reasoning_content`.
Stream: SSE `data: {...}` chunks with `choices[0].delta.content`/`reasoning_content`, terminated by `data: [DONE]`; heartbeat lines `: keep-alive`; mid-stream errors carry `error` object and `finish_reason: "error"`.
Errors: `{"error": {"message", "type", "param", "code"}}`, e.g. `model_not_found`, `missing_required_parameter`.
Only `model`/`messages`/`stream` are officially supported fields.

## 知识库

First-time setup: https://zhida.zhihu.com/repositories/square

- **List bases** — GET `/api/v1/knowledge/bases`, optional `Scope`=`all`|`created`|`subscribed`. Item: `KnowledgeBaseID`, `Name`, `Description`, `Relation`, `IsDefault`, `Visibility`, `ContentCount`, `UpdatedAt`.
- **List items** — GET `/api/v1/knowledge/bases/{KnowledgeBaseID}/items`, optional `Cursor` (opaque, from prev response), `Limit` (1-20).
- **Upload file** — POST `/api/v1/knowledge/files`, `multipart/form-data` with field `File` (≤100MB; pdf md txt ppt pptx xlsx xls docx doc webp png jpg mobi epub csv azw3) and optional `KnowledgeBaseID` (default: user's default KB). Returns `KnowledgeBaseID`, `RecallContentID`, `FileName`.
- **RAG search** — POST `/api/v1/knowledge/search`. Body: `Query` (required), `KnowledgeBaseIDs` and/or `RecallScopes` (`personal`/`subscription`/`public`) — at least one required, union when both; `Limit` 1-10. Item: `Content[]` (matched passages), `KnowledgeBaseID`, `DocName`, `RecallContentID`, `OriginUrl`. Extra error code: `50002` retrieval failed, retry later.

## PDF 解析 (async)

1. Upload: POST `/resources/v1/files`, multipart field `file` (PDF only, ≤100MB) → `Data.file_id` (valid 24h).
2. Create task: POST `/api/v1/pdf-parse/tasks`, body `{"file_id": ...}`, optional header `Idempotency-Key` (same key + same params → same task_id; never reuse a key with different params → 40001) → `Data.task_id`, `task_status`.
3. Poll: GET `/api/v1/pdf-parse/tasks/{task_id}` → `task_status` (`pending`/`running`/`succeeded`/`failed`), `progress` (0-1), `result` (`url`, `summary`, `expires_at_ms`) or `error` (`code`, `message`).

Result JSON (download `result.url`; link expires quickly, re-query task to refresh): `schema_version`="v1", `pages[]`: `page` (0-based), `blocks[]`: `type` (`title`/`text`/`formula`/`figure`/…), `box` `[x1,y1,x2,y2]`, `content`, optional `image` (`media_type`, base64 `data`). Be tolerant of unknown block types.
Extra errors: 30002 quota · 40001 idempotency conflict · 40002 file missing/expired · 40003 too many active tasks.

## PPT 生成 (async)

1. Create: POST `/api/v1/ppt-generation/tasks`, body `{"resource_url": ..., "num_pages": 6-21}`. `resource_url` must be a Zhihu answer (`/question/{qid}/answer/{aid}` or `/answer/{aid}`) or article (`zhuanlan.zhihu.com/p/{id}`).
2. Poll: GET `/api/v1/ppt-generation/tasks/{task_id}` — same status/result/error shape as PDF parse; on success `result.url` downloads a PPTX.

## 知乎用户数据

All GET, base `/api/v1/user/`. Without `X-OAuth-Token` returns the caller's own data; with it, the OAuth-authorized user's data (see oauth.md). Paging: `Data.Paging.IsEnd`, `NextOffset` (use as next `Offset`), `Totals`.

| endpoint | params |
| --- | --- |
| `/contents` | `ContentType` (required: `all`/`answer`/`article`/`zvideo`/`pin`/`question`), `Offset`, `Limit` (≤50), `SortField` (`like_count`/`ts`, default `ts`), `SortOrder` (`asc`/`desc`) |
| `/followees` | `Offset`, `Limit` (≤50) |
| `/collections` | `Limit` |
| `/favlists` | `Limit` — items include `UrlToken` used by favlist_contents |
| `/favlist_contents` | `FavlistUrlToken` (required, from favlists), `Offset`, `Limit` |

Content item: `ContentType`, `Url`, `CreatedAt` (unix sec), `LikeCount`, `CommentCount`, `FavoriteCount`, `Title`, `Summary`.

# PDF 解析 API

## 接口说明

该接口用于异步解析 PDF 文件。调用方先上传 PDF 文件获取 `file_id`，再使用 `file_id` 创建解析任务。任务创建后可通过查询接口轮询任务状态，任务成功后返回结果下载链接。

## 调用流程

1. 上传 PDF 文件，获取 `file_id`。
2. 使用 `file_id` 创建 PDF 解析任务，获取 `task_id`。
3. 使用 `task_id` 轮询任务状态。
4. 当 `task_status=succeeded` 时，从 `result.url` 下载解析结果。

## 鉴权

Header：

- `Authorization: Bearer <your_access_secret>`
- `X-Request-Timestamp: <unix_seconds>`

说明：

- `X-Request-Timestamp` 为 Unix 秒级时间戳。
- 创建任务接口支持可选 Header：`Idempotency-Key`。同一个 `Idempotency-Key` 配合同一个请求参数重复调用时，会返回同一个 `task_id`。

## 1. 上传文件

### 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://developer.zhihu.com/resources/v1/files` |
| HTTP Method | `POST` |
| 请求类型 | `multipart/form-data` |
| 响应类型 | `application/json` |

### 请求参数

Form：

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `file` | File | 是 | PDF 文件，最大 100MB |

当前仅支持上传 PDF 文件。

### 响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "file_id": "file_00000000fb987230beba394fd8279daf"
  }
}
```

说明：

- `file_id` 是文件资源 ID，用于创建 PDF 解析任务。
- 上传后的文件需在 24 小时内用于创建任务。

### Curl 示例

```bash
curl -X POST 'https://developer.zhihu.com/resources/v1/files' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)" \
  -F 'file=@/path/to/example.pdf;type=application/pdf'
```

## 2. 创建 PDF 解析任务

### 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://developer.zhihu.com/api/v1/pdf-parse/tasks` |
| HTTP Method | `POST` |
| 请求类型 | `application/json` |
| 响应类型 | `application/json` |

### 请求参数

Body：

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `file_id` | String | 是 | 上传文件接口返回的文件资源 ID |

### 请求示例

```json
{
  "file_id": "file_00000000fb987230beba394fd8279daf"
}
```

### 响应参数

Data：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `task_id` | String | 是 | PDF 解析任务 ID |
| `task_status` | String | 是 | 任务状态，初始通常为 `pending` |

### 响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "pdf_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "pending"
  }
}
```

如果命中幂等重放，响应 Header 会包含：

```text
Idempotent-Replayed: true
```

### Curl 示例

```bash
curl -X POST 'https://developer.zhihu.com/api/v1/pdf-parse/tasks' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: pdf-request-001' \
  -d '{"file_id":"file_00000000fb987230beba394fd8279daf"}'
```

## 3. 查询 PDF 解析任务

### 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | `https://developer.zhihu.com/api/v1/pdf-parse/tasks/{task_id}` |
| HTTP Method | `GET` |
| 响应类型 | `application/json` |

### Path 参数

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `task_id` | String | 是 | 创建任务接口返回的任务 ID |

### 响应参数

Data：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `task_id` | String | 是 | PDF 解析任务 ID |
| `task_status` | String | 是 | 任务状态 |
| `progress` | Number | 是 | 任务进度，范围 0 到 1 |
| `result` | Object or Null | 是 | 任务成功后返回结果信息，未完成或失败时为 `null` |
| `error` | Object or Null | 是 | 任务失败时返回错误信息，未失败时为 `null` |

`task_status` 取值：

| 值 | 说明 |
| :- | :- |
| `pending` | 任务已创建，等待处理 |
| `running` | 任务处理中 |
| `succeeded` | 任务已成功 |
| `failed` | 任务失败 |

Result：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `url` | String | 是 | 解析结果下载链接 |
| `summary` | String | 否 | PDF 摘要，可能为空 |
| `expires_at_ms` | Int64 | 是 | 下载链接过期时间，毫秒级时间戳 |

Error：

| 名称 | 类型 | 是否必返 | 说明 |
| :- | :- | :- | :- |
| `code` | String | 是 | 错误码 |
| `message` | String | 是 | 错误信息 |

### 处理中响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "pdf_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "running",
    "progress": 0.35,
    "result": null,
    "error": null
  }
}
```

### 成功响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "pdf_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "succeeded",
    "progress": 1,
    "result": {
      "url": "https://zhihu-openapi.bj.bcebos.com/...?authorization=...",
      "summary": "这是一份关于开放平台能力介绍的 PDF。",
      "expires_at_ms": 1782800000000
    },
    "error": null
  }
}
```

### 解析结果文件

访问 `result.url` 下载得到 JSON 格式的 PDF 解析结果。结构示例：

```json
{
  "schema_version": "v1",
  "pages": [
    {
      "page": 0,
      "blocks": [
        {
          "type": "text",
          "box": [0.17, 0.30, 0.82, 0.44],
          "content": "这是一段从 PDF 中解析出的正文。"
        },
        {
          "type": "figure",
          "box": [0.10, 0.55, 0.90, 0.78],
          "content": "",
          "image": {
            "media_type": "image/jpeg",
            "data": "/9j/4AAQSkZJRgABAQ..."
          }
        }
      ]
    }
  ]
}
```

字段说明：

| 名称 | 类型 | 说明 |
| :- | :- | :- |
| `schema_version` | String | 结果结构版本，当前为 `v1` |
| `pages` | Array | 按页组织的解析结果 |
| `pages[].page` | Integer | 页码，从 `0` 开始 |
| `pages[].blocks` | Array | 当前页解析出的内容块 |
| `blocks[].type` | String | 内容块类型，如 `title`、`text`、`formula`、`figure` |
| `blocks[].box` | Number Array | 内容块坐标，格式为 `[x1, y1, x2, y2]` |
| `blocks[].content` | String | 文本内容；图片块没有文本时为空字符串 |
| `blocks[].image` | Object | 图片信息，仅图片块可能返回 |
| `blocks[].image.media_type` | String | 图片 MIME 类型，如 `image/jpeg`、`image/png` |
| `blocks[].image.data` | String | 纯 Base64 图片数据，不包含 `data:image/...;base64,` 前缀 |

调用方应兼容未知的 `type` 和后续新增字段。普通文本块不返回 `image`。

### 失败响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "task_id": "pdf_39b0e572b738a5ce8c5be600f9cf7b91",
    "task_status": "failed",
    "progress": 0,
    "result": null,
    "error": {
      "code": "parse_failed",
      "message": "PDF parse failed"
    }
  }
}
```

### Curl 示例

```bash
curl 'https://developer.zhihu.com/api/v1/pdf-parse/tasks/pdf_39b0e572b738a5ce8c5be600f9cf7b91' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

## 错误响应

```json
{
  "Code": 10001,
  "Message": "file_id is invalid",
  "Data": null
}
```

常见错误：

| Code | 说明 |
| :- | :- |
| `10001` | 请求参数错误 |
| `20001` | 鉴权失败或无权限访问 |
| `30001` | 请求过于频繁 |
| `30002` | 额度不足 |
| `40001` | 幂等键与请求参数冲突 |
| `40002` | 文件不存在、已过期或不可访问 |
| `40003` | 活跃任务数超限，请等待已有任务完成后再提交 |
| `90001` | 服务内部错误 |

## 注意事项

1. 当前仅支持 PDF 文件解析。
2. 文件大小最大 100MB。
3. 查询接口返回的下载链接有效期较短；如果链接过期，重新查询任务可获得新的下载链接。
4. 不要把同一个 `Idempotency-Key` 用于不同请求参数。

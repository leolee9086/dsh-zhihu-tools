# 知识库文件上传 API

首次使用请先登录直答知识库完成初始化 https://zhida.zhihu.com/repositories/square

## 接口说明

上传文件并同步完成解析和知识库挂载。不指定知识库时，文件会进入当前用户的默认知识库。

## 接口信息

| 说明 | 值 |
| - | - |
| HTTP URL | `https://developer.zhihu.com/api/v1/knowledge/files` |
| HTTP Method | `POST` |
| Content-Type | `multipart/form-data` |
| API ID | `knowledge_file_upload` |

## 请求参数

### Header

- `Authorization`：`Bearer <your_access_secret>`
- `X-Request-Timestamp`：秒级 Unix 时间戳

不要手工设置带 boundary 的 `Content-Type`；使用 curl `-F` 时会自动生成正确的 multipart Header。

### Form

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `File` | File | 是 | 文件内容不能为空，单文件最大 `100 MB` |
| `KnowledgeBaseID` | String | 否 | 目标知识库 ID；不传时使用当前用户的默认知识库 |

支持的扩展名：

```text
pdf, md, txt, ppt, pptx, xlsx, xls, docx, doc,
webp, png, jpg, mobi, epub, csv, azw3
```

扩展名判断忽略大小写。文件名必须是合法 UTF-8，不能包含 NUL、换行或其他控制字符；清理路径和首尾空白后的文件名不能超过 255 个 UTF-8 字节。

## 响应参数

`Data`：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| `KnowledgeBaseID` | String | 是 | 文件实际进入的知识库 ID |
| `RecallContentID` | String | 是 | 内容 ID |
| `FileName` | String | 是 | 清理后的原始文件名 |
| `FileSize` | Int64 | 是 | 文件大小，单位为字节 |
| `Title` | String | 否 | 内容标题 |
| `Abstract` | String | 否 | 内容摘要 |
| `OriginUrl` | String | 否 | 源文件下载地址 |

响应示例：

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "KnowledgeBaseID": "7526139256098382426",
    "RecallContentID": "recall-content-id",
    "FileName": "产品资料.pdf",
    "FileSize": 1048576,
    "Title": "产品资料",
    "Abstract": "文档主要介绍产品能力",
    "OriginUrl": "https://assets2.zhihu.com/example/product.pdf"
  }
}
```

该接口是同步接口，较大文件可能需要较长时间。调用方取消请求不代表上传和解析一定同步取消，请不要对超时或未知结果自动重试。相同文件仅在前一次仍处于同步处理阶段时被拦截；前一次进入终态后可再次上传。

## 错误码说明

| 错误码 | 说明 |
| - | - |
| `0` | 成功 |
| `10001` | 文件、文件名、格式、大小或其他请求参数不合法 |
| `20001` | 鉴权失败或无权向目标知识库上传 |
| `30001` | 频率限制 |
| `40004` | 知识库不存在 |
| `40005` | 相同文件正在处理中 |
| `40006` | 文件解析失败 |
| `90001` | 请求失败 |

## Curl 示例

上传到指定知识库：

```bash
curl 'https://developer.zhihu.com/api/v1/knowledge/files' \
  -F 'File=@./document.pdf' \
  -F 'KnowledgeBaseID=7526139256098382426' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

上传到默认知识库时省略 `KnowledgeBaseID`：

```bash
curl 'https://developer.zhihu.com/api/v1/knowledge/files' \
  -F 'File=@./document.pdf' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

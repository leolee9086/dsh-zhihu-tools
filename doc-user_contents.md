# 用户内容 API

## 接口说明

获取知乎用户公开范围内的创作内容，包括回答、文章、视频、想法、问题等。调用接口时需使用知乎开放平台 Access Secret。

开放范围：

- 不提供 OAuth 访问凭证时，获取当前调用方本人数据。
- 查看其他用户数据时，需先取得该用户的知乎 OAuth 授权，并在请求中提供其 OAuth 访问凭证。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/contents |
| HTTP Method | GET |

## 请求参数

### Header

- Authorization：`Bearer <your_access_secret>`
- X-Request-Timestamp：秒级 Unix 时间戳
- X-OAuth-Token：可选；不传时查询本人，传入时查询该 OAuth 凭证对应的已授权用户
- Content-Type：固定值 `application/json`

### Query

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| Offset | Int64 | 否 | 分页偏移量，默认 `0` |
| Limit | Int64 | 否 | 返回数量，默认 `20`，最大 `50` |
| ContentType | String | 是 | 内容类型，可选值：`all`、`answer`、`article`、`zvideo`、`pin`、`question`；`all` 表示全部内容类型 |
| SortField | String | 否 | 排序字段，可选值：`like_count`、`ts`，默认 `ts` |
| SortOrder | String | 否 | 排序方向，可选值：`asc`、`desc`，默认 `desc` |

说明：

- `Authorization` 是开放平台接口鉴权凭证。
- 不传 `X-OAuth-Token` 时查询当前调用方本人数据；传入时查询该 OAuth 凭证对应的已授权用户数据。
- 如果返回结果中 `Paging.IsEnd=false`，可将 `Paging.NextOffset` 作为下一次请求的 `Offset`。

## 响应参数

Data：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| Items | Array[ContentItem] | 是 | 内容列表 |
| Paging | Paging | 是 | 分页信息 |

ContentItem：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| ContentType | String | 是 | 内容类型，固定为小写：`answer`、`article`、`zvideo`、`pin`、`question` |
| Url | String | 是 | 内容链接 |
| CreatedAt | Int64 | 是 | 内容创建时间，秒级时间戳 |
| LikeCount | Int64 | 是 | 点赞数 |
| CommentCount | Int64 | 是 | 评论数 |
| FavoriteCount | Int64 | 是 | 收藏数 |
| Title | String | 是 | 内容标题 |
| Summary | String | 是 | 内容摘要 |

Paging：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| IsEnd | Bool | 是 | 是否已到最后一页 |
| NextOffset | String | 否 | 下一页分页偏移量 |
| Totals | Int64 | 是 | 总数 |

## 响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "ContentType": "answer",
        "Url": "https://www.zhihu.com/answer/123456789",
        "CreatedAt": 1745486539,
        "LikeCount": 128,
        "CommentCount": 12,
        "FavoriteCount": 20,
        "Title": "如何理解某个问题？",
        "Summary": "这是一段内容摘要..."
      }
    ],
    "Paging": {
      "IsEnd": false,
      "NextOffset": "20",
      "Totals": 100
    }
  }
}
```

## 错误码说明

| 错误码 | 说明 |
| - | - |
| 0 | 成功 |
| 10001 | 参数错误 |
| 20001 | 鉴权失败 |
| 30001 | 频率限制 |
| 30002 | 配额限制 |
| 90001 | 内部错误 |

## 代码示例

查询本人内容：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/contents' \
  -d 'ContentType=all' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

查询已授权用户内容：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/contents' \
  -d 'ContentType=all' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'X-OAuth-Token: <oauth_access_token>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

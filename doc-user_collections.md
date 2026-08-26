# 用户收藏 API

## 接口说明

获取知乎用户公开范围内的近期收藏内容。调用接口时需使用知乎开放平台 Access Secret。

开放范围：

- 不提供 OAuth 访问凭证时，获取当前调用方本人数据。
- 查看其他用户数据时，需先取得该用户的知乎 OAuth 授权，并在请求中提供其 OAuth 访问凭证。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/collections |
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
| Limit | Int64 | 否 | 返回数量，默认 `20` |

## 响应参数

Data：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| Items | Array[CollectionContentItem] | 是 | 收藏内容列表 |

CollectionContentItem：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| ContentType | String | 是 | 内容类型，固定为小写：`answer`、`article`、`zvideo`、`pin`、`question` |
| Url | String | 是 | 内容链接 |
| CreatedAt | Int64 | 是 | 内容创建时间，秒级时间戳 |
| FavTime | Int64 | 是 | 收藏时间，秒级时间戳 |
| LikeCount | Int64 | 是 | 点赞数 |
| CommentCount | Int64 | 是 | 评论数 |
| FavoriteCount | Int64 | 是 | 收藏数 |
| Title | String | 是 | 内容标题 |
| Summary | String | 是 | 内容摘要 |
| Favlists | Array[FavlistItem] | 是 | 内容所在收藏夹列表 |
| Author | Author | 否 | 内容作者；下游未返回作者时不输出 |

FavlistItem：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| UrlToken | Int64 | 是 | 收藏夹 URL 标识；下游未返回时为 `0` |
| Title | String | 是 | 收藏夹名称 |
| Url | String | 是 | 收藏夹链接 |

Author：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| Name | String | 是 | 作者名称 |
| UrlToken | String | 是 | 作者 URL 标识 |
| Url | String | 是 | 作者主页链接 |
| Gender | Int16 | 是 | 作者性别：`0` 未知，`1` 女性，`2` 男性 |
| Headline | String | 是 | 作者签名 |

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
        "FavTime": 1746000000,
        "LikeCount": 128,
        "CommentCount": 12,
        "FavoriteCount": 20,
        "Title": "如何理解某个问题？",
        "Summary": "这是一段内容摘要...",
        "Author": {
          "Name": "示例作者",
          "UrlToken": "example-author",
          "Url": "https://www.zhihu.com/people/example-author",
          "Gender": 1,
          "Headline": "示例签名"
        },
        "Favlists": [
          {
            "UrlToken": 123456789,
            "Title": "默认收藏夹",
            "Url": "https://www.zhihu.com/collection/123456789"
          }
        ]
      }
    ]
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

查询本人收藏内容：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/collections' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

查询已授权用户收藏内容：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/collections' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'X-OAuth-Token: <oauth_access_token>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

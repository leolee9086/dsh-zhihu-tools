# 用户收藏夹列表 API

## 接口说明

获取知乎用户公开范围内的收藏夹列表。

开放范围：

- 可获取当前调用方本人数据。
- 如需获取其他用户数据，需先完成知乎 OAuth 授权，并在请求中传入被授权用户的 OAuth 访问凭证。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/favlists |
| HTTP Method | GET |

## 请求参数

### Header

- Authorization：`Bearer <your_access_secret>`
- X-Request-Timestamp：秒级 Unix 时间戳
- X-OAuth-Token：可选；不传时查询本人，传入时查询该 OAuth 凭证对应的已授权用户

### Query

| 名称 | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| Limit | Int64 | 否 | 返回数量，默认 `20` |

## 响应参数

Data：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| Items | Array[FavlistItem] | 是 | 收藏夹列表 |

FavlistItem：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| UrlToken | Int64 | 是 | 收藏夹 URL 标识，可用于查询收藏夹内容 |
| Url | String | 是 | 收藏夹链接 |
| Title | String | 是 | 收藏夹名称 |
| Description | String | 是 | 收藏夹描述 |
| IsPublic | Bool | 是 | 是否公开 |

## 响应示例

```json
{
  "Code": 0,
  "Message": "success",
  "Data": {
    "Items": [
      {
        "UrlToken": 123456789,
        "Url": "https://www.zhihu.com/collection/123456789",
        "Title": "默认收藏夹",
        "Description": "收藏的公开内容",
        "IsPublic": true
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

查询本人收藏夹列表：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/favlists' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

查询已授权用户收藏夹列表：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/favlists' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'X-OAuth-Token: <oauth_access_token>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

# 用户关注 API

## 接口说明

获取知乎用户公开范围内的关注列表。调用接口时需使用知乎开放平台 Access Secret。

开放范围：

- 不提供 OAuth 访问凭证时，获取当前调用方本人数据。
- 查看其他用户数据时，需先取得该用户的知乎 OAuth 授权，并在请求中提供其 OAuth 访问凭证。

## 接口信息

| 说明 | 值 |
| :- | :- |
| HTTP URL | https://developer.zhihu.com/api/v1/user/followees |
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

## 响应参数

Data：

| 参数名 | 类型 | 是否必返 | 描述 |
| :- | :- | :- | :- |
| Items | Array[FolloweeItem] | 是 | 关注用户列表 |
| Paging | Paging | 是 | 分页信息 |

FolloweeItem：

| 参数名 | 类型 | 是否必返 | 描述                      |
| :- | :- | :- |:------------------------|
| Fullname | String | 是 | 用户名                     |
| UrlToken | String | 是 | 用户主页标识                  |
| Url | String | 是 | 用户主页 URL                |
| AvatarUrl | String | 是 | 用户头像 URL                |
| Headline | String | 是 | 用户一句话介绍                 |
| Gender | Int16 | 是 | 性别：`0` 未知或保密，`1` 女性，`2` 男性 |
| FollowerCount | Int64 | 是 | 粉丝数                     |

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
        "Fullname": "知乎用户",
        "UrlToken": "example",
        "Url": "https://www.zhihu.com/people/example",
        "AvatarUrl": "https://picx.zhimg.com/example.jpg",
        "Headline": "一句话介绍",
        "Gender": 0,
        "FollowerCount": 1000
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

查询本人关注列表：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/followees' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

查询已授权用户关注列表：

```shell
curl -G 'https://developer.zhihu.com/api/v1/user/followees' \
  -d 'Limit=20' \
  -H 'Authorization: Bearer <your_access_secret>' \
  -H 'X-OAuth-Token: <oauth_access_token>' \
  -H "X-Request-Timestamp: $(date +%s)"
```

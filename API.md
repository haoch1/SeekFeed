# SeekFeed API

## 协议与认证

默认服务地址为 `http://localhost:3010`。请求与响应使用 JSON；成功响应通常为 `{ "success": true, "data": ... }`，失败响应包含 `success: false` 与 `message`。

受保护请求使用 `Authorization: Bearer <sessionId>`。Session 为数据库保存的随机凭据，不是 JWT。访客可调用公开读取接口；携带无效、过期或已注销凭据时返回 `401`，不会自动降级为访客。

API、认证响应禁止共享缓存。客户端不得将私有响应交由 Service Worker 缓存。以下示例中的凭据和域名均为占位值。

## 初始化与账号

| 方法与路径 | 认证 | 请求与行为 |
| --- | --- | --- |
| `GET /auth/check-init` | 否 | 返回初始化状态 |
| `POST /auth/init` | 否 | `username`、`password`、`confirmPassword`；仅允许首次初始化 |
| `POST /auth/register` | 否 | 首次初始化的兼容入口，已有管理员时拒绝注册 |
| `POST /auth/login` | 否 | `username`、`password`；成功返回顶层 `sessionId` 与 `user` |
| `POST /auth/verify` | 凭据在请求体 | `{ "sessionId": "..." }`；验证会话 |
| `POST /auth/refresh` | 凭据在请求体 | `{ "sessionId": "..." }`；更新有效会话 |
| `POST /auth/logout` | 凭据在请求体 | `{ "sessionId": "..." }`；注销指定会话 |
| `GET /auth/account` | 是 | 返回 `username`、`session_expiry_hours`、`avatar`，不返回密码或哈希 |
| `PUT /auth/account` | 是 | `username`、`currentPassword`、可选 `newPassword`；成功后全部会话失效 |
| `PUT /auth/preferences` | 是 | `session_expiry_hours` 仅接受 `1`、`24`、`168`、`720`，对新会话生效 |
| `PUT /auth/avatar` | 是 | `{ "avatar": "data:image/png;base64,..." }`；独立保存头像 |
| `DELETE /auth/avatar` | 是 | 恢复默认头像，返回 `data.avatar: null` |
| `GET /auth/sessions` | 是 | 活跃设备、时间、IP、`current` 与设备管理标识 `id` |
| `DELETE /auth/sessions/:id` | 是 | 注销自己的指定设备；`data.current` 表示当前设备是否被注销 |
| `POST /auth/logout-all` | 是 | 注销包含当前设备在内的全部会话 |

用户名修改接受 3–50 字符，新密码接受 8–50 字符；新密码为空时保留已有密码。默认会话有效期为七天，最多保留五个活跃会话。设备管理标识不可用于登录，错误格式返回 `400`，不存在的设备返回 `404`。

头像入口接收静态 PNG Data URL：最大宽高为 256 × 256，解码后不超过 300 KiB，字符串不超过 410,000 字符，请求体上限为 412,000 字节。超限请求体返回 `413`；格式不符返回 `400`。网页上传入口接受最大 5 MiB 的 JPG、PNG 或 WebP，并在浏览器裁剪转换。SVG、远程 URL 与 APNG 不被接收。头像修改不改变密码，不注销会话。

登录响应示例：

```json
{
  "success": true,
  "message": "登录成功",
  "sessionId": "<sessionId>",
  "user": { "username": "admin", "isInitialized": true, "avatar": null }
}
```

## 公开帖子

`GET /api/posts` 支持以下查询参数：

| 参数 | 默认值／限制 |
| --- | --- |
| `page` | 默认 1，正整数 |
| `limit` | 默认 30，1–100 |
| `search` | 最多 200 字符 |
| `searchMode` | `contains`（默认）或 `fuzzy`；仅影响标题与作者搜索，不改变订阅命中或推送状态 |
| `creator` | 最多 100 字符 |
| `category` | 逗号分隔分类 |
| `pushStatus` | 0–3，需认证 |
| `pushStatusIn` | 逗号分隔状态，需认证 |
| `pushStatusNot` | 0–3，需认证 |
| `subId` | 正整数，需认证 |

响应 `data` 包含 `posts`、`total`、`page`、`totalPages`。访客帖子字段仅包含 `post_id`、`title`、`memo`、`category`、`creator`、`pub_date` 及可选 `authorId`，不包含命中规则及推送状态。

`DELETE /api/matched-posts/:id` 需要有效会话，`:id` 为论坛帖子 ID。该接口将已命中帖子从命中订阅列表中持久移除，并停止后续自动推送；原始帖子、推送历史及已发送的 Telegram 消息保留。重复删除返回成功，非命中帖子或不存在的 ID 返回 `404`。命中状态及订阅筛选结果均排除已移除帖子，公开帖子列表不受影响。

`GET /api/stats/overview` 的认证响应包含 `visible_matched_posts`，表示当前保留的命中帖子数；`pushed_posts` 仍表示历史推送成功数。

## 热榜

`GET /api/hot` 为公开接口。查询参数：

| 参数 | 可选值 |
| --- | --- |
| `period` | `live`（默认）、`day`、`week` |
| `category` | 分类键，默认不筛选 |
| `sort` | `heat`（默认）、`views`、`replies` |
| `limit` | `30`（默认）、`50`、`100` |

`day` 按北京时间当天 00:00 起算，`week` 按北京时间本周一 00:00 起算，均包含起点。时间范围随当前日期切换；采集延迟不延长上一日或上一周。仅纳入已确认发布时间且不晚于最近成功采集时刻的帖子。

`GET /api/hot/collection` 返回采集状态、120 秒基础间隔、每轮两种排序各 2 页、上次成功采集时间、人工暂停状态、持久停止状态、浏览器运行状态与验证入口到期时间，仅登录可读。

状态查询不会触发源站采集。浏览器运行状态不表示已完成人工验证；空白页和 Chromium 新标签页均可作为冷启动采集目标，但不能作为验证成功的依据。

`POST /api/hot/collection/start`、`POST /api/hot/collection/stop`、`POST /api/hot/collection/restart` 需要有效会话及同源 Origin。停止会取消当前任务并关闭浏览器容器；启动及重启保留既有冷却与显式限流，未完成人工验证时返回 `409`。重启不会关闭刚完成验证的浏览器。

`POST /api/hot/verification` 需要有效会话与同源 Origin，暂停采集、按需启动浏览器并签发受限验证 Cookie，返回 `/hot-verification/` 入口。采集中返回 `409`。`POST /api/hot/verification/resume` 作为兼容接口，检查服务器浏览器已进入可解析的帖子列表后重启采集，未完成验证返回 `409`。代理入口与 WebSocket 均校验真实账号会话，不接受查询参数中的令牌，不代理 CDP、文件管理或终端。

`POST /api/hot/refresh` 需要认证，遵守采集冷却和异常退避；采集未启用时返回 `409`。页面轮询及访客刷新读取已有缓存。响应中的原始热度用于排序，网页展示乘以 40 后四舍五入的整数。完整定义见 [热榜规则](docs/hot-ranking.md)。

## 统计

| 接口 | 认证 | 范围 |
| --- | --- | --- |
| `GET /api/stats/overview` | 可选 | 全部／今日收录总数；私有命中与投递字段仅对认证请求返回 |
| `GET /api/stats/analytics` | 可选 | 社区总览、趋势、分类、作者、活跃时段与标题词 |
| `GET /api/stats/keywords` | 可选 | 独立关键词序列、时段、七天趋势、分类、作者与交集 |
| `GET /api/stats/charts` | 可选 | 兼容图表读取，`days` 默认 7 |
| `GET /api/stats/subscription-ranking` | 是 | 订阅排行、规则统计与时间范围 |
| `GET /api/stats`、`GET /api/match-stats` | 是 | 系统及匹配统计 |

总览与订阅排行接受 `days=-1|7|30|0`，分别代表今日、近七天、近三十天、全部；默认 `-1`。`offset` 为整数时区偏移分钟，范围 −840 至 840，默认 0。总览可选 `category`，最多 100 字符；可用分类由 `availableCategories` 返回。活跃作者最多返回五十项。

关键词查询：

```http
GET /api/stats/keywords?q=DMIT&compare1=Claude&date=2026-10-20&offset=480&scope=title
```

`q` 必填，1–60 字符；`compare1`、`compare2` 可选，分别最多 60 字符。`date` 必填，为有效且不晚于所选时区当天的 `YYYY-MM-DD` 日期。`scope` 为 `title`（默认）或 `content`（标题与 RSS 摘要）。各词独立计数，不区分大小写，重复词去重。关键词分析不继承总览分类。

公开统计不包含订阅规则、命中状态、投递队列或通知指标。详细口径见 [统计分析](docs/analytics.md)。

## 订阅

所有订阅接口需要认证。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/subscriptions` | 返回全部规则 |
| `POST /api/subscriptions` | 新增规则，成功为 `201` |
| `PUT /api/subscriptions/:id` | 部分更新，保留 ID 和历史关联 |
| `DELETE /api/subscriptions/:id` | 删除规则 |

规则字段为 `keyword1`、`keyword2`、`keyword3`、`creator`、`category`、`exclude_keywords`、`enabled`。关键词及作者最多 100 字符，屏蔽词最多 500 字符；`enabled` 为 0 或 1。分类可由逗号分隔多个键。新增及完整更新后的规则至少保留一个关键词、作者或分类条件。空字符串可清除可选过滤条件。编辑规则不会重新匹配历史帖子。

## 配置与监控

`GET /api/app-version` 为公开只读接口，返回 `{ "version": "<16 位发布标识>" }`，响应禁止缓存。页面恢复到前台时通过该接口判断是否需要加载新版本，不触发源站采集。

下表均需认证。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/config`、`PUT /api/config` | 读取或更新允许的通知／RSS 配置，响应排除密码 |
| `POST /api/bot-token` | 设置 `bot_token`，可选 `webhook_url` |
| `GET /api/rss/config`、`PUT /api/rss/config` | RSS 地址、间隔与代理 |
| `GET /api/rss/validate` | RSS 配置校验 |
| `POST /api/rss/test-connection` | 测试请求中的 `rss_url` |
| `POST /api/rss/restart` | 重启 RSS 调度 |
| `POST /api/rss/fetch` | 执行一次受并发保护的采集与通知处理 |
| `GET /api/scheduler/status` | 调度状态 |
| `POST /api/scheduler/rss/run` | 手动执行 RSS 任务 |
| `POST /api/posts/:postId/push/:subId` | 按指定订阅推送帖子 |

RSS 更新字段为 `rss_url`、`rss_interval_seconds`（10–3600）及 `rss_proxy`。当前调度会读取新间隔；`/rss/restart` 用于显式重新启动任务。通用配置更新严格限制字段，不接受 `username`、`password`、`session_expiry_hours` 或 `avatar`。

## Telegram

`POST /telegram/webhook` 供 Telegram 入站更新使用，由 Webhook 密钥验证，不使用管理员 Session。其他管理接口需要管理员 Session。

| 路径前缀 | 主要接口 |
| --- | --- |
| `/api/webhook` | `GET /status`；`POST /setup`、`/disable`、`/test-connection`、`/start-polling`、`/stop-polling`、`/clear-webhook`、`/clear-settings`、`/manage-binding` |
| `/api/push` | `GET /status`、`/bot-info`；`POST /setup`、`/set-chat-id`、`/test-send`、`/send-message` |
| `/api/telegram` | `GET /status`；`POST /test`、`/send-test`、`/unbind` |
| `/telegram` | `GET /bot-info`；`POST /set-webhook`、`/test-message` |

Webhook 使用公网 HTTPS 地址；Polling 与 Webhook 为互斥连接方式。命令及热榜按钮仅向已绑定聊天开放。

## 状态码

`200` 为成功，`201` 为新增成功，`400` 为输入不合法，`401` 为认证无效，`404` 为资源不存在，`409` 为功能状态冲突，`413` 为请求过大，`500` 为执行失败，`503` 为依赖服务未就绪。

## 采集质量

| 方法与路径 | 认证 | 响应与行为 |
| --- | --- | --- |
| `GET /api/collection/quality` | 管理员 | `summary` 为近 24 小时分来源摘要，`recent` 为最近 30 条采集记录，`authors` 为名称覆盖，`retention` 为保留上限；只读本地数据库 |

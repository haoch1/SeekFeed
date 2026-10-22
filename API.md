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

响应 `data` 包含 `posts`、`total`、`page`、`totalPages`。访客帖子字段仅包含 `post_id`、`title`、`memo`、`category`、`creator`、`pub_date`、`tradeInfo` 及可选 `authorId`，不包含命中规则及推送状态。

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

## 采集分析与历史

| 方法与路径 | 认证 | 响应与行为 |
| --- | --- | --- |
| `GET /api/collection/quality` | 管理员 | `summary` 为近 24 小时分来源摘要，`recent` 为最近 30 条采集记录，`authors` 为名称覆盖，`retention` 为保留上限；只读本地数据库 |
| `GET /api/posts/:id/revisions` | 管理员 | 最近 30 天内最多 20 个变更；每条包含 `observedAt`、`before`、`after`，均为内容字段 |
| `GET /api/posts/:id/activity?days=7` | 公开 | `points` 为近 2 小时逐轮及较早小时真实观察值，含 `bucket`、`observedAt`、`views`、`replies`；`days=30` 查看 30 天，其余值使用 7 天 |

`:id` 为论坛帖子编号。不存在观察记录时返回空数组。公开帖子不返回旧版本内容、变更计数或私有推送字段；认证帖子增加 `changed_at` 和 `revision_count`，交易标题提取位于 `tradeInfo`。金额以字符串保存，`currency=未明确` 不代表美元。保留策略、提取规则及幂等边界见 [采集与数据质量](docs/collection-insights.md)。

## 交易分析

`GET /api/stats/trades` 为公开只读接口，仅使用论坛公开字段，不返回订阅、推送或账号信息。

| 参数 | 约束与默认值 |
| --- | --- |
| `days` | `0`（全部，默认）、`-1`（今日）、`7`、`30` |
| `offset` | 浏览器 UTC 偏移分钟，范围 -840 至 840，默认 480 |
| `provider`、`region` | 归一商家或地区，最多 80 字；空值不限，`未识别` 选择缺失记录 |
| `intent`、`asset` | 意图或商品类型，最多 30 字；空值不限 |
| `q` | 标题、RSS 摘要及作者的包含搜索，最多 100 字；不影响订阅匹配 |
| `priceGroup` | 币种、用途及周期组合，最多 100 字；无效或空值选择当前范围可用默认组 |
| `page` | 1–100000，默认 1；每页 20 条，超出范围回到最后一页 |

响应包含 `range`、`totals`、`coverage`、`facets`、`providers`、`regions`、`assets`、`delivery`、`network`、`specifications`、`trend`、`pricing`、`records`、`page`、`pageCount` 与规则版本。`pricing.groups` 为可选组，`selectedGroup` 为实际采用组，分位数无样本时为 `null`。`records.fact` 保留结构化提取与原文依据。金额数值仅用于对应组内的展示，不执行换汇或总额合计。详细口径见 [交易分析](docs/trade-analysis.md)。

### 人工标记（管理员）

| 接口 | 行为 |
| --- | --- |
| `GET /api/trades/labels?postId=123` | 当前单帖标签、可用商家、最近商家和共享别名；不返回完整事件历史 |
| `GET /api/trades/labels?export=1` | 导出商家目录、当前标记、共享别名及带原文与规则预测的全部审阅事件 |
| `POST /api/trades/labels` | 提交 `{postId, labels, alias?}`，事务保存人工字段、可选共享别名与审阅事件；清除当前交易缓存 |
| `DELETE /api/trades/labels/aliases/:id` | 删除自定义共享别名并保留删除事件；不删除单帖标记或商家目录 |

`labels` 可包含 `provider`、`region`（1–60 字）、`intent`（求购／出售／其他）、`asset`（页面商品类型枚举）及 `prices`（最多 20 项）。每项人工金额包含 `text`、`amount`（0–1,000,000,000）、`currency`、`kind`、`period`、`source=manual`。支持币种为未明确、CNY、USD、CAD、EUR、GBP、HKD、SGD、AUD、NZD、USDT。费用周期未确认时不进入周期报价分布，非周期金额统一使用“不适用”。

请求中的 `labels` 替换该帖全部人工字段，空对象恢复自动识别。`alias` 为至少两个字符的原文别名，并要求 `labels.provider` 非空。请求不允许未知字段；不存在的交易帖返回 404，别名与内置词表或已存在映射冲突返回 409。商家名称忽略大小写复用已保存的标准名称。匿名或无效会话无法管理标记或导出样本。

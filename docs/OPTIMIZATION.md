# SeekFeed 优化记录

## 项目对比

对比基于 2026-10-19 可访问的项目 README 与本项目源码。下表为功能与架构对比，没有对第三方项目进行生产压测。

| 项目 | 主要能力 | 本次取舍 |
| --- | --- | --- |
| SeekFeed | Bun、Hono、SQLite，Web 管理，组合关键词/正则，Telegram，Docker | 单应用部署，统一控制台组件并优化实际执行链路 |
| [n-AChegYag/nodeseek-keywords](https://github.com/n-AChegYag/nodeseek-keywords) | 单用户 Bot、关键词暂停、防洪推送、失败重试、RSS 健康告警、首次静默 | 补上暂停、持久化待发送状态、每轮发送上限、异常状态；后续可增加首次静默与主动健康告警 |
| [AI-XMLY/nodeseek-rss-telegram-bot](https://github.com/AI-XMLY/nodeseek-rss-telegram-bot) | 组合/排除关键词、独立开关、多用户与推送目标 | 引入屏蔽词与独立暂停；继续采用本项目单管理员模式 |
| [Seameee/NodeSeekRSSMonitor](https://github.com/Seameee/NodeSeekRSSMonitor) | Workers/D1、关键词与分类过滤、备用源、可选 AI 摘要 | 当前优先修复监控可靠性，备用源与摘要适合作为后续独立功能 |

## 前端

参考 [ReUI Components](https://reui.io/components) 和 [官方文档](https://reui.io/docs) 的导航、表单、列表、徽标、按钮及面板组织方式。保留 Hono 服务端 JSX 与原生 JavaScript，没有引入客户端 React 运行时或付费组件。

- `DashboardSurface.tsx` 提供侧栏工作台、三项真实统计、搜索筛选与文章状态。
- `workspace.css` 集中管理明暗色板、6/8px 圆角、边框、字体、焦点与移动端布局。首页、初始化页、错误页、订阅/RSS/Telegram/统计/登录面板使用相同样式。
- 统一 Lucide 线性图标、按钮、输入框、分页、状态标签和通知；用原创 S 形标识统一 SeekFeed 品牌与 PWA，去掉混杂的 emoji、字符图标和旧渐变装饰。
- 支持最新帖子/命中订阅切换，分类、发送状态、作者、订阅筛选，以及清空条件与空状态恢复。
- 搜索使用独立防抖与 AbortController；新请求替换旧请求，快速筛选不会被旧响应覆盖。
- 面板支持 Escape、遮罩关闭、焦点圈定及恢复，背景使用 inert；移动端侧栏可收起，支持减少动画偏好。
- Bot Token 使用密码输入框；列表、分类图表与通知文本均做 HTML 转义。

## 监控与数据

| 问题 | 改动 |
| --- | --- |
| 手动同步与定时器可能并行抓取/发送 | 共用一个执行中的 Promise；递归定时器等待任务结束后再排下一轮 |
| 定时器状态取不到实际运行实例 | 独立 runtime 注册表，避免 API 动态导入服务器入口 |
| 推送失败后状态 1 被排除，之后不重试 | 状态 0/1 都进入处理；成功后才写状态 3；每轮最多 10 条，余量保留，失败批次轮转 |
| RSS 故障可能妨碍通知重试 | RSS 异常后仍尝试发送已入队消息；记录最近运行、成功、异常和连续失败次数 |
| 来源故障时反复高频访问 | 每次抓取原有最多三次重试；轮次之间按 2/4/8 倍间隔退避，恢复后回到正常间隔 |
| HTTP 200 验证页被误认为空 RSS | 拒绝非 RSS 内容并反馈错误 |
| 单条失败造成批量部分写入却报告完成 | 批量事务失败时回滚，并上抛给同步任务 |
| 重复 RSS 项目可重复插入 | 插入语句原子检查 post_id |
| 暂停只能删除规则 | 新增 enabled 和 exclude_keywords；暂停时保留已入队的待发送通知 |
| 精确作者/分类与仅标题匹配语义不一致 | 作者/分类按忽略大小写精确匹配；仅标题模式不再把作者/分类当作关键词命中 |
| 正则先把原文转小写 | `/pattern/` 保留大小写语义，`/pattern/i` 和 `regex:pattern` 忽略大小写 |
| 按订阅筛选重新拼 LIKE，偏离正则/屏蔽规则 | 使用记录的 sub_id，展示实际记录的命中 |
| 统计缓存刷新不完整，匹配量误当发送量 | 同步失效所有帖子派生统计和图表；今日发送量按成功状态及发送日期计数 |
| 每个 HTTP 请求新建 SQLite 连接 | 应用进程复用服务；关闭后可重新创建；缓存限制为 16MiB，增加锁等待超时 |
| .env 覆盖容器/终端显式设置 | 已设置的环境变量优先 |
| Docker 仍复制 bun.lockb | 使用仓库实际的 bun.lock；打包后从 src/database 查找 SQL 迁移 |
| Service Worker 缓存配置等 API 响应 | 仅缓存 SeekFeed 静态资源，取消浏览器自行触发 RSS 调度与自动通知授权 |

待发送状态保存在 SQLite 中，重启后会继续处理。暂停期间新抓取且未命中的帖子不会在恢复时追溯补发；恢复的是暂停前已入队的通知。单篇文章仍记录第一个匹配订阅，按订阅筛选不是多对多的完整命中历史。

## 验证与运行

```bash
bun install --frozen-lockfile
bun test
bun run build
bun run start
# 或从当前源码构建
docker compose up -d --build
```

服务默认端口 3010，首次访问创建管理员。启动时自动创建 SeekFeed 数据库和表结构。全新安装不包含旧产品名称、路由或数据文件的兼容逻辑。

项目目录与界面名称为 `SeekFeed`，包名、Docker Compose 项目/服务/镜像/容器名均为 `seekfeed`；数据库默认文件为 `data/seekfeed.db`。应用入口为 `src/seekfeed.ts`，构建产物为 `dist/seekfeed.js`，进程标题设为 `SeekFeed`。Windows 的可执行文件名称由 Bun 运行时决定，仍显示 `bun.exe`。

验证环境：Windows、Bun 1.4.3、Microsoft Edge（Playwright 控制）。使用隔离 SQLite 和本地 RSS HTTP 样本，不调用真实 Telegram。

- 21 项 Bun 测试通过，其中新增 14 项覆盖真实数据库、匹配、队列、并发、失败和迁移行为。
- 生产 bundle 构建并启动成功；JavaScript 语法检查与 Git whitespace 检查通过。
- 浏览器验证初始化、登录、订阅新增/暂停/恢复、RSS 同步去重、统计、分页、多条件筛选、空状态、明暗主题、390px 移动布局、面板关闭和静态缓存隔离，无未处理脚本错误。
- Telegram 的真实投递需要配置有效 Token/Chat ID；本机无 Docker 引擎，未执行容器镜像构建。浏览器测试验证生产 bundle 的本地启动，不等同于容器部署验证。

## 后续可扩展项

1. 首次启动静默、可配置历史回溯窗口与积压消息摘要。
2. 通知投递日志、重试次数/下一次尝试时间、错误分类及 RSS 健康告警。
3. 多个 RSS 源切换、邮件/Webhook/Bark 通道和按订阅设置接收目标。
4. 多用户隔离及完整的多对多命中历史。

当前按轮次重试，没有持久化单条消息的尝试时间。发送成功后至本地状态写入前若进程意外中断，仍可能重复通知；没有宣称恰好一次投递。

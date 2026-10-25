# SeekFeed

[![SeekFeed CI](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml/badge.svg)](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml)

面向 NodeSeek 社区的自托管监控与分析平台，提供实时热榜、帖子检索、关键词订阅、Telegram 通知和多维统计分析。采用 Bun、Hono、SQLite 与服务端 JSX，前端使用原生 JavaScript 和 SVG，支持明暗主题、移动端布局及 PWA 安装。

## 功能概览

| 模块 | 功能 |
| --- | --- |
| 热榜 | 实时、日榜与周榜；分类过滤；热度、浏览量与回复量排序；增量采集、时间衰减与失败退避 |
| 帖子 | RSS 定时采集、手动刷新、包含或容错搜索、分类与作者筛选、分页；最新帖子与命中订阅分别保存筛选条件；命中帖子支持单条删除 |
| 订阅 | 最多三个关键词组合、正则、作者、分类、屏蔽词；新增、编辑、暂停、恢复与删除 |
| 统计 | 发帖趋势、分类结构、作者贡献、活跃时段、热门标题词、分类联动和 CSV 导出 |
| 采集分析 | 作者 ID 渐进补全、采集质量记录、当前帖子内容同步、持久浏览器会话与人工验证入口 |
| 作者主页 | 热榜、帖子列表及作者榜支持在新标签页打开已确认的 NodeSeek 用户主页；未确认或存在同名歧义时保留作者文本 |
| 关键词分析 | 指定日期的发帖数量及占比、1／3／6 小时分布、近七天趋势、最多三个词独立对比、共同命中、分类与作者明细 |
| Telegram | Bot 绑定、Webhook 或 Polling、持久化待发送队列、失败重试、命令交互及热榜切换 |
| 账号 | 单管理员认证、自定义头像、登录有效期、设备列表、单设备退出与全部退出 |

图表包含柱形、折线、环形、热力分布及排行列表，支持悬停、键盘操作和移动端触控。关键词推荐仅填入输入框，分析由“开始分析”或回车提交。

## 快速部署

需要 Docker Engine 与 Docker Compose。下载仓库后，在项目目录执行：

```bash
git clone https://github.com/haoch1/SeekFeed.git
cd SeekFeed
cp .env.example .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml --profile verification create seekfeed-browser
docker compose -f docker-compose.prod.yml up -d
```

默认镜像为 `ghcr.io/haoch1/seekfeed:latest`，支持 `linux/amd64` 和 `linux/arm64`。生产配置绑定 `127.0.0.1:3010`，通过反向代理提供 HTTPS；同机访问地址为 <http://localhost:3010>。首次访问创建管理员，随后配置 RSS 与 Telegram。

数据库存储于 `seekfeed_data` 卷。升级时执行相同的 `pull` 和 `up -d` 命令；启动时自动执行未应用的数据库迁移。备份、恢复、固定版本与代理配置见 [Docker 部署](docs/Docker.md)。

从当前源码构建：

```bash
docker compose up -d --build
```

## 访问权限与账号

本项目采用单管理员模式，不提供多用户数据隔离。

| 身份 | 可访问范围 |
| --- | --- |
| 访客 | 热榜、公开帖子、基于论坛公开内容的统计与关键词分析 |
| 管理员 | 访客功能，以及订阅规则、命中订阅、推送状态、通知分析、RSS／Telegram 配置、账号与设备管理 |

受保护接口在服务端校验 Session。伪造、过期或已注销的会话返回 `401`；公开接口剔除订阅及推送字段。PWA 仅缓存静态资源，不缓存账号、配置或 API 响应。

访客点击侧栏头像打开登录窗口，悬停或键盘聚焦显示提示。管理员点击头像进入账号设置，右侧图标用于退出登录。头像支持 JPG、PNG、WebP，原图最大 5 MiB；浏览器居中裁剪为 256 × 256 PNG，服务端校验后存入数据库。头像可独立更新或恢复默认，随账号同步。

当前密码以不可逆哈希保存，接口不返回密码。修改用户名或密码需要验证当前密码，并使全部已有会话失效。登录有效期支持 1 小时、1 天、7 天或 30 天，每个账号最多保留五个活跃会话。

## 数据范围与统计口径

- 总览按 RSS 记录的发帖时间统计，支持今日、近七天、近三十天及全部记录；日期边界按请求指定的时区确定。
- 总览日期与分类作用于帖子、作者、趋势、分类、活跃时段和标题词；关键词分析使用独立日期与匹配范围。
- 每个关键词独立计数，同一篇帖子对同一词仅计一次；多个词的交集单独展示。关键词分析采用文本包含匹配，与订阅中的正则规则不同。
- 当前时段仅统计至查询时刻；未来时段不按零值展示。与上一日比较时使用相同时段，并提示历史覆盖不足。
- 热榜使用独立采集的浏览与回复样本。实时榜按近期增长与时间衰减计算，日榜和周榜按范围内帖子的累计互动计算；不代表全站穷尽数据。
- 热榜通过 HTTP 每 300 秒采集两种排序各前两页，保留浏览量、回复数和近期增长热度。Chromium 日常关闭，仅人工验证时按需启动；验证后保存本机 CF 会话并关闭浏览器。日常仅显示启动或停止按钮，遇到 CF 后显示人工验证。
- 热度为排序分数的整数展示，常规数值主要为三位数。完整公式、采集节流和适用边界见 [热榜规则](docs/hot-ranking.md)。
- 最新帖子顶部的累计收录数与统计页所选时段数量具有不同范围。通知成功数仅统计实际投递成功的帖子。

详细定义、图表交互与导出范围见 [统计分析](docs/analytics.md)。

## 订阅规则与通知

普通关键词忽略大小写，最多三个关键词需同时命中。`/pattern/` 区分大小写；`/pattern/i` 与 `regex:pattern` 忽略大小写。作者按名称精确匹配，分类按所选分类匹配；屏蔽词由逗号或换行分隔，任一命中即排除。编辑订阅保留原 ID、暂停状态及已记录的历史关联。

帖子列表的“筛选”区域可选择包含匹配或容错匹配，默认包含匹配。容错匹配仅用于标题与作者搜索，支持缺字、多字、替换及相邻字符交换，例如 `vmsis` 可匹配 `vmiss`。四至七字符的词允许一次编辑，八至六十四字符允许两次；不足四字符仅执行包含匹配。查询超过十六个词或存在超过六十四字符的词时，仅执行完整文本包含匹配。该选项不改变订阅命中、推送规则或关键词分析计数，“命中订阅”中的搜索范围仍限于已记录的命中帖子。

暂停保留已入队通知；恢复后继续处理队列，不追溯补发暂停期间未命中的帖子。每轮发送设有上限，失败通知保留重试。单篇帖子记录首个匹配订阅，当前未提供完整的多对多命中历史；进程在发送成功但状态尚未写入时中断，可能造成重复投递。

在 [BotFather](https://t.me/BotFather) 创建机器人并配置 Token，开启命令交互后向 Bot 发送 `/start` 完成绑定。

| 命令 | 功能 |
| --- | --- |
| `/start`、`/help` | 绑定账号、查看帮助 |
| `/list`、`/add 关键词1 关键词2`、`/del 订阅ID` | 查看、新增、删除订阅 |
| `/post` | 最近十条帖子 |
| `/hot` | 热榜；通过消息下方按钮切换实时、日榜与周榜 |
| `/stop`、`/resume` | 暂停、恢复通知 |
| `/getme`、`/unbind` | 查看绑定状态、解除绑定 |

## 本地开发

CI 与容器使用 Bun 1.4.3，热榜采集使用 Python 3.12。本地默认关闭热榜采集；启用时需安装 `collector/requirements.txt` 并设置 Python 路径。

```bash
bun install --frozen-lockfile
bun run dev
bun test
bun run build
bun run start
```

默认端口为 3010，数据库为 `data/seekfeed.db`。入口为 `src/seekfeed.ts`，构建产物为 `dist/seekfeed.js`。数据库维护命令及贡献约定见 [开发指南](CONTRIBUTING.md)。

## 配置

完整模板见 [.env.example](.env.example)。显式环境变量优先于该文件。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT`、`HOST` | `3010`、`0.0.0.0` | 本地服务监听；Compose 内部固定使用 3010 |
| `DATABASE_PATH` | `./data/seekfeed.db` | SQLite 文件路径 |
| `CORS_ORIGINS` | `http://localhost:3010` | 允许的跨域来源，逗号分隔 |
| `TRUST_PROXY` | `false` | 可信代理 IP 转发开关，部署要求见 Docker 文档 |
| `RSS_CHECK_ENABLED` | `true` | RSS 自动监控开关 |
| `RSS_TIMEOUT` | `30000` | RSS 请求超时，单位毫秒 |
| `HOT_COLLECT_ENABLED` | Docker 为 `true`，本地未配置时关闭 | HTTP 基础间隔 300 秒，两种排序各取前两页；支持启停及 CF 暂停 |
| `HOT_HTTP_SESSION_PATH` | 生产 Compose 已配置 | 本机私有 CF 会话文件；仅保存白名单 Cookie 和 User-Agent，不保存论坛登录 Cookie |
| `HOT_BROWSER_ENDPOINT`、`HOT_BROWSER_GUI_URL` | 生产 Compose 已配置 | 私有网络中的浏览器 CDP 与人工验证界面地址，不映射公网端口 |
| `HOT_COLLECTOR_PYTHON` | Docker 已配置，本地 `python3` | 热榜采集 Python 路径 |
| `TELEGRAM_WEBHOOK_URL` | 未设置 | 可选的公网 HTTPS Webhook 地址 |

RSS 地址、间隔、代理与 Telegram Token、接收账号在设置页管理。

默认 RSS 抓取间隔为 30 秒，订阅匹配与推送在每轮同步后执行。前台帖子列表每 15 秒检查更新，热榜、统计图表和已提交且展开的关键词分析每 60 秒更新；全局计数和运行状态每 60 秒更新。页面轮询读取本地数据库，不额外触发源站采集；页面不可见时暂停自动更新。刷新周期集中定义于 `src/config/cadence.json`，已保存的 RSS 自定义间隔优先于默认值。

项目保持服务端 Hono JSX、原生 JavaScript/SVG 与 SQLite，不引入常驻浏览器处理常规功能。热榜结果缓存最多 24 份、共享查询缓存最多 128 份，统计缓存 60 秒并在相关写入后失效。主容器限制为 256 MiB / 0.5 CPU；人工验证浏览器的临时峰值单独受限，验证结束或 15 分钟到期后回收。

采集质量、身份补全与当前内容同步的定义、保留策略和权限见 [采集与数据质量](docs/collection-insights.md)。

## 参考项目与资源

以下来源用于功能调研、交互设计或算法对照。设计参考不表示直接引入其运行时、完整页面或排名公式；第三方图标的实际使用及许可另行列明。

| 项目／资源 | 参考范围与采用方式 |
| --- | --- |
| [ReUI](https://github.com/keenthemes/reui) · [组件目录](https://reui.io/components) | 侧栏、表单、面板、分段选项、开关、分页与信息层级；采用 Hono JSX 和原生 JavaScript 实现 |
| [Discourse 社区看板](https://meta.discourse.org/t/better-insights-into-your-community-with-the-redesigned-admin-dashboard/404528) | 社区总览、报告层级与细分分析的组织方式 |
| [Plausible](https://plausible.io/docs/guided-tour) | 时间范围、筛选联动、指标与明细的关联方式 |
| [Umami](https://github.com/umami-software/umami) | 紧凑指标与排行展示方式 |
| [nodeseek-keywords](https://github.com/n-AChegYag/nodeseek-keywords) | 订阅暂停、发送上限、失败重试及 RSS 异常处理的功能对照 |
| [nodeseek-rss-telegram-bot](https://github.com/AI-XMLY/nodeseek-rss-telegram-bot) | 组合关键词、排除规则与独立订阅开关的功能对照 |
| [NodeSeekRSSMonitor](https://github.com/Seameee/NodeSeekRSSMonitor) | 关键词和分类监控、备用源及部署架构调研；未引入其 Workers／D1 架构 |
| [SeekMate parser](https://github.com/mrzhiin/seekmate/blob/main/lib/parser/parser.ts) · [分页查询](https://github.com/mrzhiin/seekmate/blob/main/hooks/services/useInfinitePostsQuery.ts) | NodeSeek 公开列表的字段语义、置顶标记、显式排序与分页契约对照 |
| [DailyHotApi NodeSeek](https://github.com/imsyy/DailyHotApi/blob/master/src/routes/nodeseek.ts) | RSS 动态与热榜数据源能力的边界对照；未使用其热榜接口 |
| [Reddit 排序源码](https://github.com/reddit-archive/reddit/blob/master/r2/r2/lib/db/_sorts.pyx) · [Arc news](https://github.com/arclanguage/anarki/blob/master/apps/news/news.arc) | 热榜与时间范围榜的算法思路对照；SeekFeed 使用独立的浏览／回复增长权重 |
| [Lucide](https://lucide.dev/) | 实际使用的功能图标，许可见 [lucide.txt](licenses/lucide.txt)；品牌 S 标识为本项目资源 |
| [jlesage/docker-chromium](https://github.com/jlesage/docker-chromium) | 实际使用的持久 Chromium 侧车容器；通过受认证的入口提供人工验证 |
| [Nodyssey 会话架构](https://github.com/5151561/nodyssey/blob/main/docs/architecture.md) | 浏览器保留真实会话、人工验证期间暂停请求、完成后显式恢复的设计对照 |
| [Scrapy](https://github.com/scrapy/scrapy) · [Discourse TopTopic](https://github.com/discourse/discourse/blob/main/app/models/top_topic.rb) | 分页任务、限速与周期统计覆盖的方案调研；当前未采用深分页巡检，也未引入对应运行时 |
| [Miniflux](https://github.com/miniflux/v2/blob/main/internal/storage/entry.go) | 条目内容更新与用户状态分离、保留原发布时间 |

参考来源的细节分别记录于 [界面规范](docs/style-guide.md)、[优化记录](docs/OPTIMIZATION.md) 与 [热榜规则](docs/hot-ranking.md)。未采用的主题预览不属于当前界面的实现来源。

## 文档与支持

[项目说明](ABOUT.md) · [文档索引](docs/README.md) · [API](API.md) · [部署](docs/Docker.md) · [CI/CD](docs/CI-CD.md) · [统计分析](docs/analytics.md) · [界面规范](docs/style-guide.md) · [开发指南](CONTRIBUTING.md)

故障排查可检查 `/health`、`docker compose -f docker-compose.prod.yml ps` 与 `docker compose -f docker-compose.prod.yml logs --tail=100 seekfeed`。提交问题时应提供版本、操作步骤与已脱敏日志。

## 许可证

[MIT](LICENSE)。第三方资源遵循各自许可声明。

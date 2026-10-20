# SeekFeed

[![SeekFeed CI](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml/badge.svg)](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml)

NodeSeek 新帖监控、关键词筛选与 Telegram 消息通知。基于 **Bun + Hono + SQLite**，提供统一的 ReUI 风格控制台、明暗主题和移动端布局。

## 功能

- RSS 自动抓取、手动同步、抓取间隔和代理设置。
- 最多三个关键词组合、正则表达式、精确作者/分类过滤、屏蔽词和独立暂停。
- Telegram Bot 消息通知、每轮发送上限、失败重试与待发送队列。
- 帖子搜索、多条件筛选、分页、真实发送统计和监控状态。
- 关键词分析：选择日期查看全天与 1／3／6 小时时段数量，最多 3 个词独立对比、交叉命中、近 7 天变化、分类占比和活跃作者。时段柱形图、七天折线图、分类环形图与作者排行使用统一尺寸的面板；点击趋势日期可查看当天。每篇每词计一次，支持标题或标题与 RSS 摘要匹配；当天与上一日同时段比较，尚未到达的时段不当作 0。
- 已有订阅支持编辑关键词、作者、分类和屏蔽词，保留原 ID、暂停状态和历史命中记录。
- 社区分析：发帖趋势、完整分类明细、作者贡献、活跃时段与热门标题词，支持今日、近 7 天、近 30 天和全部记录。
- 独立热榜：真实浏览与回复计数，实时增长、最近 24 小时及北京时间本周排行，支持分类和热度/浏览/回复排序。[采集范围与排名规则](docs/hot-ranking.md)
- 网页与 Telegram 使用相同的订阅 ID；订阅管理页集中展示订阅和通知表现。
- Session 登录、首次使用创建管理员、PWA 桌面安装与静态资源缓存。

[项目对比与优化记录](docs/OPTIMIZATION.md) · [界面组件规范](docs/style-guide.md) · [API 文档](API.md)

## 访问权限

本项目采用单管理员模式。访客可以浏览热榜、最新帖子及基于论坛公开内容的社区统计；登录后才能访问订阅规则、命中订阅、推送状态与通知统计、RSS／Telegram 配置、账号与登录设备管理。公开帖子接口只返回论坛字段，私人筛选条件要求有效 Session；公开统计不包含任何订阅或推送数据。传入伪造、过期或已退出的凭据会返回 401，接口响应禁止共享缓存。

## Docker 部署

在 SeekFeed 源码目录执行：

```bash
docker compose up -d --build
```

访问 <http://localhost:3010>，首次创建管理员，再配置 RSS 和 Telegram。镜像、服务、容器和 Compose 项目名称均为 `seekfeed`，数据保存在 `seekfeed_data` 卷内的 `seekfeed.db`。

也可以直接构建、运行：

```bash
docker build -t seekfeed:latest .
docker run -d --name seekfeed -p 3010:3010 \
  -v seekfeed_data:/usr/src/app/data seekfeed:latest
```

生产部署直接使用 GitHub Actions 构建的公开镜像，支持 `amd64` 和 `arm64`：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

默认镜像为 `ghcr.io/haoch1/seekfeed:latest`。生产配置监听 `127.0.0.1:3010`，通过 Nginx 等反向代理提供 HTTPS；可用 `SEEKFEED_IMAGE` 和 `SEEKFEED_BIND_ADDRESS` 覆盖。更新时再次执行 `pull` 和 `up -d`，数据卷会保留。

详见 [Docker 部署](docs/Docker.md) 和 [CI/CD 配置](docs/CI-CD.md)。

## 本地运行

需要 Bun 1.4.3 或兼容版本：

```bash
bun install --frozen-lockfile
# 可选：复制 .env.example 为 .env 后修改配置
bun run dev
```

```bash
bun test             # 自动化测试
bun run build        # 生成 dist/seekfeed.js
bun run start        # 启动生产版本
bun run db:migrate   # 初始化数据库表结构
bun run db:resetuser # 重置管理员账号
```

入口为 `src/seekfeed.ts`，应用进程标题为 `SeekFeed`。

## 配置

配置模板见 [.env.example](.env.example)。终端和容器显式设置的环境变量优先。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3010` | 监听端口；Compose 中映射到该主机端口 |
| `HOST` | `0.0.0.0` | 本地运行的监听地址 |
| `DATABASE_PATH` | `./data/seekfeed.db` | SQLite 文件 |
| `CORS_ORIGINS` | `http://localhost:3010` | 跨域来源，逗号分隔 |
| `RSS_CHECK_ENABLED` | `true` | 自动监控开关，关闭时仍可手动同步 |
| `RSS_TIMEOUT` | `30000` | 抓取超时，毫秒 |
| `HOT_COLLECT_ENABLED` | Docker `true`，本地 `false` | 约每 2 分钟轻量采集，约 6 分钟完整扫描；失败保留缓存并退避 |
| `HOT_COLLECTOR_PYTHON` | Docker 已配置，本地 `python3` | 安装 `collector/requirements.txt` 的 Python 路径 |
| `TELEGRAM_WEBHOOK_URL` | 无 | 可选 Webhook URL |

RSS 地址、抓取间隔、代理、Bot Token 与消息接收账号分别在独立设置页管理。「账号与安全」支持修改用户名和密码、设置 1 小时/1 天/7 天/30 天的登录有效期、查看活跃设备、单独退出指定设备与退出所有设备。修改账号需验证当前密码并重新登录。PWA 只缓存静态资源，消息通知通过 Telegram 发送。

## 统计分析

- 总览按发帖时间统计，日期和分类筛选同时作用于帖子、作者、分类、趋势、活跃时段与标题词；今日显示高峰时刻，较长时间范围显示日均发帖。
- 发帖趋势支持柱形与折线切换；悬停查看详细时段和数量，点击固定提示，方向键切换、回车固定、Esc 取消。分类环图与明细联动，每行同时显示分类名称、帖子数和占比。
- 总览及关键词分析的活跃作者支持 TOP 5／10／20／50，默认 TOP 5，列表内部滚动保持面板尺寸一致。热门标题词按一行一词排列，点击可进入关键词分析。
- 关键词分析使用独立的日期和匹配范围；时段分布与七天趋势同时呈现每个词的独立数据，分类与作者详情标明当前选中的词。对比词可单独移除，整个模块可重置、收起或展开。
- CSV 导出当前总览筛选结果、各时段数量、分类、最多 50 名作者及热门标题词，并包含统计起止时间、时区和分类范围。标题词最多取最近 5,000 篇标题，按每篇每词计数；样本不足时不会虚构历史数据。
- 最新帖子与命中订阅分别保留自己的搜索、分类和页码，切换页面不会相互覆盖。

交互设计参考 [Discourse 社区看板](https://meta.discourse.org/t/better-insights-into-your-community-with-the-redesigned-admin-dashboard/404528) 的报告层级、[Plausible](https://plausible.io/docs/guided-tour) 的筛选联动，以及 [Umami](https://github.com/umami-software/umami) 的紧凑数据展示；使用本项目现有的原生 SVG、配色和控件实现。

## 关键词规则

- 普通文本忽略大小写；多个关键词需要全部匹配。
- `/pattern/` 区分大小写，`/pattern/i` 和 `regex:pattern` 忽略大小写。
- 作者与分类为精确匹配，忽略大小写。
- 屏蔽词用逗号或换行分隔，任一命中即排除。
- 暂停会保留已入队通知；恢复后继续投递，不追溯补发暂停期间未命中的帖子。

## Telegram

在 [BotFather](https://t.me/BotFather) 创建 Bot，将 Token 填入控制台，再向 Bot 发送 `/start` 完成绑定。

| 命令 | 用途 |
| --- | --- |
| `/start` | 绑定账号 |
| `/list` | 查看订阅 |
| `/add 关键词1 关键词2` | 添加订阅 |
| `/del 订阅ID` | 删除订阅 |
| `/post` | 查看最近帖子 |
| `/stop`、`/resume` | 暂停、恢复推送 |

## 故障排查

```bash
docker compose logs -f seekfeed
curl http://localhost:3010/health
```

RSS 验证页和抓取错误会显示在监控状态中。真实通知需要有效的 Bot Token 和接收账号。统计中的成功发送只计入实际投递成功的帖子。

## 许可证

[MIT](LICENSE)

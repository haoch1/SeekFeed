# SeekFeed

[![SeekFeed CI](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml/badge.svg)](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0066cc.svg)](LICENSE)

面向 **NodeSeek** 社区的轻量级自托管监控与分析平台。基于 **Bun + Hono + SQLite** 构建，提供 RSS 实时采集、关键词组合订阅、Telegram 即时推送与多维社区统计分析。

> **架构原则**：服务端 Hono JSX 渲染 + 原生 JavaScript / SVG，无重型前端框架、无常驻浏览器，单容器低内存运行（默认限制 256 MiB / 0.5 CPU）。
>
> **关于热榜**：热榜功能已从 `main` 分支移除并归档至 [`codex/archive-hot-ranking`](https://github.com/haoch1/SeekFeed/tree/codex/archive-hot-ranking) 分支，说明见 [热榜归档](docs/hot-ranking.md)。

---

## 核心功能

| 模块 | 说明 |
| --- | --- |
| **帖子动态** | RSS 定时采集与手动刷新；支持包含 / 容错搜索、分类与作者筛选、分页浏览；最新帖子与命中订阅独立保存筛选条件，命中帖子支持单条移除 |
| **关键词订阅** | 支持最多 3 个关键词组合（AND）、正则表达式（`/pattern/flags`、`regex:pattern`）、作者/分类精确限定与屏蔽词排除；支持暂停、恢复与编辑 |
| **Telegram 通知** | 支持 Webhook 与 Polling 双模式、持久化推送队列、失败退避重试与 Bot 交互命令 |
| **多维统计** | 发帖趋势（柱状/折线 + 放大查看）、分类占比与明细、作者贡献排行、24 小时活跃热力图、热门标题词、CSV 导出 |
| **关键词分析** | 指定日期的关键词发帖量与占比、1/3/6 小时分布、近 7 天趋势、最多 3 词对比及共同命中分析 |
| **采集诊断** | 记录 RSS 同步质量与运行状态，支持当前帖子内容同步 |
| **账号与安全** | 单管理员认证、自定义头像（256×256 PNG）、可选会话有效期（1 小时 ~ 30 天）、多设备会话查看与独立撤销 |

界面支持**浅色 / 深色 / 跟随系统**三种外观模式、键盘导航、移动端适配以及 PWA 安装。

---

## 快速部署（Docker Compose）

### 使用预构建镜像（推荐）

默认镜像发布于 GHCR（`ghcr.io/haoch1/seekfeed:latest`），原生支持 `linux/amd64` 与 `linux/arm64`：

```bash
git clone https://github.com/haoch1/SeekFeed.git
cd SeekFeed
cp .env.example .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

- 默认绑定 `127.0.0.1:3010`（建议配合 Nginx / Caddy / Cloudflare Tunnel 提供 HTTPS）。
- 同机访问 <http://localhost:3010>，首次打开会引导创建管理员账号，随后可在设置页配置 RSS 源与 Telegram Bot。
- 数据持久化于 `seekfeed_data` 卷；升级时重新执行 `pull` 和 `up -d`，容器启动会自动执行增量数据库迁移。

### 从源码构建

```bash
docker compose up -d --build
```

Dockerfile 采用 `BUILDPLATFORM` 原生跨平台打包 + BuildKit 依赖缓存挂载 + 零 `RUN` 运行阶段，单容器仅包含压缩后的单文件产物、静态资源与迁移 SQL，不携带 `node_modules`。更多部署、备份与反代说明见 [Docker 部署文档](docs/Docker.md)。

---

## 访问权限说明

SeekFeed 采用**单管理员模式**（不提供多用户租户隔离）：

- **访客**：可浏览公开帖子、公开社区统计与关键词分析；所有公开接口均剔除订阅规则与推送状态字段。
- **管理员**：完整访问订阅管理、命中订阅、推送状态、通知分析、采集诊断、RSS/Telegram 配置及账号设备管理。

---

## 订阅规则与 Telegram 命令

### 匹配规则

- **普通关键词**：忽略大小写，最多 3 个关键词需同时命中。
- **正则表达式**：`/pattern/` 区分大小写；`/pattern/i` 与 `regex:pattern` 忽略大小写。
- **过滤与排除**：作者与分类按精确条件过滤；屏蔽词以逗号或换行分隔，命中任一即跳过推送。
- **容错搜索**：帖子列表筛选支持可选的容错匹配（支持缺字、多字、替换与相邻字符交换，仅作用于列表搜索，不影响订阅与统计）。

### Telegram Bot 命令

在 [@BotFather](https://t.me/BotFather) 创建机器人并在设置页填入 Token 后，向机器人发送 `/start` 完成绑定：

| 命令 | 说明 |
| --- | --- |
| `/start`、`/help` | 绑定管理员账号 / 查看帮助 |
| `/list` | 查看当前订阅列表 |
| `/add 关键词1 关键词2` | 快速新增关键词订阅 |
| `/del 订阅ID` | 删除指定订阅 |
| `/post` | 查看最近 10 条帖子 |
| `/stop`、`/resume` | 暂停 / 恢复推送通知 |
| `/getme`、`/unbind` | 查看绑定状态 / 解除绑定 |

---

## 环境变量配置

完整模板见 [`.env.example`](.env.example)，显式环境变量优先于 `.env` 文件：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | `3010` / `0.0.0.0` | 服务监听端口与地址 |
| `DATABASE_PATH` | `./data/seekfeed.db` | SQLite 数据库文件路径 |
| `CORS_ORIGINS` | `http://localhost:3010` | 允许跨域的来源列表（逗号分隔） |
| `TRUST_PROXY` | `false` | 反向代理可信 IP 转发开关 |
| `RSS_CHECK_ENABLED` | `true` | 是否启用后台 RSS 定时采集 |
| `RSS_TIMEOUT` | `30000` | RSS 请求超时时间（毫秒） |
| `TELEGRAM_WEBHOOK_URL` | 未设置 | 可选的公网 HTTPS Webhook 地址 |

RSS 源地址、抓取间隔（默认 30 秒）、代理及 Telegram 配置均可在 Web 设置页动态修改。

---

## 本地开发

需要安装 [Bun](https://bun.sh/)（CI 与容器固定使用 Bun 1.4.3）：

```bash
bun install --frozen-lockfile
bun run dev          # 启动热重载开发服务器 (http://localhost:3010)
bun test             # 运行全部单元测试
bun run build        # 打包并压缩生产产物至 dist/
bun run scripts/verify-bundle.ts  # 离线验证无 node_modules 独立运行
bun run start        # 启动生产构建
```

---

## 文档导航

- [项目简介](ABOUT.md) · [文档索引](docs/README.md) · [API 文档](API.md)
- [Docker 部署](docs/Docker.md) · [CI/CD 说明](docs/CI-CD.md) · [统计口径](docs/analytics.md)
- [采集与数据质量](docs/collection-insights.md) · [界面规范](docs/style-guide.md) · [开发指南](CONTRIBUTING.md)

## 许可证

基于 [MIT](LICENSE) 协议开源。第三方图标与依赖许可分别位于 [`licenses/`](licenses/) 与构建产物 `dist/THIRD_PARTY_LICENSES.txt`。

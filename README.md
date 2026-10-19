# SeekFeed

[![SeekFeed CI](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml/badge.svg)](https://github.com/haoch1/SeekFeed/actions/workflows/docker-build.yml)

NodeSeek 新帖监控、关键词筛选与 Telegram 消息通知。基于 **Bun + Hono + SQLite**，提供统一的 ReUI 风格控制台、明暗主题和移动端布局。

## 功能

- RSS 自动抓取、手动同步、抓取间隔和代理设置。
- 最多三个关键词组合、正则表达式、精确作者/分类过滤、屏蔽词和独立暂停。
- Telegram Bot 消息通知、每轮发送上限、失败重试与待发送队列。
- 帖子搜索、多条件筛选、分页、真实发送统计和监控状态。
- Session 登录、首次使用创建管理员、PWA 桌面安装与静态资源缓存。

[项目对比与优化记录](docs/OPTIMIZATION.md) · [界面组件规范](docs/style-guide.md) · [API 文档](API.md)

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
| `TELEGRAM_WEBHOOK_URL` | 无 | 可选 Webhook URL |

RSS 地址、抓取间隔、代理、Bot Token 与消息接收账号分别在独立设置页管理。「账号与安全」支持修改用户名和密码、设置 1 小时/1 天/7 天/30 天的登录有效期、查看活跃设备与退出所有设备。修改账号需验证当前密码并重新登录。PWA 只缓存静态资源，消息通知通过 Telegram 发送。

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

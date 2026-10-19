# SeekFeed Docker 部署

## 全新安装

在 SeekFeed 源码目录运行：

```bash
docker compose up -d --build
docker compose logs -f seekfeed
```

访问 <http://localhost:3010> 并创建管理员。数据库和表结构会自动初始化。

| 对象 | 名称 |
| --- | --- |
| Compose 项目、服务、容器 | `seekfeed` |
| 本地镜像 | `seekfeed:latest` |
| 数据卷 | `seekfeed_data` |
| 日志卷 | `seekfeed_logs` |
| 网络 | `seekfeed_network` |
| 容器内数据库 | `/usr/src/app/data/seekfeed.db` |
| 入口与应用进程标题 | `dist/seekfeed.js`、`SeekFeed` |

容器直接运行 Bun 入口，使用 `bun` 非特权用户。进程标题为 `SeekFeed`；Windows 本地运行时任务管理器的可执行文件仍为 Bun 运行时 `bun.exe`。

## 可选配置

复制 `.env.example` 为 `.env`。例如：

```dotenv
PORT=3010
CORS_ORIGINS=https://feed.example.com
RSS_CHECK_ENABLED=true
RSS_TIMEOUT=30000
```

Compose 将主机 `PORT` 映射到容器内固定的 3010。RSS URL、间隔、代理和 Telegram 配置在 Web 控制台管理。

## 生产部署

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

生产配置包含 CPU/内存限制和滚动日志。对外访问时按实际域名配置反向代理和 HTTPS。如使用自己的镜像仓库，设置 `SEEKFEED_IMAGE` 并执行 `pull`、`up -d --no-build`；无需构建本地源码。

## 日常维护

```bash
docker compose ps
docker compose logs --tail=100 seekfeed
curl http://localhost:3010/health
docker compose restart seekfeed
```

## 数据备份与恢复

停止服务后复制整个数据目录，包含可能存在的 SQLite WAL 文件：

```bash
mkdir -p backup
docker compose stop seekfeed
docker cp seekfeed:/usr/src/app/data/. ./backup/
docker compose start seekfeed
```

恢复时先停止服务，再复制已备份的数据：

```bash
docker compose stop seekfeed
docker cp ./backup/. seekfeed:/usr/src/app/data/
docker compose start seekfeed
```

普通 `docker compose down` 保留数据卷。`docker compose down -v` 会删除数据卷，执行前自行确认备份。

## 构建

```bash
docker build -t seekfeed:latest .
```

Dockerfile 使用 `bun.lock` 安装依赖，构建入口为 `src/seekfeed.ts`，镜像包含启动时所需 SQL 文件和静态资源。健康检查访问 `/health`。

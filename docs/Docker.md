# SeekFeed Docker 部署

## 运行方式

生产部署使用预构建 GHCR 镜像：

```bash
cp .env.example .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

默认绑定 `127.0.0.1:3010`，通过同机反向代理提供公网 HTTPS。首次访问创建管理员，随后配置 RSS 与 Telegram。预构建镜像支持 amd64 与 arm64，并内置热榜 Python 依赖。

开发或源码部署使用 `docker compose up -d --build`。同一实例的维护命令应始终使用对应 Compose 文件。

| 对象 | 名称／路径 |
| --- | --- |
| Compose 项目、服务、容器 | `seekfeed` |
| 生产镜像 | `ghcr.io/haoch1/seekfeed:latest` |
| 数据卷、日志卷 | `seekfeed_data`、`seekfeed_logs` |
| 网络 | `seekfeed_network`、`seekfeed_browser` |
| 浏览器容器／配置卷 | `seekfeed-browser`、`seekfeed_browser_profile` |
| 数据库 | `/usr/src/app/data/seekfeed.db` |
| 入口 | `dist/seekfeed.js` |

## 配置与代理

配置模板见 [.env.example](../.env.example)。生产 Compose 将主机 `PORT` 映射到容器固定的 3010。`SEEKFEED_IMAGE` 可指定标签或摘要；`SEEKFEED_BIND_ADDRESS` 控制主机绑定地址。容器以内置非特权用户运行。

RSS URL、抓取间隔、代理、Bot Token 与接收账号在网页设置中管理。公网来源应加入 `CORS_ORIGINS`。Webhook 必须使用 Telegram 可访问的 HTTPS 地址，可显式配置 `TELEGRAM_WEBHOOK_URL`。

默认 `TRUST_PROXY=false`，登录设备记录 TCP 对端地址。只有受控反向代理作为唯一公网入口时，才设置 `TRUST_PROXY=true`，并保持应用端口仅绑定回环地址。Nginx 必须覆盖客户端提交的 IP 头：

```nginx
location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 900s;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

直接暴露应用端口的部署应保持 `TRUST_PROXY=false`。已有会话保留创建时记录的 IP。

## 热榜浏览器与人工验证

生产 Compose 自动运行固定摘要的 Chromium 侧车，限制为 1280 MiB 内存、0.75 CPU、256 MiB 共享内存。应用容器保持原有 512 MiB 限制。浏览器通过 `seekfeed_browser` 私有桥接网络连接，不发布 5800、5900 或 9222 端口；禁止将 CDP 直接暴露至公网。浏览器需要正常访问外网，网络不应设为 `internal: true`。768 MiB 限制在 US-RAK 验证期间触发过 Chromium 子进程 OOM，不作为生产推荐值。

配置与验证状态保存在 `seekfeed_browser_profile`。更新或重建容器时保留该卷；备份须包含应用数据和浏览器配置卷，浏览器配置按私有会话数据保护。首次使用或验证失效后，登录 SeekFeed，在“RSS 配置 → 热榜采集”打开“人工验证”，完成验证进入帖子列表后返回点击“恢复采集”。入口 15 分钟到期后可重新打开，不会自动恢复采集。反向代理必须透传 WebSocket 升级头，且保留原始 Host；入口使用与 SeekFeed 相同的 HTTPS 域名。

`docker-compose.yml` 为源码开发部署，默认保留 HTTP 适配器。需要与生产一致的浏览器部署时，可先构建镜像，再设置 `SEEKFEED_IMAGE=seekfeed:latest` 使用 `docker-compose.prod.yml`。

## 更新与版本核对

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 seekfeed
curl -f http://127.0.0.1:3010/health
docker inspect seekfeed --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
```

启动时自动执行未应用的迁移。更新保留数据卷及其中的订阅、配置、会话和头像。正式升级前应记录运行版本并备份；回滚旧镜像前需核对其数据库结构兼容性，必要时恢复对应备份。备份恢复会撤销备份之后的数据变化。

迁移 `015_remove_post_history.sql` 删除互动趋势与帖子修改历史的专用表，不删除当前帖子内容、浏览量、回复量、热度或热度计算使用的近两小时样本。旧版本若依赖已删除的表，恢复时需要使用对应版本的数据库备份。

HTML 响应使用 `Cache-Control: no-store`；CSS 与 JavaScript 地址包含发布版本标识，当前版本资源使用长期缓存。Service Worker 仅缓存图标与清单，不缓存页面、API、CSS 或 JavaScript。页面从后台恢复时检查版本：只读页面自动加载新版本，设置页、订阅编辑页与已打开的弹窗提供更新提示，以保留未提交的输入。断网时保留当前页面，不强制刷新。

## 备份与恢复

以下命令使用停机复制方式，避免仅复制主数据库文件遗漏未合并的 WAL。备份应使用独立目录并存储于受控位置；数据库包含 Bot Token、会话和配置等私有数据。

```bash
mkdir -p backup
docker compose -f docker-compose.prod.yml stop seekfeed
docker cp seekfeed:/usr/src/app/data/. ./backup/
docker compose -f docker-compose.prod.yml start seekfeed
```

恢复前停止服务，使用完整且一致的备份替换目标数据目录；应先移出原有目录内容，避免遗留 WAL 与恢复的主文件不匹配。复制示例：

```bash
docker compose -f docker-compose.prod.yml stop seekfeed
docker cp ./backup/. seekfeed:/usr/src/app/data/
docker compose -f docker-compose.prod.yml start seekfeed
```

恢复后检查运行用户对目录及文件的写权限、健康状态、订阅和配置。在线备份应使用 SQLite Backup API 等一致性机制，不应直接复制正在写入的主文件。

普通 `docker compose down` 保留数据卷；`down -v` 会删除数据卷。不得将清理数据卷作为常规升级步骤。

## 资源与维护

生产配置包含 CPU／内存限制、健康检查及 Docker 日志轮转。故障排查应结合容器状态、`/health` 和应用日志；采集异常可能处于退避期，不等同于 Web 服务不可用。

清理旧文件或镜像前应核对绝对路径、运行容器引用和保留版本。数据库、WAL、SHM、环境文件与当前数据卷不属于部署缓存。旧备份应按明确的保留策略处理，不使用全局清理替代项目级检查。

从源码构建：

```bash
docker build -t seekfeed:latest .
```

Dockerfile 根据 `bun.lock` 安装依赖，并复制静态资源、采集器及启动迁移所需 SQL。完整发布流程见 [CI/CD](CI-CD.md)。

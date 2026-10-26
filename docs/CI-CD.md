# SeekFeed CI/CD

工作流位于 [docker-build.yml](../.github/workflows/docker-build.yml)。

## 触发与验证

`main`、`develop` 分支推送、`v*` 标签、目标为 `main` 的 Pull Request 以及手动触发均进入工作流。

测试任务使用 Bun 1.4.3，依次安装锁定依赖、运行 Bun 测试、生产构建及无 node_modules 的独立运行验收。测试通过后才执行容器构建。

验证使用本地数据库与模拟响应，不访问 NodeSeek。覆盖 RSS/通知状态、热榜移除、旧接口失效及数据清理迁移；部署核对镜像提交、健康、持久数据与资源占用，不触发热榜采集。

```bash
bun install --frozen-lockfile
bun test
bun run build
bun run scripts/verify-bundle.ts
```

独立运行验收将生产文件复制到临时目录，禁用依赖自动安装与 RSS 调度，验证首次初始化、登录、当前迁移结构、帖子、统计、诊断以及成功／失败健康检查。只访问本地服务，不请求 NodeSeek。Windows 本地运行可通过 `SEEKFEED_TEST_TEMP` 指定任务临时目录。

## 镜像与标签

Buildx 构建 `linux/amd64` 与 `linux/arm64`。镜像地址根据仓库所有者生成，默认部署地址为 [ghcr.io/haoch1/seekfeed](https://github.com/haoch1/SeekFeed/pkgs/container/seekfeed)。

| 来源 | 标签 |
| --- | --- |
| `main` | `main`、`latest`、`sha-<短提交号>` |
| `develop` | `develop`、`sha-<短提交号>` |
| `v1.2.3` | `1.2.3`、`sha-<短提交号>` |
| Pull Request | 仅构建验证，不推送镜像 |

GHCR 发布使用 `GITHUB_TOKEN`，发布任务需要 Packages 写权限。镜像包含 OCI 提交标识，可用于核对源码与运行版本。

## 生产更新

工作流发布镜像，不自动连接部署主机。管理员通过生产 Compose 拉取并启动：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
curl -f http://127.0.0.1:3010/health
```

可通过 `SEEKFEED_IMAGE` 固定提交标签或镜像摘要。更新前应备份数据库，检查目标镜像与提交；数据库迁移可能影响旧镜像兼容性，回滚方案需同时考虑结构版本。操作步骤见 [Docker 部署](Docker.md)。

## 手动构建

`build-and-push.sh` 默认仅构建 `seekfeed:latest`。发布到自定义仓库前需完成仓库登录，并显式传入 `--push`：

```bash
./build-and-push.sh
SEEKFEED_IMAGE=registry.example.com/account/seekfeed SEEKFEED_TAG=1.0.0 ./build-and-push.sh --push
```

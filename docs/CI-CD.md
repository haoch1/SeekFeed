# SeekFeed CI/CD

工作流：`.github/workflows/docker-build.yml`。

- `main`、`develop`、`v*` 标签、发往 `main` 的 PR 以及手动触发均执行测试与构建。
- Bun 1.4.3 安装锁定依赖，运行 `bun test` 和生产构建。
- Buildx 构建 `linux/amd64` 与 `linux/arm64` 镜像。
- PR 只构建；分支/标签构建成功后发布到当前仓库所有者的 GHCR 空间，镜像名固定为 `seekfeed`。
- `main` 生成 `latest`，`develop` 生成 `develop`，版本标签 `v1.2.3` 生成 `1.2.3`。

工作流读取当前 `github.repository_owner`，没有硬编码个人账号。使用 GitHub 提供的 `GITHUB_TOKEN`；仓库 Actions 需允许写入 Packages。

## 本地构建与发布

```bash
./build-and-push.sh
# 先自行登录目标镜像仓库，再指定自己的镜像地址：
SEEKFEED_IMAGE=registry.example.com/account/seekfeed SEEKFEED_TAG=1.0.0 ./build-and-push.sh --push
```

脚本默认只构建 `seekfeed:latest`，只有显式提供 `--push` 才发布。部署时将自己的镜像地址设为 `SEEKFEED_IMAGE`，再执行：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --no-build
```

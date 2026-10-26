# 热榜归档与恢复

2026-10-26 起，主分支移除热榜功能。完整代码、Python 采集器、浏览器控制、测试和原始文档保存在 [codex/archive-hot-ranking](https://github.com/haoch1/SeekFeed/tree/codex/archive-hot-ranking)，归档提交为 `bad3309745ea10475ecc0952107f25743efc5f96`。该分支是恢复参考，不参与主分支镜像发布。

## 当前行为

- 首页及旧 `/hot` 地址进入“最新帖子”；侧栏、RSS 设置、PWA 快捷入口和 Telegram 菜单不再包含热榜。
- `/api/hot` 及子路径、`/hot-verification` 及子路径返回 `410`，旧环境变量无法重新启用采集。
- 不再运行热榜定时器、详情作者补全、Python 采集器、Chromium 或浏览器控制服务；镜像不再安装 Python 依赖。
- 迁移 `018_retire_hot_ranking.sql` 删除热榜帖子、样本、采集状态、作者补全队列及相应诊断，并清空采集器保存的数字作者 ID。RSS 帖子与作者名称、订阅、账号、会话和通知状态保留。
- 迁移 `019_remove_collector_identity.sql` 进一步删除采集器身份表，前后端不再包含作者 ID 关联和主页提示逻辑。历史迁移文件仅用于兼容已有数据库；新安装执行全部迁移后也不保留热榜表。不得删除已执行的迁移记录。

部署时还须停止并移除旧 `seekfeed-browser`、`seekfeed-browser-control` 容器，删除 `seekfeed_browser_profile`、`seekfeed_browser_control` 卷与未使用的私有浏览器网络，删除应用数据目录中的 `hot-http-session.json`。数据库清理后执行 WAL checkpoint 和 VACUUM 回收空间；临时升级备份确认验证成功后删除。不要删除 RSS 数据卷。

## 以后恢复

1. 从最新主分支新建 `codex/restore-hot-ranking`，参考归档分支逐项恢复功能，或审查后撤销移除提交。不要直接把旧分支作为生产版本覆盖新功能。
2. 新增向前迁移重建热榜与作者补全的最终表结构。旧数据库已记录 `018`，仅恢复代码或旧 SQL 文件不会重建被删除的表；不要删除迁移记录或恢复已清理的旧数据。
3. 恢复采集依赖、身份数据表与关联逻辑、构建入口、Compose 私有服务、网页及 Telegram 接入，并运行归档测试及当前 RSS/账号回归测试。旧环境变量、CF 会话与浏览器配置不自动恢复。
4. 保持 HTTP 为主、300 秒最小间隔、无重叠、CF 暂停和人工验证；先用夹具测试，再至多验收一轮真实采集。新的榜单数据需重新积累，人工验证也需重新完成。

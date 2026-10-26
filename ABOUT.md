# 关于 SeekFeed

SeekFeed 是面向 NodeSeek 社区的自托管监控与分析平台，集成 RSS 帖子采集、关键词订阅、Telegram 通知及社区统计分析。

## 项目定位

项目采用单管理员模式。访客可访问论坛公开内容及其聚合统计；订阅规则、命中记录、投递状态、系统配置与设备管理仅对通过认证的管理员开放。项目不提供多用户租户隔离。

SeekFeed 为独立项目，不属于 NodeSeek 官方产品。帖子来自已配置 RSS，统计基于已收录帖子；数据完整性取决于来源覆盖、保留范围与 RSS 同步状态。

## 技术架构

- 运行时与服务：Bun、Hono、TypeScript、服务端 JSX。
- 数据存储：SQLite，包含订阅、帖子、会话与通知状态。
- 前端：原生 JavaScript、CSS 变量及 SVG 图表，无客户端 React 运行时。
- RSS 同步：原生 HTTP、非重叠调度及失败退避，不依赖 Python 或浏览器。
- 部署：Bun slim 单容器、GHCR 多架构镜像及 GitHub Actions；运行镜像只包含打包代码、静态文件和迁移 SQL，不包含 node_modules 或构建工具。

## 设计与来源

界面采用靛蓝主色、中性面板与统一线性图标，支持明暗主题、键盘操作和移动端触控。参考项目、具体采用范围及第三方资源许可统一记录于 [README](README.md#参考项目与资源)。

## 相关文档

[功能与部署入口](README.md) · [统计口径](docs/analytics.md) · [热榜归档](docs/hot-ranking.md) · [开发指南](CONTRIBUTING.md) · [MIT 许可证](LICENSE)

## 采集与数据质量

系统提供 RSS 采集质量记录和当前内容同步，作者按 RSS 原始名称显示。内容更新保留已推送与已删除命中的状态，订阅规则保持精准匹配。采集结果受来源覆盖及保留范围约束，具体定义与开源实现参考见 [采集与数据质量](docs/collection-insights.md)。

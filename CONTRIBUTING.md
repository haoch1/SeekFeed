# SeekFeed 开发指南

## 环境与运行

项目使用 Bun 1.4.3，锁定文件为 `bun.lock`。主分支不需要 Python 或 Chromium；热榜实现与测试见 `codex/archive-hot-ranking`。

```bash
bun install --frozen-lockfile
bun run dev
```

默认监听 `http://localhost:3010`。首次访问创建管理员。服务启动时自动执行迁移；RSS 可通过 `RSS_CHECK_ENABLED=false` 关闭；热榜代码已从主分支移除。

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/seekfeed.ts`、`src/index.ts` | 入口、服务与路由装配 |
| `src/components/` | 服务端 JSX 页面与组件 |
| `src/routes/`、`src/middleware/` | API、页面、认证与校验 |
| `src/services/` | 采集、匹配、通知、统计与存储 |
| `src/database/migrations/` | 按顺序执行的 SQL 迁移 |
| `public/css/`、`public/js/` | 主题、布局与浏览器交互 |

## 验证

```bash
bun test
bun run build
git diff --check
```

Bun 构建验证打包与转译，不替代完整的 TypeScript 类型检查。项目未配置独立的 ESLint 或 Biome 工作流。

界面修改应验证桌面与窄屏布局、明暗主题、键盘操作、触控、加载与错误状态。认证修改应覆盖访客、有效会话、伪造、过期及注销会话。自动化测试应使用隔离数据库和受控网络样本。

## 数据库维护

`bun run db:migrate` 仅执行未应用的迁移。新增结构需同时登记迁移文件，并更新依赖完整结构的测试夹具。已发布迁移不应修改。

`bun run db:reset` 会重置数据库；`bun run db:resetuser` 用于重置管理员。执行前应备份并确认目标数据库路径，不得对生产数据库执行开发测试。

## 代码与文档

使用 TypeScript ES 模块、四空格缩进及分号。API 输入应通过 Schema 或专用校验函数验证；受保护操作必须在服务端检查 Session。数据库修改后应失效相关缓存。

整个项目必须保持低 CPU、低内存：使用现有服务端渲染与原生 JavaScript，不为常规功能增加常驻浏览器、重型前端框架或额外后台服务。自动轮询应暂停隐藏页面，查询缓存必须有容量和有效期上限；采集任务不得重叠。不恢复热榜采集或浏览器服务，除非用户明确要求。性能相关变更需用本地夹具、查询／页面检查及实际资源快照验证，不以高频源站抓取代替测试。

功能变更需同步更新 README 及对应部署、API、统计或界面文档。文档使用正式、客观的技术表述，明确默认值、限制与适用范围；功能参考集中登记于 README，实际使用的第三方资源保留许可。

问题与变更说明应包含触发条件、预期行为、实际行为及验证结果。不得提交数据库、令牌、会话、未脱敏日志或临时截图。

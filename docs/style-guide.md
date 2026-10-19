# SeekFeed 组件规范

界面参考 [ReUI Components](https://reui.io/components) 的布局与组件组织方式，使用 Hono JSX 和原生 JavaScript 实现。所有页面共用 `Layout.tsx` 和 `public/css/workspace.css`；不加载旧主题样式。

具体对照 ReUI 官方的 [带图标分段选项 c-tabs-9](https://github.com/keenthemes/reui/blob/main/public/r/styles/radix-nova/c-tabs-9.json)、[开关 c-switch-1](https://github.com/keenthemes/reui/blob/main/public/r/styles/radix-nova/c-switch-1.json) 和 [省略号分页 c-pagination-10](https://github.com/keenthemes/reui/blob/main/public/r/styles/radix-nova/c-pagination-10.json)。保留等宽选项、清晰选中态、统一图标间距、首尾页和省略号，并适配当前 Hono 页面和品牌色。

## 设计变量

| 类别 | 规范 |
| --- | --- |
| 主色 | `#4f46e5`，悬停 `#4338ca` |
| 明亮背景、正文、边框 | `#ffffff`、`#18181b`、`#e4e4e7` |
| 深色背景、正文、边框 | `#101012`、`#f4f4f5`、`#2d2d33` |
| 字体 | 系统 sans-serif，中文使用 Microsoft YaHei 等本机字体 |
| 字号 | 正文/控件 13–14px，辅助 11–12px，页面标题 24px |
| 圆角 | 控件 6px，面板 8px；不混用大胶囊和渐变卡片 |
| 线条 | 1px 中性边框，功能图标使用 Lucide、24px 网格、1.7px 描边 |
| 间距 | 4px 基础刻度，内容区 30px，移动端 16px |

颜色、边框、字体和焦点样式通过 CSS 变量统一提供；明暗主题只覆盖变量。

SeekFeed 品牌使用原创 S 形标识，界面、favicon、Apple 图标与 PWA 使用同一源文件。功能图标选自 [Lucide Static](https://lucide.dev/guide/static) 1.59.0，图标路径统一存放在 `src/components/icons.json` 中，服务端与动态组件均内联渲染 SVG，避免主题切换后外部引用失效；导航、按钮、关闭、主题切换、空状态与通知共用该图标集，许可见 `licenses/lucide.txt`。

## 组件

- **工作台**：228px 侧栏、56px 顶栏、三栏统计、紧凑帖子列表。
- **按钮**：主按钮、描边次按钮、文字按钮、危险按钮共享高度、圆角和焦点环。
- **表单**：输入框、选择器、开关、分段选择、辅助文字共用样式；每个控件关联 label。
- **反馈**：状态徽标、空状态、加载骨架与 Toast 使用一致色板，文案反映真实数据。
- **页面**：订阅 `/subscriptions`、统计 `/statistics`、账号与安全 `/settings/account`、RSS `/settings/rss`、Telegram `/settings/telegram` 使用独立地址，支持直达、刷新和前进后退。配置在宽屏使用双栏卡片，窄屏堆叠，避免固定表单宽度留下大块空白。
- **临时操作**：登录和危险操作确认使用居中对话框，支持 Escape、焦点管理。
- **独立页面**：初始化、错误与 PWA 检查页面共用品牌、边框、输入和按钮。

## 交互与适配

登录对话框支持 Escape、遮罩关闭、焦点圈定/恢复，背景设为 inert。窄屏折叠侧栏，表单在 320px 起保持无水平溢出。动效尊重 `prefers-reduced-motion`，所有可操作元素具备键盘焦点状态。

列表搜索和作者筛选独立防抖，使用 AbortController 避免旧响应覆盖新结果。列表翻页保留当前行高与滚动位置，数字按钮保留首尾页和省略号。错误保留当前结果并提供重试，空列表提供清空筛选入口。

非登录输入由 `FieldInput` 统一标记 `data-1p-ignore` 和 `data-op-ignore`；登录表单保留 username/current-password 的语义。选择器支持方向键、Home/End、输入定位和 Escape。保存按钮有忙碌状态，禁止重复提交。

Telegram 保留语义明确的原生图标（📰 帖子、📋 订阅、👤 账号、🔔 通知、✈️ 测试），不使用试管图标。图标仅置于标题或字段开头，字段间空一行。最近帖子的序号使用等宽 01–10 和统一间距，展示时统一全角方括号；数据库原文保持不变。帖子与订阅通知启用链接预览。原生命令菜单使用 SeekFeed 头像和简短说明；动态文本必须转义，长列表按完整条目拆分消息。

## Surface contrast, aligned settings and category selection

The workspace uses a light neutral canvas with white cards, visible cool-gray borders and subtle elevation. Dark surfaces use separate border tokens. ReUI card/input hierarchy is shared across all seven routes rather than tuned per screenshot. Two-column settings stretch the primary card to the full height of the two related cards, with its actions at the bottom; narrow screens stack naturally.

Category selects use one accessible multi-select with persistent checkboxes, a selected count, select-all and clear actions. Keyboard navigation, Space/Enter toggling and Escape remain available. Category keys are stored as a comma-separated set in the existing field; boards use OR, other conditions use AND. Post pagination applies the exact same SQL IN filter to its result and total queries.

Active devices show the IP recorded at login. Direct deployments use the socket address. Deployments behind a controlled reverse proxy can enable TRUST_PROXY=true; that proxy must overwrite X-Real-IP and keep the application port private. Existing sessions retain their original recorded IP.

The feed polls current results every 10 seconds while visible and refreshes on returning to the tab. Page one reconciles keyed post rows without a loading flash, preserving the visible post anchor. Older pages retain their contents and show a compact new-post action. Filters and page selection remain intact; hidden tabs and settings pages do not poll the post list.

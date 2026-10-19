# SeekFeed 组件规范

界面参考 [ReUI Components](https://reui.io/components) 的布局与组件组织方式，使用 Hono JSX 和原生 JavaScript 实现。所有页面共用 `Layout.tsx` 和 `public/css/workspace.css`；不加载旧主题样式。

## 设计变量

| 类别 | 规范 |
| --- | --- |
| 主色 | `#4f46e5`，悬停 `#4338ca` |
| 明亮背景、正文、边框 | `#ffffff`、`#18181b`、`#e4e4e7` |
| 深色背景、正文、边框 | `#101012`、`#f4f4f5`、`#2d2d33` |
| 字体 | 系统 sans-serif，中文使用 Microsoft YaHei 等本机字体 |
| 字号 | 正文/控件 13–14px，辅助 11–12px，页面标题 24px |
| 圆角 | 控件 6px，面板 8px；不混用大胶囊和渐变卡片 |
| 线条 | 1px 中性边框，功能图标使用 Lucide、24px 网格、1.8px 描边 |
| 间距 | 4px 基础刻度，内容区 30px，移动端 16px |

颜色、边框、字体和焦点样式通过 CSS 变量统一提供；明暗主题只覆盖变量。

SeekFeed 品牌使用原创 S 形标识，界面、favicon、Apple 图标与 PWA 使用同一源文件。功能图标选自 [Lucide Static](https://lucide.dev/guide/static) 1.59.0，30 个图标打包在 `public/icons/ui.svg` 中；导航、按钮、关闭、主题切换、空状态与通知共用该图标集，许可见 `licenses/lucide.txt`。

## 组件

- **工作台**：228px 侧栏、56px 顶栏、三栏统计、紧凑帖子列表。
- **按钮**：主按钮、描边次按钮、文字按钮、危险按钮共享高度、圆角和焦点环。
- **表单**：输入框、选择器、开关、分段选择、辅助文字共用样式；每个控件关联 label。
- **反馈**：状态徽标、空状态、加载骨架与 Toast 使用一致色板，文案反映真实数据。
- **面板**：订阅、RSS、Telegram、统计和登录共用抽屉，最大宽度 440px/520px。
- **独立页面**：初始化、错误与 PWA 检查页面共用品牌、边框、输入和按钮。

## 交互与适配

面板支持 Escape、遮罩关闭、焦点圈定/恢复，背景设为 inert。窄屏折叠侧栏，抽屉使用全宽。动效尊重 `prefers-reduced-motion`，所有可操作元素具备键盘焦点状态。

列表搜索和作者筛选独立防抖，使用 AbortController 避免旧响应覆盖新结果。错误和空列表提供刷新/清空筛选的恢复入口。

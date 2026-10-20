# SeekFeed 图标资源

`seekfeed.svg` 为 SeekFeed 的 S 形品牌标识。`seekfeed-192.png` 与 `seekfeed-512.png` 使用相同标识，分别供 PWA、Apple Touch Icon 及系统图标使用。

功能图标采用 Lucide Static 1.59.0 的选定路径，统一保存在 `src/components/icons.json`。服务端组件与浏览器动态内容均内联渲染 SVG，不依赖客户端图标运行时。目录中的 `ui.svg` 为静态图标资源。

第三方许可原文见 [Lucide 许可](../../licenses/lucide.txt)，项目与参考来源见 [README](../../README.md#参考项目与资源)。账号上传头像属于用户数据，保存在数据库中，不写入本目录。

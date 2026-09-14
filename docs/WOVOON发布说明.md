# Wovoon 离线网页包

平台发布页 https://creator.wovoon.com/publish 的「静态作品上传」说明要求：关闭服务器后双击 index.html 仍可游玩；验证通过后在 ZIP 根目录放置 .wovoongame，与 index.html 同级。标识文件本身不会修复资源加载。

普通 H5 包需要 HTTP 服务，不能仅增加标识文件冒充本地静态版本。本导出使用独立 IIFE 脚本、不使用浏览器 ES 模块加载；图片、模型、音频嵌入 resources.js，按需转换为 Blob URL。导出专用运行适配覆盖 fetch、图片、媒体与 CSS 资源地址，不加入常规网页和 APK 构建。

## 构建

在项目根目录执行 `node scripts/build-wovoon.mjs 1.0.3`。输出在 `releases/abysswait-wovoon-1.0.3/`，双击其中 index.html 检查场景、图片、音频和交互。不要更改浏览器安全设置，不需要启动 HTTP 服务。

验收后执行 `node scripts/build-wovoon.mjs 1.0.3 --verified` 生成带标识的 ZIP；参数表示操作者已验证此源码版本，不代表平台已经审核通过。需要 Node.js/npm 和 Python，依赖先执行 npm ci。导出目录是构建产物，重建会清空相应版本的目录，不在其中保存手工文件。

上传整个 `abysswait-wovoon-1.0.3.zip`，不要额外套一层文件夹，也不要把标识改名为 .wovoongame.txt。不上传 APK 或普通 H5 ZIP。

## 本次验证

- 使用 Chromium 默认安全设置，无本地 HTTP 服务，file:// 加载，浏览器网络设置为 offline。
- 首次隐私同意、主菜单、剧情跳过、视角选择、首层运行通过。
- 6 / 11 / 16 / 21 / 25 层场景生成返回成功；音乐媒体 readyState=4、paused=false、无媒体错误。
- 未发现破损 DOM 图片、资源请求失败或脚本异常。未执行完整一局真人操作，未登录 Wovoon 上传或验证平台内嵌运行环境。
- 1.0.3 包含终层通关与旧档主线补记修复。

离线导出首次会读取完整资源容器。嵌入后文本体积增加，但 ZIP 会压缩；没有降低素材画质。网站来源或本地文件位置变化可能使用不同存储空间，请保留旧存档，不把它视为跨平台云存档。

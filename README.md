# 深渊，请等一下

**一段弹错的旋律，一场来不及准备的冒险。**

由 **桑尼工作室** 制作的像素风格化 3D 地牢动作游戏。探索随机房间、收集装备、组合技能与天赋，在一局 25 层的冒险里，把自己的流派一点点练成。

![深渊，请等一下 · 宣传美术](art/promotion/taptap-covers-v1/horizontal-1380x645.jpg)

> 上图为游戏宣传美术，非实机截图。项目处于持续开发与移动端发布准备阶段。

[立即游玩](https://mineworld-rose.vercel.app/) · [Cloudflare 入口](https://mineworld-c5z.pages.dev/) · [隐私政策](https://mineworld-rose.vercel.app/privacy.html) · [反馈问题](https://github.com/CSUNX233/mineworld/issues)

## 在深渊里做什么

- **走完 25 层，也可以见好就收。** 每 5 层迎战一位 Boss；完成阶段目标后可提前结算，或带着当前构筑继续深入。
- **装备改变打法。** 随机词条、可混搭套装、暗金装备与 Boss 专属武器，配合局内天赋和技能，发展近战、元素、召唤等构筑。
- **探索不只靠扩大地图。** 不同章节有各自的场景、房间、通路、机关与敌人；商店、试炼、宝藏和补给穿插其中。
- **战斗需要位置和时机。** 应对追逐、冲锋、远程攻击与 Boss 阶段变化；可以跳跃，也可以通过召唤物指令协同作战。
- **失败也有成长。** 结算获得研究经验，推进跨存档共享的营地天赋。单局装备不带出，图鉴与局外成长留下冒险的痕迹。

## 选择你的视角

支持第一人称与第三人称，游戏内可以随时切换。手机以横屏体验为主，提供浮动移动摇杆、攻击与方向技能拖动瞄准，以及触屏背包和交互界面。

移动端跳跃通过**连续两次没有拖动的移动摇杆点击**触发。非方向类技能直接点击使用。电脑使用 WASD 移动、鼠标瞄准和攻击；完整键位、技能操作与召唤指令请查看主菜单的 **操作说明**，灵敏度和音量可在暂停菜单调整。

首次使用先阅读隐私说明；新玩家进入开场剧情与首层冒险。已有玩家可在开始游戏后的界面管理五个存档，并从独立入口进入营地天赋树。

## Android 版本

当前本地签名包：**1.0.2 / versionCode 3**，包名 `com.csunx233.abysswait`。

- Capacitor 封装，游戏资源随 APK 提供；Android 7.0 及以上，需要支持 WebGL 2 的较新系统 WebView。
- 当前无内购、广告、注册账号或云存档。首次隐私说明和政策全文已接入。
- APK 尚未在本仓库发布下载，也不表示已通过 TapTap 审核。实名认证／防沉迷接入及隐私检测仍需完成。
- 浏览器与 APK 存档相互独立；Android 更新请覆盖安装，保持包名和签名不变，**不要先卸载旧版**。

### 自己打包

本项目使用 Node.js / npm、JDK 21、Android SDK 36。先安装依赖，并按照 [Android 打包说明](docs/Android打包与TapTap发布.md) 配置工具与自己的发布签名。

在本机 PowerShell 中打下一个版本：

```powershell
Set-Location D:\34229\mineworld
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -VersionName 1.0.3 -VersionCode 4
```

脚本自动构建网页、同步 Android 资源、生成签名 APK 并验证签名。产物为 `releases/abysswait-1.0.3-release.apk`。每次发布增加 `VersionCode`，继续使用原签名；私钥、密码和 APK 不提交到 Git。

## 本地运行

```bash
npm ci
npm run dev
```

打开终端显示的本地地址。生产构建与预览：

```bash
npm run build
npm run preview
```

基础检查：

```bash
npm run typecheck
npm test
```

`npm test` 运行核心测试，不代表全部玩法或真机兼容性验收。固定地图种子可使用 `?seed=42`；暂停菜单可以导出当前会话的试玩记录，记录不会自动上传。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `src/core/` | 游戏流程、输入、存档、音频与运行管理 |
| `src/combat/`、`src/player/`、`src/monsters/` | 战斗、角色控制与敌人行为 |
| `src/world/` | 随机地图、场景模块、光照与交互物 |
| `src/items/`、`src/data/` | 装备、掉落、成长及内容配置 |
| `src/ui/` | HUD、背包、菜单与移动端界面 |
| `public/` | 随游戏发布的模型、贴图、音频及隐私政策 |
| `art/` | 概念图、素材设计与制作参考 |
| `android/`、`scripts/` | Android 工程与构建工具 |
| `docs/`、`tests/` | 设计文档、交付记录及测试 |

技术栈：**TypeScript · Three.js · Vite · Capacitor**。场景使用可复用低模模块和像素风格化贴图，音频使用已接入的音乐、环境声与动作音效素材。

## 开发文档

- [总体开发计划](docs/DEVELOPMENT_PLAN.md) · [架构说明](docs/ARCHITECTURE.md)
- [技能与流派阶段交付](docs/P4_DELIVERY.md) · [装备构筑阶段交付](docs/P5_DELIVERY.md)
- [16–25 层制作与接入](docs/FLOORS_16_25_IMPLEMENTATION.md)
- [发布前性能复盘](docs/发布前性能复盘.md)
- [Android 打包与发布](docs/Android打包与TapTap发布.md) · [隐私政策接入说明](docs/隐私政策发布说明.md)

阶段文档保留设计过程，部分旧阶段规则已被后续实现替代；当前行为以代码和游戏内说明为准。

## 存档与隐私

五个冒险存档保存在当前设备，营地研究跨存档共享。删除单个存档不会删除共享营地；清除应用或网站全部数据会一并删除本地成长。游戏本身不提供云同步，请谨慎清理数据。

隐私政策运营主体为 **桑尼工作室**。联系邮箱：**1977975227@qq.com**。未来如接入广告等新服务，将同步更新政策与相关授权流程。

## 素材与使用

音频来源和授权信息见 [音频素材记录](public/audio/selected-v1/CREDITS.md)。仓库中代码、美术和第三方素材的授权范围不能混为一谈；仓库公开不代表所有素材可自由再分发，使用前请核对相应授权。

发现问题时，欢迎在 Issues 中附上楼层、地图种子、复现步骤和设备／浏览器型号。请勿提交隐私资料、签名文件或密码。

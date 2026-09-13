# 《深渊，请等一下》Android 包

当前最新包为 `releases/abysswait-1.0.2-release.apk`（versionCode 3），包含角色美术图标、首次隐私提示、主菜单政策入口和撤回同意功能，沿用原签名。默认构建脚本也更新到此版本；下文的首包校验数据仅对应保留的 1.0.0。完整提审待办见 [TapTap首发待办](TapTap首发待办.md)，尤其还需处理隐私政策和平台要求的防沉迷，不能把签名检查通过等同于提审条件已齐全。

## 应用身份

- 包名：`com.csunx233.abysswait`。首次发布后保持不变。
- 首包：`versionName=1.0.0`，`versionCode=1`。
- Android 7.0 / API 24 起，target/compile SDK 36；需要较新的系统 WebView（Chromium 107 起）和 WebGL 2。
- Capacitor 8 本地资源包，横屏、沉浸全屏、保持亮屏、系统返回键关闭面板/暂停，主菜单退出按钮退出 Activity。
- 所有场景、贴图、剧情及音频打入 APK；不配置远程游戏服务器。使用系统 WebView 的 GPU 渲染，不另打包 Chromium。
- 没有支付、广告或统计 SDK。本轮不接 TapTap 登录 SDK；此包不是小游戏 ZIP。

## 签名与复现

私钥和密码备份：`D:/34229/abysswait-signing`。请把整个目录另行备份到安全位置，勿发给玩家或上传公开仓库。`android/signing.properties` 是忽略提交的本机副本。

首次编译工具在 `D:/34229/tools/android-build`：Microsoft OpenJDK 21、Android SDK 36、build-tools 35.0.0/36.0.0。Gradle wrapper 自动下载 Gradle 8.14.3。

```powershell
npm ci # 仅首次安装依赖或锁文件变更后需要
npm run android:release # 重打当前默认版本 1.0.2 / 3
# 后续版本：versionCode 必须递增，继续使用原来的私钥。
Set-Location D:\34229\mineworld
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -VersionName 1.0.3 -VersionCode 4
```

其他电脑可用脚本的 `-JavaPath` 和 `-SdkPath` 指定工具路径，恢复签名配置时调整 `storeFile` 的私钥路径。如网络需要代理，请只在本机配置 Java/Gradle 代理，不把私人网络配置写入仓库。

产物位于 `releases/abysswait-<VersionName>-release.apk`；脚本检查正式签名并输出 SHA-256。APK 和私钥不提交 Git。

## 首包验证结果

- Release 构建及 Android `lintVitalRelease` 通过。APK 为 41,426,376 字节（约 39.5 MiB）。
- RSA 3072 专用证书，APK v2 签名校验通过，适用于 minSdk 24；ZIP 对齐检查通过。
- 804 个网页资源逐文件比对一致，没有 `.so`、私钥或签名密码文件；WebView 调试关闭。
- 签名证书 MD5：`384f3824299b0cc560045a642329423e`。
- 签名证书 SHA-256：`94abefdba04654cece09864a5254021523f83064b12cdc5bce09594a1b7af23f`。
- APK SHA-256：`e1b3bd0592239892454213d314d46f418f867037deb19e9a9ec88ff32250d1d7`。
- 对外权限为 INTERNET；另外仅有 AndroidX 自用的 signature 级 receiver 权限，没有定位、通讯录、麦克风或存储读取权限。

## 存档边界

APK 与浏览器属于独立存储空间，不能自动读取之前在 Cloudflare/Vercel 网页中的存档。浏览器旧数据不会因安装 APK 被删除。本轮未提供浏览器到 APK 的导入迁移。

APK 后续覆盖升级需保持包名、签名、`https://localhost` 本地来源不变，递增 versionCode；不要先卸载旧版。卸载/清除应用数据会删除本机存档，不能把系统自动备份当作确定的存档恢复服务。

## TapTap 提交

上传正式签名的 `.apk`，开发者后台填写同一个包名、名称和版本资料。本项目不含 C/C++ `.so`，Java/Kotlin 包能运行于 ARM64 设备，符合该项打包要求。最终以产物结构检查为准。

安装包检查不代表平台已审核通过。按自己已有资质选择测试、试玩或正式发行入口，准备商店截图、简介、图标、隐私说明以及平台要求的材料。依据官方文档：

- [TapTap 打包规范](https://developer.taptap.cn/docs/store/release/publish/bundle/)
- [新建与管理游戏](https://developer.taptap.cn/docs/store/release/publish/create-game/)

提审前用手机确认：首次离线启动进入第一层、横屏 HUD/背包、返回键、音效、后台恢复，以及覆盖安装后局外天赋和五个存档仍可读取。本机没有连接 Android 设备，未完成真机验收。

## 日常更新打包

在 PowerShell 执行上面的显式版本命令即可：脚本会自动构建网页、同步全部资源、生成正式签名 APK 并校验签名。下一次用 1.0.3 / 4，再下一次用 1.0.4 / 5；versionCode 必须大于已经发布的所有包，不要只改显示版本号。显式参数不会自动更改脚本默认版本，后续发布始终传两个版本参数。无需先推送 GitHub，包内使用当前本地源码。

更新给玩家时覆盖安装，不要卸载旧版；包名、签名和本地来源保持不变。保管好 D:/34229/abysswait-signing 整个签名目录。构建失败时不要上传之前遗留的 APK，确认控制台出现 Release APK 和签名成功。

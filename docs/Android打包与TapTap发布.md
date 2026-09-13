# 《深渊，请等一下》Android 包

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
npm ci
npm run android:release
# 后续版本：versionCode 必须递增，继续使用原来的私钥。
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -VersionName 1.0.1 -VersionCode 2
```

其他电脑可用脚本的 `-JavaPath` 和 `-SdkPath` 指定工具路径，恢复签名配置时调整 `storeFile` 的私钥路径。如网络需要代理，请只在本机配置 Java/Gradle 代理，不把私人网络配置写入仓库。

产物位于 `releases/abysswait-1.0.0-release.apk`；脚本检查正式签名并输出 SHA-256。APK 和私钥不提交 Git。

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

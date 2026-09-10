# Sunlit Quest UI 交付记录

## 后续选择与交付记录

- 槽底选 B 羊皮纸包边；hud-b-reference.png 保留选型图，切出 bar-track-frame.webp 与 bar-track-base.webp。填充继续使用此前四张素材，独立 bar-track 裁切，框在最上层、文字高于填充，护盾宽度限定 0–100%。
- 关闭图标独立透明生成，close.png 为原图，close.webp 为裁切缩放后的运行时版本；只替换按钮视觉，保留原点击区域、aria-label 和关闭逻辑。
- UI 品质框采用绿、蓝、黄、橙、红；暗金 unique 外观已预留，当前游戏品质规则仍为五档，未提前添加传奇暗金的掉落或数值功能。空格使用深色 1px 细框。品质名称与框色在 UI 内共享映射。
- 手机背包贴合 safe-area，横屏装备栏 190px、装备槽 46px；844×390 检查能完整显示四行右侧物品格。竖屏保留背包/装备页签。
- 桌面背包最大 800×570，并有右上关闭；技能配置最大 900px 双栏，标题与关闭固定，只有列表滚动。暂停、天赋与确认面板补顶部关闭入口。
- 基本验证：TypeScript/生产构建通过，桌面 1440×900、手机横屏 844×390 与竖屏 390×844 检查；新档营地、背包打开/整理/关闭、技能配置关闭可用；页面未出现相关运行时异常。浏览器插件未提供，使用已有 Playwright + 本机 Edge 无头渲染。没有运行完整对局或压力测试；仍有既有主包大于 500kB 提示。
- 场景和角色继续保留 3D 粗模，因此截图的世界部分尚未对齐概念图；本轮仅交付 UI。未提交或推送。

### close 图标生成提示词

Generate ONE production UI icon: a centered diagonal X close symbol, transparent alpha background, no panel, no outer frame, no text other than the X symbol, no shadow outside the icon, no other objects. Match Sunlit Quest reference's bright adventurous pixel art UI. Bold highly readable X made of stair-stepped square pixel blocks, warm ivory #fff0c7 face, antique gold #d7a447 single-step lower-right shading, very dark navy #14283f thin outline. Symmetric diagonal arms of equal thickness, clean crossing center, compact silhouette. Think deliberately drawn 24x24 pixel icon enlarged using nearest neighbor, not a font glyph, no antialiasing or smooth edges, no blur, no smooth gradients. Square output, X occupies central 65% with generous transparent margin. Must stay recognizable when displayed at 18-24 CSS pixels. Reference is style only, do not copy entire game screen.


## 最新调整
- 移除 HUD 条组浅色背板；每条独立 B 槽底和原填充保留，等级经验改浅色保证对比度。
- 桌面背包上限 860px，八列均分；48 槽完整保留，无横向溢出。
- 三套数字候选见 art/sunlit-ui/NUMERALS.md，每套 0–9 共十张；10 组合显示。透明通道保留，待用户选择后接入。
- 本轮构建通过，并做单次桌面布局检查。

## 已选方案与接入
- 第 1 套 A：伤害飘字（世界坐标飘字及 HUD 伤害提示），继承伤害颜色。
- 第 3 套 C：生命/法力数量、金币、怪物剩余数、击杀数、背包容量、材料数量、套装件数和商店操作价格。
- 第 2 套仅保留候选源文件，不进入运行资源。
- 运行素材在 public/assets/ui/sunlit/numerals/{damage,quantity}，共享 PixelNumbers.ts 用 alpha mask + currentColor 染色；相同数值不会重复重建节点。中文和标点使用文本。
- 敌人血条共享现有 B 槽底图片和 health 填充贴图，左端固定、比例限制在 0–100%，保留空槽；关闭深度写入并明确槽底/填充绘制顺序。保留燃烧时的颜色反馈。
- npm run build 通过；本轮仅基本代码与构建检查，未做完整战斗视觉验收。

## 敌人受击血条残片
- 实际扣血段立即变白，55ms 停顿后短促弹起并加速下坠，后半段淡出；总时长435ms，早于死亡模型清理。
- 普通伤害、持续伤害和致死伤害共享入口；过量伤害仅按剩余血量产生残片。每只怪物最多12段，过期立即释放材质。
- 采用面向镜头的偏移，怪物转身不会把残片或血量填充甩到血条外。更新遵循游戏时间，不使用独立定时器。
- 本轮仅基本逻辑和构建检查；具体打击节奏待实战验收。

## 主角槽条插值与命中震动
- 生命、护盾、法力、经验按帧指数插值，减少速度16、恢复速度10；数字即时更新。初次状态直接同步，升级重置经验周期，移除槽条CSS重复缓动。
- 命中震动为140ms衰减脉冲，范围伤害取最大值不累加，第一人称强度乘0.6。陨石1.3、突进1.1、冰霜0.85、旋风0.65、闪电0.45、火径0.25；普攻沿用武器impact。暴击单次加强，移除命中/击杀的重复暴击叠加。
- 保留原有受伤反馈。构建通过，未扩展战斗测试，节奏待用户验收。

# P0 美术选型

使用内置 image_gen 生成。每项有 A / B 两版，参考 art/sunlit-ui/icons-atlas.png。

## 已确认选择

用户选择 1 / 2 / 2：状态图标 A、战斗特效 B、危险预警 B。六张原图全部保留，不覆盖备选版本。机器可读选择见 selection.json。
已检查：三张选中图都包含真实的非全不透明 alpha；未选的三张没有全部具备透明通道。接入时仍需裁切、检查边缘光晕和几何比例。

选中素材已接入游戏。原始 A/B 图集全部保留；运行时使用 public/assets/ui/sunlit/p0 中的 22 张 256×256 透明 WebP，export.cjs 可重复导出。未选版本中部分包含背景或棋盘格，不能直接作为透明纹理。

## 接入范围与检查

- 玩家 HUD / 敌人头顶显示燃烧、冰冻、感电、中毒图标；流血继续使用文字，不用错误图标替代。护盾、增伤、恢复、减速备用图标已导出，未伪造新状态触发逻辑。
- Effects 接入 8 种基础贴图与寿命动画，BurnVisual 使用 4 个可复用火焰 Sprite；纹理缓存、菜单预载、160 粒子与 48 临时贴图上限。
- 普通怪攻击、精英标记、Boss 圆形/扇形/冲刺、最终 Boss、控场地面区域、移动瞄准终点均已使用新素材。预警几何保留真实范围，装饰不作为碰撞边界；修正普通 Boss 圆形漏显的 0.4 接触半径及冲刺显示宽度。
- 移动端任务提示随状态栏自然排布；竖屏工具按钮右侧纵向排列，横屏保留底部排列，HUD 预留小地图/暂停与安全区。
- 构建通过。Browser plugin not available，使用 Playwright + Edge 做有限浏览检查；桌面与手机实际模块受控展示无加载/脚本错误。检查 568×320、667×375、844×390、932×430、320×568、390×844、768×1024 下主要 HUD/触屏按钮未越界，状态栏与目标提示不重叠。圆形攻击/技能的矩形外接框存在角落相交，圆形可见轮廓不重叠。
- 非全设备实机验证。两项现有地图测试断言失败（地图尺寸及商店距离），本次未改地图生成，也未继续扩大测试。

## 图集顺序（从左到右，再到下一行）

- 状态 status，4×2：燃烧、冰冻、减速、中毒；感电、护盾、增伤、生命恢复。
- 特效 effects，4×2：刀光、命中闪光、火星、冰晶；闪电、烟雾、冲击环、暗影命中。
- 预警 telegraphs，3×2：圆形范围、扇形范围、直线攻击；落点、瞄准、精英标记。

A 简洁轮廓，B 加强装饰和动态。允许按单项混选。

## 完整提示词

### status-a

Use case: stylized-concept. Create a production concept sprite atlas for Mineworld, matching the provided Sunlit Quest reference image ONLY for art style. Strict unified hand-placed pixel art: crisp square pixel clusters, no antialiasing, no smooth gradients, no 3D rendering, no painterly strokes. Deep navy #172f49 outlines, warm ivory highlights, restrained antique gold and teal, fire orange-red, frost cyan, lightning pale gold, poison mint-green, shadow violet. Light comes upper left. Each sprite clearly readable at small sizes. Transparent background with real alpha, no checkerboard painted in, no labels, no text, no UI frames, no reference equipment copied. Uniform equal cells, wide empty gutters; all sprites fully contained with at least 15% padding. This is a selection atlas, not an animation strip. 8 status icons in exactly 4 columns x 2 rows, row-major: burning flame, frozen ice crystal, slow boot with frost trails, poisoned green droplet with skull, shocked lightning with small arcs, protective silver-teal shield, increased damage sword with upward chevron, regeneration heart with green plus. Variant A: clean emblem silhouettes, compact, minimal secondary particles.

### status-b

Use case: stylized-concept. Create a production concept sprite atlas for Mineworld, matching the provided Sunlit Quest reference image ONLY for art style. Strict unified hand-placed pixel art: crisp square pixel clusters, no antialiasing, no smooth gradients, no 3D rendering, no painterly strokes. Deep navy #172f49 outlines, warm ivory highlights, restrained antique gold and teal, fire orange-red, frost cyan, lightning pale gold, poison mint-green, shadow violet. Light comes upper left. Each sprite clearly readable at small sizes. Transparent background with real alpha, no checkerboard painted in, no labels, no text, no UI frames, no reference equipment copied. Uniform equal cells, wide empty gutters; all sprites fully contained with at least 15% padding. This is a selection atlas, not an animation strip. 8 status icons in exactly 4 columns x 2 rows, row-major: burning flame, frozen ice crystal, slow boot with frost trails, poisoned green droplet with skull, shocked lightning with small arcs, protective silver-teal shield, increased damage sword with upward chevron, regeneration heart with green plus. Variant B: same visual family but richer crystalline shapes, more dynamic asymmetric shapes, subtle decorative gold details, still legible.

### effects-a

Use case: stylized-concept. Create a production concept sprite atlas for Mineworld, matching the provided Sunlit Quest reference image ONLY for art style. Strict unified hand-placed pixel art: crisp square pixel clusters, no antialiasing, no smooth gradients, no 3D rendering, no painterly strokes. Deep navy #172f49 outlines, warm ivory highlights, restrained antique gold and teal, fire orange-red, frost cyan, lightning pale gold, poison mint-green, shadow violet. Light comes upper left. Each sprite clearly readable at small sizes. Transparent background with real alpha, no checkerboard painted in, no labels, no text, no UI frames, no reference equipment copied. Uniform equal cells, wide empty gutters; all sprites fully contained with at least 15% padding. This is a selection atlas, not an animation strip. 8 independent combat VFX sprites in exactly 4 columns x 2 rows, row-major: sweeping ivory sword slash crescent, four-point bright impact burst, orange fire spark cluster, cyan exploding ice shard cluster, branching golden lightning bolt, soft-looking but hard pixel clustered gray smoke puff, circular ivory shockwave ring top-down, violet magical impact burst. Variant A: restrained compact crisp silhouettes, sparse particles, clear empty centers for rings; no frames.

### effects-b

Use case: stylized-concept. Create a production concept sprite atlas for Mineworld, matching the provided Sunlit Quest reference image ONLY for art style. Strict unified hand-placed pixel art: crisp square pixel clusters, no antialiasing, no smooth gradients, no 3D rendering, no painterly strokes. Deep navy #172f49 outlines, warm ivory highlights, restrained antique gold and teal, fire orange-red, frost cyan, lightning pale gold, poison mint-green, shadow violet. Light comes upper left. Each sprite clearly readable at small sizes. Transparent background with real alpha, no checkerboard painted in, no labels, no text, no UI frames, no reference equipment copied. Uniform equal cells, wide empty gutters; all sprites fully contained with at least 15% padding. This is a selection atlas, not an animation strip. 8 independent combat VFX sprites in exactly 4 columns x 2 rows, row-major: sweeping ivory sword slash crescent, four-point bright impact burst, orange fire spark cluster, cyan exploding ice shard cluster, branching golden lightning bolt, soft-looking but hard pixel clustered gray smoke puff, circular ivory shockwave ring top-down, violet magical impact burst. Variant B: energetic layered twin arcs, staggered pixel fragments, stronger star cores and sculpted smoke, ornamental but readable; no frames.

### telegraphs-a

Use case: stylized-concept. Create a production concept sprite atlas for Mineworld, matching the provided Sunlit Quest reference image ONLY for art style. Strict unified hand-placed pixel art: crisp square pixel clusters, no antialiasing, no smooth gradients, no 3D rendering, no painterly strokes. Deep navy #172f49 outlines, warm ivory highlights, restrained antique gold and teal, fire orange-red, frost cyan, lightning pale gold, poison mint-green, shadow violet. Light comes upper left. Each sprite clearly readable at small sizes. Transparent background with real alpha, no checkerboard painted in, no labels, no text, no UI frames, no reference equipment copied. Uniform equal cells, wide empty gutters; all sprites fully contained with at least 15% padding. This is a selection atlas, not an animation strip. 6 independent top-down combat telegraph sprites in exactly 3 columns x 2 rows, row-major: dangerous circular ground perimeter, dangerous 60-degree fan perimeter, dangerous straight lane with arrow tip, dangerous landing target concentric ring, friendly targeting reticle with four brackets, elite enemy crown marker. Variant A: exceptionally clean thin pixel geometry, segmented amber-red hazard borders, mostly empty transparent interiors, friendly teal/ivory reticle, gold elite crown. Exact top-down circles not ellipses, no scenes.

### telegraphs-b

Use case: stylized-concept. Create a production concept sprite atlas for Mineworld, matching the provided Sunlit Quest reference image ONLY for art style. Strict unified hand-placed pixel art: crisp square pixel clusters, no antialiasing, no smooth gradients, no 3D rendering, no painterly strokes. Deep navy #172f49 outlines, warm ivory highlights, restrained antique gold and teal, fire orange-red, frost cyan, lightning pale gold, poison mint-green, shadow violet. Light comes upper left. Each sprite clearly readable at small sizes. Transparent background with real alpha, no checkerboard painted in, no labels, no text, no UI frames, no reference equipment copied. Uniform equal cells, wide empty gutters; all sprites fully contained with at least 15% padding. This is a selection atlas, not an animation strip. 6 independent top-down combat telegraph sprites in exactly 3 columns x 2 rows, row-major: dangerous circular ground perimeter, dangerous 60-degree fan perimeter, dangerous straight lane with arrow tip, dangerous landing target concentric ring, friendly targeting reticle with four brackets, elite enemy crown marker. Variant B: rune-notched and pointed geometric borders, restrained gold trim with red-orange danger, mostly empty transparent interiors, friendly teal/ivory diamond-bracket reticle, gold three-spike elite crest. Exact top-down circles not ellipses, no scenes.


## 幸运数值

背包角色属性使用 Game.effectiveStats，与实际战斗/掉落一致，包含天赋额外属性。
怪物装备掉落中，rare / epic / legendary 权重乘以 1 + 0.2 × 幸运 / (幸运 + 100)。负值和非有限值按零处理。
10 幸运约 +1.82% 权重，50 幸运约 +6.67%，100 幸运 +10%，逐渐接近但不超过 +20%。这是归一化前的相对权重，不是绝对掉率百分点。
不增加装备掉落件数，不改变楼层基础权重，不影响商店、打造及显式指定品质。原有金币幸运加成保持不变。

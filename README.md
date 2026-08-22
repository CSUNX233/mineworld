# MineWorld / 方块割草：深渊

Three.js + TypeScript + Vite 的 Minecraft 风格第三人称方块割草游戏。当前版本是可运行的 MVP 垂直切片，覆盖随机地牢、移动碰撞、自动锁定战斗、怪物 AI、掉落、随机装备词条、背包穿戴、楼层推进、存档与程序化音效。

## 运行

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`，选择“新游戏”或“继续游戏”。生产构建：

```bash
npm run build
npm run preview
```

## 操作

- WASD：移动
- 鼠标：旋转视角（点击画面锁定鼠标）
- Shift：冲刺
- 空格：跳跃
- 鼠标左键：向当前视角前方释放近战攻击（前方扇形范围，不自动锁定）
- 数字键 1/2/3：前方旋风斩 / 冲刺斩 / 火球术，分别有独立范围和粒子特效
- E：交互（开宝箱、进入已激活传送门）（移动端为点击普攻按键）
- Tab 或 B：打开/关闭背包
- C：切换第一人称/第三人称
- Esc：游戏暂停（可继续或返回主菜单；背包打开时 Esc 关闭背包）
- P：打开角色加点 / 天赋面板
- 数字键 4/5：天赋解锁的冰霜新星 / 闪电链

## 已实现系统

- 带种子的随机房间 + L 形走廊地牢，每层尺寸递增
- 体素方块渲染、玩家 AABB 碰撞与重力、平滑跟随相机
- 近战/远程/冲锋/Boss 怪物，简单追击 AI 与远程弹幕
- 伤害、暴击、连杀、击退/震屏、hitstop、粒子与程序化 Web Audio 音效
- 金币、血瓶、法力瓶和带随机词条的装备掉落
- 8 个装备槽、品质词条、背包比较/穿戴/出售
- 清层后激活传送门，每 5 层 Boss，4 套楼层主题
- localStorage 自动存档与新游戏/继续游戏
- 移动端适配可直接游玩，横屏竖屏均可

## 目录

```
src/
  core/        Game、Input、EventBus、Save、Audio、Effects
  world/       FloorGenerator、BlockRegistry、World、Textures
  player/      Player、PlayerController、CombatSystem
  monsters/    Monster、MonsterAI、MonsterSpawner
  items/       ItemGenerator、AffixSystem、LootSystem、Inventory、EquipmentManager
  ui/          HUD、InventoryUI、ItemTooltip、DamageNumber、Minimap
  data/        monsters/items/affixes/floors 配置与平衡公式
  utils/       RNG、seededRandom、math
```

## 素材说明

纹理当前使用 Canvas 程序化生成的 16x16 像素贴图，因此不依赖外部文件即可运行。若需要接入仓库贴图，可将 PNG 放入 `public/textures/` 并在 `src/world/Textures.ts` 中改为 `TextureLoader` 加载，同时保留 Canvas 后备。

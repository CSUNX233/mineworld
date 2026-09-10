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

## 数字基线与伤害入口修复
- 原图上下行留白不同，旧版整组裁切造成0–4与5–9错行。现逐字按不透明字形边界裁切、等比缩放，统一44×60画布；20字形实测可见纵向范围均为2–57，水平居中，CSS保持原比例。
- 修复实际攻击使用的HUD.spawnDamage仍写入textContent的遗漏，改用第1套damage字形；保留暴击尺寸与颜色。
- 构建与20字形边界检查通过。

## 第三人称与移动端双摇杆（待真机手感验收）
- 第三人称投射物由镜头射线确定瞄准点，再从角色施法位置发射；墙体/地面射线与角色命中检测保留。移动方向与触屏攻击方向独立。
- 取消攻击瞬间强制旋转角色，使用战斗朝向插值；跳跃镜头垂直阻尼，遮挡解除120ms后才拉远，近距离角色渐隐。
- 近战小角度软辅助保留目标偏好，不转动镜头；手动右摇杆瞄准时禁用。可选镜头自动跟随支持键盘和模拟摇杆。新增震动强度，手机默认0.6，可调至0关闭。
- 手机左下扩大触控区支持浮动摇杆，按下中心就在手指下，拖动后才开始移动；松手立即清空输入并回位。移动死区缩小、奔跑阈值加入滞回，移动起停响应加快。
- 右侧圆形攻击/技能按钮支持拖动方向；技能松手释放，远拖进入取消区，拖回恢复，边界有滞回。显示摇杆头和地面方向箭头；自身范围技能仍以角色为中心。
- 暂停、失焦、切后台、旋转、取消触摸均清理相关输入；技能配置改文字，移除底部法杖图，并修正底部工具图标定位。
- 浏览器触摸双指检查：浮动中心精确跟随触点；单按移动量0；左手移动时右手松开只触发1次技能且移动保持；左手松开归零并回位。另检查了取消不施放、真实火球法力消耗/冷却，以及圆形按钮样式。构建通过。
- 验证使用本机Edge/Playwright（Browser插件未提供），不代表真机延迟、性能或商业游戏手感已经达到同等水平；本轮等待用户实机验收。

## 手机双击移动摇杆跳跃
- 移除手机跳跃按钮；电脑空格不变。第二次有效点按松手时才发送一次Space脉冲。
- 每次按住≤160ms，第二次开始距上次松手≤240ms，第二次松手距首次松手≤320ms，两次触点距离≤24px。
- 全轨迹检测：离起点超过3px或累计路径超过5px即永久标记本次拖动，并清除前次候选；支持合并指针采样，最终松手坐标再次检查，拖出再回原点也不算点击。
- 触摸取消、丢失捕获、暂停、失焦、转屏清除候选。正常单击不延迟移动，双击成功后清空候选，避免三击连续触发。
- 9项基本判定检查通过：干净双击、第一/第二次拖动、长按、超时、异地点击、取消、轻微噪声、松手位移；构建通过。未做完整游戏测试。

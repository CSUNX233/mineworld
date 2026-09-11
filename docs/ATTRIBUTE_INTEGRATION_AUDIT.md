# 属性与词条接入审计

日期：2026-09-11。基线：main c5f0441。只检查现有代码，未修改战斗数值或实现。接入表示存在实际消费路径，不代表已完成平衡或所有实机场景验证。

本文保留修复前的审计记录；后续用户要求的实施规则与修复范围见 [ATTRIBUTE_RULES.md](./ATTRIBUTE_RULES.md)。

## 结论与优先级

存在明确的无效属性和部分接入的特效，不能认为全部词条已生效。

1. 优先修复玩家护甲、生命偷取、击杀回复的运行链路，以及武器基础攻速重复计入加成。
2. 定义敏捷的实际收益，接入五个空缺套装特效；这部分需要明确设计数值，不能仅凭名字编造倍率。
3. 统一近战、法杖、技能、附加伤害的伤害/触发入口，统一护甲、暴击上限、元素归属和幸运作用范围。
4. 同步面板、词条描述与重复特效的叠加规则。

## 全部 19 个 Stat

|属性|检查结果|实际消费/缺口|
|---|---|---|
|attack 攻击|已接入|Game 普攻、技能、召唤等伤害|
|attackSpeed 攻速|接入但计算错误|EquipmentManager 将武器基础攻速同时加入 attackSpeedBonus；Game 再乘基础攻速，实战上限 3.5，面板未同步上限|
|critChance 暴击率|已接入但规则不一致|CombatSystem 限制 5%–85%；投射物直接命中直接使用未限制数值|
|critDamage 暴伤|已接入|近战、技能与投射物暴击计算；固定伤害/持续伤害未必暴击|
|maxHealth 最大生命|已接入|Game.updatePlayerStats 更新 Player.maxHealth|
|armor 护甲|未接入玩家减伤|仅汇总和展示；玩家近战受击、投射物、Boss 伤害直接 takeDamage；Player 仅处理无敌和护盾|
|moveSpeed 移速|已接入|PlayerController 移动速度|
|cooldown 冷却|已接入|技能冷却，缩减上限 60%|
|pickupRange 拾取范围|已接入|Game 拾取距离|
|luck 幸运|部分路径接入|LootSystem 普通掉落/常规 Boss 掉落品质、金币；精英额外装备和宝箱生成未传幸运|
|strength 力量|已接入|每点攻击 +1.5|
|agility 敏捷|未接入|汇总后没有映射到任何 DerivedStats，也没有其他战斗消费者|
|vitality 体质|已接入|每点最大生命 +8|
|intelligence 智力|已接入|每点最大法力 +4；没有额外法术伤害映射|
|lifeSteal 生命偷取|未接入|DerivedStats 有值，伤害结算没有回血消费者|
|killHeal 击杀回复|未接入|DerivedStats 有值，onMonsterKilled 没有回血消费者|
|maxMana 最大法力|已接入|Game.updatePlayerStats 与技能耗蓝|
|manaRegen 法力回复|已接入|每秒回复|
|lifeRegen 生命回复|已接入|存活时每秒回复|

18 个数值词条逐一归入上述属性：sharp/attack、fierce/attackSpeed、precise/critChance、deadly/critDamage、colossal/maxHealth、ironclad/armor、swift/moveSpeed、vampiric/lifeSteal、giant/strength、windwalker/agility、vital/vitality、scholar/intelligence、lucky/luck、hunter/killHeal、arcane/manaRegen、renewing/lifeRegen、hastened/cooldown、arcane_reservoir/maxMana。没有遗漏的独立数值词条类型。

## 9 个特殊装备词条

|特殊词条|实际行为与缺口|
|---|---|
|chainLightning 雷暴|仅近战普攻命中时 15% 概率；法杖不触发。计算沿用首目标护甲，后续目标未分别计算防御，伤害元素默认为物理而非闪电|
|explosiveKill 爆裂|击杀触发周围爆炸，可连锁击杀；伤害直接传入，默认物理，未走完整防御计算|
|aegisWalk 壁垒|已接入；每件每秒最大生命 1%，容量每件 20%，移动时累计，多件叠加|
|meteorOnAttack 陨星|仅近战普攻命中后 18% 概率，法杖不触发；陨石伤害与火焰状态有实现|
|summonSkeletonOnKill 唤骨|已接入击杀召唤和召唤攻击；布尔效果，上限 4，不随重复词条增加|
|executeFullHealth 处刑|仅玩家满血的近战普攻 +25%；法杖、技能等没有此增伤，范围小于“造成的伤害提高”描述|
|dashInvincibility 幻影|冲刺斩技能设置 0.8 秒无敌；不是普通移动加速触发|
|fireTrail 燎原|移动时生成火焰路径，有伤害与火焰异常路径|
|lowHealthShield 血誓|低于 30% 生命，获得至少最大生命 35% 护盾，12 秒冷却；无独立到期消失逻辑，提示“临时护盾”不精确|

除壁垒以外，上述重复特殊词条均使用 hasSpecial 布尔判定，多件不会提高触发率/倍率。这是当前规则，是否改成叠加需要明确设计。

## 套装

9 套定义的数值均会进入 EquipmentManager 的阈值汇总，但无效属性会继续无效：战争领主/霜语者/永冻的护甲，疫毒的击杀回复，血裔的吸血、护甲、击杀回复等。

五个特效只有定义与 UI 名称，没有实际消费者：

- 炼狱 2 件：burnMastery 火焰异常强化。
- 永冻 4 件：freezeMastery 冰霜异常强化。
- 永冻 6 件：glacialNova 冰霜新星强化。
- 疫毒 2 件：poisonMastery 毒素异常强化。
- 风暴 4 件：shockMastery 闪电异常强化。

其他套装特效复用上表实现，继承其适用范围和缺口。特别是破军 6 件满血增伤、风暴 6 件连锁闪电也只在近战普攻生效。

## 天赋与关联属性规则

当前局内树 16 个节点经 RunTalents.talentStats / FireBuild.deriveFireModifiers 进入游戏。火种、传播/穿透、燃烧延长、引爆倍率、低血非 Boss 加成均有实现；最大生命、最大法力、冷却、幸运有对应消费者。淬火皮肤的护甲 +6 因玩家护甲链路缺失而不产生减伤。

烬中汲取/灰烬护体在成功消耗至少一个目标燃烧后结算一次，空放不返蓝、不加盾；描述“每次引爆施法”需要注明命中条件。近战火焰点燃使用攻击系数，投射物点燃使用暴击后的 raw，暴击对燃烧的影响尚未统一。

局外目前是流派起始配置解锁，不应把未来高阶地图池、更多流派树、图鉴增强算成现有已完成属性。

补充核对：9 套装备的最高件数阈值在当前装备槽/掉落池中均可达到。旧 data/talents.ts 无运行引用；冰霜新星、闪电链原本仍引用旧天赋，因此正常流程无法解锁。旧 BuildChoices/BuildSystem 已离开游戏流程，不应算当前功能。局外 summoner 当前与 vanguard 发放相同起始剑，属于文案已注明的未来占位，不能当作已完成召唤流派。

额外发现：玩家可以被写入冰冻/减速状态，但 PlayerController 移动速度没有消费 slowMultiplier/frozen；敌人则有状态减速消费者。装备的元素与异常概率确实用于武器攻击；非武器装备也可能生成 element/statusChance，这些不是自动叠加到玩家的全局元素加成。

## 证据入口与定点验证

- src/items/EquipmentManager.ts：总属性、派生属性、套装与特殊词条统计。
- src/core/Game.ts：doBasicAttack/doMeleeAttack/doStaffAttack、updateProjectiles、applyMonsterDamage、onMonsterKilled、damagePlayerWithElement、updatePlayerStats。
- src/player/Player.ts：takeDamage；src/player/CombatSystem.ts：rollDamage。
- src/items/LootSystem.ts、ItemGenerator.ts：幸运与装备生成。
- src/data/affixes.json、sets.ts、runTalents.ts：全部当前定义。

用现有 esbuild 在内存打包 EquipmentManager 做两项定点验证：额外 +100 敏捷前后 DerivedStats 完全相同；基础攻速 1.35 的无词条武器得到 base=1.35、bonus=1.35，最终 3.1725 次/秒。其余为静态调用链核对，未运行全套测试、未宣称全部玩法场景实测通过。

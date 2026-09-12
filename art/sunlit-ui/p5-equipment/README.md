# P5 十二套装备美术候选

使用内置 image_gen 生成，每套 A/B 两版，已完成共 24 张九宫格图集。所有输出保留原始 PNG；选择入口为同目录 preview.html，完整逐图提示词在 prompts.json，输出文件清单在 manifest.json。

画风依据：docs/PIXEL_STYLE_PROPOSALS.md 中已选② Sunlit Quest（明亮冒险），参考现有 art/sunlit-ui/icons-atlas.png 的视觉语言。统一深靛蓝轮廓、暖奶油高光、旧金点缀、左上光源、块状像素材质；套装通过剪影、材质和纹章区别。A/B 改变装备结构，保持套装身份。

每张严格按行对应九个槽位：

| 武器 | 头盔 | 胸甲 |
| --- | --- | --- |
| 护腿 | 靴子（一双） | 戒指一 |
| 戒指二（不同设计） | 项链 | 副手 |

两枚戒指是双戒指槽的美术变体，不增加属性或新增套装计件规则。法衣、皮甲、板甲和晶甲分别保持类别识别；副手包含盾、格挡刃、魔典与法器。已按用户确认版本导出并接入新版P5装备图标；所有候选原图保持不变。

| 编号 | 套装 | ID | A | B |
| --- | --- | --- | --- | --- |
| 1 | 战争领主 | warlord | 01-warlord-A.png | 01-warlord-B.png |
| 2 | 破军 | warbringer | 02-warbringer-A.png | 02-warbringer-B.png |
| 3 | 霜语者 | frost | 03-frost-A.png | 03-frost-B.png |
| 4 | 暗影行者 | shadow | 04-shadow-A.png | 04-shadow-B.png |
| 5 | 炼狱 | inferno | 05-inferno-A.png | 05-inferno-B.png |
| 6 | 永冻 | glacier | 06-glacier-A.png | 06-glacier-B.png |
| 7 | 疫毒 | venom | 07-venom-A.png | 07-venom-B.png |
| 8 | 血裔 | sanguine | 08-sanguine-A.png | 08-sanguine-B.png |
| 9 | 风暴 | storm | 09-storm-A.png | 09-storm-B.png |
| 10 | 魂旗军团 | soul_banner | 10-soul_banner-A.png | 10-soul_banner-B.png |
| 11 | 烬祭 | soul_pyre | 11-soul_pyre-A.png | 11-soul_pyre-B.png |
| 12 | 烬钢 | embersteel | 12-embersteel-A.png | 12-embersteel-B.png |

选择方式：打开 preview.html，按套点击“选择 A/B”，复制编号结果发回对话，例如“1A、2B、3A…”。也可以注明某一套采用 A、但某个具体部位采用 B。


实际生成尺寸均为1254×1254。10A做过旗杖留白修正，最终候选采用深蓝预览底色；修正提示词及来源见revisions.json。其余为原始RGBA候选。用户选择已完成，选定版本全部使用真实透明原图导出，见下文。


## 已确认并接入

用户选择：1A、2B、3B、4A、5A、6B、7B、8B、9B、10B、11A、12B。selection.json记录选择；其余12张与全部24张原图均保留备用。

- export.py：沿用用户此前授权的本地透明素材处理与切图流程；直接使用现有Alpha，避免色键误删银白装备。统一128像素网格、硬边透明、无抖色40色、清理微小孤立碎点；最近邻2倍导出。
- native/：108个128×128透明PNG。
- public/assets/ui/sunlit/equipment/：108个256×256无损WebP，总计498584字节，按显示需要加载。
- selected-preview.png：实际导出图标总览；preview.html保留全部A/B候选并默认标记确认选择。
- export-report.json：原图、格子边界、装备部位与公共文件映射。
- src/ui/EquipmentArt.ts：新版装备按套装和部位解析图标，适用于已有P5存档；旧版/散件/空格维持通用入口。两种戒指图按稳定实例id选择，不改变套装计件或物品属性。
- src/ui/UiAssets.ts：背包、装备槽、商店、提示详情统一使用解析结果；使用部署BASE_URL支持子路径。

检查：生产构建通过；108条图标路径存在，透明只含0/255且四周留白安全；24张原图逐一与生成来源哈希一致。没有修改3D装备模型，也没有提交推送。

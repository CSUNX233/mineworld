# 死亡收割像素装备

九件分别使用内置 image_gen 生成，完整提示词与来源在 prompts.json。原始透明 PNG 保留于 originals/，未覆盖。

游戏使用 public/assets/ui/sunlit/death-reaper/ 下的九张 96×96 透明无损 WebP（总计约 64 KB），共用 EquipmentArt 路径解析与加载预热，接入背包、装备槽、详情和地面掉落。

prepare_icons.py 使用已有透明通道去除半透明杂边、裁去空白、最近邻统一像素尺寸；不绘制替代素材。使用 Python 3.12 + Pillow 运行。preview.png 是九件静态总览，preview.html 展示实际图标与红金流光边框。

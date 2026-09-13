# 古代传送门实装

参考 ../portal-reference/waygate-states-orthographic.png，使用 Blender 构建 portal_frame 与 portal_runes，打包到现有 interaction-props.glb 并在前台加载阶段等待。脚本 scripts/art/build_interaction_props.py，源文件 ../interaction-props/interaction-props.blend，真实正交渲染为 portal-front/right/top.png。

PortalPlacement 在出口房内选墙边位置，检查 3 格宽门框与 2 格深接近区域，避开入口、商人、宝箱和原障碍；两侧门柱有网格碰撞，中心可进入。只修改出口位置与门柱格，不消费玩法随机数；重复生成同一个 FloorData 不累积移动。若非常旧或异常地图无安全位置，保留原有出口位置，避免关卡无法退出。

PortalVisual 管理石门、符文、传送面、蓝色点光源和 32 个像素光点。未激活时隐藏传送面与粒子、关闭蓝光。激活后在正面靠近，沿用电脑/手机原有交互按钮进入楼层结算和继续流程；不自动吞掉玩家尚未领取的掉落。门后的墙和两侧不触发进入。

旧旋转方块传送门与出口中心圆圈已删除。其他房间的玩法标记不受影响，小地图直接读取迁移后的出口位置。没有修改存档字段、装备、天赋或奖励。

验证：生产构建通过；种子 411485540 的 1–25 层全部找到墙边摆放点，重复调用幂等；1/8/15 层检查未激活、激活、正面与背面交互，并截图；通过临时替换楼层菜单入口验证 Game.tryInteract 分发到原有流程，未进行真实通关或下一层整局测试。浏览器无错误。尚未提交推送。

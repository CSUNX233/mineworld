const DESKTOP = [
  ['移动与跳跃', 'W / A / S / D 移动，Shift 奔跑，空格跳跃。'],
  ['视角', '移动鼠标转动镜头；C 切换第一、第三人称，第三人称用滚轮调整镜头距离，按 R 回正镜头，按住鼠标右键保持面向。点击游戏画面可重新锁定鼠标。'],
  ['攻击与技能', '按住鼠标左键连续普通攻击；按技能槽上显示的数字键施放技能。K 打开技能配置。技能受法力与冷却限制。'],
  ['探索与交互', '靠近传送门、宝箱、商店等交互物，按 E 执行屏幕提示的操作。'],
  ['背包与装备', 'Tab / B 打开背包。点击装备穿戴，点击已装备槽卸下；悬停查看详情，右键背包装备打开分解、升级和重铸菜单。'],
  ['套装与整理', '套装名旁显示当前件数 / 最高奖励件数；点击“套装属性”查看完整效果。一键整理排列背包，一键分解按所选品质处理。出售只在商店进行。'],
  ['暂停与返回', 'P 打开局内天赋；Esc 关闭当前面板或打开暂停菜单。暂停菜单可调整视角灵敏度、自动回正和镜头震动强度（可关闭）。'],
  ['脱离卡死', '如角色被墙体卡住，可在暂停菜单点击“脱离卡死”。会移动到附近安全位置；战斗期间仍留在当前封锁房间内。小地图箭头表示角色当前朝向。'],
];
const MOBILE = [
  ['移动与镜头', '在左下方移动区域按住，摇杆会出现在手指下；直接拖动移动，向外推进行奔跑，松手停止并回位；在右侧空白区域滑动转动镜头。横屏可获得更大的操作空间。'],
  ['双击跳跃', '在左侧移动触控区同一位置快速点按两次，第二次松手时跳跃。两次都必须短按且不拖动；拖出再拖回、长按或间隔过久都不会触发。无需单独的跳跃按钮。'],
  ['攻击与技能', '按住攻击键连续攻击，拖动攻击键调整攻击方向。按住技能键拖动瞄准，松手施放；拖远至出现“松手取消”后松开即可取消，拖回可继续瞄准。左手可同时移动。技能受法力与冷却限制，自身范围技能仍以角色为中心。'],
  ['探索与交互', '靠近交互物后，点击交互按钮执行提示的操作。点击显示“一人称 / 三人称”的按钮切换视角。'],
  ['背包与装备', '点击背包按钮打开界面，点击物品查看详情并选择穿戴、卸下等操作。竖屏上方显示装备，下方背包可上下滑动；横屏左右同时显示。'],
  ['套装与整理', '点击“套装属性”查看套装奖励；套装名旁显示件数进度。背包支持一键整理、按品质一键分解，出售需要前往商店。'],
  ['技能配置与暂停', '点击“技能”按钮调整技能槽（横屏底部，竖屏右侧）；点击小地图左侧的暂停按钮打开菜单，可调整灵敏度、自动回正和震动强度。使用面板关闭按钮或手机返回操作返回上一层。'],
  ['脱离卡死', '角色卡住时，在暂停菜单点击“脱离卡死”，移到附近安全位置。战斗期间不会离开封锁房间。小地图箭头表示角色当前朝向。'],
];

export function buildControlsGuide(mobile: boolean): HTMLElement {
  const root = document.createElement('div');
  root.className = 'controls-guide';
  const tabs = document.createElement('div');
  tabs.className = 'controls-guide-tabs';
  const body = document.createElement('div');
  body.className = 'controls-guide-body mobile-scroll';
  const buttons: HTMLButtonElement[] = [];
  const select = (index: number) => {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    body.replaceChildren();
    for (const [title, description] of index === 0 ? DESKTOP : MOBILE) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = title;
      const text = document.createElement('p');
      text.textContent = description;
      section.append(heading, text);
      body.appendChild(section);
    }
    body.scrollTop = 0;
  };
  ['电脑操作', '手机操作'].forEach((label, index) => {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => select(index);
    buttons.push(button);
    tabs.appendChild(button);
  });
  root.append(tabs, body);
  select(mobile ? 1 : 0);
  return root;
}


import { isMobileDevice } from '../utils/mobile';

const COMMON_TIPS = [
  '小地图箭头表示角色当前朝向，留意它来辨认路线。',
  '背包可以整理和分解装备，出售装备需要前往商店。',
  '被墙体卡住时，可在暂停菜单选择“脱离卡死”。',
  '战斗房间会封锁出口，击败房内敌人后解除。',
  '多件移动护盾装备可以叠加护盾获取速度与容量。',
  '幸运会小幅提升稀有品质掉落权重，收益逐渐递减。',
  '每五层有一次 Boss 战，获胜后可以选择提前结算。',
];
/** Stage progress reflects completed work, not a simulated download percentage. */
export class LoadingScreen {
  private element: HTMLDivElement;
  private label: HTMLDivElement;
  private progress: HTMLProgressElement;
  private tip: HTMLDivElement;
  private tipTimer: ReturnType<typeof setInterval>;
  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'game-loading';
    this.element.style.backgroundImage = `linear-gradient(0deg, #081625dd, transparent 65%), url(${import.meta.env.BASE_URL}assets/ui/sunlit/loading-camp.webp)`;
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    const panel = document.createElement('div');
    panel.className = 'game-loading-panel';
    this.label = document.createElement('div');
    this.progress = document.createElement('progress');
    this.progress.max = 100;
    this.progress.setAttribute('aria-label', '关卡准备进度');
    const title = document.createElement('strong');
    title.className = 'game-loading-title';
    title.textContent = 'MineWorld';
    this.tip = document.createElement('div');
    this.tip.className = 'game-loading-tip';
    const tips = [...(isMobileDevice() ? ['左下区域按住即可移动；快速双击且不拖动可跳跃。', '拖动攻击键调整方向，技能拖远后松手可以取消施放。'] : ['按住鼠标左键连续攻击，使用技能槽上的数字键施放技能。', '按 C 切换人称，第三人称可用滚轮调整镜头距离。']), ...COMMON_TIPS];
    let index = Math.floor(Math.random() * tips.length);
    const showTip = () => {
      this.tip.textContent = `小提示 · ${tips[index]}`;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
        this.tip.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 350 });
      index = (index + 1) % tips.length;
    };
    showTip();
    this.tipTimer = setInterval(showTip, 3500);
    panel.append(title, this.label, this.progress, this.tip);
    this.element.appendChild(panel);
    root.appendChild(this.element);
  }
  async step(value: number, text: string): Promise<void> {
    this.label.textContent = `${text} · ${value}%`;
    this.progress.value = value;
    // Two frames allow the previous stage to paint before synchronous generation.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }
  close(): void { clearInterval(this.tipTimer); this.element.remove(); }
  fail(back: () => void): void {
    clearInterval(this.tipTimer);
    this.label.textContent = '关卡准备失败，请返回后重试。';
    const button = document.createElement('button');
    button.textContent = '返回主菜单';
    button.onclick = () => { this.close(); back(); };
    this.progress.replaceWith(button);
  }
}

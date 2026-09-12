import { isMobileDevice } from '../utils/mobile';

const COMMON_TIPS = [
  '古谣里说，渡河人遗下九件行装。后来河水干了，岸边的灯却一直亮着。',
  '有位守墓人坚持，钟楼从来只有八口钟。至于夜里多出的那一声，他不肯再提。',
  '旧沙漏的主人已经无从查考。偶尔，里面的沙会向上流动。',
  '商旅在废墟里找到过一枚戒指。与它成对的那枚，据说还戴在某位等候归人的手上。',
  '祭坛边留下半句祷词：“待九个名字重新聚首……”余下的石面，像是被镰刃削去了。',
  '有人在空荡的墓道听见脚步声。那声音总比自己多走一步。',
  '营火旁记下的修习，会随你踏上下一段旅程。出发之前，记得回头看看。',
  '同一套行装的两枚戒指各有来历。收集时，请留意名字后的编号。',
  '九件套需要九个不同部位；多带一枚相同的戒指，补不上缺失的那一件。',
  '死亡收割的遗物偶尔会出现在 Boss 的战利品中。寻常敌人身上找不到它们。',
  '小地图箭头表示角色当前朝向，留意它来辨认路线。',
  '背包可以整理和分解装备，出售装备需要前往商店。',
  '被墙体卡住时，可在暂停菜单选择“脱离卡死”。',
  '战斗房间会封锁出口，击败房内敌人后解除。',
  '护甲增加护盾容量，防御力减少直接伤害；两者可以搭配。',
  '连续 5 秒未受攻击，护盾才会逐渐恢复；启动速度词条可以缩短等待。',
  '多件壁垒可以叠加护盾容量，并加快脱战后移动时的恢复。',
  '敏捷提升闪避，但不能闪避燃烧等持续伤害，走位仍然重要。',
  '幸运会小幅提升稀有品质掉落权重，收益逐渐递减。',
  '圣陵的双叩会在原位置再次落下，先绕侧，别急着走回去。',
  '葬仪台只伤敌人；把司钟人的葬印留在外侧刻槽，可以创造输出窗口。',
  '军械挑战和无名者安葬都是可选支路，不影响主线出口解锁。',
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
  report(value: number, text: string): void {
    this.label.textContent = `${text} · ${value}%`;
    this.progress.value = value;
  }
  async step(value: number, text: string): Promise<void> {
    this.report(value, text);
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

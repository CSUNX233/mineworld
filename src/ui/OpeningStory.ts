import { loadImage } from '../core/AssetLoading';
import './opening-story.css';

export const OPENING_SCENES = [
  {title:'街角', text:'傍晚的街头，两个男人拦住了一个背着吉他的少女。\n「欠的钱呢？」他扯住她的手腕。我走了过去：「放开她。」'},
  {title:'不肯退让', text:'拳头比回答来得更快。我擦掉嘴角的血，又站回她身前。\n男人终于松了手：「再给你最后三天。钱交不上，就跟我们走。」\n脚步声远去，她攥着吉他的背带，很久没有说话。'},
  {title:'不是她欠下的', text:'「是我爸爸……他总说，下一把就能赢回来。」\n她低着头，声音越来越轻。欠条一张接着一张，最后站在这里还债的，却只有她。'},
  {title:'试一试吧', text:'我看向她的吉他：「你有没有听过一个传说？弹出某段曲调，就能去一个神秘的地方。」\n她不太相信，却还是宠溺地笑了：「好吧，听你的。说不定，真能在那里凑够还账的钱呢。」'},
  {title:'弦外之音', text:'第一声琴弦响起时，街灯轻轻晃了一下。\n最后一个音落下，脚下的街道碎成了光。她伸手来拉我——\n一阵天旋地转。连她的声音，也听不见了。'},
  {title:'遗迹苏醒', text:'再睁开眼，只剩陌生的石墙和风声。衣服变成了甲胄，掌心亮起微弱的火。\n她不在身边。远处的阴影，正在靠近。\n先活下来。再去找她。'},
] as const;

export class OpeningStory {
  readonly element = document.createElement('div');
  private picture = document.createElement('img');
  private heading = document.createElement('h2');
  private copy = document.createElement('p');
  private counter = document.createElement('span');
  private next = document.createElement('button');
  private status = document.createElement('span');
  private index = 0;
  private finished = false;
  private lastAdvance = 0;
  constructor(private complete: () => void) {
    this.element.className = 'opening-story'; this.element.setAttribute('role','dialog');
    this.element.setAttribute('aria-modal','true'); this.element.setAttribute('aria-label','开场剧情');
    this.picture.className = 'opening-picture'; this.picture.alt = ''; this.picture.draggable = false;
    const skip = document.createElement('button'); skip.className = 'opening-skip'; skip.textContent = '跳过剧情';
    skip.onclick = event => { event.stopPropagation(); this.finish(); };
    const caption = document.createElement('div'); caption.className = 'opening-caption'; caption.setAttribute('aria-live','polite');
    const footer = document.createElement('div'); footer.className = 'opening-footer';
    this.status.className='opening-status'; this.status.setAttribute('role','status');
    this.next.className='sunlit-menu-button'; this.next.onclick=event=>{event.stopPropagation();this.advance();};
    footer.append(this.counter,this.status,this.next); caption.append(this.heading,this.copy,footer);
    this.element.append(this.picture,skip,caption);
    this.element.onclick=event=>{if(!(event.target as HTMLElement).closest('button'))this.advance();};
    this.element.addEventListener('keydown',event=>{
      if(event.code==='Escape'){event.preventDefault();event.stopPropagation();this.finish();}
      else if(['Space','Enter','ArrowRight'].includes(event.code)&&!(event.target instanceof HTMLButtonElement)){event.preventDefault();this.advance();}
      else if(event.key==='Tab'){event.preventDefault();(document.activeElement===skip?this.next:skip).focus();}
    });
    this.render(); queueMicrotask(()=>this.next.focus());
  }
  private advance(): void {
    if(this.finished || performance.now()-this.lastAdvance<300)return;
    this.lastAdvance=performance.now();
    if(this.index===OPENING_SCENES.length-1){this.finish();return;}
    this.index++;this.render();
  }
  private render(): void {
    const index=this.index,scene=OPENING_SCENES[index];
    this.heading.textContent=scene.title;this.copy.textContent=scene.text;
    this.counter.textContent=`${index+1} / ${OPENING_SCENES.length}`;
    this.next.textContent=index===OPENING_SCENES.length-1?'进入遗迹':'点击继续 ▸';
    this.status.textContent='画面加载中…';this.picture.classList.remove('is-ready');
    const path=(n:number)=>`${import.meta.env.BASE_URL}assets/story/opening/${n+1}.webp`;
    void loadImage(path(index)).then(image=>{
      if(this.finished||index!==this.index)return;
      this.picture.src=image.src;this.picture.alt=scene.title;this.picture.classList.add('is-ready');this.status.textContent='';
      if(index<OPENING_SCENES.length-1)void loadImage(path(index+1),true).catch(()=>{});
    }).catch(()=>{if(!this.finished&&index===this.index)this.status.textContent='画面暂未加载，可继续阅读或跳过';});
  }
  finish(): void {if(this.finished)return;this.finished=true;this.element.remove();this.complete();}
}

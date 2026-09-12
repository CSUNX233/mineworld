import './meta-talent-tree.css';
import { META_NODES, completedBasicVictoryCount, metaBonusDescription, metaUnlockReason, permanentMetaBonuses, type MetaNode } from '../progression/MetaProgression';
import type { SaveEnvelopeV3 } from '../progression/types';
import { DEATH_REAPER_ITEMS } from '../data/DeathReaperItems';

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 900, HEIGHT = 1480;
let selectedId = 'camp_trunk_1';
let savedScroll: { left: number; top: number } | null = null;
const BRANCH_LABELS = {trunk:'公共主干',vitality:'体魄分支',mana:'灵泉分支',attack:'锋芒分支',defense:'坚守分支'};

function position(node: MetaNode): { x: number; y: number } {
  const legacy: Record<string,{x:number;y:number}> = {vanguard:{x:440,y:70},arcanist:{x:230,y:70},summoner:{x:650,y:70},vanguard_mastery:{x:350,y:180},arcanist_mastery:{x:130,y:180},summoner_mastery:{x:750,y:180}};
  if (node.kind !== 'permanent') return legacy[node.id];
  const step = Number(node.id.slice(node.id.lastIndexOf('_')+1));
  if (node.branch === 'trunk') return {x:440,y:290+(step-1)*95};
  const branches = {vitality:{x:100,root:2},mana:{x:780,root:3},defense:{x:260,root:4},attack:{x:620,root:5}};
  const branch = branches[node.branch];
  return {x:branch.x,y:290+(branch.root-1)*95+80+(step-1)*90};
}

function text(tag: 'div'|'p'|'strong'|'h3'|'span',value: string,className = ''): HTMLElement {
  const node = document.createElement(tag); node.textContent = value; node.className = className; return node;
}
function action(label: string,callback:()=>void,disabled = false): HTMLButtonElement {
  const button = document.createElement('button'); button.type='button';button.className='sunlit-menu-button';button.textContent=label;button.disabled=disabled;button.onclick=callback;return button;
}

/** A scrollable graph keeps node details and purchase actions readable on desktop and touch screens. */
export function buildMetaTalentTree(envelope: SaveEnvelopeV3, unlock: (id:string)=>void): HTMLElement {
  const root = document.createElement('section');root.className='meta-tree';root.setAttribute('aria-label','营地天赋树');
  root.append(text('h3','营地修习 · 长期天赋树'),text('p','先沿公共主干深入，再逐点修习分支。小节点累加，末端积习稍强；出发时生效。本局期间可查看。','sunlit-copy'));
  const bonus = permanentMetaBonuses(envelope.profile.unlockedNodes);
  const bonusCopy = Object.values(bonus).some(value=>value>0) ? metaBonusDescription(bonus) : '尚无永久属性加成。';
  root.append(text('p',`已修习 ${envelope.profile.unlockedNodes.filter(id=>META_NODES.some(n=>n.id===id&&n.kind==='permanent')).length} / 40 · ${bonusCopy}`,'meta-tree-summary'));
  const count = completedBasicVictoryCount(envelope);
  root.append(text('p',count >= 3 ? `完整通关 ${count} 次 · 已取得后续进阶研究资格，内容尚未开放。` : `进阶研究资格：完整通过 25 层 ${count} / 3 次。提前撤离不计；后续内容尚未开放。`,'meta-tree-qualification'));
  const toolbar = document.createElement('div');toolbar.className='meta-tree-toolbar';
  toolbar.append(text('span','金色：已解锁 · 青色：可修习 · 灰色：前置未满足'));
  root.append(toolbar);
  const layout = document.createElement('div');layout.className='meta-tree-layout';
  const viewport = document.createElement('div');viewport.className='meta-tree-viewport';viewport.tabIndex=0;
  viewport.setAttribute('aria-label','天赋连线图，可滚动或用方向键移动；电脑可拖动空白处');
  const board = document.createElement('div');board.className='meta-tree-board';board.style.width=`${WIDTH}px`;board.style.height=`${HEIGHT}px`;
  const svg = document.createElementNS(NS,'svg');svg.setAttribute('width',String(WIDTH));svg.setAttribute('height',String(HEIGHT));svg.setAttribute('aria-hidden','true');
  for (const node of META_NODES) {
    if (!node.requiresNode) continue;
    const parent = META_NODES.find(n=>n.id===node.requiresNode);if(!parent)continue;
    const a = position(parent),b = position(node),line = document.createElementNS(NS,'line');
    line.setAttribute('x1',String(a.x));line.setAttribute('y1',String(a.y));line.setAttribute('x2',String(b.x));line.setAttribute('y2',String(b.y));
    line.setAttribute('class',envelope.profile.unlockedNodes.includes(node.id) ? 'is-unlocked' : envelope.profile.unlockedNodes.includes(parent.id) ? 'is-reachable' : '');svg.append(line);
  }
  board.append(svg);
  const detail = document.createElement('aside');detail.className='meta-tree-detail';detail.setAttribute('aria-live','polite');
  const buttons = new Map<string,HTMLButtonElement>();
  const select = (node: MetaNode) => {
    selectedId = node.id;
    for (const [id,button] of buttons) {button.classList.toggle('is-selected',id===node.id);button.setAttribute('aria-pressed',String(id===node.id));}
    detail.replaceChildren(text('span',node.kind==='permanent' ? BRANCH_LABELS[node.branch] : node.kind==='mastery' ? '流派掌握' : '流派入门','meta-tree-branch'),text('h3',node.name),text('p',node.description));
    if (node.requiresNode) detail.append(text('p',`前置：${META_NODES.find(n=>n.id===node.requiresNode)?.name ?? node.requiresNode}`));
    if (node.kind==='mastery') detail.append(text('p','需完整通关，并在至少 3 个战斗房使用任一对应分支 20 次。'));
    detail.append(text('p',`消耗 ${node.cost} 个营地天赋点 · 当前 ${envelope.profile.availableMetaPoints} 点`));
    const reason = metaUnlockReason(envelope,node);
    detail.append(text('p',reason ?? '前置已满足，可修习。','meta-tree-status'),action(envelope.profile.unlockedNodes.includes(node.id) ? '已解锁' : `修习 · ${node.cost} 点`,()=>unlock(node.id),reason!==null));
    if (node.kind==='permanent') detail.append(text('p','永久属性在下一局出发时固定，进行中的对局保留原有修习配置。','meta-tree-footnote'));
  };
  for (const node of META_NODES) {
    const p = position(node),button = document.createElement('button');button.type='button';button.className='meta-tree-node';
    const unlocked = envelope.profile.unlockedNodes.includes(node.id),ready = metaUnlockReason(envelope,node)===null;
    button.classList.toggle('is-unlocked',unlocked);button.classList.toggle('is-ready',ready);button.classList.toggle('is-notable',node.kind==='mastery'||node.kind==='permanent'&&node.notable);
    button.style.left=`${p.x}px`;button.style.top=`${p.y}px`;button.setAttribute('aria-label',`${node.name}，${unlocked?'已解锁':ready?'可修习':'待解锁'}`);button.title=node.name;
    button.append(text('span',node.kind==='permanent' ? node.notable ? '◆' : node.id.slice(node.id.lastIndexOf('_')+1) : node.kind==='mastery' ? '★' : node.id==='vanguard' ? '剑' : node.id==='arcanist' ? '术' : '契','meta-tree-node-symbol'));
    const label = text('span',node.name,'meta-tree-node-label');button.append(label);button.onclick=()=>select(node);board.append(button);buttons.set(node.id,button);
  }
  viewport.append(board);layout.append(viewport,detail);root.append(layout,text('p','滚轮或触屏滑动查看连线；电脑可拖动空白处，也可用方向键移动。点击节点查看详情，再确认修习。','meta-tree-footnote'));
  toolbar.append(action('回到主干',()=>viewport.scrollTo({left:440-viewport.clientWidth/2,top:220,behavior:'smooth'})));
  let drag: {x:number;y:number;left:number;top:number} | null = null;
  viewport.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0||(event.target as HTMLElement).closest('button'))return;drag={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-dragging');event.preventDefault();});
  viewport.addEventListener('pointermove',event=>{if(drag){viewport.scrollLeft=drag.left-event.clientX+drag.x;viewport.scrollTop=drag.top-event.clientY+drag.y;}});
  const endDrag=()=>{drag=null;viewport.classList.remove('is-dragging');};viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);
  viewport.addEventListener('scroll',()=>{savedScroll={left:viewport.scrollLeft,top:viewport.scrollTop};});
  const scroll = savedScroll;
  requestAnimationFrame(()=>{viewport.scrollLeft=scroll?.left ?? Math.max(0,440-viewport.clientWidth/2);viewport.scrollTop=scroll?.top ?? 220;});
  select(META_NODES.find(n=>n.id===selectedId) ?? META_NODES.find(n=>n.id==='camp_trunk_1')!);
  const collection = document.createElement('details');collection.className='meta-relic-collection';
  const discovered = new Set(envelope.profile.discoveredRelics ?? []),summary = document.createElement('summary');
  summary.textContent=`死亡收割图鉴 · 已发现 ${DEATH_REAPER_ITEMS.filter(item=>discovered.has(item.id)).length} / ${DEATH_REAPER_ITEMS.length} 件`;
  collection.append(summary,text('p','击败 Boss 时有 3% 概率获得一件死亡收割红装。首次拾取记录身份；死亡与删除单个冒险存档保留发现，不将装备带出，不增加永久属性。','meta-tree-footnote'));
  const list=document.createElement('ul');list.className='meta-relic-list';
  for(const item of DEATH_REAPER_ITEMS){const row=document.createElement('li');row.textContent=`${discovered.has(item.id)?'✓ 已发现':'◇ 未发现'} · ${item.name}`;row.classList.toggle('is-discovered',discovered.has(item.id));list.append(row);}
  collection.append(list);root.append(collection);
  return root;
}

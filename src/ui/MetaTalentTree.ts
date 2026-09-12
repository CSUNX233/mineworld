import './meta-talent-tree.css';
import './mobile-meta-tree.css';
import { META_NODES, completedBasicVictoryCount, metaBonusDescription, metaUnlockReason, permanentMetaBonuses, type MetaNode } from '../progression/MetaProgression';
import type { SaveEnvelopeV3 } from '../progression/types';
import { DEATH_REAPER_ITEMS } from '../data/DeathReaperItems';
import { kitUrl } from './InterfaceKit';

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
  root.append(text('h3','营地修习 · 长期天赋树','meta-tree-title'));
  const controls = document.createElement('div');controls.className='meta-tree-controls';root.append(controls);
  const help = document.createElement('details');help.className='meta-tree-help';
  const helpSummary = document.createElement('summary');helpSummary.textContent='修习说明与永久加成';help.append(helpSummary,text('p','先沿公共主干深入，再逐点修习分支。小节点累加，末端积习稍强；出发时生效。本局期间可查看。','sunlit-copy'));
  const bonus = permanentMetaBonuses(envelope.profile.unlockedNodes);
  const bonusCopy = Object.values(bonus).some(value=>value>0) ? metaBonusDescription(bonus) : '尚无永久属性加成。';
  const learned = envelope.profile.unlockedNodes.filter(id=>META_NODES.some(n=>n.id===id&&n.kind==='permanent')).length;
  help.append(text('p',bonusCopy,'meta-tree-summary'));
  const count = completedBasicVictoryCount(envelope);
  help.append(text('p',count >= 3 ? `完整通关 ${count} 次 · 已取得后续进阶研究资格，内容尚未开放。` : `进阶研究资格：完整通过 25 层 ${count} / 3 次。提前撤离不计；后续内容尚未开放。`,'meta-tree-qualification'));controls.append(help);
  const toolbar = document.createElement('div');toolbar.className='meta-tree-toolbar';
  toolbar.append(text('span',`已修习 ${learned}/40 · 余 ${envelope.profile.availableMetaPoints} 点`,'meta-tree-progress'));
  controls.append(toolbar);
  const layout = document.createElement('div');layout.className='meta-tree-layout';
  const viewport = document.createElement('div');viewport.className='meta-tree-viewport';viewport.tabIndex=0;
  viewport.setAttribute('aria-label','天赋连线图，可双向拖动、滚动或用方向键移动；点击节点查看详情');
  const board = document.createElement('div');board.className='meta-tree-board';board.style.width=`${WIDTH}px`;board.style.height=`${HEIGHT}px`;
  const links = document.createElement('div');links.setAttribute('aria-hidden','true');
  for (const node of META_NODES) {
    if (!node.requiresNode) continue;
    const parent = META_NODES.find(n=>n.id===node.requiresNode);if(!parent)continue;
    const a = position(parent),b = position(node),line = document.createElement('span');
    const state = envelope.profile.unlockedNodes.includes(node.id) ? 'learned' : envelope.profile.unlockedNodes.includes(parent.id) ? 'available' : 'locked';
    line.className = 'kit-talent-link';
    Object.assign(line.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${Math.hypot(b.x-a.x,b.y-a.y)}px`, transform: `rotate(${Math.atan2(b.y-a.y,b.x-a.x)}rad)`, borderImageSource: `url("${kitUrl(`talents/link-${state}`)}")` });
    links.append(line);
  }
  board.append(links);
  const detail = document.createElement('aside');detail.className='meta-tree-detail';detail.setAttribute('aria-live','polite');
  const buttons = new Map<string,HTMLButtonElement>();
  const closeDetail = () => {root.classList.remove('is-detail-open');detail.hidden=true;};
  const select = (node: MetaNode, open = true) => {
    selectedId = node.id;
    for (const [id,button] of buttons) {button.classList.toggle('is-selected',id===node.id);button.setAttribute('aria-pressed',String(id===node.id));}
    const heading = document.createElement('div');heading.className='meta-tree-detail-heading';
    const close = action('收起详情',()=>{closeDetail();buttons.get(node.id)?.focus({preventScroll:true});});close.classList.add('meta-tree-detail-close');
    heading.append(text('h3',node.name),close);
    detail.replaceChildren(heading,text('span',node.kind==='permanent' ? BRANCH_LABELS[node.branch] : node.kind==='mastery' ? '流派掌握' : '流派入门','meta-tree-branch'),text('p',node.description));
    if (node.requiresNode) detail.append(text('p',`前置：${META_NODES.find(n=>n.id===node.requiresNode)?.name ?? node.requiresNode}`));
    if (node.kind==='mastery') detail.append(text('p','需完整通关，并在至少 3 个战斗房使用任一对应分支 20 次。'));
    detail.append(text('p',`消耗 ${node.cost} 个营地天赋点 · 当前 ${envelope.profile.availableMetaPoints} 点`));
    const reason = metaUnlockReason(envelope,node);
    detail.append(text('p',reason ?? '前置已满足，可修习。','meta-tree-status'),action(envelope.profile.unlockedNodes.includes(node.id) ? '已解锁' : `修习 · ${node.cost} 点`,()=>unlock(node.id),reason!==null));
    if (node.kind==='permanent') detail.append(text('p','永久属性在下一局出发时固定，进行中的对局保留原有修习配置。','meta-tree-footnote'));
    root.classList.toggle('is-detail-open',open);detail.hidden=!open;detail.scrollTop=0;
  };
  for (const node of META_NODES) {
    const p = position(node),button = document.createElement('button');button.type='button';button.className='meta-tree-node';
    const unlocked = envelope.profile.unlockedNodes.includes(node.id),ready = metaUnlockReason(envelope,node)===null;
    button.classList.toggle('is-unlocked',unlocked);button.classList.toggle('is-ready',ready);button.classList.toggle('is-notable',node.kind==='mastery'||node.kind==='permanent'&&node.notable);
    const tier = node.kind === 'mastery' ? 'core' : node.kind !== 'permanent' || node.notable ? 'major' : 'minor';
    button.dataset.kitTier = tier;
    button.style.setProperty('--kit-node', `url("${kitUrl(`talents/${tier}-${unlocked ? 'learned' : ready ? 'available' : 'locked'}`)}")`);
    button.style.left=`${p.x}px`;button.style.top=`${p.y}px`;button.setAttribute('aria-label',`${node.name}，${unlocked?'已解锁':ready?'可修习':'待解锁'}`);button.title=node.name;
    button.append(text('span',node.kind==='permanent' ? node.notable ? '◆' : node.id.slice(node.id.lastIndexOf('_')+1) : node.kind==='mastery' ? '★' : node.id==='vanguard' ? '剑' : node.id==='arcanist' ? '术' : '契','meta-tree-node-symbol'));
    const label = text('span',node.name,'meta-tree-node-label');button.append(label);button.onclick=()=>select(node);board.append(button);buttons.set(node.id,button);
  }
  viewport.append(board);layout.append(viewport,detail);root.append(layout,text('p','金：已解锁 · 青：可修习 · 灰：待解锁｜双向拖动，点节点查看','meta-tree-footnote meta-tree-gesture-hint'));
  toolbar.append(action('回到主干',()=>{closeDetail();requestAnimationFrame(()=>viewport.scrollTo({left:440-viewport.clientWidth/2,top:220,behavior:'smooth'}));}));
  let drag: {id:number;x:number;y:number;left:number;top:number;moved:boolean} | null = null;
  let suppressClick = false;
  viewport.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.button!==0)return;suppressClick=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};});
  viewport.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;if(!drag.moved){drag.moved=true;viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-dragging');}event.preventDefault();viewport.scrollLeft=drag.left-event.clientX+drag.x;viewport.scrollTop=drag.top-event.clientY+drag.y;});
  const endDrag=(event:PointerEvent)=>{if(!drag||drag.id!==event.pointerId)return;suppressClick=drag.moved;drag=null;viewport.classList.remove('is-dragging');if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);};viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);viewport.addEventListener('lostpointercapture',()=>{drag=null;viewport.classList.remove('is-dragging');});
  viewport.addEventListener('pointerleave',()=>{if(drag&&!drag.moved)drag=null;});
  viewport.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&root.classList.contains('is-detail-open')){event.preventDefault();event.stopPropagation();closeDetail();buttons.get(selectedId)?.focus({preventScroll:true});}});
  viewport.addEventListener('scroll',()=>{savedScroll={left:viewport.scrollLeft,top:viewport.scrollTop};});
  const scroll = savedScroll;
  requestAnimationFrame(()=>{viewport.scrollLeft=scroll?.left ?? Math.max(0,440-viewport.clientWidth/2);viewport.scrollTop=scroll?.top ?? 220;});
  select(META_NODES.find(n=>n.id===selectedId) ?? META_NODES.find(n=>n.id==='camp_trunk_1')!,!matchMedia('(max-width: 900px), (pointer: coarse) and (max-height: 600px)').matches);
  const collection = document.createElement('details');collection.className='meta-relic-collection';
  const discovered = new Set(envelope.profile.discoveredRelics ?? []),summary = document.createElement('summary');
  summary.textContent=`死亡收割图鉴 · 已发现 ${DEATH_REAPER_ITEMS.filter(item=>discovered.has(item.id)).length} / ${DEATH_REAPER_ITEMS.length} 件`;
  collection.append(summary,text('p','击败 Boss 时有 3% 概率获得一件死亡收割红装。首次拾取记录身份；死亡与删除单个冒险存档保留发现，不将装备带出，不增加永久属性。','meta-tree-footnote'));
  const list=document.createElement('ul');list.className='meta-relic-list';
  for(const item of DEATH_REAPER_ITEMS){const row=document.createElement('li');row.textContent=`${discovered.has(item.id)?'✓ 已发现':'◇ 未发现'} · ${item.name}`;row.classList.toggle('is-discovered',discovered.has(item.id));list.append(row);}
  collection.append(list);root.append(collection);
  return root;
}

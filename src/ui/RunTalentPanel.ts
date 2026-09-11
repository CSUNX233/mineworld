import { RUN_TALENT_BY_ID, RUN_TALENT_DEFS } from '../data/runTalents';
import type { RunTalentDef, RunTalentLane } from '../data/runTalents';
import {
  canUnlockTalent,
  isValidRunTalentState,
  resetTalentCost,
  spentTalentPoints,
  type RunTalentState,
} from '../progression/RunTalents';
import { createUiIcon } from './UiAssets';
import { P4_ICON_IDS } from './P4Icons';

const LANE_NAMES: Record<RunTalentLane, string> = {
  core: '核心',
  spreading: '蔓延之火',
  consuming: '吞噬之火',
  'melee-core': '近战核心',
  cleave: '断岳连斩',
  guard: '盾反守势',
  'summon-core': '召唤核心',
  legion: '混编军团',
  elite: '精锐魂契',
  hybrid: '跨系联动',
  utility: '生存与资源',
};

type RunTalentGroup = 'fire' | 'melee' | 'summon' | 'hybrid';

const TALENT_GROUP_NAMES: Readonly<Record<RunTalentGroup, string>> = {
  fire: '火焰',
  melee: '近战',
  summon: '召唤',
  hybrid: '混合',
};

let activeTalentGroup: RunTalentGroup = 'fire';

const TALENT_ICONS: Record<string, string> = {
  fire_seed: 'fireball',
  spreading_flame: 'fireball',
  ember_relay: 'fireball',
  wide_wildfire: 'fireball',
  many_sparks: 'fireball',
  lasting_embers: 'fireball',
  consuming_flame: 'detonate',
  searing_appetite: 'detonate',
  mana_from_ashes: 'detonate',
  ash_guard: 'shield',
  cremation: 'detonate',
  melee_seed: 'sword',
  melee_cleave: 'axe',
  melee_cleave_edge: 'axe',
  melee_cleave_aftershock: 'hammer',
  melee_guard: 'shield',
  melee_guard_reserve: 'shield',
  melee_guard_bastion: 'shield',
  summon_seed: 'summon',
  summon_legion: 'summon',
  summon_legion_drill: 'summon',
  summon_legion_vanguard: 'shield',
  summon_elite: 'summon',
  summon_elite_training: 'summon',
  summon_elite_guardian: 'shield',
  ember_blade: 'ember_blade',
  tempered_skin: 'shield',
  deep_reservoir: 'staff',
  vital_spark: 'heal',
  steady_flame: 'dash',
  scavenger_instinct: 'bag',
};

function relationNames(ids: readonly string[] | undefined): string {
  return ids?.map((id) => RUN_TALENT_BY_ID.get(id)?.name ?? id).join('、') ?? '无';
}

function lockedReason(state: RunTalentState, talent: RunTalentDef, budget: number): string {
  if (!isValidRunTalentState(state)) return '天赋数据无效';
  const missing = talent.requires?.filter((id) => !state.unlocked.includes(id)) ?? [];
  if (missing.length > 0) return `需要：${relationNames(missing)}`;
  const conflict = talent.excludes?.find((id) => state.unlocked.includes(id));
  if (conflict) return `与「${relationNames([conflict])}」互斥`;
  const shortfall = spentTalentPoints(state) + talent.cost - Math.floor(budget);
  if (shortfall > 0) return `还差 ${shortfall} 点`;
  return '可点亮';
}

function buildTalentNode(
  state: RunTalentState,
  talent: RunTalentDef,
  budget: number,
  editable: boolean,
  onUnlock: (id: string) => void,
): HTMLElement {
  const unlocked = state.unlocked.includes(talent.id);
  const canUnlock = editable && canUnlockTalent(state, talent.id, budget);
  const article = document.createElement('article');
  article.className = `run-talent-node is-${unlocked ? 'unlocked' : canUnlock ? 'available' : 'locked'}`;
  article.dataset.talentId = talent.id;

  const heading = document.createElement('div');
  heading.className = 'run-talent-node-heading';
  heading.appendChild(createUiIcon(P4_ICON_IDS.has(talent.id) ? talent.id : TALENT_ICONS[talent.id] ?? 'fireball', 'run-talent-icon'));
  const name = document.createElement('strong');
  name.textContent = talent.name;
  const cost = document.createElement('span');
  cost.className = 'run-talent-cost';
  cost.textContent = `代价 ${talent.cost} 点`;
  heading.append(name, cost);

  const description = document.createElement('p');
  description.textContent = `${talent.excludes?.length ? '取舍' : '收益'}：${talent.description}`;

  const relations = document.createElement('dl');
  relations.className = 'run-talent-relations';
  if (talent.requires?.length) {
    const term = document.createElement('dt');
    term.textContent = '前置';
    const detail = document.createElement('dd');
    detail.textContent = relationNames(talent.requires);
    relations.append(term, detail);
  }
  if (talent.excludes?.length) {
    const term = document.createElement('dt');
    term.textContent = '互斥';
    const detail = document.createElement('dd');
    detail.textContent = relationNames(talent.excludes);
    relations.append(term, detail);
  }

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'run-talent-action';
  action.disabled = unlocked || !canUnlock;
  action.textContent = unlocked ? '已点亮' : editable ? lockedReason(state, talent, budget) : '仅在安全房可点亮';
  action.setAttribute('aria-label', `${talent.name}：${action.textContent}`);
  if (canUnlock) action.addEventListener('click', () => onUnlock(talent.id));

  article.append(heading, description);
  if (relations.childElementCount > 0) article.appendChild(relations);
  article.appendChild(action);
  return article;
}

function buildLane(
  lane: RunTalentLane,
  state: RunTalentState,
  budget: number,
  editable: boolean,
  onUnlock: (id: string) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = `run-talent-lane run-talent-lane-${lane}`;
  const heading = document.createElement('h3');
  heading.textContent = LANE_NAMES[lane];
  section.appendChild(heading);
  RUN_TALENT_DEFS
    .filter((talent) => talent.lane === lane)
    .sort((left, right) => left.tier - right.tier)
    .forEach((talent) => section.appendChild(buildTalentNode(state, talent, budget, editable, onUnlock)));
  return section;
}

function buildBranches(
  lanes: readonly [RunTalentLane, RunTalentLane],
  state: RunTalentState,
  budget: number,
  editable: boolean,
  onUnlock: (id: string) => void,
): HTMLElement {
  const branches = document.createElement('div');
  branches.className = 'run-talent-branches';
  branches.append(
    buildLane(lanes[0], state, budget, editable, onUnlock),
    buildLane(lanes[1], state, budget, editable, onUnlock),
  );
  return branches;
}

function buildCenteredLane(
  lane: RunTalentLane,
  state: RunTalentState,
  budget: number,
  editable: boolean,
  onUnlock: (id: string) => void,
): HTMLElement {
  const section = buildLane(lane, state, budget, editable, onUnlock);
  section.style.maxWidth = '490px';
  section.style.margin = '0 auto 12px';
  return section;
}

function buildTalentGroup(
  group: RunTalentGroup,
  state: RunTalentState,
  budget: number,
  editable: boolean,
  onUnlock: (id: string) => void,
): HTMLElement {
  const page = document.createElement('div');
  page.id = `run-talent-group-${group}`;
  page.dataset.talentGroup = group;
  page.setAttribute('role', 'tabpanel');
  page.setAttribute('aria-label', `${TALENT_GROUP_NAMES[group]}天赋`);

  if (group === 'fire') {
    page.append(
      buildCenteredLane('core', state, budget, editable, onUnlock),
      buildBranches(['spreading', 'consuming'], state, budget, editable, onUnlock),
    );
  } else if (group === 'melee') {
    page.append(
      buildCenteredLane('melee-core', state, budget, editable, onUnlock),
      buildBranches(['cleave', 'guard'], state, budget, editable, onUnlock),
    );
  } else if (group === 'summon') {
    page.append(
      buildCenteredLane('summon-core', state, budget, editable, onUnlock),
      buildBranches(['legion', 'elite'], state, budget, editable, onUnlock),
    );
  } else {
    page.append(
      buildCenteredLane('hybrid', state, budget, editable, onUnlock),
      buildLane('utility', state, budget, editable, onUnlock),
    );
  }

  return page;
}

export function buildRunTalentPanel(
  state: RunTalentState,
  budget: number,
  editable: boolean,
  onUnlock: (id: string) => void,
  onReset: () => void,
): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'run-talent-panel';
  panel.setAttribute('aria-label', '局内天赋');

  const valid = isValidRunTalentState(state);
  const spent = spentTalentPoints(state);
  const safeBudget = Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0;
  const available = Math.max(0, safeBudget - spent);
  const header = document.createElement('header');
  header.className = 'run-talent-header';
  const headingBlock = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = '局内天赋';
  const summary = document.createElement('p');
  summary.className = 'run-talent-summary';
  const used = document.createElement('strong');
  used.textContent = `${spent} / ${safeBudget}`;
  summary.append('已用 ', used, ` · 可用 ${available}`);
  headingBlock.append(heading, summary);
  if (!valid) {
    const warning = document.createElement('div');
    warning.className = 'run-talent-invalid';
    warning.textContent = '天赋状态无效，已停止编辑。';
    headingBlock.appendChild(warning);
  }

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'run-talent-reset';
  const resetCost = resetTalentCost(state);
  reset.textContent = resetCost === 0 ? '重置天赋（免费）' : `重置天赋（${resetCost} 金币）`;
  reset.disabled = !editable || !valid || spent === 0;
  reset.title = editable
    ? '确认后清空已选节点并退回点数；前两次免费，之后花费金币'
    : '仅在安全房可以重置天赋';
  if (!reset.disabled) reset.addEventListener('click', onReset);
  header.append(headingBlock, reset);

  const cadence = document.createElement('p');
  cadence.className = 'run-talent-cadence';
  cadence.textContent = '获取节奏：开局 1 点；等级 2 / 4 / 6 / 8 / 10 各 1 点；完整完成第 5 / 10 / 15 / 20 层的两条 Boss 主线各 1 点。25 层预计共 10 点。';

  const tabs = document.createElement('div');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '天赋流派');
  tabs.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(68px,1fr));gap:8px;margin:0 0 12px;overflow-x:auto;position:sticky;top:0;z-index:2;padding:4px;background:rgba(34,59,86,.94)';

  const content = document.createElement('div');
  content.style.cssText = 'max-height:min(62dvh,680px);overflow-y:auto;overscroll-behavior:contain;padding-right:4px';
  const pages = new Map<RunTalentGroup, HTMLElement>();
  const buttons = new Map<RunTalentGroup, HTMLButtonElement>();
  const selectGroup = (selected: RunTalentGroup): void => {
    activeTalentGroup = selected;
    for (const [group, page] of pages) page.hidden = group !== selected;
    for (const [group, button] of buttons) {
      const active = group === selected;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      button.style.background = active ? '#287f80' : '#223b56';
      button.style.color = active ? '#fff1ca' : '#d5c9ad';
      button.style.boxShadow = active ? 'inset 0 0 0 2px #d8aa4e' : 'none';
    }
  };

  for (const group of Object.keys(TALENT_GROUP_NAMES) as RunTalentGroup[]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `run-talent-group-${group}`);
    button.textContent = TALENT_GROUP_NAMES[group];
    button.style.cssText = 'min-height:44px;padding:8px 10px;border:1px solid rgba(255,225,163,.45);font:inherit;font-weight:800;cursor:pointer;white-space:nowrap';
    button.addEventListener('click', () => selectGroup(group));
    buttons.set(group, button);
    tabs.appendChild(button);

    const page = buildTalentGroup(group, state, safeBudget, editable && valid, onUnlock);
    pages.set(group, page);
    content.appendChild(page);
  }
  selectGroup(activeTalentGroup);

  panel.append(header, cadence, tabs, content);
  return panel;
}

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

const LANE_NAMES: Record<RunTalentLane, string> = {
  core: '核心',
  spreading: '蔓延之火',
  consuming: '吞噬之火',
  utility: '生存与资源',
};

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
  heading.appendChild(createUiIcon(TALENT_ICONS[talent.id] ?? 'fireball', 'run-talent-icon'));
  const name = document.createElement('strong');
  name.textContent = talent.name;
  const cost = document.createElement('span');
  cost.className = 'run-talent-cost';
  cost.textContent = `代价 ${talent.cost} 点`;
  heading.append(name, cost);

  const description = document.createElement('p');
  description.textContent = `收益：${talent.description}`;

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

  panel.append(header, cadence);
  panel.appendChild(buildLane('core', state, safeBudget, editable && valid, onUnlock));
  const branches = document.createElement('div');
  branches.className = 'run-talent-branches';
  branches.append(
    buildLane('spreading', state, safeBudget, editable && valid, onUnlock),
    buildLane('consuming', state, safeBudget, editable && valid, onUnlock),
  );
  panel.append(branches, buildLane('utility', state, safeBudget, editable && valid, onUnlock));
  return panel;
}

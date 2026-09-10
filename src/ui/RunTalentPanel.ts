import { RUN_TALENT_BY_ID, RUN_TALENT_DEFS } from '../data/runTalents';
import type { RunTalentDef, RunTalentLane } from '../data/runTalents';
import {
  canUnlockTalent,
  isValidRunTalentState,
  resetTalentCost,
  spentTalentPoints,
  type RunTalentState,
} from '../progression/RunTalents';

const LANE_NAMES: Record<RunTalentLane, string> = {
  core: '核心',
  spreading: '蔓延之火',
  consuming: '吞噬之火',
  utility: '生存与资源',
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

function panelStyles(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
    .run-talent-panel { box-sizing: border-box; width: 100%; max-width: 980px; padding: 16px; color: #edf3f8; background: #0e1722; border: 1px solid #4a6178; border-radius: 8px; font: 13px/1.45 var(--hud-font, monospace); overflow-x: hidden; }
    .run-talent-panel * { box-sizing: border-box; min-width: 0; }
    .run-talent-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .run-talent-header h2 { margin: 0 0 5px; font-size: 22px; color: #fff1cf; }
    .run-talent-summary { margin: 0; color: #b8c9d9; }
    .run-talent-summary strong { color: #ffcf72; }
    .run-talent-cadence { margin: 8px 0 14px; padding: 8px 10px; border-left: 3px solid #dd8a45; background: #172535; color: #cbd9e6; overflow-wrap: anywhere; }
    .run-talent-reset, .run-talent-action { min-height: 44px; border: 1px solid #607992; border-radius: 5px; padding: 8px 12px; color: #edf5fc; background: #21364a; font: inherit; cursor: pointer; white-space: normal; overflow-wrap: anywhere; }
    .run-talent-reset { flex: 0 1 190px; }
    .run-talent-reset:disabled, .run-talent-action:disabled { opacity: .48; cursor: default; }
    .run-talent-core { max-width: 470px; margin: 0 auto 12px; }
    .run-talent-branches { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
    .run-talent-lane { padding: 10px; border: 1px solid #33485e; border-radius: 7px; background: #111e2b; }
    .run-talent-lane h3 { margin: 0 0 9px; font-size: 16px; }
    .run-talent-lane-spreading h3 { color: #ffb45e; }
    .run-talent-lane-consuming h3 { color: #ff7868; }
    .run-talent-lane-utility { margin-top: 12px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .run-talent-lane-utility h3 { grid-column: 1 / -1; color: #a8d6ff; }
    .run-talent-node { margin: 8px 0; padding: 10px; border: 1px solid #364a5d; border-radius: 6px; background: #172536; }
    .run-talent-node.is-unlocked { border-color: #dfa451; background: #2b2a24; }
    .run-talent-node.is-available { border-color: #65a8ca; box-shadow: inset 0 0 0 1px #65a8ca44; }
    .run-talent-node.is-locked { color: #a1afbc; }
    .run-talent-node-heading { display: flex; justify-content: space-between; gap: 8px; }
    .run-talent-node-heading strong { color: #f3f6f9; font-size: 14px; }
    .run-talent-cost { flex: 0 0 auto; color: #ffcf72; }
    .run-talent-node p { margin: 7px 0; min-height: 3em; overflow-wrap: anywhere; }
    .run-talent-relations { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 7px; margin: 7px 0; font-size: 11px; color: #b9c9d8; }
    .run-talent-relations dt { color: #8197aa; }
    .run-talent-relations dd { margin: 0; overflow-wrap: anywhere; }
    .run-talent-action { width: 100%; margin-top: 5px; }
    .run-talent-invalid { color: #ff9187; }
    @media (max-width: 760px), (orientation: portrait) {
      .run-talent-panel { width: 100%; padding: 11px; }
      .run-talent-header { flex-direction: column; gap: 9px; }
      .run-talent-reset { width: 100%; flex-basis: auto; }
      .run-talent-branches { grid-template-columns: minmax(0, 1fr); }
      .run-talent-lane-utility { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 430px) {
      .run-talent-lane-utility { grid-template-columns: minmax(0, 1fr); }
    }
  `;
  return style;
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
  panel.appendChild(panelStyles());

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

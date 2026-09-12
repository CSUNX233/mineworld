import { CRAFTING_TAGS } from '../items/CraftingTags';
import type { EquipmentMechanismTag } from '../items/RewardPreference';
import type { SaveData } from '../types';
import type { ArchetypeId, RewardPreference, SaveEnvelopeV3, SettlementRecord } from '../progression/types';
import {
  ARCHETYPE_NODES,
  BUILD_BRANCH_NAMES,
  MASTERY_ENCOUNTER_REQUIREMENT,
  MASTERY_NODES,
  MASTERY_USE_REQUIREMENT,
  XP_PER_POINT,
  archetypeAllowed,
} from '../progression/MetaProgression';
import { BASIC_RUN_DEFINITION } from '../data/runProgression';
import { createUiIcon } from './UiAssets';
import { buildMetaTalentTree } from './MetaTalentTree';

interface CampActions {
  start: (id: ArchetypeId, mechanism?: EquipmentMechanismTag) => void;
  resume: () => void;
  unlock: (id: string) => void;
  back: () => void;
  exportLegacy: () => void;
  abandon: () => void;
  setPreference?: (id: RewardPreference) => void;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function panel(title: string, description: string): HTMLDivElement {
  const root = element('div');
  root.className = 'sunlit-run-screen';
  const heading = element('h2', title);
  heading.className = 'sunlit-screen-title';
  root.append(heading, paragraph(description));
  return root;
}

function paragraph(text: string): HTMLParagraphElement {
  const node = element('p', text);
  node.className = 'sunlit-copy';
  return node;
}

function button(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const node = element('button', label);
  node.type = 'button';
  node.disabled = disabled;
  node.className = 'sunlit-menu-button';
  node.onclick = action;
  return node;
}

function row(...children: HTMLElement[]): HTMLDivElement {
  const node = element('div');
  node.className = 'sunlit-action-row';
  node.append(...children);
  return node;
}

function notice(root: HTMLElement, message?: string): void {
  if (!message) return;
  const node = paragraph(message);
  node.setAttribute('role', 'status');
  node.classList.add('sunlit-notice');
  root.append(node);
}

const ARCHETYPE_ICONS: Record<ArchetypeId, string> = {
  vanguard: 'sword',
  arcanist: 'staff',
  summoner: 'summon',
};

export function buildNewAdventureView(envelope: SaveEnvelopeV3, actions: { start:(name:string,archetype:ArchetypeId)=>void;back:()=>void }, defaultName: string, message = ''): HTMLDivElement {
  const root=panel('新的冒险','为这个存档取名并选择已解锁流派，然后直接出发。营地天赋在存档界面的独立入口修习。');
  notice(root,message);
  const form=document.createElement('form');form.className='sunlit-new-adventure-form';
  const nameLabel=element('label','冒险名称');const name=element('input');name.type='text';name.maxLength=24;name.required=true;name.value=envelope.adventureName ?? defaultName;name.autocomplete='off';nameLabel.append(name);
  const archetypeLabel=element('label','起始流派');const archetype=element('select');archetype.required=true;
  for(const node of ARCHETYPE_NODES) if(archetypeAllowed(envelope.profile,node.id)){const option=element('option',node.name);option.value=node.id;archetype.append(option);}
  archetype.value=envelope.preferredArchetype ?? envelope.profile.rewardPreference ?? 'vanguard';if(!archetype.value)archetype.selectedIndex=0;
  archetypeLabel.append(archetype);const submit=button('开始冒险',()=>undefined);submit.type='submit';
  const error=paragraph('');error.setAttribute('role','alert');
  form.onsubmit=event=>{event.preventDefault();const chosenName=name.value.trim();if(!chosenName){error.textContent='请填写冒险名称。';name.focus();return;}submit.disabled=true;actions.start(chosenName,archetype.value as ArchetypeId);};
  form.append(nameLabel,archetypeLabel,error,submit);root.append(form,row(button('返回存档界面',actions.back)));return root;
}

export function buildMetaProgressionView(envelope:SaveEnvelopeV3,actions:{unlock:(id:string)=>void;setPreference:(id:RewardPreference)=>void;back:()=>void},message = ''):HTMLDivElement {
  const root=element('div');root.className='sunlit-run-screen meta-screen-content';
  const header=element('header');header.className='meta-screen-header';
  const heading=element('h2','营地天赋树');heading.className='sunlit-screen-title';
  const back=button('关闭',actions.back);back.classList.add('panel-close-button');back.setAttribute('aria-label','关闭天赋树，返回存档');
  header.append(heading,back);root.append(header);
  const points=element('div',`天赋点 ${envelope.profile.availableMetaPoints} · 研究经验 ${envelope.profile.researchXp} / ${XP_PER_POINT}`);points.className='meta-screen-points';root.append(points);
  notice(root,message);
  root.append(buildMetaTalentTree(envelope,actions.unlock));
  const more=element('details');more.className='meta-screen-more mobile-scroll';more.append(element('summary','修习说明与奖励偏好'));
  more.append(paragraph('本机五个存档共用修习、掌握和图鉴。新的修习与奖励偏好在下次出发时生效，进行中的对局保留原有配置。'));
  const preferences=MASTERY_NODES.filter(n=>envelope.profile.unlockedNodes.includes(n.id));
  if(preferences.length){more.append(element('h3','下一局奖励偏好'),row(...preferences.map(n=>button(`${n.name}${envelope.profile.rewardPreference===n.archetype?' · 已选择':''}`,()=>actions.setPreference(n.archetype),!!envelope.activeRun||!!envelope.pendingSettlement||envelope.profile.rewardPreference===n.archetype))));}
  root.append(more);return root;
}

export function buildCampView(envelope: SaveEnvelopeV3, actions: CampActions, message?: string): HTMLDivElement {
  const profile = envelope.profile;
  const root = panel('营地', '练成新的流派，再向深渊出发。每局的等级、装备与金币独立；营地天赋点、解锁与专精由本机五个存档共享，删除冒险存档也会保留。');
  const points = element('div', `可用天赋点 ${profile.availableMetaPoints} · 研究经验 ${profile.researchXp} / ${XP_PER_POINT}`);
  points.className = 'sunlit-inset sunlit-resource-banner';
  points.prepend(createUiIcon('gem', 'sunlit-inline-icon'));
  root.append(points, paragraph(`再获得 ${Math.max(0, XP_PER_POINT - profile.researchXp)} 研究经验可得到 1 个天赋点。`));
  notice(root, message);
  root.append(paragraph('三类入门各自提供能独立运作的起始配置。完整通关并在至少 3 个战斗房实际使用同一分支 20 次，才会记录该分支掌握。'));

  if (envelope.activeRun) {
    const run = envelope.activeRun;
    const name = ARCHETYPE_NODES.find(node => node.id === run.archetype)?.name ?? run.archetype;
    root.append(paragraph(`进行中的对局：${name} · 第 ${run.snapshot?.floor ?? 1} / ${BASIC_RUN_DEFINITION.floorCount} 层 · Lv.${run.snapshot?.player.level ?? 1}`));
    root.append(row(button('继续本局', actions.resume)));
    const abandonArea = element('div');
    const showAbandon = button('放弃本局', () => {
      abandonArea.replaceChildren();
      abandonArea.append(paragraph('确认放弃？本局装备、等级、金币和材料将清空，不获得研究经验。局外天赋与解锁保留。'));
      abandonArea.append(row(button('确认放弃', actions.abandon), button('取消', () => {
        abandonArea.replaceChildren(showAbandon);
      })));
    });
    abandonArea.append(showAbandon);
    root.append(abandonArea, paragraph('进行中的对局保留出发时配置；结束后可解锁其他起始流派。'));
  } else {
    root.append(paragraph('一大局 25 层，每 5 层一场 Boss 战。第 5、10、15、20 层可提前结算，分别获得 50、100、200、350 个局外天赋点；25 层通关获得 500 点。死亡按所在楼层足额结算，中间楼层按进度插值。主动放弃不发奖励。'));
    const mechanism = element('select');
    mechanism.setAttribute('aria-label', '本局辅助机制偏好');
    const any = element('option', '不限制辅助机制'); any.value = ''; mechanism.append(any);
    for (const tag of CRAFTING_TAGS) { const option = element('option', tag.name); option.value = tag.id; mechanism.append(option); }
    root.append(element('h3', '本局辅助机制偏好'), mechanism, paragraph('部分装备奖励在主流派池内优先匹配所选机制；不提升品质，也不排除其他混搭。'));
    root.append(element('h3', '流派入门'));
    for (const node of ARCHETYPE_NODES) {
      const unlocked = profile.unlockedNodes.includes(node.id);
      const card = element('div');
      card.className = `sunlit-choice-card${unlocked ? ' is-unlocked' : ' is-locked'}`;
      const icon = createUiIcon(ARCHETYPE_ICONS[node.id], 'sunlit-card-icon');
      const title = element('strong', node.name);
      const copy = element('div');
      copy.className = 'sunlit-card-copy';
      copy.append(title, paragraph(node.description));
      const action = unlocked
        ? button('以此流派出发', () => actions.start(node.id, (mechanism.value || undefined) as EquipmentMechanismTag | undefined))
        : button(`解锁 · ${node.cost} 天赋点`, () => actions.unlock(node.id), profile.availableMetaPoints < node.cost);
      action.classList.add('sunlit-card-action');
      card.append(icon, copy, action);
      root.append(card);
    }
  }

  root.append(buildMetaTalentTree(envelope,actions.unlock));
  root.append(element('h3', '流派掌握'));
  for (const node of MASTERY_NODES) {
    const unlocked = profile.unlockedNodes.includes(node.id);
    const archetypeUnlocked = profile.unlockedNodes.includes(node.requiresNode);
    const completedBranch = node.requiresAnyMastery.find((id) => (profile.mastery[id] ?? 0) > 0);
    const card = element('div');
    card.className = `sunlit-choice-card${unlocked ? ' is-unlocked' : ' is-locked'}`;
    const icon = createUiIcon(node.id, 'sunlit-card-icon');
    const title = element('strong', node.name);
    const copy = element('div');
    copy.className = 'sunlit-card-copy';
    copy.append(title, paragraph(node.description));
    copy.append(paragraph(`前置：${ARCHETYPE_NODES.find((entry) => entry.id === node.requiresNode)?.name ?? node.requiresNode}入门`));
    for (const branchId of node.requiresAnyMastery) {
      const usage = envelope.activeRun?.buildUsage?.[branchId];
      const mastered = (profile.mastery[branchId] ?? 0) > 0;
      const progress = mastered
        ? '已掌握'
        : `${Math.min(usage?.uses ?? 0, MASTERY_USE_REQUIREMENT)} / ${MASTERY_USE_REQUIREMENT} 次 · ${Math.min(new Set(usage?.encounterKeys ?? []).size, MASTERY_ENCOUNTER_REQUIREMENT)} / ${MASTERY_ENCOUNTER_REQUIREMENT} 房`;
      copy.append(paragraph(`${BUILD_BRANCH_NAMES[branchId]}：${progress}`));
    }
    const action = unlocked
      ? button('已解锁', () => undefined, true)
      : button(
        completedBranch ? `解锁 · ${node.cost} 天赋点` : '需先完成任一分支掌握',
        () => actions.unlock(node.id),
        !!envelope.activeRun || !archetypeUnlocked || !completedBranch || profile.availableMetaPoints < node.cost,
      );
    action.classList.add('sunlit-card-action');
    card.append(icon, copy, action);
    root.append(card);
  }

  root.append(element('h3', '奖励偏好'));
  root.append(paragraph('普通掉落和商店按 40% 定向池、60% 通用池生成。新局前5层首次清理精英房，额外获得同套不同部位的两件起步装备；商店★委托可补当前未成型套装的缺部位。偏好不提高品质。'));
  const availablePreferences = MASTERY_NODES.filter((node) => profile.unlockedNodes.includes(node.id));
  if (availablePreferences.length === 0) {
    root.append(paragraph('解锁一个流派掌握节点后，可让奖励生成更常提供该系核心机会。未选择时，每局默认跟随出发流派。'));
  } else {
    root.append(paragraph(`当前偏好：${profile.rewardPreference
      ? ARCHETYPE_NODES.find((node) => node.id === profile.rewardPreference)?.name ?? profile.rewardPreference
      : '跟随出发流派'}。偏好只影响奖励选项，不增加永久战力。`));
    root.append(row(...availablePreferences.map((node) => button(
      profile.rewardPreference === node.archetype ? `${node.name} · 已选择` : `选择${node.name}`,
      () => actions.setPreference?.(node.archetype),
      !!envelope.activeRun || !actions.setPreference || profile.rewardPreference === node.archetype,
    ))));
  }

  if (envelope.legacyArchive) {
    const old = envelope.legacyArchive.snapshot;
    const archive = element('details');
    archive.className = 'sunlit-archive';
    archive.append(element('summary', '旧版纪念记录'));
    archive.append(paragraph(`原角色 Lv.${old.player.level} · 第 ${old.floor} 层 · 金币 ${old.gold} · 背包装备 ${old.inventory.length} 件。旧版装备和进度作为记录保留，不带入新局。`));
    archive.append(button('导出旧版记录', actions.exportLegacy));
    root.append(archive);
  }
  root.append(row(button('返回存档界面', actions.back)));
  return root;
}

export function buildSettlementView(
  record: SettlementRecord,
  saved: boolean,
  actions: { confirm: () => void; retry: () => void },
  message?: string,
): HTMLDivElement {
  const victory = record.outcome === 'victory';
  const extracted = record.outcome === 'extracted';
  const floorCount = record.rulesVersion === 1 ? 5 : BASIC_RUN_DEFINITION.floorCount;
  const root = panel(victory ? '深渊突破' : extracted ? '阶段撤离成功' : record.outcome === 'death' ? '本次冒险结束' : '已放弃本局',
    victory ? `你完成了 ${floorCount} 层挑战。带着新的研究成果，尝试下一种流派。`
      : extracted ? '提前结算获得部分研究成果，不算完整通关。本局装备和资源不会带出，局外解锁继续保留。'
        : '本局装备和资源不会带出，局外解锁继续保留。');
  root.append(paragraph(`到达第 ${record.finalFloor} 层 · Lv.${record.finalLevel} · 完成主线 ${record.completedObjectives} / ${floorCount * 2}`));
  const totals = element('div');
  totals.className = 'sunlit-inset sunlit-settlement-totals';
  const rewardHeading = element('div');
  rewardHeading.className = 'sunlit-reward-heading';
  rewardHeading.append(createUiIcon('gem', 'sunlit-inline-icon'), document.createTextNode('研究结算'));
  totals.append(rewardHeading);
  totals.append(element('div', `${victory ? '通关基础奖励' : extracted ? '提前结算奖励' : '进度奖励'}：${record.baseXp / XP_PER_POINT} 个局外天赋点`));
  if (record.challengeXp) totals.append(element('div', `挑战奖励：${record.challengeXp} 研究经验`));
  if (record.growthXp) totals.append(element('div', `成长补偿：${record.growthXp} 研究经验`));
  if (record.masteryXp) totals.append(element('div', `首次掌握：${record.masteryXp} 研究经验`));
  if (record.masteredBranches?.length) {
    totals.append(element('div', `本局达成掌握：${record.masteredBranches.map((id) => BUILD_BRANCH_NAMES[id]).join('、')}（记录成就，不额外发放研究经验）`));
  }
  totals.append(element('strong', `${saved ? '获得' : '保存后获得'} ${record.pointsEarned} 个局外天赋点`));
  root.append(totals);
  notice(root, message);
  root.append(paragraph(saved ? '奖励已保存。再次打开这份结算不会重复发放。' : '结算尚未保存，奖励未确认到账。请重试保存后再离开。'));
  root.append(row(saved ? button('确认结算，返回存档界面', actions.confirm) : button('重试保存', actions.retry)));
  return root;
}

export function buildMigrationView(
  data: SaveData,
  actions: { confirm: () => void; back: () => void },
  message?: string,
): HTMLDivElement {
  const root = panel('保存旧日足迹', '这个存档来自旧版冒险。进入新的单局模式前，会先备份原始存档，再建立局外档案。');
  root.append(paragraph(`旧角色 Lv.${data.player.level} · 第 ${data.floor} 层 · 金币 ${data.gold} · 背包装备 ${data.inventory.length} 件。`));
  root.append(paragraph('旧角色、装备、材料与进度会完整保留为可导出的纪念记录。新对局从第 1 层开始，不继承旧装备与金币，也不将其兑换为局外天赋点。'));
  root.append(paragraph('免费开放破阵剑术起始流派；局外天赋点通过新的冒险获得。备份或保存失败时，不覆盖原存档。'));
  notice(root, message);
  root.append(row(button('备份并进入新模式', actions.confirm), button('暂不转换，返回存档', actions.back)));
  return root;
}

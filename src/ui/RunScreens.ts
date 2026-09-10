import type { SaveData } from '../types';
import type { ArchetypeId, SaveEnvelopeV3, SettlementRecord } from '../progression/types';
import { META_NODES, XP_PER_POINT } from '../progression/MetaProgression';
import { BASIC_RUN_DEFINITION } from '../data/runProgression';

interface CampActions {
  start: (id: ArchetypeId) => void;
  resume: () => void;
  unlock: (id: string) => void;
  back: () => void;
  exportLegacy: () => void;
  abandon: () => void;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function panel(title: string, description: string): HTMLDivElement {
  const root = element('div');
  root.style.cssText = 'color:#e7eef8;text-align:left;line-height:1.6;max-width:620px;margin:auto';
  const heading = element('h2', title);
  heading.style.cssText = 'font-size:28px;margin:0 0 8px;text-align:center';
  root.append(heading, paragraph(description));
  return root;
}

function paragraph(text: string): HTMLParagraphElement {
  const node = element('p', text);
  node.style.cssText = 'color:#b6c8df;margin:8px 0 14px;font-size:14px;overflow-wrap:anywhere';
  return node;
}

function button(label: string, action: () => void, disabled = false): HTMLButtonElement {
  const node = element('button', label);
  node.type = 'button';
  node.disabled = disabled;
  node.style.cssText = `min-height:44px;padding:10px 16px;border:1px solid #6fa9d8;border-radius:6px;background:#2c5f8a;color:#fff;font:inherit;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '.5' : '1'};touch-action:manipulation;white-space:normal`;
  node.onclick = action;
  return node;
}

function row(...children: HTMLElement[]): HTMLDivElement {
  const node = element('div');
  node.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
  node.append(...children);
  return node;
}

function notice(root: HTMLElement, message?: string): void {
  if (!message) return;
  const node = paragraph(message);
  node.setAttribute('role', 'status');
  node.style.color = '#ffd391';
  root.append(node);
}

export function buildCampView(envelope: SaveEnvelopeV3, actions: CampActions, message?: string): HTMLDivElement {
  const profile = envelope.profile;
  const root = panel('营地', '练成新的流派，再向深渊出发。每局的等级、装备与金币独立，局外解锁永久保留。');
  const points = element('div', `可用天赋点 ${profile.availableMetaPoints} · 研究经验 ${profile.researchXp} / ${XP_PER_POINT}`);
  points.style.cssText = 'padding:12px;border:1px solid #6876a0;border-radius:6px;background:#252d46;color:#e6d4ff';
  root.append(points, paragraph(`再获得 ${Math.max(0, XP_PER_POINT - profile.researchXp)} 研究经验可得到 1 个天赋点。`));
  notice(root, message);
  root.append(paragraph('当前先开放火系局内树原型，任一起始武器均可使用火球并选择蔓延或引爆；近战与召唤新树将在后续阶段接入。旧层间专精已移除。'));

  if (envelope.activeRun) {
    const run = envelope.activeRun;
    const name = META_NODES.find(node => node.id === run.archetype)?.name ?? run.archetype;
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
    root.append(paragraph('一大局 25 层，每 5 层一场 Boss 战。完成第 5、10、15、20 层主线后可低收益提前结算，也可保留本局构筑继续深入；第 25 层完成才是完整通关。死亡结束本局，按进度获得少量研究经验。'));
    for (const node of META_NODES) {
      const unlocked = profile.unlockedNodes.includes(node.id);
      const card = element('div');
      card.style.cssText = 'margin:10px 0;padding:12px 14px;border:1px solid #46566e;border-radius:7px;background:rgba(25,36,53,.8)';
      const title = element('strong', node.name);
      card.append(title, paragraph(node.description));
      card.append(unlocked
        ? button('以此流派出发', () => actions.start(node.id))
        : button(`解锁 · ${node.cost} 天赋点`, () => actions.unlock(node.id), profile.availableMetaPoints < node.cost));
      root.append(card);
    }
  }

  if (envelope.legacyArchive) {
    const old = envelope.legacyArchive.snapshot;
    const archive = element('details');
    archive.style.cssText = 'margin-top:16px;padding:10px;border:1px solid #46566e;border-radius:6px';
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
  totals.style.cssText = 'padding:14px;border:1px solid #6876a0;border-radius:6px;background:#252d46';
  totals.append(element('div', `${victory ? '通关基础奖励' : extracted ? '提前结算奖励' : '进度奖励'}：${record.baseXp} 研究经验`));
  if (record.challengeXp) totals.append(element('div', `挑战奖励：${record.challengeXp} 研究经验`));
  if (record.growthXp) totals.append(element('div', `成长补偿：${record.growthXp} 研究经验`));
  if (record.masteryXp) totals.append(element('div', `首次掌握：${record.masteryXp} 研究经验`));
  totals.append(element('strong', `总计 ${record.totalXp} 研究经验 · ${saved ? '获得' : '保存后获得'} ${record.pointsEarned} 天赋点`));
  root.append(totals);
  notice(root, message);
  root.append(paragraph(saved ? '奖励已保存。再次打开这份结算不会重复发放。' : '结算尚未保存，奖励未确认到账。请重试保存后再离开。'));
  root.append(row(saved ? button('确认结算，返回营地', actions.confirm) : button('重试保存', actions.retry)));
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

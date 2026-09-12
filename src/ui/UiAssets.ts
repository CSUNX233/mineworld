import { P4_ICON_IDS } from './P4Icons';
import { equipmentArtPath, type ItemArtSource } from './EquipmentArt';
/** Generated Sunlit Quest atlas; positions are shared by every inventory and skill view. */
export const UI_RARITY_COLORS: Record<string, string> = {
  common: '#55bd69', magic: '#4b9fff', rare: '#f2d14b',
  epic: '#ee8a35', legendary: '#df4545', unique: '#9a641d', mythic: '#ff2857',
};

const ICONS = ['sword', 'axe', 'hammer', 'helmet', 'chest', 'legs',
  'boots', 'ring', 'necklace', 'shield', 'staff', 'coin',
  'whirlwind', 'dash', 'fireball', 'detonate', 'frost', 'lightning',
  'summon', 'heal', 'poison', 'gem', 'bag', 'anvil'] as const;
const ALIASES: Record<string, string> = { guard_counter: 'shield', seismic_slam: 'hammer', raise_company: 'summon', soul_burst: 'poison', flame_rift: 'fireball', ember_blade: 'axe', frost_nova: 'frost', lightning_chain: 'lightning',
  weapon: 'sword', offhand: 'shield', head: 'helmet', body: 'chest', amulet: 'necklace',
  fire: 'fireball', burning: 'fireball', frozen: 'frost', shocked: 'lightning', poisoned: 'poison', bleeding: 'sword' };

export function indexOf(id: string): number {
  const index = (ICONS as readonly string[]).indexOf(ALIASES[id] ?? id);
  return index < 0 ? ICONS.indexOf('bag') : index;
}

export function createUiIcon(id: string, className = ''): HTMLSpanElement {
  const icon = document.createElement('span');
  const index = indexOf(id);
  icon.className = `sunlit-icon ${className}`.trim();
  if (P4_ICON_IDS.has(id)) {
    icon.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/ui/sunlit/p4/${id}.webp)`;
    icon.style.backgroundSize = 'contain';
    icon.style.backgroundPosition = 'center';
    icon.style.backgroundRepeat = 'no-repeat';
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  const skillIcon = ALIASES[id] ?? id;
  if (['whirlwind', 'dash', 'fireball', 'detonate', 'frost', 'lightning'].includes(skillIcon)) {
    icon.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/ui/sunlit/skills/${skillIcon}.webp)`;
    icon.style.backgroundSize = 'contain';
    icon.style.backgroundPosition = 'center';
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  icon.style.backgroundPosition = `${index % 6 * 20}% ${Math.floor(index / 6) * 100 / 3}%`;
  if (id === 'bag') {
    icon.style.backgroundImage = `url(${import.meta.env.BASE_URL}assets/ui/sunlit/bag-transparent.webp)`;
    icon.style.backgroundSize = 'contain';
    icon.style.backgroundPosition = 'center';
  }
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function iconHTML(id: string, className = ''): string {
  return createUiIcon(id, className).outerHTML;
}

export function createItemIcon(item: ItemArtSource, className = ''): HTMLSpanElement {
  const path = equipmentArtPath(item);
  if (!path) return createUiIcon(item.icon, className);
  const icon = document.createElement('span');
  icon.className = `sunlit-icon sunlit-equipment-icon ${className}`.trim();
  icon.style.backgroundImage = `url(${import.meta.env.BASE_URL}${path})`;
  icon.style.backgroundSize = 'contain';
  icon.style.backgroundPosition = 'center';
  icon.style.backgroundRepeat = 'no-repeat';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function itemIconHTML(item: ItemArtSource, className = ''): string {
  return createItemIcon(item, className).outerHTML;
}

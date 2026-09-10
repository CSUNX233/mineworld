/** Generated Sunlit Quest atlas; positions are shared by every inventory and skill view. */
export const UI_RARITY_COLORS: Record<string, string> = {
  common: '#55bd69', magic: '#4b9fff', rare: '#f2d14b',
  epic: '#ee8a35', legendary: '#df4545', unique: '#9a641d',
};

const ICONS = ['sword', 'axe', 'hammer', 'helmet', 'chest', 'legs',
  'boots', 'ring', 'necklace', 'shield', 'staff', 'coin',
  'whirlwind', 'dash', 'fireball', 'detonate', 'frost', 'lightning',
  'summon', 'heal', 'poison', 'gem', 'bag', 'anvil'] as const;
const ALIASES: Record<string, string> = { frost_nova: 'frost', lightning_chain: 'lightning',
  weapon: 'sword', offhand: 'shield', head: 'helmet', body: 'chest', amulet: 'necklace',
  fire: 'fireball', burning: 'fireball', frozen: 'frost', shocked: 'lightning', poisoned: 'poison', bleeding: 'sword' };

function indexOf(id: string): number {
  const index = (ICONS as readonly string[]).indexOf(ALIASES[id] ?? id);
  return index < 0 ? ICONS.indexOf('bag') : index;
}

export function createUiIcon(id: string, className = ''): HTMLSpanElement {
  const icon = document.createElement('span');
  const index = indexOf(id);
  icon.className = `sunlit-icon ${className}`.trim();
  icon.style.backgroundPosition = `${index % 6 * 20}% ${Math.floor(index / 6) * 100 / 3}%`;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function iconHTML(id: string, className = ''): string {
  return createUiIcon(id, className).outerHTML;
}

export function createItemIcon(item: { icon: string }, className = ''): HTMLSpanElement {
  return createUiIcon(item.icon, className);
}

export function itemIconHTML(item: { icon: string }, className = ''): string {
  return iconHTML(item.icon, className);
}

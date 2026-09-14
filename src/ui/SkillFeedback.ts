import type { SkillDefinition } from '../data/skills';

const colors = { physical: '#ffe0a0', fire: '#ff9954', frost: '#91e5ff', lightning: '#d9bcff', shadow: '#d1a3ff', poison: '#a5ee81' };
/** Visual confirmation only: no success/failure text over the playfield. */
export function showSkillFeedback(root: HTMLElement, skill: SkillDefinition): void {
  const color = colors[skill.element];
  for (const node of root.querySelectorAll<HTMLElement>('.touch-skill, .sunlit-skill')) {
    if ((node.dataset.icon ?? node.dataset.skillId) !== skill.id) continue;
    node.getAnimations().forEach(animation => animation.cancel());
    node.animate([{ boxShadow: `0 0 0 3px ${color}, 0 0 18px ${color}`, filter: 'brightness(1.6)' },
      { boxShadow: '0 0 0 0 transparent', filter: 'brightness(1)' }], { duration: 420 });
  }
}

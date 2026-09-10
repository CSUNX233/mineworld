import { BUILDS } from '../data/builds';
import type { BuildSystem } from '../items/BuildSystem';
import { createUiIcon } from './UiAssets';

const BUILD_ICONS: Record<string, string> = {
  vanguard: 'sword',
  arcanist: 'fireball',
  summoner: 'summon',
};

export function buildChoices(builds: BuildSystem, floor: number, onChoose: () => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'build-choices';
  const heading = document.createElement('h3');
  heading.textContent = builds.canChoose(floor) ? '本层专精 · 三选一，可专注升级或混合搭配' : `当前构筑：${builds.summary}`;
  section.appendChild(heading);
  if (!builds.canChoose(floor)) return section;
  BUILDS.forEach(build => {
    const button = document.createElement('button');
    button.className = 'build-choice';
    button.style.setProperty('--build-accent', build.color);
    button.disabled = builds.rank(build.id) >= 3;
    button.setAttribute('aria-label', `${build.name}，等级 ${builds.rank(build.id)} / 3。${build.description}`);
    button.appendChild(createUiIcon(BUILD_ICONS[build.id] ?? 'sword', 'build-choice-icon'));
    const copy = document.createElement('span');
    copy.className = 'build-choice-copy';
    const title = document.createElement('strong');
    title.textContent = `${build.name} ${builds.rank(build.id)}/3`;
    const description = document.createElement('span');
    description.textContent = build.description;
    copy.append(title, description);
    button.append(copy);
    button.onclick = () => { if (builds.choose(build.id, floor)) onChoose(); };
    section.appendChild(button);
  });
  return section;
}

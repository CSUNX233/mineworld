import { BUILDS } from '../data/builds';
import type { BuildSystem } from '../items/BuildSystem';

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
    button.style.borderColor = build.color;
    button.disabled = builds.rank(build.id) >= 3;
    const title = document.createElement('strong');
    title.textContent = `${build.name} ${builds.rank(build.id)}/3`;
    const description = document.createElement('span');
    description.textContent = build.description;
    button.append(title, description);
    button.onclick = () => { if (builds.choose(build.id, floor)) onChoose(); };
    section.appendChild(button);
  });
  return section;
}

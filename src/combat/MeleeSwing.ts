/** Shared by the held weapon and its slash plane, in radians. */
export function swingRoll(angle: number, progress: number): number {
  return angle * Math.sin(Math.PI * Math.max(0, Math.min(1, progress)));
}

/** Slash art opens toward +X; the forward chop travels down the local image plane. */
export function slashRoll(angle: number, progress: number): number {
  return -Math.PI / 2 + swingRoll(angle, progress);
}

export function meleeSwingAngle(weaponId: string, sequence: number): number {
  if (/hammer|mace/.test(weaponId)) return 0.12;
  if (/axe/.test(weaponId)) return sequence % 2 ? -0.65 : 0.65;
  return sequence % 2 ? -0.85 : 0.85;
}

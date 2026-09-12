import type { Projectile } from './ProjectileSystem';
import type { Monster } from '../monsters/Monster';

export interface ProjectileRuntimeHost {
  projectiles(): Projectile[];
  paused(): boolean;
  step(projectile: Projectile, dt: number): { hitWall: boolean; hitMonster: Monster | null; hitPlayer: boolean; expired: boolean };
  hitMonster(projectile: Projectile, monster: Monster): boolean;
  hitPlayer(projectile: Projectile): boolean;
  impact(projectile: Projectile, wall: boolean): void;
  expire(projectile: Projectile): void;
  dispose(projectile: Projectile): void;
}

/** Lifecycle only. Damage/element rules stay in the host and retain their exact order. */
export function updateProjectileRuntime(dt: number, host: ProjectileRuntimeHost): void {
  if (dt <= 0) return;
  for (let i = host.projectiles().length - 1; i >= 0; i--) {
    if (host.paused()) return;
    const projectile = host.projectiles()[i];
    const { hitWall, hitMonster, hitPlayer, expired } = host.step(projectile, dt);
    projectile.mesh.position.copy(projectile.position);
    let remove = hitWall || hitPlayer || hitMonster !== null;
    if (hitMonster) {
      if (!host.hitMonster(projectile, hitMonster)) return;
      if ((projectile.piercesRemaining ?? 0) > 0 && !expired) {
        projectile.piercesRemaining!--;
        remove = false;
      }
    } else if (hitPlayer) {
      if (!host.hitPlayer(projectile)) return;
    }
    if (remove) host.impact(projectile, hitWall);
    else if (expired) { host.expire(projectile); remove = true; }
    if (remove) {
      host.dispose(projectile);
      host.projectiles().splice(i, 1);
    }
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const result = buildSync({ stdin: { contents: `
export { PlayerController } from './src/player/PlayerController';
export { PerspectiveCamera } from 'three';`, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { PlayerController, PerspectiveCamera } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('first-person drag changes visible shot yaw and pitch, release retains aim and cancel removes it', () => {
  const controller = new PlayerController({}, {}, new PerspectiveCamera());
  controller.setFirstPerson(true);
  controller.setTouchAim(40, -30);
  const shot = controller.getProjectileDirection();
  assert.ok(shot.x < 0 && shot.y > 0 && shot.z > 0.8);
  assert.ok(Math.abs(shot.length() - 1) < 1e-8);
  const melee = controller.getAimDirection();
  assert.equal(melee.y, 0);
  assert.ok(melee.x < 0 && melee.z > 0);
  controller.endTouchAim(false);
  assert.ok(controller.getProjectileDirection().equals(shot));
  controller.endTouchAim(true);
  assert.equal(controller.isTouchAiming, false);
});

test('third-person keeps full-circle aiming and centering / view switch clears old direction', () => {
  const controller = new PlayerController({}, {}, new PerspectiveCamera());
  controller.setTouchAim(50, 0);
  assert.ok(controller.getAimDirection().x < -0.99);
  controller.setTouchAim(0, 0);
  assert.equal(controller.isTouchAiming, false);
  controller.setTouchAim(50, 0);
  controller.setFirstPerson(true);
  assert.equal(controller.isTouchAiming, false);
});

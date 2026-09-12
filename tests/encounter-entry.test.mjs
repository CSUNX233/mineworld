import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve('vite/package.json'))('esbuild');
const compiled = buildSync({ stdin: { contents: `
  export {generateFloor} from './src/world/FloorGenerator';
  export {EncounterDirector} from './src/core/EncounterDirector';
  export {setEncounterBarrierRooms,getEncounterBarriers,canSealEncounterRoom,
    encounterBarrierBlocksCylinder,findEncounterRoomPosition} from './src/world/EncounterBarriers';
  export {PLAYER_RADIUS} from './src/world/CollisionBounds';`,
  resolveDir: fileURLToPath(new URL('..',import.meta.url)), loader:'ts' },
  bundle:true, write:false, format:'esm', platform:'node' });
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const floorSeed = (411485540 ^ Math.imul(2,0x9e3779b9)) >>> 0;

test('seed 411485540 floor 2 elite waits for the whole body to clear the west entrance', () => {
  const floor = api.generateFloor(floorSeed,2,5), director = new api.EncounterDirector(floor);
  const room = floor.rooms.find(room => room.id === 'room-4');
  assert.equal(director.roomAt(35.05,10.5),room);
  // This used to start the encounter even though its new barrier intersected the body.
  assert.equal(director.enter(35.05,10.5),null);
  assert.deepEqual(director.lockedRoomIds,[]);
  assert.equal(director.enter(35.5,10.5),room);
  api.setEncounterBarrierRooms(floor,director.lockedRoomIds);
  assert.equal(api.encounterBarrierBlocksCylinder(floor,35.5,10.5,api.PLAYER_RADIUS),false);
  assert.equal(api.encounterBarrierBlocksCylinder(floor,35.6,10.5,api.PLAYER_RADIUS,0,1.8,35.5,10.5),false);
  assert.equal(api.encounterBarrierBlocksCylinder(floor,35.2,10.5,api.PLAYER_RADIUS,0,1.8,35.5,10.5),true);
  assert.equal(director.enter(36,10.5),null);
});

test('every doorway of the reported elite rejects early sealing and has a safe recovery position', () => {
  const floor = api.generateFloor(floorSeed,2,5);
  const room = floor.rooms.find(room => room.id === 'room-4');
  api.setEncounterBarrierRooms(floor,[room.id]);
  const doors = api.getEncounterBarriers(floor);
  assert.ok(doors.length > 0);
  for (const door of doors) {
    const x = (door.minX+door.maxX)/2+door.inwardX*.03;
    const z = (door.minZ+door.maxZ)/2+door.inwardZ*.03;
    assert.equal(api.canSealEncounterRoom(floor,room,x,z),false);
    const safe = api.findEncounterRoomPosition(floor,room,x,z);
    assert.ok(safe);
    assert.equal(api.encounterBarrierBlocksCylinder(floor,safe.x,safe.z,api.PLAYER_RADIUS),false);
  }
});

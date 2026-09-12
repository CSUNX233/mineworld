import * as THREE from 'three';
import type { FloorData } from '../types';
import { roomCenter } from './RoomGeometry';
import { sanctumRitualPositions, sanctumThroneSlots } from '../data/SanctumChapter';

/** Low-contrast, collision-free greybox landmarks. No additional realtime lights. */
export function createChapterLandmarks(data: FloorData): THREE.Group | null {
  if ((data.generationVersion ?? 1) < 5 || !(data.floor <= 5 || (data.floor >= 10 && data.floor <= 15))) return null;
  const group = new THREE.Group(); group.name = 'chapter-landmarks';
  const sanctum = data.floor >= 11;
  const stone = sanctum ? 0xaaa38e : data.floor === 3 ? 0x8b805a : 0x858578;
  const accent = sanctum ? 0x506966 : data.floor === 2 || data.floor === 4 ? 0x97704e : 0x617c4e;
  const box = (x: number,y: number,z: number,w: number,h: number,d: number,color: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color}));
    mesh.position.set(x,y,z); group.add(mesh); return mesh;
  };
  const tile = (x: number,z: number,w: number,d: number,color: number) => box(x,.013,z,w,.018,d,color);
  const arch = (x: number,z: number,color: number,broken: boolean) => {
    box(x-2.8,1.05,z,.6,2.1,.65,color); box(x+2.8,1.05,z,.6,2.1,.65,color);
    box(x+(broken ? -1.1 : 0),2.25,z,broken ? 3 : 6.2,.45,.7,color);
  };
  for (const room of data.rooms) {
    const c = roomCenter(room), template = room.template ?? '';
    if (room.kind === 'start' || room.kind === 'treasure' || room.kind === 'sanctuary') {
      tile(c.x,c.z,Math.min(5,room.width-4),Math.min(5,room.depth-4),accent);
      continue;
    }
    if (sanctum) {
      const procession = template === 'sanctum-procession';
      tile(c.x,c.z,room.width-6,procession ? 3 : 5,procession ? 0x777a70 : template === 'sanctum-inscription' ? 0x5b6e67 : 0x828379);
      // Bone niches stay on the room perimeter, away from entrance corridors and telegraphs.
      for (const x of [room.x+2.5,room.x+room.width-2.5]) {
        box(x,.2,room.z+room.depth-3.5,1,.4,1.6,stone);
        box(x,.45,room.z+room.depth-3.5,.6,.1,1.2,0x706e61);
      }
      if (template === 'sanctum-echo') {
        tile(c.x-1,c.z,1.25,.16,0xa08048); tile(c.x+1,c.z,1.25,.16,0xa08048);
      }
      if (template === 'sanctum-ritual') for (const p of sanctumRitualPositions(room)) {
        box(p.x,.12,p.z,1.8,.24,1.8,0x696e60);
        box(p.x,.36,p.z,.65,.25,.65,0x72a4a1);
      }
      if (template === 'sanctum-trial') box(c.x,.65,c.z,.45,1.3,.45,0xa08048);
      if (template === 'sanctum-throne') {
        for (const p of sanctumThroneSlots(room)) {
          // Square slots never resemble circular enemy telegraphs.
          tile(p.x,p.z,2.8,2.8,0x7a7358); tile(p.x,p.z,2.15,2.15,0x414d4c);
        }
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(.8,1.25,1.8,8,1,true),new THREE.MeshLambertMaterial({color:0x81795b,side:THREE.DoubleSide}));
        bell.rotation.z = .22; bell.position.set(c.x,.7,room.z+2.5); group.add(bell);
        arch(c.x,room.z+room.depth-2.5,stone,false);
      }
    } else if (data.floor <= 5) {
      tile(c.x,c.z,Math.min(7,room.width-5),4,accent);
      if (template === 'ruins-court' || template === 'ruins-double-path') arch(c.x,room.z+2.5,stone,true);
      if (template === 'ruins-chapel') for (const x of [room.x+3.5,room.x+room.width-3.5]) {
        box(x,.22,room.z+3.5,1.3,.44,1.3,0x817652); box(x,.62,room.z+3.5,.55,.35,.55,stone);
      }
      if (data.floor === 2 || data.floor === 4) {
        box(room.x+2.5,.75,room.z+room.depth-2.5,.12,1.5,.12,stone);
        box(room.x+2.8,1.05,room.z+room.depth-2.5,.55,.6,.05,0x816350);
      }
      if (template === 'ruins-trial') box(c.x,.65,c.z,.45,1.3,.45,0xae8558);
      if (template === 'ruins-gate-arena') {
        arch(c.x,room.z+2.5,0x67645a,false);
        box(c.x,1.1,room.z+2.5,4.7,2.2,.3,0x4e4d47);
        box(c.x,.85,room.z+2.31,.16,1.6,.035,0xce833c);
      }
    }
  }
  if (data.floor === 10) {
    const exit = data.rooms.find(r => r.id === 'room-1');
    if (exit) { const c = roomCenter(exit); arch(c.x,exit.z+2.5,0x758f89,false); box(c.x,.4,exit.z+2.5,1.5,.8,1.5,0x72a4a1); }
  }
  return group;
}

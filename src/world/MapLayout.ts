import type { RoomKind } from '../types';
import type { RNG } from '../utils/RNG';

export type MapLayoutKind = 'foundry-double-loop' | 'foundry-hub' | 'foundry-parallel' | 'branch-rejoin' | 'loop-shortcut' | 'asymmetric-cluster' | 'ruins-short-axis' | 'sanctum-beaded' | 'sanctum-fan' | 'sanctum-cathedral';
export type RoomShape = 'rect' | 'cut-corners' | 'l-shape' | 'twin-hall' | 'u-shape' | 'three-leaf' | 'four-leaf' | 'crescent' | 'cross-hall' | 'octagon';

export interface LayoutNode {
  id: string;
  kind: RoomKind;
  required?: boolean;
  /** Desired room center in grid coordinates. */
  cx: number;
  cz: number;
  shape: RoomShape;
}

export interface MapLayout {
  kind: MapLayoutKind;
  nodes: LayoutNode[];
  edges: [string, string][];
}

const COMMON = {
  start: { id: 'room-7', kind: 'start' as const },
  approach: { id: 'room-0', kind: 'battle' as const },
  skirmish: { id: 'room-2', kind: 'battle' as const },
  objective: { id: 'room-4', kind: 'elite' as const, required: true },
  respite: { id: 'room-3', kind: 'sanctuary' as const },
  exit: { id: 'room-1', kind: 'exit' as const, required: true },
  reward: { id: 'room-5', kind: 'treasure' as const },
  optionalFight: { id: 'room-6', kind: 'battle' as const },
};

function branchRejoin(roomCount: number): MapLayout {
  const nodes: LayoutNode[] = [
    { ...COMMON.start, cx: 7, cz: 27, shape: 'cut-corners' },
    { ...COMMON.approach, cx: 18, cz: 27, shape: 'rect' },
    { ...COMMON.skirmish, cx: 29, cz: 18, shape: 'l-shape' },
    { ...COMMON.objective, cx: 41, cz: 18, shape: 'rect' },
    { ...COMMON.respite, cx: 41, cz: 36, shape: 'cut-corners' },
    { ...COMMON.exit, cx: 52, cz: 27, shape: 'rect' },
  ];
  const edges: [string, string][] = [
    ['room-7', 'room-0'], ['room-0', 'room-2'], ['room-2', 'room-4'],
    ['room-4', 'room-1'], ['room-0', 'room-3'], ['room-3', 'room-1'],
  ];
  if (roomCount >= 7) {
    nodes.push({ ...COMMON.reward, cx: 29, cz: 38, shape: 'l-shape' });
    edges.push(['room-0', 'room-5'], ['room-5', 'room-3']);
  }
  if (roomCount >= 8) {
    nodes.push({ ...COMMON.optionalFight, cx: 18, cz: 12, shape: 'cut-corners' });
    edges.push(['room-0', 'room-6'], ['room-6', 'room-2']);
  }
  return { kind: 'branch-rejoin', nodes, edges };
}

function loopShortcut(roomCount: number): MapLayout {
  const nodes: LayoutNode[] = [
    { ...COMMON.start, cx: 7, cz: 27, shape: 'rect' },
    { ...COMMON.approach, cx: 18, cz: 27, shape: 'cut-corners' },
    { ...COMMON.skirmish, cx: 29, cz: 17, shape: 'l-shape' },
    { ...COMMON.objective, cx: 41, cz: 18, shape: 'rect' },
    { ...COMMON.respite, cx: 29, cz: 38, shape: 'cut-corners' },
    { ...COMMON.exit, cx: 46, cz: 32, shape: 'rect' },
  ];
  const edges: [string, string][] = [
    ['room-7', 'room-0'], ['room-0', 'room-2'], ['room-2', 'room-4'],
    ['room-4', 'room-1'], ['room-1', 'room-3'], ['room-3', 'room-0'],
    // The cross-link is substantially shorter than walking around the full ring.
    ['room-2', 'room-3'],
  ];
  if (roomCount >= 7) {
    nodes.push({ ...COMMON.reward, cx: 17, cz: 40, shape: 'l-shape' });
    edges.push(['room-3', 'room-5']);
  }
  if (roomCount >= 8) {
    nodes.push({ ...COMMON.optionalFight, cx: 18, cz: 11, shape: 'cut-corners' });
    edges.push(['room-0', 'room-6'], ['room-6', 'room-2']);
  }
  return { kind: 'loop-shortcut', nodes, edges };
}

function asymmetricCluster(roomCount: number): MapLayout {
  const nodes: LayoutNode[] = [
    { ...COMMON.start, cx: 7, cz: 27, shape: 'cut-corners' },
    { ...COMMON.approach, cx: 18, cz: 26, shape: 'l-shape' },
    { ...COMMON.skirmish, cx: 29, cz: 17, shape: 'rect' },
    { ...COMMON.objective, cx: 41, cz: 15, shape: 'cut-corners' },
    { ...COMMON.respite, cx: 30, cz: 35, shape: 'rect' },
    { ...COMMON.exit, cx: 44, cz: 29, shape: 'rect' },
  ];
  const edges: [string, string][] = [
    ['room-7', 'room-0'], ['room-0', 'room-2'], ['room-2', 'room-4'],
    ['room-4', 'room-1'], ['room-0', 'room-3'], ['room-3', 'room-1'],
    ['room-2', 'room-3'],
  ];
  if (roomCount >= 7) {
    nodes.push({ ...COMMON.reward, cx: 17, cz: 40, shape: 'cut-corners' });
    edges.push(['room-3', 'room-5']);
  }
  if (roomCount >= 8) {
    nodes.push({ ...COMMON.optionalFight, cx: 44, cz: 43, shape: 'rect' });
    edges.push(['room-1', 'room-6'], ['room-3', 'room-6']);
  }
  return { kind: 'asymmetric-cluster', nodes, edges };
}

/** Builds a bounded six-to-eight-room route graph. Floor depth never increases its size. */
export function createMapLayout(rng: RNG): MapLayout {
  const roomCount = rng.int(6, 8);
  const kind = rng.pick<MapLayoutKind>(['branch-rejoin', 'loop-shortcut', 'asymmetric-cluster']);
  if (kind === 'branch-rejoin') return branchRejoin(roomCount);
  if (kind === 'loop-shortcut') return loopShortcut(roomCount);
  return asymmetricCluster(roomCount);
}

/** Compact chapter graphs; shape and reward connections vary independently of rotation. */
export function createChapterMapLayout(rng: RNG, floor: number): MapLayout {
  const sanctum = floor >= 11;
  if (floor === 5 || floor === 15) {
    return {
      kind: sanctum ? 'sanctum-cathedral' : 'ruins-short-axis',
      nodes: [
        { ...COMMON.start, cx: 7, cz: 27, shape: 'cut-corners' },
        { ...COMMON.respite, cx: 20, cz: 27, shape: 'cut-corners' },
        { ...COMMON.objective, kind: 'battle', cx: 33, cz: 27, shape: 'cut-corners' },
        { ...COMMON.exit, cx: 51, cz: 27, shape: 'octagon' },
        { ...COMMON.reward, cx: 20, cz: 42, shape: 'cut-corners' },
      ],
      edges: [['room-7','room-3'],['room-3','room-4'],['room-4','room-1'],['room-3','room-5']],
    };
  }
  const kind: MapLayoutKind = sanctum
    ? rng.pick(['sanctum-beaded','sanctum-fan','sanctum-cathedral'] as const)
    : floor === 1 ? 'branch-rejoin' : floor === 2 ? 'asymmetric-cluster' : floor === 3 ? 'branch-rejoin' : 'loop-shortcut';
  const nodes: LayoutNode[] = [
    { ...COMMON.start, cx: 7, cz: 27, shape: rng.pick(['rect','cut-corners'] as const) },
    { ...COMMON.approach, cx: 22, cz: 27, shape: 'cut-corners' },
    { ...COMMON.objective, kind: floor === 1 ? 'battle' : 'elite', cx: 42, cz: 10, shape: 'cut-corners' },
    { ...COMMON.exit, cx: 54, cz: 27, shape: 'cut-corners' },
    { ...COMMON.respite, cx: 22, cz: 44, shape: 'cut-corners' },
    { ...COMMON.reward, cx: 36, cz: 44, shape: 'rect' },
  ];
  const edges: [string,string][] = [['room-7','room-0'],['room-4','room-1'],['room-0','room-3'],['room-3','room-5']];
  if (floor === 1) {
    nodes.find(n => n.id === 'room-4')!.cx = rng.pick([40,42]);
    nodes.find(n => n.id === 'room-1')!.cz = rng.pick([24,30]);
    edges.push(['room-0','room-4'],['room-5','room-4']);
  } else {
    nodes.push({ ...COMMON.skirmish, cx: 23, cz: 9, shape: 'l-shape' });
    edges.push(['room-0','room-2'],['room-2','room-4'],['room-5','room-2']);
    if (kind === 'sanctum-fan' || kind === 'loop-shortcut') edges.push(['room-3','room-2']);
    if (kind === 'sanctum-cathedral') {
      nodes.find(n => n.id === 'room-2')!.cx = 25;
      nodes.find(n => n.id === 'room-4')!.cz = 12;
      nodes.find(n => n.id === 'room-5')!.cx = 36;
    }
    if (kind === 'asymmetric-cluster' || kind === 'sanctum-fan') {
      nodes.find(n => n.id === 'room-1')!.cz = 30;
      nodes.find(n => n.id === 'room-3')!.cx = 19;
    }
  }
  if (floor === 4 || floor === 14) {
    nodes.push({ ...COMMON.optionalFight, cx: 51, cz: 45, shape: sanctum ? 'four-leaf' : 'u-shape' });
    edges.push(['room-5','room-6'],['room-6','room-1']);
  }
  // Safe rewards reconnect downstream without making any optional challenge compulsory.
  if (sanctum && kind === 'sanctum-beaded') edges.push(['room-5','room-4']);
  return { kind, nodes, edges };
}

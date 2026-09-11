import type { RNG } from '../utils/RNG';
import type { MapLayout, LayoutNode } from './MapLayout';

/** Keep the reviewed floor-six slice equivalent in graph and RNG use. */
function createFloorSixLayout(rng: RNG): MapLayout {
  const kind = rng.pick(['foundry-double-loop', 'foundry-hub', 'foundry-parallel'] as const);
  const nodes: LayoutNode[] = [
    { id: 'room-7', kind: 'start', cx: 8, cz: 27, shape: 'cut-corners' },
    { id: 'room-0', kind: 'battle', cx: 24, cz: 27, shape: 'cut-corners' },
    { id: 'room-2', kind: 'battle', cx: 25, cz: 10, shape: 'l-shape' },
    { id: 'room-3', kind: 'sanctuary', cx: 25, cz: 44, shape: 'cut-corners' },
    { id: 'room-4', kind: 'elite', required: true, cx: 43, cz: 10, shape: 'rect' },
    { id: 'room-1', kind: 'exit', required: true, cx: 53, cz: 27, shape: 'rect' },
    { id: 'room-5', kind: 'treasure', cx: 43, cz: 44, shape: 'cut-corners' },
  ];
  let edges: [string, string][];
  if (kind === 'foundry-double-loop') {
    edges = [['room-7','room-0'],['room-0','room-2'],['room-0','room-3'],
      ['room-2','room-4'],['room-3','room-5'],['room-5','room-4'],['room-4','room-1'],['room-5','room-1']];
  } else if (kind === 'foundry-hub') {
    nodes.find(n => n.id === 'room-3')!.cx = 41;
    nodes.find(n => n.id === 'room-3')!.cz = 27;
    nodes.find(n => n.id === 'room-5')!.cx = 27;
    edges = [['room-7','room-0'],['room-0','room-3'],['room-3','room-2'],
      ['room-2','room-4'],['room-3','room-4'],['room-4','room-1'],['room-3','room-1'],['room-3','room-5']];
  } else {
    edges = [['room-7','room-0'],['room-0','room-2'],['room-0','room-3'],
      ['room-2','room-4'],['room-3','room-5'],['room-5','room-1'],['room-4','room-1'],['room-2','room-3']];
  }
  return { kind, nodes, edges };
}

function createChapterLayout(rng: RNG, floor: number): MapLayout {
  const kind = rng.pick(['foundry-double-loop', 'foundry-hub', 'foundry-parallel'] as const);
  const nodes: LayoutNode[] = [
    { id: 'room-7', kind: 'start', cx: 7, cz: 27, shape: 'cut-corners' },
    { id: 'room-0', kind: 'battle', cx: 22, cz: 27, shape: 'cut-corners' },
    { id: 'room-2', kind: 'battle', cx: 23, cz: 9, shape: 'l-shape' },
    { id: 'room-3', kind: 'sanctuary', cx: 20, cz: 45, shape: 'cut-corners' },
    { id: 'room-4', kind: 'elite', required: true, cx: 40, cz: 10, shape: 'rect' },
    { id: 'room-1', kind: 'exit', required: true, cx: 53, cz: 27, shape: 'rect' },
    { id: 'room-5', kind: 'treasure', cx: 35, cz: 45, shape: 'cut-corners' },
  ];
  if (floor >= 8) {
    nodes.push({ id: 'room-6', kind: 'battle', cx: 51, cz: 45, shape: floor === 9 ? 'rect' : 'cut-corners' });
  }

  let edges: [string, string][];
  if (kind === 'foundry-double-loop') {
    edges = [['room-7','room-0'],['room-0','room-2'],['room-0','room-3'],
      ['room-2','room-4'],['room-3','room-5'],['room-5','room-4'],['room-4','room-1']];
    if (floor >= 8) edges.push(['room-5','room-6'],['room-6','room-1']);
    else edges.push(['room-5','room-1']);
  } else if (kind === 'foundry-hub') {
    edges = [['room-7','room-0'],['room-0','room-2'],['room-0','room-3'],
      ['room-2','room-4'],['room-3','room-4'],['room-4','room-1'],['room-3','room-5']];
    if (floor >= 8) edges.push(['room-5','room-6'],['room-6','room-1']);
    else edges.push(['room-5','room-1']);
  } else {
    edges = [['room-7','room-0'],['room-0','room-2'],['room-0','room-3'],
      ['room-2','room-4'],['room-3','room-5'],['room-4','room-1'],['room-2','room-3']];
    if (floor >= 8) edges.push(['room-5','room-6'],['room-6','room-1']);
    else edges.push(['room-5','room-1']);
  }
  return { kind, nodes, edges };
}

/** The finale spends the chapter room budget on a short approach and a 19x17 arena. */
function createFurnaceCoreLayout(): MapLayout {
  return {
    kind: 'foundry-hub',
    nodes: [
      { id: 'room-7', kind: 'start', cx: 7, cz: 28, shape: 'cut-corners' },
      { id: 'room-3', kind: 'sanctuary', cx: 20, cz: 28, shape: 'cut-corners' },
      { id: 'room-0', kind: 'battle', cx: 32, cz: 10, shape: 'l-shape' },
      { id: 'room-4', kind: 'elite', required: true, cx: 35, cz: 28, shape: 'rect' },
      { id: 'room-5', kind: 'treasure', cx: 32, cz: 46, shape: 'cut-corners' },
      { id: 'room-1', kind: 'exit', required: true, cx: 51, cz: 28, shape: 'cut-corners' },
    ],
    edges: [
      ['room-7','room-3'],['room-3','room-0'],['room-0','room-4'],['room-4','room-1'],
      ['room-3','room-5'],
    ],
  };
}

/** Builds a floor-specific foundry route while preserving the reviewed floor-six slice. */
export function createFoundryLayout(rng: RNG, floor = 6): MapLayout {
  if (floor === 6) return createFloorSixLayout(rng);
  if (floor === 10) return createFurnaceCoreLayout();
  return createChapterLayout(rng, floor);
}

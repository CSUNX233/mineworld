export enum BlockKind {
  Air = 0,
  Floor = 1,
  Wall = 2,
  Obstacle = 3,
  Portal = 4,
}

export function isSolidBlock(kind: number): boolean {
  return kind === BlockKind.Wall || kind === BlockKind.Obstacle;
}

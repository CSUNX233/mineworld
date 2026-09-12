export const BASIC_RUN_DEFINITION = {
  id: 'basic-25-floors',
  mapPoolId: 'basic',
  floorCount: 25,
  rulesVersion: 2,
} as const;

export const BASIC_REQUIRED_ROOM_IDS = ['room-1', 'room-4'] as const;
export type BasicRequiredRoomId = typeof BASIC_REQUIRED_ROOM_IDS[number];

export function requiredObjectiveId(floor: number, roomId: BasicRequiredRoomId): string {
  return `${floor}-${roomId}`;
}

export const REQUIRED_OBJECTIVE_IDS = Object.freeze(
  Array.from({ length: BASIC_RUN_DEFINITION.floorCount }, (_, index) => index + 1)
    .flatMap((floor) => BASIC_REQUIRED_ROOM_IDS.map((roomId) => requiredObjectiveId(floor, roomId))),
);

// Keep persisted research XP units unchanged (100 XP = one camp talent point).
export const RUN_REWARDS = {
  victoryResearchXp: 500,
  extractionResearchXpByFloor: {
    5: 50,
    10: 100,
    15: 200,
    20: 350,
  },
} as const;

/** Floor rewards are research XP, converted at 100 XP per camp point on settlement. */
export function researchXpForFloor(floor: number): number {
  const depth = Number.isFinite(floor) ? Math.max(0, Math.min(25, floor)) : 0;
  const anchors = [[0,0],[5,50],[10,100],[15,200],[20,350],[25,500]];
  for (let i = 1; i < anchors.length; i++) {
    const [end, reward] = anchors[i], [start, previous] = anchors[i-1];
    if (depth <= end) return Math.floor(previous + (reward-previous) * (depth-start)/(end-start));
  }
  return 500;
}

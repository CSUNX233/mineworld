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

// P1 values are deliberately centralized here. They establish the reward flow,
// but are not presented as final balance values before playtesting.
export const RUN_REWARDS = {
  victoryResearchXp: 1000,
  extractionResearchXpByFloor: {
    5: 60,
    10: 150,
    15: 270,
    20: 420,
  },
  maxDeathResearchXp: 200,
  maxDeathObjectives: REQUIRED_OBJECTIVE_IDS.length - 1,
  deathObjectiveDenominator: REQUIRED_OBJECTIVE_IDS.length,
} as const;

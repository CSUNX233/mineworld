import type { FoundryBossState } from './monsters/FoundryBossController';
import type { FinalBossState } from './monsters/FinalBossController';
import type { RunTalentState } from './progression/RunTalents';
export type Rarity = 'common' | 'magic' | 'rare' | 'epic' | 'legendary';

export type Slot =
  | 'weapon'
  | 'helmet'
  | 'chest'
  | 'legs'
  | 'boots'
  | 'ring'
  | 'ring2'
  | 'necklace'
  | 'offhand';

export type Stat =
  | 'attack'
  | 'attackSpeed'
  | 'critChance'
  | 'critDamage'
  | 'maxHealth'
  | 'armor'
  | 'defense'
  | 'shieldRecoveryRate'
  | 'moveSpeed'
  | 'cooldown'
  | 'pickupRange'
  | 'luck'
  | 'strength'
  | 'agility'
  | 'vitality'
  | 'intelligence'
  | 'lifeSteal'
  | 'killHeal'
  | 'maxMana'
  | 'manaRegen'
  | 'lifeRegen';

export type StatMap = Partial<Record<Stat, number>>;
export type StatValueMode = 'flat' | 'increased';
export type StatValueModes = Partial<Record<Stat, StatValueMode>>;

export type ElementType = 'physical' | 'fire' | 'frost' | 'lightning' | 'poison' | 'shadow';

export type StatusType = 'burning' | 'frozen' | 'shocked' | 'poisoned' | 'bleeding';

export type MaterialId = 'iron' | 'silver' | 'gold' | 'mithril' | 'void_essence' | 'element_shard';

export interface Affix {
  id: string;
  name: string;
  tier: number;
  values: StatMap;
  valueModes?: StatValueModes;
  special?: string;
}

export interface ActorStatus {
  type: StatusType;
  duration: number;
  maxDuration: number;
  damagePerTick: number;
  sourceElement?: ElementType;
  slowMultiplier?: number;
  extraLightningMultiplier?: number;
}

export interface Item {
  contentId?: string;
  equipmentRulesVersion?: number;
  reforgeCount?: number;
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  baseStats: StatMap;
  affixes: Affix[];
  requiredLevel: number;
  icon: string;
  model?: string;
  itemLevel: number;
  sellPrice: number;
  setId?: string;
  element?: ElementType;
  statusChance?: number;
  flavor?: string;
}

export type RoomKind = 'start' | 'battle' | 'elite' | 'treasure' | 'sanctuary' | 'exit';

export interface Room {
  cells?: { x: number; z: number }[];
  center?: { x: number; z: number };
  entrances?: { x: number; z: number }[];
  shape?: string;
  encounterId?: string;
  id?: string;
  kind?: RoomKind;
  required?: boolean;
  template?: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface FloorTheme {
  id: string;
  name: string;
  wallType: string;
  floorType: string;
  accentType: string;
}

export interface FloorData {
  generationVersion?: 1 | 2 | 3 | 4 | 5;
  layoutKind?: string;
  merchant?: { x: number; z: number };
  connections?: [string, string][];
  size: number;
  grid: number[][];
  rooms: Room[];
  spawn: { x: number; z: number };
  portal: { x: number; z: number };
  chests: { x: number; z: number }[];
  theme: FloorTheme;
  seed: number;
  floor: number;
}

export interface MonsterDefinition {
  role?: 'support' | 'guardian' | 'controller';
  id: string;
  name: string;
  health: number;
  attack: number;
  armor: number;
  speed: number;
  detectRadius: number;
  attackRange: number;
  attackCooldown: number;
  xp: number;
  color: number;
  minFloor: number;
  behavior: 'melee' | 'ranged' | 'charger' | 'boss';
  element?: ElementType;
  statusChance?: number;
  resistances?: Partial<Record<ElementType, number>>;
  immunities?: StatusType[];
}

export interface ShopStockEntry {
  uid: string;
  item: Item;
  price: number;
}

export interface SavedMonster {
  difficultyStatMultiplier?: number;
  sanctumState?: import('./monsters/SanctumController').SanctumState;
  chapterReinforcement?: boolean;
  mechanicState?: import('./monsters/EncounterMechanics').SerializedMechanicState;
  statuses?: ActorStatus[];
  roomId?: string;
  defId: string;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  elite: boolean;
  eliteModifiers: string[];
}

export interface FloorProgress {
  visited: string[];
  started: string[];
  cleared: string[];
  usedSanctuaries: string[];
}

export interface SaveData {
  equipmentRulesVersion?: number;
  craftingSequence?: number;
  setPreference?: string;
  mapGenerationVersion?: 1 | 2 | 3 | 4 | 5;
  mapLayoutKind?: string;
  runTalents?: RunTalentState;
  runtime?: {
    aggression?: import('./core/AdaptiveAggression').AggressionSnapshot;
    oathGatekeeper?: import('./monsters/OathGatekeeperController').OathGatekeeperState;
    usedRituals?: string[];
    setState?: import('./items/SetRuntime').SetSnapshot;
    summonSquad?: import('./summons/types').SummonSnapshot;
    brokenFoundryPanels?: string[];
    foundryTrialClaimed?: boolean;
    finalBoss?: FinalBossState;
    foundryBoss?: FoundryBossState;
    elapsed: number;
    shield: number;
    shieldRechargeElapsed?: number;
    invulnerable: number;
    attackTimer: number;
    comboCount: number;
    comboTimer: number;
    lowHealthShieldCooldown: number;
    skillCooldowns: Record<string, number>;
  };
  floorProgress?: FloorProgress;
  openedChests?: string[];
  buildRanks?: Record<string, number>;
  buildChoiceFloor?: number;
  version: number;
  floor: number;
  seed: number;
  player: {
    level: number;
    xp: number;
    xpToNext: number;
    attributePoints: number;
    attributeAllocated?: number;
    talentPoints?: number;
    unlockedTalents?: string[];
    firstPerson?: boolean;
    stats: StatMap;
    position: { x: number; y: number; z: number };
    health: number;
    mana: number;
  };
  gold: number;
  materials: number;
  materialCounts?: Partial<Record<MaterialId, number>>;
  reforgeTickets?: number;
  monsters?: SavedMonster[];
  portalActive?: boolean;
  inventory: Item[];
  equipment: Partial<Record<Slot, Item>>;
  kills: number;
  skillLoadout?: string[];
  shopStock?: ShopStockEntry[];
  shopFloor?: number;
  shopRefreshes?: number;
  shopGambles?: number;
  shopHeals?: number;
  playerStatuses?: ActorStatus[];
}

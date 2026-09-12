import { RunManager } from '../core/RunManager';
import { SaveManager } from '../core/SaveManager';
import type { ArchetypeId, RunOutcome } from '../progression/types';
import type { FloorData, Item, Rarity } from '../types';
import { clearEncounterBarriers, setEncounterBarrierRooms } from '../world/EncounterBarriers';
import { mulberry32 } from '../utils/seededRandom';

export type SimulationPersona = 'novice' | 'expert';
export type SimulationOutcome = 'victory' | 'death' | 'extracted' | 'invalid';

/**
 * Policies deliberately receive the live Game object. The properties they use are
 * private only at TypeScript compile time; the simulation is exercising the same
 * input, movement, combat, encounter, loot, and settlement code as the browser game.
 */
export interface PersonaPolicy {
  kind?: SimulationPersona;
  step(game: SimulationGame, dt: number): void | Promise<void>;
  reset?(): void;
  describe?(): Record<string, unknown>;
}

export interface SimulationOptions {
  seed: number;
  persona: SimulationPersona;
  maxSeconds?: number;
  dt?: number;
  archetype?: ArchetypeId;
  /** Primarily useful for focused harness tests. Normal batch runs load PersonaPolicy.ts. */
  policy?: PersonaPolicy;
  /** Abort a run whose browser work takes too long, independently of simulated time. */
  maxWallClockMs?: number;
}

export interface FloorRecord {
  floor: number;
  enteredAt: number;
  exitedAt?: number;
  entryHealth: number;
  exitHealth?: number;
  entryMana: number;
  exitMana?: number;
  entryLevel: number;
  exitLevel?: number;
  entryEquipmentScore: number;
  exitEquipmentScore?: number;
  killsAtEntry: number;
  killsAtExit?: number;
  outcome?: 'advanced' | 'victory' | 'death' | 'extracted' | 'invalid';
}

export interface EquipmentItemSummary {
  id: string;
  name: string;
  slot: string;
  rarity: Rarity;
  itemLevel: number;
  requiredLevel: number;
  affixCount: number;
}

export interface EquipmentStatistics {
  equipped: Record<string, EquipmentItemSummary | null>;
  inventoryCount: number;
  inventoryByRarity: Record<Rarity, number>;
  equippedItemLevelTotal: number;
  inventoryItemLevelTotal: number;
  derivedStats: Record<string, number>;
  itemsAcquired: number;
  equipChanges: number;
  upgrades: number;
}

export interface SimulationResult {
  seed: number;
  persona: SimulationPersona;
  outcome: SimulationOutcome;
  floor: number;
  kills: number;
  time: number;
  gameplayTime: number;
  deathCause: string | null;
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  gold: number;
  completedObjectives: number;
  equipment: EquipmentStatistics;
  floorRecords: FloorRecord[];
  policyStats: Record<string, unknown>;
  skillUses: number;
  talentPointsSpent: number;
  invalidReason?: string;
  replay: { seed: number; persona: SimulationPersona; dt: number; maxSeconds: number };
  acceleration: {
    fixedStep: true;
    renderingDisabled: true;
    audioDisabled: true;
    visualEffectsDisabled: true;
    gameplayRulesPreserved: true;
    /** Visual RNG calls are omitted, so replays are deterministic within this harness. */
    rngSequenceMatchesRenderedGame: false;
    limitation: string;
  };
}

type AnyFunction = (...args: any[]) => any;
export type SimulationGame = Record<string, any>;
type Restore = () => void;

interface Metrics {
  deathCause: string | null;
  itemsAcquired: number;
  equipChanges: number;
  skillUses: number;
  talentPointsSpent: number;
}

interface FloorExitSnapshot {
  health: number;
  mana: number;
  level: number;
  equipmentScore: number;
  kills: number;
}

interface VirtualTimer {
  id: number;
  due: number;
  interval: number | null;
  callback: TimerHandler;
  args: unknown[];
}

class VirtualTimerQueue {
  private nowMs = 0;
  private nextId = 1;
  private timers = new Map<number, VirtualTimer>();

  set(callback: TimerHandler, delay: number | undefined, interval: number | null, args: unknown[]): number {
    const id = this.nextId++;
    const boundedDelay = Math.max(interval === null ? 0 : 1, Number(delay) || 0);
    this.timers.set(id, {
      id,
      due: this.nowMs + boundedDelay,
      interval: interval === null ? null : boundedDelay,
      callback,
      args,
    });
    return id;
  }

  clear(id: number | undefined): void {
    if (id !== undefined) this.timers.delete(id);
  }

  advance(seconds: number): void {
    this.nowMs += seconds * 1000;
    let callbacks = 0;
    while (callbacks++ < 10_000) {
      const due = [...this.timers.values()]
        .filter(timer => timer.due <= this.nowMs)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!due) return;
      if (due.interval === null) this.timers.delete(due.id);
      else due.due += due.interval;
      if (typeof due.callback === 'function') due.callback(...due.args);
      else Function(String(due.callback))();
    }
    throw new Error('Virtual timer runaway: more than 10,000 callbacks in one simulation step.');
  }

  clearAll(): void {
    this.timers.clear();
  }
}

function patchMethod(target: SimulationGame, key: string, replacement: AnyFunction): Restore {
  const hadOwn = Object.prototype.hasOwnProperty.call(target, key);
  const original = target[key];
  target[key] = replacement;
  return () => {
    if (hadOwn) target[key] = original;
    else delete target[key];
  };
}

function patchPrototypeFunctions(target: SimulationGame | null | undefined, excluded: string[] = []): Restore {
  if (!target) return () => {};
  const restores: Restore[] = [];
  const blocked = new Set(['constructor', ...excluded]);
  let prototype = Object.getPrototypeOf(target);
  while (prototype && prototype !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (blocked.has(key) || typeof target[key] !== 'function') continue;
      blocked.add(key);
      restores.push(patchMethod(target, key, () => undefined));
    }
    prototype = Object.getPrototypeOf(prototype);
  }
  return () => restores.reverse().forEach(restore => restore());
}

function installVirtualTimers(): { queue: VirtualTimerQueue; restore: Restore } {
  const queue = new VirtualTimerQueue();
  const originalSetTimeout = window.setTimeout;
  const originalClearTimeout = window.clearTimeout;
  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
    queue.set(callback, delay, null, args)) as typeof window.setTimeout;
  window.clearTimeout = ((id?: number) => queue.clear(id)) as typeof window.clearTimeout;
  window.setInterval = ((callback: TimerHandler, delay?: number, ...args: unknown[]) =>
    queue.set(callback, delay, Math.max(1, Number(delay) || 0), args)) as typeof window.setInterval;
  window.clearInterval = ((id?: number) => queue.clear(id)) as typeof window.clearInterval;
  return {
    queue,
    restore: () => {
      queue.clearAll();
      window.setTimeout = originalSetTimeout;
      window.clearTimeout = originalClearTimeout;
      window.setInterval = originalSetInterval;
      window.clearInterval = originalClearInterval;
    },
  };
}

function nextAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

async function waitForFloor(game: SimulationGame, nativeSetTimeout: typeof window.setTimeout, timeoutMs = 30_000): Promise<void> {
  const started = performance.now();
  while (game.loadingFloor || !game.floorData) {
    if (!game.running && !game.loadingFloor) throw new Error('Game stopped while preparing a floor.');
    if (performance.now() - started > timeoutMs) throw new Error(`Floor preparation exceeded ${timeoutMs}ms.`);
    await new Promise<void>(resolve => nativeSetTimeout(resolve, 0));
  }
}

function itemSummary(item: Item): EquipmentItemSummary {
  return {
    id: item.id,
    name: item.name,
    slot: item.slot,
    rarity: item.rarity,
    itemLevel: item.itemLevel,
    requiredLevel: item.requiredLevel,
    affixCount: item.affixes?.length ?? 0,
  };
}

function equipmentScore(game: SimulationGame): number {
  const items = game.equipment?.getEquippedItems?.() as Item[] | undefined;
  return (items ?? []).reduce((sum, item) => sum + item.itemLevel, 0);
}

function floorSnapshot(game: SimulationGame, simulatedSeconds: number): FloorRecord {
  return {
    floor: game.floor,
    enteredAt: simulatedSeconds,
    entryHealth: game.player.health,
    entryMana: game.player.mana,
    entryLevel: game.player.level,
    entryEquipmentScore: equipmentScore(game),
    killsAtEntry: game.kills,
  };
}

function closeFloorRecord(
  record: FloorRecord,
  game: SimulationGame,
  simulatedSeconds: number,
  outcome: FloorRecord['outcome'],
  snapshot?: FloorExitSnapshot,
): void {
  if (record.exitedAt !== undefined) return;
  record.exitedAt = simulatedSeconds;
  record.exitHealth = snapshot?.health ?? game.player.health;
  record.exitMana = snapshot?.mana ?? game.player.mana;
  record.exitLevel = snapshot?.level ?? game.player.level;
  record.exitEquipmentScore = snapshot?.equipmentScore ?? equipmentScore(game);
  record.killsAtExit = snapshot?.kills ?? game.kills;
  record.outcome = outcome;
}

function floorExitSnapshot(game: SimulationGame): FloorExitSnapshot {
  return {
    health: game.player.health,
    mana: game.player.mana,
    level: game.player.level,
    equipmentScore: equipmentScore(game),
    kills: game.kills,
  };
}

function getEquipmentStatistics(game: SimulationGame, metrics: Metrics): EquipmentStatistics {
  const emptyRarities: Record<Rarity, number> = {
    common: 0,
    magic: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
    mythic: 0,
  };
  const inventory = (game.inventory?.items ?? []) as Item[];
  for (const item of inventory) emptyRarities[item.rarity]++;
  const equipped = Object.fromEntries(
    Object.entries((game.equipment?.equipment ?? {}) as Record<string, Item | null>)
      .map(([slot, item]) => [slot, item ? itemSummary(item) : null]),
  );
  const stats = (game.effectiveStats?.() ?? {}) as Record<string, unknown>;
  return {
    equipped,
    inventoryCount: inventory.length,
    inventoryByRarity: emptyRarities,
    equippedItemLevelTotal: equipmentScore(game),
    inventoryItemLevelTotal: inventory.reduce((sum, item) => sum + item.itemLevel, 0),
    derivedStats: Object.fromEntries(Object.entries(stats).filter((entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1]))),
    itemsAcquired: metrics.itemsAcquired,
    equipChanges: metrics.equipChanges,
    upgrades: Number(game.upgradeCount) || 0,
  };
}

async function loadPolicy(persona: SimulationPersona, seed: number): Promise<PersonaPolicy> {
  // @vite-ignore keeps this harness buildable while PersonaPolicy is developed independently.
  const url = new URL('./PersonaPolicy.ts', import.meta.url).href;
  const module = await import(/* @vite-ignore */ url) as {
    createPersonaPolicy?: (kind: SimulationPersona, seed?: number) => PersonaPolicy;
  };
  if (typeof module.createPersonaPolicy !== 'function') {
    throw new Error('PersonaPolicy.ts does not export createPersonaPolicy(kind, seed).');
  }
  return module.createPersonaPolicy(persona, seed);
}

function installAcceleration(game: SimulationGame, metrics: Metrics): Restore {
  const restores: Restore[] = [];

  // Stop the self-scheduling browser loop. One already queued callback may still
  // execute; runSimulation waits two frames before starting the fixed-step loop.
  restores.push(patchMethod(game, 'animate', () => undefined));

  // A headless page has no meaningful focus or pointer-lock ownership. Game's
  // constructor listeners call these methods dynamically, so suppressing them
  // prevents Playwright worker focus changes from pausing an otherwise valid run.
  // Modal gameplay states (rest/shop/talents/inventory) remain represented by
  // their own flags and continue to stop updateGame normally.
  restores.push(patchMethod(game, 'pauseGame', () => undefined));
  restores.push(patchMethod(game, 'requestPointerLock', () => undefined));

  // Renderer, UI, audio, recorder and particles do not feed gameplay state.
  if (game.renderer) {
    restores.push(patchMethod(game.renderer, 'render', () => undefined));
    restores.push(patchMethod(game.renderer, 'compileAsync', async () => undefined));
  }
  restores.push(patchPrototypeFunctions(game.audio));
  restores.push(patchPrototypeFunctions(game.effects));
  restores.push(patchPrototypeFunctions(game.hud));
  restores.push(patchPrototypeFunctions(game.minimap));
  restores.push(patchPrototypeFunctions(game.playtestRecorder));
  restores.push(patchPrototypeFunctions(game.firstPersonView));
  restores.push(patchPrototypeFunctions(game.inventoryUI));

  // Keep FloorData and the encounter barrier registry used by collision/raycast
  // code, while omitting Three.js floor, wall, chest and portal meshes.
  const world = game.world as SimulationGame;
  restores.push(patchMethod(world, 'generate', (data: FloorData) => {
    if (world.floorData) clearEncounterBarriers(world.floorData);
    world.floorData = data;
    setEncounterBarrierRooms(data, []);
  }));
  restores.push(patchMethod(world, 'setEncounterBarriers', (roomIds: Iterable<string>) => {
    if (world.floorData) setEncounterBarrierRooms(world.floorData, roomIds);
  }));
  restores.push(patchMethod(world, 'setPortalActive', () => undefined));
  restores.push(patchMethod(world, 'removeChest', () => undefined));
  restores.push(patchMethod(world, 'update', () => undefined));

  const originalDeathTransition = game.recordDeathTransition.bind(game) as AnyFunction;
  restores.push(patchMethod(game, 'recordDeathTransition', (wasAlive: boolean, cause: string, damage?: number) => {
    originalDeathTransition(wasAlive, cause, damage);
    if (wasAlive && !game.player.alive) metrics.deathCause = cause;
  }));

  const originalAcquire = game.recordItemAcquired.bind(game) as AnyFunction;
  restores.push(patchMethod(game, 'recordItemAcquired', (...args: unknown[]) => {
    metrics.itemsAcquired++;
    return originalAcquire(...args);
  }));

  const originalEquip = game.equipFromInventory.bind(game) as AnyFunction;
  restores.push(patchMethod(game, 'equipFromInventory', (...args: unknown[]) => {
    const before = JSON.stringify(game.equipment.equipment);
    const value = originalEquip(...args);
    if (JSON.stringify(game.equipment.equipment) !== before) metrics.equipChanges++;
    return value;
  }));

  const originalSkill = game.tryUseSkill.bind(game) as AnyFunction;
  restores.push(patchMethod(game, 'tryUseSkill', (skill: SimulationGame, ...args: unknown[]) => {
    const before = Number(skill?.cooldownRemaining) || 0;
    const value = originalSkill(skill, ...args);
    if (before <= 0 && Number(skill?.cooldownRemaining) > 0) metrics.skillUses++;
    return value;
  }));

  const originalTalent = game.allocateRunTalent.bind(game) as AnyFunction;
  restores.push(patchMethod(game, 'allocateRunTalent', (...args: unknown[]) => {
    const before = game.runTalents?.unlocked?.length ?? 0;
    const value = originalTalent(...args);
    metrics.talentPointsSpent += Math.max(0, (game.runTalents?.unlocked?.length ?? 0) - before);
    return value;
  }));

  return () => restores.reverse().forEach(restore => restore());
}

function notifyProgress(game: SimulationGame, options: SimulationOptions, simulatedSeconds: number): void {
  const callback = (window as typeof window & {
    __simulationProgress?: (progress: Record<string, unknown>) => void;
  }).__simulationProgress;
  callback?.({
    seed: options.seed >>> 0,
    persona: options.persona,
    floor: game.floor,
    time: simulatedSeconds,
    health: game.player?.health ?? 0,
    kills: game.kills ?? 0,
    running: Boolean(game.running),
    paused: Boolean(game.paused),
    restOpen: Boolean(game.restOpen),
    shopOpen: Boolean(game.shopOpen),
    skillOpen: Boolean(game.skillOpen),
    attributeOpen: Boolean(game.attributeOpen),
    inventoryOpen: Boolean(game.inventoryUI?.open),
    loadingFloor: Boolean(game.loadingFloor),
    failedSave: Boolean(game.failedSaveCandidate),
    liveMonsters: (game.monsters ?? []).filter((monster: SimulationGame) => !monster.dead).length,
    remainingObjectives: game.encounters?.remainingObjectives?.length ?? null,
  });
}

/** Run one deterministic, fixed-step playthrough against the live Game instance. */
export async function runSimulation(game: SimulationGame, options: SimulationOptions): Promise<SimulationResult> {
  const seed = options.seed >>> 0;
  const dt = options.dt ?? 1 / 20;
  const maxSeconds = options.maxSeconds ?? 45 * 60;
  const maxWallClockMs = options.maxWallClockMs ?? 180_000;
  if (!game || typeof game.updateGame !== 'function') throw new Error('runSimulation requires window.game.');
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.05) throw new Error('dt must be in (0, 0.05].');
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('maxSeconds must be positive.');

  const metrics: Metrics = {
    deathCause: null,
    itemsAcquired: 0,
    equipChanges: 0,
    skillUses: 0,
    talentPointsSpent: 0,
  };
  const nativeSetTimeout = window.setTimeout.bind(window);
  const originalRandom = Math.random;
  const originalSaveEnvelope = SaveManager.saveEnvelope;
  const timerPatch = installVirtualTimers();
  const restoreAcceleration = installAcceleration(game, metrics);
  const floorRecords: FloorRecord[] = [];
  let policy: PersonaPolicy | null = null;
  let simulatedSeconds = 0;
  let invalidReason: string | undefined;
  const realStart = performance.now();

  try {
    Math.random = mulberry32((seed ^ 0xa511e9b3) >>> 0);
    // Preserve Game's save/settlement transitions without writing the isolated
    // context's localStorage every four simulated seconds.
    SaveManager.saveEnvelope = (() => ({ ok: true })) as typeof SaveManager.saveEnvelope;

    await nextAnimationFrame();
    await nextAnimationFrame();

    const envelope = RunManager.startRun(
      RunManager.createEnvelope(`simulation-${seed}-${options.persona}`),
      `simulation-${seed}-${options.persona}`,
      seed,
      options.archetype ?? 'vanguard',
      Date.now(),
    );
    game.envelope = envelope;
    game.failedSaveCandidate = null;
    game.retryAfterSave = null;
    game.seed = seed;
    game.startNewGame(options.archetype ?? 'vanguard');
    await waitForFloor(game, nativeSetTimeout);

    policy = options.policy ?? await loadPolicy(options.persona, seed);
    policy.reset?.();
    floorRecords.push(floorSnapshot(game, simulatedSeconds));
    notifyProgress(game, options, simulatedSeconds);

    let previousFloor = game.floor;
    let nextProgressAt = 30;
    const maxSteps = Math.ceil(maxSeconds / dt);
    for (let step = 0; step < maxSteps; step++) {
      if (performance.now() - realStart > maxWallClockMs) {
        invalidReason = `wall_clock_timeout:${maxWallClockMs}ms`;
        break;
      }
      const settled = game.envelope?.pendingSettlement;
      if (settled) break;
      if (!game.running) {
        invalidReason = 'game_stopped_without_settlement';
        break;
      }

      const beforePolicy = floorExitSnapshot(game);
      await policy.step(game, dt);
      if (game.loadingFloor) await waitForFloor(game, nativeSetTimeout);
      if (game.running && !game.loadingFloor) game.updateGame(dt);
      timerPatch.queue.advance(dt);
      game.input?.endFrame?.();
      simulatedSeconds += dt;

      if (game.paused && !game.envelope?.pendingSettlement) {
        invalidReason = `unexpected_pause:rest=${Boolean(game.restOpen)},shop=${Boolean(game.shopOpen)},skill=${Boolean(game.skillOpen)},attribute=${Boolean(game.attributeOpen)},inventory=${Boolean(game.inventoryUI?.open)}`;
        notifyProgress(game, options, simulatedSeconds);
        break;
      }

      if (game.floor !== previousFloor) {
        closeFloorRecord(floorRecords[floorRecords.length - 1], game, simulatedSeconds, 'advanced', beforePolicy);
        floorRecords.push(floorSnapshot(game, simulatedSeconds));
        previousFloor = game.floor;
        notifyProgress(game, options, simulatedSeconds);
      } else if (simulatedSeconds + 1e-9 >= nextProgressAt) {
        notifyProgress(game, options, simulatedSeconds);
        nextProgressAt += 30;
      }

      // Let floor-loading RAF promises and Playwright messaging make progress,
      // and stop a long fixed-step loop from monopolizing the page event loop.
      if ((step + 1) % 240 === 0) await new Promise<void>(resolve => nativeSetTimeout(resolve, 0));
    }

    if (!game.envelope?.pendingSettlement && !invalidReason) invalidReason = `simulated_time_limit:${maxSeconds}s`;
  } catch (error) {
    invalidReason = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  } finally {
    game.input?.reset?.();
    game.running = false;
    SaveManager.saveEnvelope = originalSaveEnvelope;
    Math.random = originalRandom;
    timerPatch.restore();
    restoreAcceleration();
  }

  const settlement = game.envelope?.pendingSettlement as { outcome?: RunOutcome; completedObjectives?: number } | undefined;
  const validOutcome = settlement?.outcome === 'victory' || settlement?.outcome === 'death' || settlement?.outcome === 'extracted'
    ? settlement.outcome : 'invalid';
  const outcome: SimulationOutcome = invalidReason ? 'invalid' : validOutcome;
  const finalFloorRecord = floorRecords[floorRecords.length - 1];
  if (finalFloorRecord) closeFloorRecord(finalFloorRecord, game, simulatedSeconds, outcome);

  return {
    seed,
    persona: options.persona,
    outcome,
    floor: Number(game.floor) || 0,
    kills: Number(game.kills) || 0,
    time: simulatedSeconds,
    gameplayTime: Number(game.elapsed) || 0,
    deathCause: metrics.deathCause,
    level: Number(game.player?.level) || 0,
    health: Number(game.player?.health) || 0,
    maxHealth: Number(game.player?.maxHealth) || 0,
    mana: Number(game.player?.mana) || 0,
    gold: Number(game.gold) || 0,
    completedObjectives: settlement?.completedObjectives
      ?? game.envelope?.activeRun?.completedObjectives?.length
      ?? 0,
    equipment: getEquipmentStatistics(game, metrics),
    floorRecords,
    policyStats: policy?.describe?.() ?? {},
    skillUses: metrics.skillUses,
    talentPointsSpent: metrics.talentPointsSpent,
    ...(invalidReason ? { invalidReason } : {}),
    replay: { seed, persona: options.persona, dt, maxSeconds },
    acceleration: {
      fixedStep: true,
      renderingDisabled: true,
      audioDisabled: true,
      visualEffectsDisabled: true,
      gameplayRulesPreserved: true,
      rngSequenceMatchesRenderedGame: false,
      limitation: 'The seed replays this accelerated harness exactly; omitted visual-only Math.random calls mean its RNG stream does not match a rendered manual session.',
    },
  };
}

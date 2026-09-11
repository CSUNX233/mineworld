import { AimGuide } from '../ui/AimGuide';
import { SoftAim } from '../combat/SoftAim';
import { buildControlsGuide } from '../ui/ControlsGuide';
import { DAMAGE_COLORS } from '../ui/DamageStyle';
import { EncounterMechanics } from '../monsters/EncounterMechanics';
import { roomCenter } from '../world/RoomGeometry';
import { FinalBossController } from '../monsters/FinalBossController';
import { deriveFireModifiers, createBurn, consumeBurn, type FireModifiers } from '../combat/FireBuild';
import { createRunTalents, talentBudget, spentTalentPoints, canUnlockTalent, unlockRunTalent, resetRunTalents, resetTalentCost, talentStats, type RunTalentState } from '../progression/RunTalents';
import { buildRunTalentPanel } from '../ui/RunTalentPanel';
import { findEncounterRoomPosition } from '../world/EncounterBarriers';
import * as THREE from 'three';
import { LoadingScreen } from '../ui/LoadingScreen';
import { preloadCombatArt } from '../ui/CombatArt';
import type { DerivedStats } from '../items/EquipmentManager';
import { EquipmentManager } from '../items/EquipmentManager';
import { Inventory } from '../items/Inventory';
import { ItemGenerator } from '../items/ItemGenerator';
import { LootSystem, type LootDrop } from '../items/LootSystem';
import { CombatSystem } from '../player/CombatSystem';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { FirstPersonViewModel } from '../player/FirstPersonViewModel';
import { Monster } from '../monsters/Monster';
import { MonsterAI } from '../monsters/MonsterAI';
import { encounterById } from '../data/encounters';
import { MonsterSpawner } from '../monsters/MonsterSpawner';
import { SummonedSkeleton } from '../monsters/SummonedSkeleton';
import { BossController, type BossHost } from '../monsters/BossController';
import { generateFloor } from '../world/FloorGenerator';
import { World } from '../world/World';
import { worldRayDistance } from '../world/SpatialQueries';
import { RNG } from '../utils/RNG';
import { RARITY_COLORS, RARITY_ORDER, xpToNext } from '../data/recipes';
import type { ActorStatus, ElementType, Item, MaterialId, Rarity, SaveData, SavedMonster, ShopStockEntry, Slot, StatMap } from '../types';
import { DEFAULT_SKILL_LOADOUT, SKILLS, skillById } from '../data/skills';
import { MATERIALS, MATERIAL_ORDER } from '../data/materials';
import { elementalDamage, applyElementalHit, applyStatus, makeActorStatus, type StatusedActor } from '../combat/ElementSystem';
import { ELEMENTS, elementStatusChance } from '../data/elements';
import { defenseMitigation, boundedCritChance } from '../combat/DamageRules';
import { ShopSystem, SHOP_SLOTS } from '../items/ShopSystem';
import { buildShopView } from '../ui/ShopUI';
import { CraftingSystem } from '../items/CraftingSystem';
import { AudioManager } from './AudioManager';
import { Effects } from './Effects';
import { InputManager } from './InputManager';
import { SaveManager } from './SaveManager';
import { SettingsManager } from './SettingsManager';
import { PerformanceTierDetector } from './Performance';
import { MobileBackHandler } from './MobileBackHandler';
import { PlaytestRecorder, type PlaytestPhase } from './PlaytestRecorder';
import { HUD, type SkillHUDState } from '../ui/HUD';
import { InventoryUI } from '../ui/InventoryUI';
import { Minimap } from '../ui/Minimap';
import { itemTooltipHTML } from '../ui/ItemTooltip';
import { TouchControls } from '../ui/TouchControls';
import { isMobileDevice } from '../utils/mobile';
import { EncounterDirector } from './EncounterDirector';
import { ROOM_LABELS } from '../data/rooms';
import { stepProjectile, type Projectile } from '../combat/ProjectileSystem';
import { RunManager } from './RunManager';
import { archetypeAllowed, unlockNode } from '../progression/MetaProgression';
import { canExtract, extractionResearchXp, hasVictoryObjectives } from '../progression/Settlement';
import { BASIC_RUN_DEFINITION } from '../data/runProgression';
import type { ArchetypeId, RunOutcome, SaveEnvelopeV3, SettlementRecord } from '../progression/types';
import { buildCampView, buildMigrationView, buildSettlementView } from '../ui/RunScreens';
import { starterWeapon } from '../items/StarterEquipment';
import { createUiIcon } from '../ui/UiAssets';

interface DropEntity {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  kind: LootDrop['kind'];
  amount?: number;
  item?: Item;
  bobPhase: number;
  life: number;
}

interface SkillState {
  id: string;
  name: string;
  key: string;
  baseCooldown: number;
  cooldown: number;
  cooldownRemaining: number;
  manaCost: number;
  element: ElementType;
  statusChance?: number;
  icon: string;
}

const SKILL_UI_ICONS: Record<string, string> = {
  whirlwind: 'whirlwind',
  dash: 'dash',
  fireball: 'fireball',
  detonate: 'detonate',
  frost_nova: 'frost',
  lightning_chain: 'lightning',
};

export class Game {
  private readonly softAim = new SoftAim();
  private readonly aimGuide = new AimGuide();
  private touchAimSkill: string | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private app: HTMLElement;
  private uiRoot: HTMLElement;
  private input = new InputManager();
  private audio = new AudioManager();
  private effects: Effects;
  private bossController: BossController;
  private finalBossController = new FinalBossController(this.scene);
  private encounterMechanics = new EncounterMechanics();
  private readonly mechanicHost = {
    addWorldObject: (object: THREE.Object3D) => { this.scene.add(object); },
    removeWorldObject: (object: THREE.Object3D) => { this.scene.remove(object); },
    damagePlayer: (amount: number, cause: 'controller_zone') => this.damagePlayerWithElement(amount, 'shadow', 0, cause),
  };
  private world: World;
  private player = new Player();
  private firstPersonView: FirstPersonViewModel;
  private controller: PlayerController;
  private equipment = new EquipmentManager();
  private inventory = new Inventory(48);
  private hud: HUD;
  private minimap: Minimap;
  private inventoryUI: InventoryUI;
  private touchControls: TouchControls | null = null;
  private readonly mobile = isMobileDevice();
  private readonly mobileBack = new MobileBackHandler();
  private readonly playtestRecorder = new PlaytestRecorder();

  private encounters: EncounterDirector | null = null;
  private runTalents: RunTalentState = createRunTalents();
  private fireModifiers = deriveFireModifiers(this.runTalents);
  private skillCooldowns: Record<string, number> = {};
  private migratedRunTalents = false;
  private pendingResume: SaveData | null = null;
  private hudTimer = 0;
  private floor = 1;
  private seed = Math.floor(Math.random() * 0xffffffff);
  private currentFloorSeed = this.seed;
  private floorData: ReturnType<typeof generateFloor> | null = null;
  private monsters: Monster[] = [];
  private summons: SummonedSkeleton[] = [];
  private projectiles: Projectile[] = [];
  private drops: DropEntity[] = [];
  private openedChests = new Set<string>();
  private portalActive = false;
  private gold = 0;
  private materials = 0;
  private materialCounts: Partial<Record<MaterialId, number>> = {};
  private reforgeTickets = 0;
  private pendingSavedMonsters: SavedMonster[] | null = null;
  private pendingPortalActive: boolean | null = null;
  private shopStock: ShopStockEntry[] = [];
  private shopFloor = 0;
  private shopRefreshes = 0;
  private shopGambles = 0;
  private shopHeals = 0;
  private shopOpen = false;
  private saveSlot = 0;
  private kills = 0;
  private bonusAttributes: StatMap = {};
  private attackTimer = 0;
  private attackBuffer = 0;
  private attackAnimTimer = 0;
  private attackAnimDuration = 0.24;
  private hitstopTimer = 0;
  private deathTimer = 0;
  private saveTimer = 0;
  private comboCount = 0;
  private comboTimer = 0;
  private lowHealthShieldCooldown = 0;
  private elapsed = 0;
  private running = false;
  private paused = false;
  private lastTime = performance.now();
  private lastPlaytestFrameTime = performance.now();
  private skipPlaytestFrameTime = document.hidden;
  private startOverlay: HTMLDivElement | null = null;
  private startMenuKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private pauseOverlay: HTMLDivElement | null = null;
  private floorRestOverlay: HTMLDivElement | null = null;
  private restOpen = false;
  private attributeOverlay: HTMLDivElement | null = null;
  private attributePanel: HTMLDivElement | null = null;
  private attributeOpen = false;
  private sellOverlay: HTMLDivElement | null = null;
  private craftOverlay: HTMLDivElement | null = null;
  private skillOverlay: HTMLDivElement | null = null;
  private skillPanel: HTMLDivElement | null = null;
  private skillOpen = false;
  private skillLoadout: string[] = [...DEFAULT_SKILL_LOADOUT];
  private skills: SkillState[] = [];
  private envelope: SaveEnvelopeV3 | null = null;
  private failedSaveCandidate: SaveEnvelopeV3 | null = null;
  private retryAfterSave: (() => void) | null = null;
  private upgradeCount = 0;
  private runIdCounter = 0;

  constructor(uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.app = document.getElementById('app')!;
    this.skills = this.buildSkillStates();

    this.renderer = new THREE.WebGLRenderer({ antialias: PerformanceTierDetector.tier !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PerformanceTierDetector.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.app.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x090c12);
    this.scene.fog = new THREE.Fog(0x090c12, 18, 62);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 1, 0);
    this.scene.add(this.camera);
    this.scene.add(this.aimGuide.mesh);
    this.firstPersonView = new FirstPersonViewModel(this.camera);

    const hemi = new THREE.HemisphereLight(0xd8e8ff, 0x2a2f36, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
    sun.position.set(12, 22, 8);
    sun.castShadow = false;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6678a8, 0.35);
    fill.position.set(-10, 6, -8);
    this.scene.add(fill);

    this.world = new World(this.scene);
    this.effects = new Effects(this.scene);
    this.effects.particleScale = PerformanceTierDetector.particleScale;
    this.bossController = new BossController(this.scene, this.effects, this.audio);
    this.controller = new PlayerController(this.player, this.input, this.camera);
    this.scene.add(this.player.group);
    this.hud = new HUD(this.uiRoot);
    this.hud.onMuteToggle = () => {
      this.audio.toggleMute();
      this.hud.setMuted(this.audio.isMuted);
    };
    this.minimap = new Minimap(this.uiRoot);
    if (this.mobile) {
      this.touchControls = new TouchControls(this.uiRoot, this.input, {
        onAimBegin: (key) => { this.touchAimSkill = key; },
        onAim: (x, y) => this.controller.setTouchAim(x, y),
        onAimEnd: (cancel) => this.controller.endTouchAim(cancel),
        onSkillPress: (key) => this.input.press(key),
        onSkillRelease: (key) => this.input.release(key),
        onAttackPress: () => this.input.pressMouse(0),
        onInteractPress: () => { if (!this.isGameplayPaused()) this.tryInteract(); },
        onAttackRelease: () => this.input.releaseMouse(0),
        onPausePress: () => this.togglePause(),
        onInventoryPress: () => { if (!this.isGameplayPaused() || this.inventoryUI.open) this.toggleInventory(); },
        onViewPress: () => {
          if (this.isGameplayPaused()) return;
          this.controller.toggleView();
          this.updatePlayerVisibility();
        },
        onSkillBarPress: () => this.toggleSkillBar(),
      });
    }
    this.inventoryUI = new InventoryUI(this.uiRoot);
    preloadCombatArt();
    this.inventoryUI.getCurrentStats = () => this.effectiveStats();
    this.inventoryUI.onEquip = (index) => this.equipFromInventory(index);
    this.inventoryUI.onUnequip = (slot) => this.unequipSlot(slot);
    this.inventoryUI.onSalvage = (index) => this.confirmSalvage(index);
    this.inventoryUI.onUpgrade = (index) => this.confirmUpgrade(index);
    this.inventoryUI.onReforge = (index) => this.confirmReforge(index);
    this.inventoryUI.onAllocateClick = () => this.showAttributeAllocation();
    this.inventoryUI.onSort = () => {
      this.inventory.sort();
      this.showInventory();
      this.saveGame();
    };
    this.inventoryUI.onSalvageAll = (rarity) => this.confirmSalvageAll(rarity);
    this.inventoryUI.onClose = () => this.mobileBack.unregister('inventory');
    this.inventoryUI.onDetailsOpen = () => this.mobileBack.register('itemDetails', () => this.inventoryUI.closeDetails());
    this.inventoryUI.onDetailsClose = () => this.mobileBack.unregister('itemDetails');

    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.running && !this.inventoryUI.open && !this.mobile) {
        this.audio.ensure();
        this.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.hud.setPointerLocked(this.input.pointerLocked);
      if (!this.input.pointerLocked) {
        this.input.reset();
        this.attackBuffer = 0;
        if (this.running && !this.mobile && !this.paused && !this.inventoryUI.open
          && !this.restOpen && !this.attributeOpen && !this.skillOpen) this.pauseGame();
      }
    });
    window.addEventListener('blur', () => this.pauseGame());
    document.addEventListener('visibilitychange', () => {
      this.lastPlaytestFrameTime = performance.now();
      this.skipPlaytestFrameTime = true;
      if (document.hidden) this.pauseGame();
      else this.input.reset();
    });
    this.mobileBack.setRootHandler(() => {
      if (this.failedSaveCandidate) return true;
      if (!this.running) return false;
      if (this.paused) {
        this.resumeGame();
      } else {
        this.pauseGame();
      }
      return true;
    });
  }

  start(): void {
    this.showStartMenu();
    requestAnimationFrame(this.animate);
  }

  private showStartMenu(): void {
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();

    const title = document.createElement('h1');
    title.textContent = 'MineWorld';
    title.className = 'sunlit-brand-title';
    panel.appendChild(title);

    const startButton = this.makeMenuButton('开始游戏');
    startButton.onclick = () => this.showSaveSlotMenu();
    panel.appendChild(startButton);
    const guideButton = this.makeMenuButton('操作说明');
    guideButton.onclick = () => this.showControlsGuide();
    panel.appendChild(guideButton);

    overlay.appendChild(panel);
    this.startOverlay = overlay;
    this.uiRoot.appendChild(overlay);
  }

  private showControlsGuide(): void {
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();
    panel.classList.add('controls-guide-panel');
    const title = document.createElement('h2');
    title.textContent = '操作说明';
    const back = this.makeMenuButton('返回主菜单');
    back.onclick = () => this.showStartMenu();
    panel.append(title, buildControlsGuide(this.mobile), back);
    overlay.appendChild(panel);
    this.startOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.setStartMenuBackHandler(() => this.showStartMenu());
  }

  private showSaveSlotMenu(message = '', isError = false): void {
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();
    panel.classList.add('sunlit-save-panel');
    let storageError = false;
    let slots: ReturnType<typeof SaveManager.listSlots> = [];
    try {
      slots = SaveManager.listSlots();
    } catch (error) {
      console.warn('Failed to access saves', error);
      storageError = true;
    }

    const title = document.createElement('h2');
    title.textContent = '选择存档';
    title.className = 'sunlit-menu-title';
    panel.appendChild(title);

    if (message) {
      const notice = document.createElement('div');
      notice.setAttribute('role', isError ? 'alert' : 'status');
      notice.textContent = message;
      notice.className = `sunlit-menu-notice ${isError ? 'is-error' : 'is-success'}`;
      panel.appendChild(notice);
    }
    if (storageError) {
      const notice = document.createElement('div');
      notice.setAttribute('role', 'alert');
      notice.textContent = '无法访问本地存档，请检查浏览器存储权限后重试。';
      notice.className = 'sunlit-menu-notice is-error';
      panel.appendChild(notice);
    }

    const list = document.createElement('div');
    list.className = 'sunlit-save-list';
    slots.forEach((slot) => {
      const state = slot.state ?? (slot.exists ? 'active' : 'empty');
      const stored = state !== 'empty';
      const corrupt = state === 'invalid';
      const row = document.createElement('div');
      row.className = `sunlit-save-row${stored ? ' has-delete' : ''}`;

      const selectButton = this.makeMenuButton(
        storageError
          ? `存档 ${slot.slot + 1} · 无法访问`
          : corrupt
          ? `存档 ${slot.slot + 1} · 不可读取`
          : state === 'legacy'
            ? `存档 ${slot.slot + 1} · 旧版存档 · 需要迁移`
            : state === 'summary'
              ? `存档 ${slot.slot + 1} · 待确认结算`
              : state === 'camp'
                ? `存档 ${slot.slot + 1} · 营地 · ${slot.metaPoints ?? 0} 天赋点`
                : state === 'active'
                  ? `存档 ${slot.slot + 1} · 第 ${slot.floor} 层 · Lv.${slot.level} · 继续游戏`
                  : `存档 ${slot.slot + 1} · 新档案`,
      );
      selectButton.classList.add('sunlit-save-button');
      if (storageError || corrupt) {
        selectButton.disabled = true;
        selectButton.title = storageError ? '无法访问本地存档' : '这个存档无法读取，请删除后再使用此槽位';
      } else {
        selectButton.onclick = () => this.selectSaveSlot(slot.slot);
      }
      row.appendChild(selectButton);

      if (stored && !storageError) {
        const deleteButton = this.makeMenuButton('删除');
        deleteButton.setAttribute('aria-label', `删除存档 ${slot.slot + 1}`);
        deleteButton.classList.add('is-danger', 'sunlit-delete-button');
        deleteButton.onclick = () => this.showDeleteSaveConfirmation(slot.slot, corrupt);
        row.appendChild(deleteButton);
      }
      list.appendChild(row);
    });
    panel.appendChild(list);

    const backButton = this.makeMenuButton('返回主菜单');
    backButton.classList.add('is-secondary');
    backButton.onclick = () => this.showStartMenu();
    panel.appendChild(backButton);

    overlay.appendChild(panel);
    this.startOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.setStartMenuBackHandler(() => this.showStartMenu());
  }

  private showDeleteSaveConfirmation(slot: number, corrupt: boolean): void {
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();
    panel.classList.add('sunlit-confirm-panel');

    const title = document.createElement('h2');
    title.textContent = `删除存档 ${slot + 1}？`;
    title.className = 'sunlit-menu-title';
    const warning = document.createElement('div');
    warning.setAttribute('role', 'alert');
    warning.textContent = `${corrupt ? '此存档已损坏且无法读取。' : '当前进度将被永久删除。'} 此操作不可恢复。`;
    warning.className = 'sunlit-menu-notice is-error';
    panel.append(title, warning);

    const confirmButton = this.makeMenuButton('确认删除（不可恢复）');
    confirmButton.classList.add('is-danger');
    confirmButton.onclick = () => {
      try {
        SaveManager.clear(slot);
        if (SaveManager.hasSave(slot)) throw new Error('save still exists');
        this.showSaveSlotMenu(`存档 ${slot + 1} 已删除`);
      } catch (error) {
        console.warn('Failed to delete save', error);
        this.showSaveSlotMenu(`存档 ${slot + 1} 删除失败，请重试`, true);
      }
    };
    panel.appendChild(confirmButton);

    const cancelButton = this.makeMenuButton('取消');
    cancelButton.classList.add('is-secondary');
    cancelButton.onclick = () => this.showSaveSlotMenu();
    panel.appendChild(cancelButton);

    overlay.appendChild(panel);
    this.startOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.setStartMenuBackHandler(() => this.showSaveSlotMenu());
  }

  private selectSaveSlot(slot: number): void {
    this.saveSlot = slot;
    const result = SaveManager.readSlot(slot);
    if (result.kind === 'ready') {
      this.envelope = result.envelope;
      if (result.envelope.pendingSettlement) this.showSettlement(result.envelope.pendingSettlement, true);
      else this.showCamp();
      return;
    }
    if (result.kind === 'legacy') {
      this.showMigration(result.data);
      return;
    }
    if (result.kind === 'invalid' || result.kind === 'error') {
      this.showSaveSlotMenu(`存档 ${slot + 1} 无法读取：${result.error}`, true);
      return;
    }
    const candidate = RunManager.createEnvelope(this.newProfileId());
    this.commitEnvelope(candidate, () => this.showCamp());
  }

  private showCamp(message = ''): void {
    const envelope = this.envelope;
    if (!envelope) return this.showSaveSlotMenu('档案尚未载入，请重新选择存档。', true);
    if (envelope.pendingSettlement) return this.showSettlement(envelope.pendingSettlement, true);
    this.running = false;
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();
    panel.append(buildCampView(envelope, {
      start: (archetype) => this.startArchetype(archetype),
      resume: () => this.resumeActiveRun(),
      unlock: (id) => this.unlockArchetype(id),
      back: () => this.showSaveSlotMenu(),
      exportLegacy: () => this.exportLegacyArchive(),
      abandon: () => this.finishRun('abandoned'),
    }, message));
    overlay.append(panel);
    this.startOverlay = overlay;
    this.uiRoot.append(overlay);
    this.setStartMenuBackHandler(() => this.showSaveSlotMenu());
  }

  private showMigration(data: SaveData, message = ''): void {
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();
    panel.append(buildMigrationView(data, {
      confirm: () => {
        const result = SaveManager.migrateLegacy(this.saveSlot);
        if (!result.ok) return this.showMigration(data, result.error);
        this.envelope = result.envelope;
        this.showCamp('旧版存档已备份并保存为纪念记录。');
      },
      back: () => this.showSaveSlotMenu(),
    }, message));
    overlay.append(panel);
    this.startOverlay = overlay;
    this.uiRoot.append(overlay);
    this.setStartMenuBackHandler(() => this.showSaveSlotMenu());
  }

  private showSettlement(record: SettlementRecord, saved: boolean, message = ''): void {
    this.running = false;
    this.paused = true;
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();
    panel.append(buildSettlementView(record, saved, {
      confirm: () => this.acknowledgeSettlement(),
      retry: () => this.retryFailedSave(),
    }, message));
    overlay.append(panel);
    this.startOverlay = overlay;
    this.uiRoot.append(overlay);
    this.setStartMenuBackHandler(null);
  }

  private unlockArchetype(id: string): void {
    if (!this.envelope) return;
    try {
      const candidate = unlockNode(this.envelope, id);
      this.commitEnvelope(candidate, () => this.showCamp('流派已解锁。'));
    } catch (error) {
      this.showCamp(error instanceof Error ? error.message : '无法解锁流派。');
    }
  }

  private startArchetype(archetype: ArchetypeId): void {
    if (!this.envelope || this.failedSaveCandidate || !archetypeAllowed(this.envelope.profile, archetype)) return;
    try {
      const runId = this.newRunId();
      const seed = this.newGameSeed();
      const candidate = RunManager.startRun(this.envelope, runId, seed, archetype, Date.now());
      this.commitEnvelope(candidate, () => this.startNewGame(archetype));
    } catch (error) {
      this.showCamp(error instanceof Error ? error.message : '无法开始新冒险。');
    }
  }

  private resumeActiveRun(): void {
    const run = this.envelope?.activeRun;
    if (!run || this.failedSaveCandidate) return;
    if (run.snapshot && run.snapshot.player.health <= 0) {
      this.finishRun('death');
      return;
    }
    this.seed = run.seed;
    this.upgradeCount = run.upgradeCount;
    this.removeStartMenu();
    if (run.snapshot) this.loadGame(run.snapshot);
    else this.startNewGame(run.archetype);
  }

  private acknowledgeSettlement(): void {
    if (!this.envelope?.pendingSettlement) return;
    const candidate = RunManager.acknowledge(this.envelope);
    this.commitEnvelope(candidate, () => this.showCamp());
  }

  private exportLegacyArchive(): void {
    if (this.envelope?.legacyArchive) SaveManager.exportLegacy(this.saveSlot);
  }

  private newProfileId(): string {
    return `profile-${this.newRunId()}`;
  }

  private newRunId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++this.runIdCounter}`;
  }

  private commitEnvelope(
    candidate: SaveEnvelopeV3,
    onSuccess: () => void,
    onFailure?: (message: string) => void,
  ): boolean {
    if (this.failedSaveCandidate && this.failedSaveCandidate !== candidate) return false;
    const result = SaveManager.saveEnvelope(candidate, this.saveSlot);
    if (result.ok) {
      this.envelope = candidate;
      this.failedSaveCandidate = null;
      this.retryAfterSave = null;
      onSuccess();
      return true;
    }
    this.failedSaveCandidate = candidate;
    this.retryAfterSave = onSuccess;
    this.input.reset();
    this.attackBuffer = 0;
    if (this.running) this.paused = true;
    if (onFailure) onFailure(result.error);
    else this.showSaveRetry(result.error);
    return false;
  }

  private retryFailedSave(): void {
    const candidate = this.failedSaveCandidate;
    const onSuccess = this.retryAfterSave;
    if (!candidate || !onSuccess) return;
    const result = SaveManager.saveEnvelope(candidate, this.saveSlot);
    if (!result.ok) {
      if (candidate.pendingSettlement) this.showSettlement(candidate.pendingSettlement, false, result.error);
      else this.showSaveRetry(result.error);
      return;
    }
    this.envelope = candidate;
    this.failedSaveCandidate = null;
    this.retryAfterSave = null;
    onSuccess();
  }

  private showSaveRetry(message: string): void {
    this.removeStartMenu();
    const { overlay, panel } = this.createStartMenuShell();
    overlay.style.zIndex = '320';
    if (document.pointerLockElement) document.exitPointerLock();
    const title = document.createElement('h2');
    title.textContent = '保存失败';
    const detail = document.createElement('p');
    detail.setAttribute('role', 'alert');
    detail.textContent = `${message}。当前进度尚未保存，保存成功前不能离开或开始新局。`;
    const retry = this.makeMenuButton('重试保存');
    retry.onclick = () => this.retryFailedSave();
    panel.append(title, detail, retry);
    overlay.append(panel);
    this.startOverlay = overlay;
    this.uiRoot.append(overlay);
    this.setStartMenuBackHandler(null);
  }

  private createStartMenuShell(): { overlay: HTMLDivElement; panel: HTMLDivElement } {
    const overlay = document.createElement('div');
    overlay.className = 'sunlit-menu-overlay';

    const panel = document.createElement('div');
    panel.className = 'panel mobile-scroll sunlit-menu-panel';
    return { overlay, panel };
  }

  private setStartMenuBackHandler(handler: (() => void) | null): void {
    if (this.startMenuKeyHandler) document.removeEventListener('keydown', this.startMenuKeyHandler, true);
    this.startMenuKeyHandler = null;
    this.mobileBack.unregister('startMenu');
    if (!handler) return;

    this.startMenuKeyHandler = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      handler();
    };
    document.addEventListener('keydown', this.startMenuKeyHandler, true);
    this.mobileBack.register('startMenu', handler);
  }

  private makeMenuButton(label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = label;
    button.className = 'sunlit-menu-button';
    return button;
  }

  private addPanelCloseButton(panel: HTMLDivElement, onClick: () => void): void {
    panel.style.position = 'relative';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '✕';
    button.className = 'panel-close-button';
    button.setAttribute('aria-label', '关闭面板');
    button.onclick = onClick;
    panel.prepend(button);
  }

  private bindOverlayMaskClose(overlay: HTMLDivElement, close: () => void): void {
    if (!this.mobile) return;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
  }

  private removeStartMenu(): void {
    this.setStartMenuBackHandler(null);
    this.startOverlay?.remove();
    this.startOverlay = null;
  }

  private startNewGame(archetype: ArchetypeId): void {
    this.runTalents = createRunTalents();
    this.fireModifiers = deriveFireModifiers(this.runTalents);
    this.skillCooldowns = {};
    this.skills = [];
    this.migratedRunTalents = false;
    this.pendingResume = null;
    this.player.alive = true;
    this.player.statuses = [];
    this.floor = 1;
    this.seed = this.envelope?.activeRun?.seed ?? this.seed;
    this.gold = 0;
    this.materials = 0;
    this.materialCounts = {};
    this.reforgeTickets = 0;
    this.pendingSavedMonsters = null;
    this.pendingPortalActive = null;
    this.shopStock = [];
    this.shopFloor = 0;
    this.shopRefreshes = this.shopGambles = this.shopHeals = 0;
    this.skillLoadout = [...DEFAULT_SKILL_LOADOUT];
    this.skills = this.buildSkillStates();
    this.kills = 0;
    this.bonusAttributes = talentStats(this.runTalents);
    this.inventory.items = [];
    this.equipment.equipment = { weapon: starterWeapon(archetype) };
    this.player.level = 1;
    this.player.xp = 0;
    this.player.attributePoints = 0;
    this.controller.setFirstPerson(false);
    this.player.health = 9999;
    this.player.clearRecovery();
    this.player.mana = 9999;
    this.player.shield = 0;
    this.player.invulnerable = 0;
    this.player.velocity.set(0, 0, 0);
    this.attackTimer = 0;
    this.attackBuffer = 0;
    this.attackAnimTimer = 0;
    this.hitstopTimer = 0;
    this.deathTimer = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lowHealthShieldCooldown = 0;
    this.elapsed = 0;
    this.saveTimer = 0;
    this.upgradeCount = 0;
    this.input.reset();
    this.clearEntities();
    this.startPlaytestSession('new');
    this.beginRun();
  }

  private loadGame(save: SaveData): void {
    this.pendingResume = save;
    this.runTalents = save.runTalents ? structuredClone(save.runTalents) : createRunTalents();
    this.migratedRunTalents = !save.runTalents;
    this.fireModifiers = deriveFireModifiers(this.runTalents);
    this.skillCooldowns = { ...(save.runtime?.skillCooldowns ?? {}) };
    this.skills = [];
    this.player.alive = true;
    this.floor = save.floor;
    this.seed = save.seed;
    this.gold = save.gold;
    this.materials = save.materials;
    this.materialCounts = { ...(save.materialCounts ?? {}) };
    this.reforgeTickets = save.reforgeTickets ?? 0;
    this.pendingSavedMonsters = Array.isArray(save.monsters) ? save.monsters : null;
    this.pendingPortalActive = save.portalActive ?? null;
    this.skillLoadout = [...new Set(save.skillLoadout ?? DEFAULT_SKILL_LOADOUT)].slice(0, 4);
    this.shopStock = Array.isArray(save.shopStock) ? [...save.shopStock] : [];
    this.shopFloor = save.shopFloor ?? 0;
    this.shopRefreshes = save.shopRefreshes ?? 0;
    this.shopGambles = save.shopGambles ?? 0;
    this.shopHeals = save.shopHeals ?? 0;
    // Reprice legacy portal stock using the current material recovery floor.
    this.shopStock.forEach(entry => { entry.price = ShopSystem.itemPrice(entry.item, this.floor); });
    this.kills = save.kills;
    this.inventory.items = [...save.inventory];
    this.equipment.equipment = { ...save.equipment };
    this.skillLoadout = this.skillLoadout.filter(id => this.isSkillUnlocked(id));
    this.player.level = save.player.level;
    this.player.xp = save.player.xp;
    this.player.attributePoints = 0;
    this.skills = this.buildSkillStates();
    const runtime = save.runtime;
    this.skills.forEach((skill) => {
      skill.cooldownRemaining = Math.max(0, runtime?.skillCooldowns?.[skill.id] ?? 0);
    });
    this.controller.setFirstPerson(Boolean(save.player.firstPerson));
    this.bonusAttributes = talentStats(this.runTalents);
    this.player.health = save.player.health;
    this.player.clearRecovery();
    this.player.mana = save.player.mana;
    this.player.statuses = Array.isArray(save.playerStatuses) ? [...save.playerStatuses] : [];
    this.player.shield = Math.max(0, runtime?.shield ?? 0);
    this.player.shieldRechargeElapsed = Math.max(0, Math.min(60, runtime?.shieldRechargeElapsed ?? 0));
    this.player.invulnerable = Math.max(0, runtime?.invulnerable ?? 0);
    this.upgradeCount = this.envelope?.activeRun?.upgradeCount ?? 0;
    this.attackTimer = Math.max(0, runtime?.attackTimer ?? 0);
    this.attackBuffer = 0;
    this.attackAnimTimer = 0;
    this.hitstopTimer = 0;
    this.deathTimer = 0;
    this.comboCount = Math.max(0, Math.floor(runtime?.comboCount ?? 0));
    this.comboTimer = Math.max(0, runtime?.comboTimer ?? 0);
    this.lowHealthShieldCooldown = Math.max(0, runtime?.lowHealthShieldCooldown ?? 0);
    this.elapsed = Math.max(0, runtime?.elapsed ?? 0);
    this.saveTimer = 0;
    this.input.reset();
    this.startPlaytestSession('continue');
    this.beginRun();
  }

  private loadingFloor = false;

  private unstuckPlayer(): void {
    if (!this.floorData || !this.player.alive || this.loadingFloor) return;
    const data = this.floorData;
    const current = this.encounters?.roomAt(this.player.position.x, this.player.position.z);
    const locked = data.rooms.filter(room => this.encounters?.lockedRoomIds.includes(room.id!));
    const room = locked.find(candidate => candidate === current) ?? locked.sort((a, b) =>
      Math.hypot(a.x - this.player.position.x, a.z - this.player.position.z)
      - Math.hypot(b.x - this.player.position.x, b.z - this.player.position.z))[0] ?? current;
    const spot = room ? findEncounterRoomPosition(data, room, this.player.position.x, this.player.position.z) : null;
    const fallback = !room ? MonsterSpawner.findNearestWalkable(data, this.player.position.x, this.player.position.z) : null;
    if (!spot && !fallback) { this.hud.showCenterMessage('暂无安全落点', '当前房间没有可用位置', 2); return; }
    this.player.position.set(spot?.x ?? fallback!.x + .5, 0, spot?.z ?? fallback!.z + .5);
    this.player.velocity.set(0, 0, 0);
    this.player.moving = this.player.sprinting = false;
    this.input.reset();
    this.controller.resetView(data);
    this.player.group.position.copy(this.player.position);
    this.resumeGame();
    this.hud.showCenterMessage('已脱离卡死', locked.length ? '已移动到当前战斗房间内的安全位置' : '已移动到附近安全位置', 2);
    this.saveGame();
  }

  private async beginRun(): Promise<void> {
    this.running = true;
    this.paused = false;
    this.restOpen = false;
    this.shopOpen = false;
    this.attributeOpen = false;
    this.skillOpen = false;
    this.skillOverlay?.remove();
    this.skillOverlay = null;
    this.skillPanel = null;
    this.removeStartMenu();
    this.removePauseMenu();
    this.removeFloorRestMenu();
    this.closeAttributeAllocation();
    this.lastTime = performance.now();
    if (!await this.generateCurrentFloor(this.pendingSavedMonsters, this.pendingPortalActive, this.pendingResume)) return;
    this.pendingResume = null;
    this.pendingSavedMonsters = null;
    this.pendingPortalActive = null;
    this.updatePlayerStats(this.effectiveStats());
    this.updateWeaponVisual();
    this.player.health = Math.min(this.player.maxHealth, this.player.health);
    this.player.mana = Math.min(this.player.maxMana, this.player.mana);
    this.recordResourceSnapshot('session_ready');
    if (!this.saveGame()) return;
    this.hud.showCenterMessage(`第 ${this.floor} 层`, this.floorData?.theme.name ?? '', 3);
    this.requestPointerLock();
  }

  private async generateCurrentFloor(savedMonsters: SavedMonster[] | null = null, savedPortalActive: boolean | null = null, resume: SaveData | null = null): Promise<boolean> {
    this.loadingFloor = true;
    this.input.reset();
    this.touchControls?.setGameplayState(false, this.controller.isFirstPerson, null);
    const loading = new LoadingScreen(this.uiRoot);
    try {
    await loading.step(5, '准备关卡');
    this.currentFloorSeed = (this.seed ^ Math.imul(this.floor, 0x9e3779b9)) >>> 0;
    const generationVersion = resume ? (resume.mapGenerationVersion ?? 1) : 2;
    const data = generateFloor(this.currentFloorSeed, this.floor, generationVersion);
    data.generationVersion = generationVersion;
    this.floorData = data;
    this.playtestRecorder.record('floor_entered', {
      floor: this.floor,
      floorSeed: data.seed,
      runSeed: this.seed,
      resumed: Boolean(resume?.floorProgress),
      theme: data.theme.id,
      layoutKind: data.layoutKind ?? 'legacy-grid',
      generationVersion,
    });
    this.encounters = new EncounterDirector(data, resume?.floorProgress);
    this.hudTimer = 0;
    await loading.step(30, '构建场景');
    this.world.generate(data);
    await loading.step(65, '安置角色与遭遇');
    this.audio.startAmbient(data.theme.id);
    this.audio.startBGM(data.theme.id);
    this.player.position.set(data.spawn.x + 0.5, 0, data.spawn.z + 0.5);
    const spawnRoom = data.rooms.find(room => room.kind === 'start');
    const safeSpawn = spawnRoom ? findEncounterRoomPosition(data, spawnRoom, this.player.position.x, this.player.position.z) : null;
    if (safeSpawn) this.player.position.set(safeSpawn.x, 0, safeSpawn.z);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = Math.atan2(data.portal.x-data.spawn.x, data.portal.z-data.spawn.z);
    this.player.pitch = 0;
    this.player.group.position.copy(this.player.position);
    this.player.group.rotation.y = this.player.yaw;
    this.controller.resetView(data);
    this.updatePlayerVisibility();
    this.openedChests.clear();
    this.portalActive = false;
    this.clearEntities();
    if (resume?.floorProgress && savedMonsters) {
      this.restoreMonsters(savedMonsters);
      const resumedRooms = new Map<string, number>();
      this.monsters.forEach(monster => {
        if (monster.roomId) resumedRooms.set(monster.roomId, (resumedRooms.get(monster.roomId) ?? 0) + 1);
      });
      resumedRooms.forEach((monsterCount, encounterId) => {
        const room = data.rooms.find(candidate => candidate.id === encounterId);
        this.playtestRecorder.record('encounter_started', {
          floor: this.floor,
          floorSeed: this.currentFloorSeed,
          encounterId,
          kind: room?.kind ?? 'unknown',
          required: Boolean(room?.required),
          monsterCount,
          resumed: true,
        });
      });
    }
    this.portalActive = this.encounters.portalReady;
    for (const key of resume?.openedChests ?? []) {
      this.openedChests.add(key);
      const [x,z] = key.split(',').map(Number);
      this.world.removeChest(x,z);
    }
    if (resume?.floorProgress) {
      const spot = MonsterSpawner.findNearestWalkable(data, resume.player.position.x, resume.player.position.z);
      if (spot) this.player.position.set(spot.x + 0.5, Math.max(0, resume.player.position.y), spot.z + 0.5);
      this.controller.resetView(data);
    }
    if (resume?.floorProgress) this.restoreEncounterBoundary();
    if (resume?.runtime?.finalBoss && this.monsters.some(monster => monster.def.id === 'ruins_warden')) this.finalBossController.restore(resume.runtime.finalBoss);
    this.world.setEncounterBarriers(this.encounters.lockedRoomIds);
    this.world.setPortalActive(this.portalActive);
    await loading.step(85, '准备画面');
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    await loading.step(100, '准备完成');
    loading.close();
    this.lastTime = performance.now();
    return true;
    } catch (error) {
      console.error('Floor preparation failed', error);
      this.running = false;
      loading.fail(() => this.showStartMenu());
      return false;
    } finally { this.loadingFloor = false; }
  }

  private restoreEncounterBoundary(): void {
    if (!this.floorData || !this.encounters) return;
    const active = this.floorData.rooms.filter(room => this.encounters!.lockedRoomIds.includes(room.id!));
    if (!active.length) return;
    const current = this.encounters.roomAt(this.player.position.x, this.player.position.z);
    const keep = active.find(room => room === current) ?? active.sort((a, b) =>
      Math.hypot(a.x + a.width / 2 - this.player.position.x, a.z + a.depth / 2 - this.player.position.z)
      - Math.hypot(b.x + b.width / 2 - this.player.position.x, b.z + b.depth / 2 - this.player.position.z))[0];
    const reset = new Set(active.filter(room => room !== keep).map(room => room.id!));
    this.encounters.state.started = this.encounters.state.started.filter(id => !reset.has(id));
    this.monsters = this.monsters.filter(monster => {
      if (!reset.has(monster.roomId)) return true;
      this.disposeObject(monster.group);
      return false;
    });
    const playerSpot = findEncounterRoomPosition(this.floorData, keep, this.player.position.x, this.player.position.z);
    if (playerSpot) {
      this.player.position.set(playerSpot.x, 0, playerSpot.z);
      this.player.velocity.set(0, 0, 0);
    }
    for (const monster of this.monsters) {
      if (monster.dead || monster.roomId !== keep.id) continue;
      const spot = findEncounterRoomPosition(this.floorData, keep, monster.position.x, monster.position.z);
      if (spot) monster.position.set(spot.x, 0, spot.z);
    }
    this.controller.resetView(this.floorData);
  }

  private updateEncounters(): boolean {
    if (!this.encounters || !this.floorData) return false;
    if (this.floor === BASIC_RUN_DEFINITION.floorCount && this.envelope?.activeRun && hasVictoryObjectives(this.envelope.activeRun)) {
      this.finishRun('victory');
      return true;
    }
    const room = this.encounters.enter(this.player.position.x, this.player.position.z);
    if (room) {
      const wave = MonsterSpawner.spawnEncounter(this.floorData, room, this.player.position,
        new RNG(this.currentFloorSeed ^ Number(room.id!.split('-')[1]) * 7919));
      this.monsters.push(...wave);
      wave.forEach(monster => this.scene.add(monster.group));
      this.playtestRecorder.record('encounter_started', {
        floor: this.floor,
        floorSeed: this.currentFloorSeed,
        encounterId: room.id ?? 'unknown',
        kind: room.kind ?? 'unknown',
        required: Boolean(room.required),
        monsterCount: wave.length,
      });
      const encounter = encounterById(room.encounterId);
      this.hud.showCenterMessage(encounter?.name ?? ROOM_LABELS[room.kind!], encounter
        ? `屏障已封闭 · ${encounter.intent}`
        : room.required ? '屏障已封闭 · 清除本房守卫后解锁' : '屏障已封闭 · 清除后解锁并获得奖励', encounter ? 3 : 1.5);
    }
    const completedRooms = this.encounters.complete(new Set(this.monsters.filter(m => !m.dead).map(m => m.roomId)));
    if (room || completedRooms.length) this.world.setEncounterBarriers(this.encounters.lockedRoomIds);
    for (const cleared of completedRooms) {
      const rewardGold = cleared.kind === 'elite' ? 30 + this.floor * 5 : 10 + this.floor * 2;
      this.changeGold(rewardGold, 'encounter_reward', { encounterId: cleared.id ?? 'unknown', kind: cleared.kind ?? 'unknown' });
      this.player.heal(this.player.maxHealth * 0.08);
      if (cleared.kind === 'elite') {
        const item = ItemGenerator.generate(this.floor, new RNG(this.currentFloorSeed ^ Number(cleared.id!.split('-')[1]) * 31337), this.player.level, 'rare');
        if (this.inventory.add(item)) this.recordItemAcquired(item, 'elite_encounter_reward');
        else this.spawnDrop(this.player.position, { kind: 'item', item });
      }
      this.playtestRecorder.record('encounter_completed', {
        floor: this.floor,
        floorSeed: this.currentFloorSeed,
        encounterId: cleared.id ?? 'unknown',
        kind: cleared.kind ?? 'unknown',
        required: Boolean(cleared.required),
        goldReward: rewardGold,
      });
      if (cleared.required && cleared.id && this.envelope?.activeRun) {
        RunManager.completeObjective(this.envelope.activeRun, `${this.floor}-${cleared.id}`, this.investmentSample());
      }
      this.hud.showCenterMessage('房间已清理', cleared.required ? '屏障已解除 · 主线推进' : '屏障已解除 · 获得额外金币与奖励', 1.4);
    }
    if (this.floor === BASIC_RUN_DEFINITION.floorCount && this.envelope?.activeRun && hasVictoryObjectives(this.envelope.activeRun)) {
      this.finishRun('victory');
      return true;
    }
    if (completedRooms.length && !this.saveGame()) return true;
    if (this.encounters.portalReady && !this.portalActive) {
      this.portalActive = true;
      this.world.setPortalActive(true);
      this.audio.portal();
      this.hud.showCenterMessage('出口已开启', '主线完成，可选房间无需全部清理', 2.5);
      if (!this.saveGame()) return true;
      if (this.envelope?.activeRun && canExtract(this.envelope.activeRun)) {
        this.showFloorRestMenu();
        return true;
      }
    }
    return false;
  }

  private investmentSample() {
    return {
      level: this.player.level,
      equipmentLevelTotal: this.equipment.getEquippedItems().reduce((sum, item) => sum + item.itemLevel, 0),
      upgradeCount: this.upgradeCount,
    };
  }

  private observeCombatInvestment(): void {
    const run = this.envelope?.activeRun;
    if (!run || !this.floorData) return;
    const requiredRooms = new Set(this.floorData.rooms.filter(room => room.required).map(room => room.id));
    const encounterIds = this.monsters
      .filter(monster => !monster.dead && monster.roomId && requiredRooms.has(monster.roomId))
      .map(monster => `${this.floor}-${monster.roomId}`);
    if (encounterIds.length) RunManager.observe(run, this.investmentSample(), encounterIds);
  }

  private restoreMonsters(savedMonsters: SavedMonster[]): void {
    if (!this.floorData) return;
    this.monsters = [];
    savedMonsters.forEach((saved) => {
      const monster = MonsterSpawner.spawnSaved(saved, this.floorData!);
      if (monster) {
        this.encounterMechanics.restore(monster, saved.mechanicState);
        this.monsters.push(monster);
        this.scene.add(monster.group);
      }
    });
  }

  private serializeMonsters(): SavedMonster[] {
    return this.monsters
      .filter((monster) => !monster.dead)
      .map((monster) => ({
        roomId: monster.roomId,
        defId: monster.def.id,
        x: monster.position.x,
        z: monster.position.z,
        health: monster.health,
        maxHealth: monster.maxHealth,
        elite: monster.elite,
        eliteModifiers: [...monster.eliteModifiers],
        statuses: structuredClone(monster.statuses),
        mechanicState: this.encounterMechanics.serialize(monster),
      }));
  }

  private clearEntities(): void {
    this.bossController.clearWarnings();
    this.finalBossController.clear();
    this.encounterMechanics.clear(this.mechanicHost);
    this.summons.forEach((summon) => summon.dispose(this.scene));
    this.summons = [];
    this.monsters.forEach((monster) => this.disposeObject(monster.group));
    this.monsters = [];
    this.projectiles.forEach((projectile) => {
      this.scene.remove(projectile.mesh);
      projectile.mesh.geometry.dispose();
      (projectile.mesh.material as THREE.Material).dispose();
    });
    this.projectiles = [];
    this.drops.forEach((drop) => this.disposeObject(drop.mesh));
    this.drops = [];
    this.effects.clear();
  }

  private disposeObject(root: THREE.Object3D): void {
    this.scene.remove(root);
    root.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material: THREE.Material) => material.dispose());
      } else if (child instanceof THREE.Sprite) {
        const material = child.material as THREE.SpriteMaterial;
        if (child.userData.ownsTexture && material.map) material.map.dispose();
        material.dispose();
      }
    });
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private requestPointerLock(): void {
    if (!document.hidden && !this.mobile && this.running && !this.paused
      && !this.failedSaveCandidate && !this.isGameplayPaused()) {
      this.input.requestPointerLock(this.renderer.domElement);
    }
  }

  private animate = (now: number): void => {
    requestAnimationFrame(this.animate);
    const playtestFrameSeconds = Math.max(0, (now - this.lastPlaytestFrameTime) / 1000);
    this.lastPlaytestFrameTime = now;
    if (document.hidden) {
      this.skipPlaytestFrameTime = true;
    } else if (this.running) {
      if (this.skipPlaytestFrameTime) this.skipPlaytestFrameTime = false;
      else this.playtestRecorder.tick(playtestFrameSeconds, this.playtestPhase());
    }
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.running) this.updateGame(dt);
    this.updateAimIndicator();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private updateGame(rawDt: number): void {
    if (this.loadingFloor) return;
    if (this.isGameplayPaused()) {
      if (!this.failedSaveCandidate) {
        if (this.input.wasPressed('Escape')) {
          if (this.craftOverlay) this.closeCraftOverlay();
          else if (this.sellOverlay) this.closeSellOverlay();
          else if (this.attributeOpen) this.closeAttributeAllocation();
          else if (this.skillOpen) this.closeSkillBar();
          else if (this.restOpen) this.closeFloorRest();
          else if (this.paused) this.resumeGame();
          else if (this.inventoryUI.open) this.toggleInventory();
        } else if (this.skillOpen && this.input.wasPressed('KeyK')) {
          this.closeSkillBar();
        } else if (this.inventoryUI.open && !this.craftOverlay && !this.sellOverlay && !this.attributeOpen
          && (this.input.wasPressed('Tab') || this.input.wasPressed('KeyB'))) {
          this.toggleInventory();
        }
      }
      this.audio.stopWalk();
      this.hud.update(rawDt);
      return;
    }
    this.elapsed += rawDt;
    let dt = rawDt;
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      dt = 0;
    }

    const stats = this.effectiveStats();
    this.updatePlayerStats(stats);
    if (this.player.alive) {
      this.player.mana = Math.min(this.player.maxMana, this.player.mana + stats.manaRegen * rawDt);
      if (this.player.health < this.player.maxHealth) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + stats.lifeRegen * rawDt);
      }
      this.lowHealthShieldCooldown = Math.max(0, this.lowHealthShieldCooldown - rawDt);
      if (
        this.equipment.hasSpecial('lowHealthShield') &&
        this.player.health < this.player.maxHealth * 0.3 &&
        this.lowHealthShieldCooldown <= 0
      ) {
        this.player.grantShield(this.player.maxHealth * 0.35, this.player.maxHealth * 0.35);
        this.lowHealthShieldCooldown = 12;
        this.effects.explosion(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x7fc4ff);
        this.hud.showCenterMessage('血誓护盾触发', '获得额外护盾', 1.4);
      }
      if (this.equipment.hasSpecial('fireTrail') && this.player.moving && Math.random() < rawDt * 5) {
        this.spawnFireTrail();
      }
    }

    if (this.player.alive) {
      if (!this.inventoryUI.open && !this.skillOpen) {
        const wasGrounded = this.player.onGround;
        this.controller.update(dt, this.floorData, stats, rawDt);
        this.updatePlayerVisibility();
        if (this.input.wasPressed('Space') && wasGrounded) this.audio.jump();
      }
      this.handleInput(dt, stats);
      if (this.isGameplayPaused()) return;
      const aliveBeforePlayerUpdate = this.player.alive;
      this.player.update(rawDt, this.elapsed);
      this.recordDeathTransition(aliveBeforePlayerUpdate, 'status_damage');
      if (!this.running) return;
      this.firstPersonView.update(rawDt, this.player.moving, this.player.sprinting);
      if (this.player.alive && this.player.moving && this.player.onGround && !this.inventoryUI.open && !this.skillOpen) {
        this.audio.startWalk();
      } else {
        this.audio.stopWalk();
      }
      if (this.attackAnimTimer > 0) {
        this.attackAnimTimer -= rawDt;
        const progress = Math.max(0, 1 - this.attackAnimTimer / this.attackAnimDuration);
        this.player.swingArm(progress);
        this.firstPersonView.swing(progress);
      }
    } else this.audio.stopWalk();

    if (this.player.alive && !this.inventoryUI.open && !this.skillOpen) {
      if (this.updateEncounters()) return;
      this.observeCombatInvestment();
      this.updateMonsters(dt);
      if (this.isGameplayPaused()) return;
      this.updateProjectiles(dt);
      if (this.isGameplayPaused()) return;
      this.updateDrops(dt, stats);
      this.updateSkills(rawDt);
      this.updateSummons(dt);
    } else if (this.player.alive) {
      this.updateSkills(rawDt);
    }

    this.world.update(rawDt, this.elapsed);
    this.effects.update(rawDt);
    this.hud.update(rawDt);
    this.updateCombo(rawDt);
    this.hudTimer -= rawDt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.hud.setState(this.hudState());
      const skillStates = this.skillHudStates();
      this.hud.updateSkills(skillStates, this.player.mana);
      this.touchControls?.updateSkillStates(skillStates, this.player.mana);
      this.hud.setStatuses(this.player.statuses);
      this.minimap.update(this.floorData, this.player, this.monsters, this.encounters?.state);
      const room = this.encounters?.roomAt(this.player.position.x, this.player.position.z);
      this.hud.setObjective(this.portalActive ? '出口已开启 · 可前往传送门' : `主线目标 ${2 - (this.encounters?.remainingObjectives.length ?? 2)}/2 · ${room?.kind ? ROOM_LABELS[room.kind] : '连接通道'}`);
    }

    this.saveTimer += rawDt;
    if (this.saveTimer >= 4) {
      this.saveTimer = 0;
      this.saveGame();
    }
  }

  private isGameplayPaused(): boolean {
    return this.loadingFloor || this.paused || this.restOpen || this.attributeOpen || this.skillOpen || this.inventoryUI.open
      || this.sellOverlay !== null || this.craftOverlay !== null || this.failedSaveCandidate !== null || !this.running;
  }

  private handleInput(dt: number, stats: DerivedStats): void {
    if (this.input.wasPressed('Tab') || this.input.wasPressed('KeyB')) {
      this.toggleInventory();
    }
    if (this.inventoryUI.open) {
      if (this.input.wasPressed('Escape')) this.toggleInventory();
      return;
    }
    if (this.input.wasPressed('KeyK')) {
      this.toggleSkillBar();
      return;
    }
    if (this.skillOpen) {
      if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyK')) this.closeSkillBar();
      return;
    }
    if (this.input.wasPressed('KeyP')) {
      this.showAttributeAllocation();
      return;
    }
    if (this.input.wasPressed('Escape')) {
      this.togglePause();
      return;
    }
    if (this.input.wasPressed('KeyC')) {
      this.controller.toggleView();
      this.updatePlayerVisibility();
    }

    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.attackBuffer = Math.max(0, this.attackBuffer - dt);
    if (this.input.wasMousePressed(0)) this.attackBuffer = 0.16;
    if ((this.input.isMouseDown(0) || this.attackBuffer > 0) && this.attackTimer <= 0) {
      this.doBasicAttack(stats);
      this.attackBuffer = 0;
      if (this.isGameplayPaused()) return;
    }

    this.skills.forEach((skill) => {
      if (this.input.wasPressed(skill.key)) {
        this.tryUseSkill(skill, stats);
      }
    });

    if (this.input.wasPressed('KeyE')) {
      this.tryInteract();
    }
  }

  private toggleInventory(): void {
    if (!this.inventoryUI.open && this.isGameplayPaused()) return;
    this.inventoryUI.playerLevel = this.player.level;
    this.inventoryUI.attributePoints = this.currentTalentBudget() - spentTalentPoints(this.runTalents);
    this.inventoryUI.materialText = this.materialStatusText();
    this.inventoryUI.toggle(this.equipment, this.inventory);
    if (this.inventoryUI.open) {
      this.player.moving = false;
      this.player.sprinting = false;
      if (document.pointerLockElement) document.exitPointerLock();
      this.mobileBack.register('inventory', () => this.toggleInventory());
    } else {
      this.mobileBack.unregister('inventory');
      this.lastTime = performance.now();
      this.requestPointerLock();
    }
  }

  private showInventory(): void {
    this.inventoryUI.playerLevel = this.player.level;
    this.inventoryUI.attributePoints = this.currentTalentBudget() - spentTalentPoints(this.runTalents);
    this.inventoryUI.materialText = this.materialStatusText();
    this.inventoryUI.show(this.equipment, this.inventory);
    this.mobileBack.register('inventory', () => this.toggleInventory());
  }

  private updatePlayerVisibility(): void {
    const opacity = this.controller.bodyOpacity;
    this.player.group.visible = opacity > 0.02;
    this.player.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material.opacity === opacity) continue;
        const transparent = opacity < 0.99;
        if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.opacity = opacity;
        material.depthWrite = !transparent;
      }
    });
    this.firstPersonView.setVisible(this.controller.isFirstPerson);
  }

  private togglePause(): void {
    if (this.failedSaveCandidate || !this.running) return;
    if (this.paused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  private pauseGame(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.input.reset();
    this.attackBuffer = 0;
    this.player.moving = false;
    this.player.sprinting = false;
    this.audio.stopWalk();
    if (document.pointerLockElement) document.exitPointerLock();
    this.showPauseMenu();
  }

  private resumeGame(): void {
    if (!this.paused || !this.running || this.failedSaveCandidate) return;
    this.paused = false;
    this.removePauseMenu();
    this.lastTime = performance.now();
    this.requestPointerLock();
  }

  private showPauseMenu(): void {
    this.removePauseMenu();
    const overlay = document.createElement('div');
    overlay.className = 'sunlit-menu-overlay sunlit-pause-overlay';

    const panel = document.createElement('div');
    panel.className = 'panel mobile-scroll sunlit-menu-panel sunlit-pause-panel';
    if (this.mobile) panel.classList.add('is-mobile');
    const title = document.createElement('h2');
    title.textContent = '游戏暂停';
    title.className = 'sunlit-menu-title is-large';
    panel.appendChild(title);

    const seedInfo = document.createElement('div');
    seedInfo.textContent = `本局种子 ${this.seed}（地图/遭遇可复现，掉落不保证一致）`;
    seedInfo.className = 'sunlit-menu-help';
    panel.appendChild(seedInfo);

    const continueBtn = this.makeMenuButton('继续游戏');
    continueBtn.onclick = () => this.resumeGame();
    panel.appendChild(continueBtn);
    const unstuckBtn = this.makeMenuButton('脱离卡死');
    unstuckBtn.onclick = () => this.unstuckPlayer();
    panel.appendChild(unstuckBtn);
    const exportBtn = this.makeMenuButton('导出试玩记录');
    exportBtn.onclick = () => {
      this.recordResourceSnapshot('export');
      this.playtestRecorder.download();
    };
    panel.appendChild(exportBtn);
    const exportHelp = document.createElement('div');
    exportHelp.textContent = '记录仅保存在内存，最多 2000 条事件；不会上传，刷新页面会清空。';
    exportHelp.className = 'sunlit-menu-help';
    panel.appendChild(exportHelp);
    const exitBtn = this.makeMenuButton('返回主菜单');
    exitBtn.classList.add('is-secondary');
    exitBtn.onclick = () => this.exitToMainMenu();
    panel.appendChild(exitBtn);

    const lookLabel = document.createElement('div');
    lookLabel.textContent = '视角灵敏度';
    lookLabel.className = 'sunlit-setting-label';
    panel.appendChild(lookLabel);
    const lookSensitivity = document.createElement('input');
    lookSensitivity.type = 'range';
    lookSensitivity.min = '0.5';
    lookSensitivity.max = '2.5';
    lookSensitivity.step = '0.1';
    lookSensitivity.value = String(SettingsManager.getLookSensitivity());
    lookSensitivity.className = 'sunlit-range';
    lookSensitivity.setAttribute('aria-label', '视角灵敏度');
    lookSensitivity.oninput = () => SettingsManager.setLookSensitivity(Number(lookSensitivity.value));
    panel.appendChild(lookSensitivity);

    const followRow = document.createElement('label');
    followRow.className = 'sunlit-toggle-row';
    followRow.textContent = '前进时自动回正镜头';
    const followToggle = document.createElement('input');
    followToggle.type = 'checkbox';
    followToggle.checked = SettingsManager.getCameraFollow();
    followToggle.onchange = () => SettingsManager.setCameraFollow(followToggle.checked);
    followRow.appendChild(followToggle);
    panel.appendChild(followRow);
    const cameraHelp = document.createElement('div');
    cameraHelp.textContent = this.mobile
      ? '拖动画面转向 · 摇杆轻推慢走、外推冲刺'
      : '鼠标转向 · 滚轮调距离 · R 回正 · 按住右键保持面向';
    cameraHelp.className = 'sunlit-menu-help';
    panel.appendChild(cameraHelp);

    const shakeLabel = document.createElement('label');
    shakeLabel.textContent = '镜头震动强度（0 为关闭）';
    shakeLabel.className = 'sunlit-setting-label';
    const shakeSlider = document.createElement('input');
    shakeSlider.type = 'range'; shakeSlider.min = '0'; shakeSlider.max = '1'; shakeSlider.step = '0.1';
    shakeSlider.value = String(SettingsManager.getShakeStrength());
    shakeSlider.setAttribute('aria-label', '镜头震动强度');
    shakeSlider.className = 'sunlit-range';
    shakeSlider.oninput = () => SettingsManager.setShakeStrength(Number(shakeSlider.value));
    shakeLabel.appendChild(shakeSlider); panel.appendChild(shakeLabel);
    const sfxLabel = document.createElement('div');
    sfxLabel.textContent = '音效音量';
    sfxLabel.className = 'sunlit-setting-label';
    panel.appendChild(sfxLabel);
    const sfxVolume = document.createElement('input');
    sfxVolume.type = 'range';
    sfxVolume.min = '0';
    sfxVolume.max = '1';
    sfxVolume.step = '0.05';
    sfxVolume.value = String(this.audio.currentVolume);
    sfxVolume.className = 'sunlit-range';
    sfxVolume.setAttribute('aria-label', '音效音量');
    sfxVolume.oninput = () => this.audio.setSfxVolume(Number(sfxVolume.value));
    panel.appendChild(sfxVolume);

    const musicLabel = document.createElement('div');
    musicLabel.textContent = '背景音乐音量';
    musicLabel.className = 'sunlit-setting-label';
    panel.appendChild(musicLabel);
    const musicVolume = document.createElement('input');
    musicVolume.type = 'range';
    musicVolume.min = '0';
    musicVolume.max = '1';
    musicVolume.step = '0.05';
    musicVolume.value = String(this.audio.currentMusicVolume);
    musicVolume.className = 'sunlit-range';
    musicVolume.setAttribute('aria-label', '背景音乐音量');
    musicVolume.oninput = () => this.audio.setMusicVolume(Number(musicVolume.value));
    panel.appendChild(musicVolume);
    if (this.mobile) {
      const mute = this.makeMenuButton(this.audio.isMuted ? '开启声音' : '静音');
      mute.onclick = () => {
        this.audio.toggleMute();
        this.hud.setMuted(this.audio.isMuted);
        mute.textContent = this.audio.isMuted ? '开启声音' : '静音';
      };
      panel.appendChild(mute);
    }

    overlay.appendChild(panel);
    this.pauseOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.addPanelCloseButton(panel, () => this.resumeGame());
    this.bindOverlayMaskClose(overlay, () => this.resumeGame());
    this.mobileBack.register('pause', () => this.resumeGame());
  }

  private removePauseMenu(): void {
    this.mobileBack.unregister('pause');
    this.pauseOverlay?.remove();
    this.pauseOverlay = null;
  }

  private exitToMainMenu(): void {
    if (!this.saveGame()) return;
    this.paused = false;
    this.removePauseMenu();
    this.running = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.showStartMenu();
  }

  private showFloorRestMenu(shop = false, message = ''): void {
    this.removeFloorRestMenu();
    this.restOpen = true;
    this.shopOpen = shop;
    this.player.moving = false;
    this.player.sprinting = false;
    this.input.reset();
    if (document.pointerLockElement) document.exitPointerLock();
    const overlay = document.createElement('div');
    overlay.className = 'merchant-overlay';
    const panel = document.createElement('div');
    panel.className = 'panel merchant-panel mobile-scroll sunlit-rest-panel';
    const title = document.createElement('h2');
    title.textContent = shop ? '游商驿站' : `第 ${this.floor} 层主线完成`;
    const status = document.createElement('p');
    status.className = 'merchant-wallet';
    status.textContent = `金币 ${this.gold} · 生命 ${Math.ceil(this.player.health)}/${this.player.maxHealth} · 法力 ${Math.ceil(this.player.mana)}/${this.player.maxMana}`;
    panel.append(title, status);
    if (shop) {
      panel.appendChild(buildShopView({
        floor: this.floor, gold: this.gold, stock: this.shopStock, inventory: this.inventory.items,
        materials: this.materialCounts, full: !this.inventory.hasSpace(), refreshes: this.shopRefreshes,
        gambles: this.shopGambles, heals: this.shopHeals,
        needsHealing: this.player.health < this.player.maxHealth || this.player.mana < this.player.maxMana,
        message, buy: uid => this.buyShopItem(uid), refresh: () => this.refreshShop(),
        gamble: slot => this.gambleShopItem(slot), heal: () => this.healAtShop(),
        sell: index => this.confirmSell(index), sellAll: rarity => this.confirmSellAll(rarity),
        sellMaterial: id => {
          if (!this.shopOpen || this.materialCount(id) < 1) return;
          this.materialCounts[id] = this.materialCount(id) - 1;
          const price = ShopSystem.materialPrice(id, this.floor);
          this.changeGold(price, 'shop_sell_material', { materialId: id, amountSold: 1 });
          this.playtestRecorder.record('shop_transaction', { action: 'sell_material', materialId: id, quantity: 1, goldAmount: price, floor: this.floor });
          this.saveGame();
          this.showShopMenu('材料已出售');
        },
      }));
    } else {
      const run = this.envelope?.activeRun;
      if (run && canExtract(run)) {
        const checkpoint = document.createElement('p');
        checkpoint.textContent = `阶段 Boss 已击败。现在提前结算可获得 ${extractionResearchXp(run)} 研究经验；继续深入可争取完整通关奖励。进入下一层后，要到下一场 Boss 战后才能再次提前结算。`;
        panel.appendChild(checkpoint);
        const extract = this.makeMenuButton('提前结算，返回营地');
        extract.onclick = () => this.confirmExtraction();
        panel.appendChild(extract);
      }
      const talents = this.makeMenuButton('查看局内天赋');
      talents.onclick = () => this.showAttributeAllocation();
      panel.appendChild(talents);
      const next = this.makeMenuButton(`继续深入 · 第 ${this.floor + 1} 层`);
      next.onclick = () => {
        this.closeFloorRest();
        this.advanceFloor();
      };
      panel.appendChild(next);
    }
    const close = this.makeMenuButton('返回探索');
    close.onclick = () => this.closeFloorRest();
    panel.appendChild(close);
    overlay.appendChild(panel);
    this.floorRestOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.addPanelCloseButton(panel, () => this.closeFloorRest());
    if (this.mobile) panel.style.paddingTop = '14px';
    this.bindOverlayMaskClose(overlay, () => this.closeFloorRest());
    this.mobileBack.register('floorRest', () => this.closeFloorRest());
  }

  private showShopMenu(message = ''): void {
    if (!this.floorData?.merchant) return;
    const selling = this.floorRestOverlay?.querySelectorAll('[role="tab"]')[1]?.getAttribute('aria-selected') === 'true';
    const scrollTop = this.floorRestOverlay?.querySelector('.merchant-panel')?.scrollTop ?? 0;
    if (this.shopFloor !== this.floor) {
      this.shopStock = ShopSystem.generateStock(this.floor, this.player.level, 4,
        new RNG((this.seed ^ (this.floor * 4099)) >>> 0));
      this.shopFloor = this.floor;
      this.shopRefreshes = this.shopGambles = this.shopHeals = 0;
      this.saveGame();
    }
    this.showFloorRestMenu(true, message);
    if (selling) (this.floorRestOverlay?.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement)?.click();
    const panel = this.floorRestOverlay?.querySelector('.merchant-panel');
    if (panel) panel.scrollTop = scrollTop;
  }

  private confirmExtraction(): void {
    const run = this.envelope?.activeRun;
    if (!run || !canExtract(run) || this.failedSaveCandidate) return;
    this.showCraftOverlay('确认提前结算',
      `在第 ${this.floor} 层结束本局，获得 ${extractionResearchXp(run)} 研究经验。<br>这是阶段撤离，不算完整通关。装备、金币和材料不会带出。`,
      () => {
        if (this.envelope?.activeRun && canExtract(this.envelope.activeRun)) this.finishRun('extracted');
      });
  }

  private buyShopItem(uid: string): void {
    if (!this.shopOpen) return;
    const index = this.shopStock.findIndex(entry => entry.uid === uid);
    const entry = this.shopStock[index];
    if (!entry || this.gold < entry.price || !this.inventory.hasSpace()) return;
    this.inventory.add(entry.item);
    this.recordItemAcquired(entry.item, 'shop_purchase');
    this.changeGold(-entry.price, 'shop_purchase', { itemId: entry.item.id, itemName: entry.item.name });
    this.playtestRecorder.record('shop_transaction', { action: 'buy_item', itemId: entry.item.id, itemName: entry.item.name, goldAmount: -entry.price, floor: this.floor });
    this.shopStock.splice(index, 1);
    this.audio.coin();
    this.saveGame();
    this.showShopMenu(`已购买 ${entry.item.name}`);
  }

  private refreshShop(): void {
    const price = ShopSystem.refreshPrice(this.floor, this.shopRefreshes);
    if (!this.shopOpen || this.shopRefreshes >= 3 || this.gold < price) return;
    this.changeGold(-price, 'shop_refresh');
    this.playtestRecorder.record('shop_transaction', { action: 'refresh', goldAmount: -price, floor: this.floor });
    this.shopRefreshes++;
    this.shopStock = ShopSystem.generateStock(this.floor, this.player.level, 4,
      new RNG((this.seed ^ (this.floor * 4099) ^ (this.shopRefreshes * 65537)) >>> 0));
    this.saveGame();
    this.showShopMenu('货架已换新；委托与补给次数保持不变');
  }

  private gambleShopItem(slot: Slot): void {
    const price = ShopSystem.gamblePrice(this.floor, slot);
    if (!this.shopOpen || this.shopGambles >= 3 || this.gold < price || !this.inventory.hasSpace()
      || !SHOP_SLOTS.some(option => option.slot === slot)) return;
    const item = ShopSystem.gamble(this.floor, this.player.level, slot,
      new RNG((this.seed ^ (this.floor * 8191) ^ ((this.shopGambles + 1) * 104729)) >>> 0));
    this.inventory.add(item);
    this.recordItemAcquired(item, 'shop_gamble');
    this.changeGold(-price, 'shop_gamble', { itemId: item.id, itemName: item.name, slot });
    this.playtestRecorder.record('shop_transaction', { action: 'gamble', itemId: item.id, itemName: item.name, slot, goldAmount: -price, floor: this.floor });
    this.shopGambles++;
    this.audio.pickup();
    this.saveGame();
    this.showShopMenu(`委托完成：${item.name}（${this.rarityLabel(item.rarity)}）已收入背包`);
  }

  private healAtShop(): void {
    const price = ShopSystem.healPrice(this.floor);
    if (!this.shopOpen || this.shopHeals >= 2 || this.gold < price
      || (this.player.health >= this.player.maxHealth && this.player.mana >= this.player.maxMana)) return;
    this.changeGold(-price, 'shop_heal');
    this.playtestRecorder.record('shop_transaction', { action: 'heal', goldAmount: -price, floor: this.floor });
    this.shopHeals++;
    this.player.heal(this.player.maxHealth * .4);
    this.player.addMana(this.player.maxMana * .4);
    this.saveGame();
    this.showShopMenu('已恢复生命与法力');
  }

  private closeFloorRest(): void {
    this.mobileBack.unregister('floorRest');
    this.restOpen = false;
    this.shopOpen = false;
    this.floorRestOverlay?.remove();
    this.floorRestOverlay = null;
    this.input.reset();
    this.requestPointerLock();
  }

  private removeFloorRestMenu(): void {
    this.mobileBack.unregister('floorRest');
    this.floorRestOverlay?.remove();
    this.floorRestOverlay = null;
  }

  private showAttributeAllocation(): void {
    if (this.attributeOpen) return;
    this.attributeOpen = true;
    this.player.moving = false;
    this.player.sprinting = false;
    if (document.pointerLockElement) document.exitPointerLock();

    const overlay = document.createElement('div');
    overlay.className = 'sunlit-menu-overlay sunlit-talent-overlay';

    const panel = document.createElement('div');
    panel.className = 'panel sunlit-talent-shell';
    if (this.mobile) panel.classList.add('mobile-scroll');
    this.attributePanel = panel;
    this.renderCharacterPanel();

    overlay.appendChild(panel);
    this.attributeOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.bindOverlayMaskClose(overlay, () => this.closeAttributeAllocation());
    this.mobileBack.register('attribute', () => this.closeAttributeAllocation());
  }

  private currentTalentBudget(): number {
    return talentBudget(this.player.level, this.envelope?.activeRun?.completedObjectives ?? []);
  }

  private canEditRunTalents(): boolean {
    if (!this.running || !this.player.alive || this.failedSaveCandidate || !this.encounters) return false;
    if (this.encounters.lockedRoomIds.length || this.monsters.some(monster => !monster.dead)) return false;
    const room = this.encounters.roomAt(this.player.position.x, this.player.position.z);
    return Boolean(room && (['start', 'sanctuary', 'treasure'].includes(room.kind!)
      || this.encounters.state.cleared.includes(room.id!)));
  }

  private renderCharacterPanel(): void {
    const panel = this.attributePanel;
    if (!panel) return;
    panel.replaceChildren();
    this.addPanelCloseButton(panel, () => this.closeAttributeAllocation());
    if (this.migratedRunTalents) {
      const note = document.createElement('p');
      note.textContent = '本局已接续新天赋规则：旧属性、天赋和层间专精已归并，按等级与已完成 Boss 目标恢复可用点数，请在安全房重新规划。装备和局外档案保留。';
      note.className = 'sunlit-menu-notice';
      panel.appendChild(note);
    }
    panel.appendChild(buildRunTalentPanel(this.runTalents, this.currentTalentBudget(), this.canEditRunTalents(),
      id => this.allocateRunTalent(id), () => this.confirmTalentReset()));
    const skills = this.makeMenuButton('技能栏配置');
    skills.onclick = () => { this.closeAttributeAllocation(); this.showSkillBar(); };
    const close = this.makeMenuButton('关闭');
    close.classList.add('is-secondary');
    close.onclick = () => { this.closeAttributeAllocation(); this.requestPointerLock(); };
    panel.append(skills, close);
  }

  private allocateRunTalent(id: string): void {
    if (!this.canEditRunTalents() || !canUnlockTalent(this.runTalents, id, this.currentTalentBudget())) return;
    this.runTalents = unlockRunTalent(this.runTalents, id, this.currentTalentBudget());
    this.migratedRunTalents = false;
    if (id === 'consuming_flame' && !this.skillLoadout.includes('detonate') && this.skillLoadout.length < 4) this.skillLoadout.push('detonate');
    this.refreshTalentEffects();
    if (this.saveGame()) this.renderCharacterPanel();
  }

  private confirmTalentReset(): void {
    if (!this.canEditRunTalents() || !this.runTalents.unlocked.length) return;
    const cost = resetTalentCost(this.runTalents);
    this.showCraftOverlay('确认重置局内天赋',
      `将清空本局全部 ${this.runTalents.unlocked.length} 个已选节点，退回 ${spentTalentPoints(this.runTalents)} 点。<br>费用：${cost === 0 ? '免费' : cost + ' 金币'}；不会恢复生命、法力或技能冷却。`,
      () => {
        if (!this.canEditRunTalents() || this.gold < cost) return;
        this.changeGold(-cost, 'talent_reset');
        this.runTalents = resetRunTalents(this.runTalents);
        this.refreshTalentEffects();
        if (this.saveGame()) this.renderCharacterPanel();
      }, this.gold < cost);
  }

  private refreshTalentEffects(): void {
    this.fireModifiers = deriveFireModifiers(this.runTalents);
    this.bonusAttributes = talentStats(this.runTalents);
    this.skillLoadout = this.skillLoadout.filter(id => this.isSkillUnlocked(id));
    this.skills = this.buildSkillStates();
    this.updatePlayerStats(this.effectiveStats());
  }

  private closeAttributeAllocation(): void {
    this.mobileBack.unregister('attribute');
    this.attributeOpen = false;
    this.attributeOverlay?.remove();
    this.attributeOverlay = null;
    this.attributePanel = null;
  }

  private toggleSkillBar(): void {
    if (this.skillOpen) this.closeSkillBar();
    else if (!this.isGameplayPaused()) this.showSkillBar();
  }

  private showSkillBar(): void {
    if (this.skillOpen) return;
    this.skillOpen = true;
    this.player.moving = false;
    this.player.sprinting = false;
    if (document.pointerLockElement) document.exitPointerLock();

    const overlay = document.createElement('div');
    overlay.className = 'sunlit-menu-overlay sunlit-skill-menu-overlay';

    const panel = document.createElement('div');
    panel.className = 'panel sunlit-skill-panel';
    if (this.mobile) panel.classList.add('mobile-scroll');
    this.skillPanel = panel;
    this.renderSkillPanel();

    overlay.appendChild(panel);
    this.skillOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.bindOverlayMaskClose(overlay, () => this.closeSkillBar());
    this.mobileBack.register('skillBar', () => this.closeSkillBar());
  }

  private renderSkillPanel(): void {
    const panel = this.skillPanel;
    if (!panel) return;
    panel.innerHTML = '';
    if (panel === this.attributePanel) this.addPanelCloseButton(panel, () => this.closeAttributeAllocation());
    if (panel === this.skillPanel) this.addPanelCloseButton(panel, () => this.closeSkillBar());
    const header = document.createElement('header');
    header.className = 'sunlit-skill-header';
    const title = document.createElement('h2');
    title.textContent = '技能栏配置';
    title.className = 'sunlit-menu-title';

    const hint = document.createElement('div');
    hint.textContent = `已装备 ${this.skillLoadout.length}/4 · ${this.canEditRunTalents() ? '安全房可调整技能栏' : '战斗或通道中仅可查看'}`;
    hint.className = 'sunlit-skill-hint sunlit-inset';
    header.append(title, hint);
    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'sunlit-skill-list mobile-scroll';
    list.setAttribute('aria-label', '可配置技能');

    SKILLS.forEach((skill) => {
      const unlocked = this.isSkillUnlocked(skill.id);
      const equipped = this.skillLoadout.includes(skill.id);
      const equippedSlot = this.skillLoadout.indexOf(skill.id);
      const row = document.createElement('div');
      row.className = `sunlit-skill-row${equipped ? ' is-equipped' : ''}${unlocked ? '' : ' is-locked'}`;

      const icon = createUiIcon(SKILL_UI_ICONS[skill.id] ?? skill.id, 'sunlit-skill-icon');
      row.appendChild(icon);

      const info = document.createElement('div');
      info.className = 'sunlit-skill-copy';
      const cooldown = Math.max(.3, skill.cooldown * (skill.id === 'fireball' ? this.fireModifiers.fireballCooldownMultiplier : 1) * (1 - this.effectiveStats().cooldownReduction));
      const manaCost = Math.max(0, Math.round(skill.manaCost * (skill.id === 'fireball' ? this.fireModifiers.fireballManaCostMultiplier : 1)));
      const skillName = document.createElement('div');
      skillName.className = 'sunlit-config-skill-name';
      skillName.append(document.createTextNode(`${skill.name} `));
      const key = document.createElement('span');
      key.textContent = equippedSlot >= 0 ? `[槽位 ${equippedSlot + 1}]` : '[未配置]';
      skillName.appendChild(key);
      const description = document.createElement('div');
      description.className = 'sunlit-skill-description';
      description.textContent = `${skill.description} · ${cooldown.toFixed(1)}s · 法力 ${manaCost}`;
      info.append(skillName, description);
      row.appendChild(info);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sunlit-menu-button sunlit-skill-action';
      if (!unlocked && !equipped) {
        button.textContent = '未解锁';
        button.disabled = true;
      } else {
        button.textContent = equipped ? '卸载' : '装备';
        if (equipped) button.classList.add('is-equipped');
        button.disabled = !this.canEditRunTalents();
        button.onclick = () => {
          if (!this.canEditRunTalents()) return;
          if (equipped) this.removeSkillFromLoadout(skill.id);
          else this.addSkillToLoadout(skill.id);
          this.renderSkillPanel();
        };
      }
      button.setAttribute('aria-label', `${button.textContent}技能：${skill.name}`);
      row.appendChild(button);
      list.appendChild(row);
    });
    panel.appendChild(list);

    const footer = document.createElement('footer');
    footer.className = 'sunlit-skill-footer';
    const closeButton = this.makeMenuButton('关闭');
    closeButton.classList.add('is-secondary');
    closeButton.onclick = () => this.closeSkillBar();
    footer.appendChild(closeButton);
    panel.appendChild(footer);
  }

  private addSkillToLoadout(id: string): void {
    if (!this.canEditRunTalents() || !this.isSkillUnlocked(id) || this.skillLoadout.includes(id) || this.skillLoadout.length >= 4) return;
    this.skillLoadout.push(id);
    this.skills = this.buildSkillStates();
    this.saveGame();
  }

  private removeSkillFromLoadout(id: string): void {
    if (!this.canEditRunTalents()) return;
    this.skillLoadout = this.skillLoadout.filter((skillId) => skillId !== id);
    this.skills = this.buildSkillStates();
    this.saveGame();
  }

  private closeSkillBar(): void {
    this.mobileBack.unregister('skillBar');
    this.skillOpen = false;
    this.skillOverlay?.remove();
    this.skillOverlay = null;
    this.skillPanel = null;
    if (this.running && !this.paused) this.requestPointerLock();
  }

  private basicAimDirection(): THREE.Vector3 {
    return this.softAim.resolve(this.player.position, this.controller.getAimDirection(), this.monsters,
      this.floorData, this.getMeleeProfile(this.equipment.get('weapon')).range,
      !this.controller.isFirstPerson && !this.controller.isTouchAiming).direction;
  }

  private doBasicAttack(stats: DerivedStats): void {
    this.controller.faceAim();
    const aim = this.basicAimDirection();
    const weapon = this.equipment.get('weapon');
    const attackSpeed = Math.max(0.15, Math.min(3.5, stats.baseAttackSpeed * (1 + stats.attackSpeedBonus)));
    this.attackAnimTimer = Math.max(0.12, Math.min(0.28, 0.34 / attackSpeed));
    this.attackAnimDuration = this.attackAnimTimer;
    this.attackTimer = 1 / attackSpeed;

    if (this.isStaffWeapon(weapon)) {
      this.doStaffAttack(weapon, aim, stats);
      return;
    }
    this.doMeleeAttack(weapon, aim, stats);
  }

  private isStaffWeapon(weapon: Item | null): weapon is Item {
    if (!weapon) return false;
    return weapon.name.includes('法杖') || weapon.id.startsWith('staff_') || weapon.id.startsWith('weapon_staff');
  }

  private doMeleeAttack(weapon: Item | null, aim: THREE.Vector3, stats: DerivedStats): void {
    const element = weapon?.element ?? 'physical';
    const statusChance = weapon?.statusChance;
    const profile = this.getMeleeProfile(weapon);
    const targets = this.getTargetsInFront(aim, profile.range, 1.0);
    this.audio.swing();
    this.effects.meleeSlash(
      this.player.position.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(aim, 1.4),
      aim,
      profile.color,
      profile.scale,
    );

    targets.slice(0, 3).forEach((target, index) => {
      const falloff = Math.max(0.65, 1 - index * 0.12);
      const result = CombatSystem.rollDamage(
        stats.attack * falloff,
        stats.critChance,
        stats.critDamage,
        target.def.armor,
        this.floor,
        element,
        target.def.resistances,
        target.statuses,
      );
      this.applyMonsterDamage(target, result.damage, result.crit, profile.scale * 0.55, this.player.position, element);
      this.applyPlayerElementalHit(target, element, stats.attack * falloff, statusChance);
    });

    if (targets.length > 0) this.triggerBasicAttackEffects(targets[0], stats);
  }

  private triggerBasicAttackEffects(target: Monster, stats: DerivedStats): void {
    if (this.equipment.hasSpecial('chainLightning') && Math.random() < 0.15) {
      const chainTargets = this.monsters.filter(
        (monster) => monster !== target && !monster.dead && monster.position.distanceTo(target.position) < 4,
      );
      chainTargets.slice(0, 3).forEach((chainTarget, index) => {
        const raw = stats.attack * 0.55 * (1 - index * 0.18);
        const result = CombatSystem.rollDamage(raw, stats.critChance, stats.critDamage,
          chainTarget.def.armor, this.floor, 'lightning', chainTarget.def.resistances, chainTarget.statuses);
        this.applyMonsterDamage(chainTarget, result.damage, result.crit, 0.45, undefined, 'lightning', false);
        this.applyPlayerElementalHit(chainTarget, 'lightning', raw);
      });
      this.effects.explosion(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x8ed4ff);
    }

    if (this.equipment.hasSpecial('meteorOnAttack') && Math.random() < 0.18) {
      this.spawnMeteor(target.position.clone());
    }
  }

  private getMeleeProfile(weapon: Item | null): { range: number; color: number; scale: number } {
    const id = weapon?.id ?? '';
    const name = weapon?.name ?? '';
    const icon = weapon?.icon ?? 'sword';
    if (name.includes('匕首') || id.includes('dagger')) return { range: 3.2, color: 0xb9e7ff, scale: 0.92 };
    if (icon === 'axe') return { range: 4.8, color: 0xffa24a, scale: 1.55 };
    if (icon === 'hammer') return { range: 4.4, color: 0xffe14d, scale: 1.3 };
    if (name.includes('巨剑') || name.includes('重剑') || name.includes('战刃')) {
      return { range: 4.7, color: 0xdff4ff, scale: 1.35 };
    }
    return { range: 4.0, color: 0xdff4ff, scale: 1.1 };
  }

  private doStaffAttack(weapon: Item, aim: THREE.Vector3, stats: DerivedStats): void {
    const element = weapon.element ?? 'physical';
    const statusChance = weapon.statusChance;
    const color = this.weaponElementColor(element);
    aim = this.controller.getProjectileDirection(this.monsters);
    const position = this.controller.getProjectileOrigin();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color }),
    );
    mesh.position.copy(position);
    this.scene.add(mesh);

    const projectileSpeed = 15 + stats.baseAttackSpeed * 1.5;
    this.projectiles.push({
      mesh,
      position,
      velocity: aim.clone().multiplyScalar(projectileSpeed),
      damage: Math.max(1, Math.round(stats.attack * 1.25)),
      sourceSkillId: 'staff_attack',
      fireModifiers: { ...this.fireModifiers },
      life: 2.6,
      friendly: true,
      element,
      statusChance,
      radius: 0.9,
      impact: 0.75,
      traveled: 0,
      maxDistance: 10,
    });
    this.audio.shoot();
    this.effects.burst(position, color, 5, 2);
  }

  private weaponElementColor(element: ElementType): number {
    const colors: Record<ElementType, number> = {
      physical: 0xd9e2ec,
      fire: 0xff7a2a,
      frost: 0x7ad7ff,
      lightning: 0xffe14d,
      poison: 0x69d44a,
      shadow: 0xb56bff,
    };
    return colors[element] ?? colors.physical;
  }

  private spawnMeteor(position: THREE.Vector3): void {
    const center = position.clone().add(new THREE.Vector3(0, 0.8, 0));
    this.effects.explosion(center, 0xff7a2a);
    this.audio.explosion();
    const stats = this.effectiveStats();
    const nearby = this.monsters.filter(
      (monster) => !monster.dead && monster.position.distanceTo(position) < 3.5,
    );
    nearby.forEach((monster) => {
      const result = CombatSystem.rollDamage(
        stats.attack * 1.1,
        stats.critChance,
        stats.critDamage,
        monster.def.armor,
        this.floor,
        'fire',
        monster.def.resistances,
        monster.statuses,
      );
      this.applyMonsterDamage(monster, result.damage, result.crit, 1.3, undefined, 'fire', false);
      this.applyPlayerElementalHit(monster, 'fire', stats.attack * 1.1, 0.2);
    });
  }

  private spawnFireTrail(): void {
    const position = this.player.position.clone();
    position.y = 0.05;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.5, 16),
      new THREE.MeshBasicMaterial({
        color: 0xff5a1e,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(position);
    this.scene.add(mesh);
    const stats = this.effectiveStats();
    this.monsters
      .filter((monster) => !monster.dead && monster.position.distanceTo(this.player.position) < 1.0)
      .forEach((monster) => {
        const result = CombatSystem.rollDamage(
          stats.attack * 0.22,
          stats.critChance,
          stats.critDamage,
          monster.def.armor,
          this.floor,
          'fire',
          monster.def.resistances,
          monster.statuses,
        );
        this.applyMonsterDamage(monster, result.damage, result.crit, 0.25, undefined, 'fire', false);
        this.applyPlayerElementalHit(monster, 'fire', stats.attack * 0.22, 0.12);
      });
    window.setTimeout(() => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }, 900);
  }

  private tryUseSkill(skill: SkillState, stats: DerivedStats): void {
    if (!this.isSkillUnlocked(skill.id)) return;
    if (skill.cooldownRemaining > 0 || this.player.mana < skill.manaCost) return;
    if (skill.id === 'detonate' && !this.detonationTargets().length) {
      this.hud.showCenterMessage('没有可引爆的目标', '先用火球点燃视线内的敌人', 1.2);
      return;
    }
    this.controller.faceAim();
    skill.cooldown = Math.max(0.3, skill.baseCooldown * (1 - stats.cooldownReduction));
    skill.cooldownRemaining = skill.cooldown;
    this.skillCooldowns[skill.id] = skill.cooldown;
    this.player.mana -= skill.manaCost;
    if (skill.id === 'whirlwind') this.useWhirlwind(stats, skill);
    if (skill.id === 'dash') this.useDash(stats, skill);
    if (skill.id === 'fireball') this.useFireball(stats, skill);
    if (skill.id === 'frost_nova') this.useFrostNova(stats, skill);
    if (skill.id === 'lightning_chain') this.useLightningChain(stats, skill);
    if (skill.id === 'detonate') this.useDetonate();
  }

  private useWhirlwind(stats: DerivedStats, skill: SkillState): void {
    const aim = this.controller.getAimDirection();
    this.audio.explosion();
    this.controller.addShake(0.12);
    this.effects.whirlwind(
      this.player.position.clone().add(new THREE.Vector3(0, 1.1, 0)).addScaledVector(aim, 1.5),
      aim,
    );
    const targets = this.getTargetsInFront(aim, 4.4, 1.15);
    targets.forEach((target) => {
      const result = CombatSystem.rollDamage(
        stats.attack * 1.6,
        stats.critChance,
        stats.critDamage,
        target.def.armor,
        this.floor,
        skill.element,
        target.def.resistances,
        target.statuses,
      );
      this.applyMonsterDamage(target, result.damage, result.crit, 0.65, undefined, skill.element);
      this.applyPlayerElementalHit(target, skill.element, stats.attack * 1.6, skill.statusChance);
    });
  }

  private useDash(stats: DerivedStats, skill: SkillState): void {
    const aim = this.controller.getAimDirection();
    this.controller.dash(aim);
    this.audio.swing();
    this.effects.dashTrail(this.player.position.clone().add(new THREE.Vector3(0, 0.9, 0)), aim);
    this.controller.addShake(0.08);
    const targets = this.getTargetsInFront(aim, 3.9, 0.45);
    targets.forEach((target) => {
      const result = CombatSystem.rollDamage(
        stats.attack * 1.25,
        stats.critChance,
        stats.critDamage,
        target.def.armor,
        this.floor,
        skill.element,
        target.def.resistances,
        target.statuses,
      );
      this.applyMonsterDamage(target, result.damage, result.crit, 1.1, undefined, skill.element);
      this.applyPlayerElementalHit(target, skill.element, stats.attack * 1.25, skill.statusChance);
    });
    if (this.equipment.hasSpecial('dashInvincibility')) {
      this.player.invulnerable = 0.8;
    }
  }

  private useFireball(stats: DerivedStats, skill: SkillState): void {
    const direction = this.controller.getProjectileDirection(this.monsters);
    const position = this.controller.getProjectileOrigin();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8c1e }),
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      position,
      velocity: direction.multiplyScalar(16),
      damage: Math.round(stats.attack * 1.8 * this.fireModifiers.fireDamageMultiplier),
      sourceSkillId: 'fireball',
      fireModifiers: { ...this.fireModifiers },
      piercesRemaining: this.fireModifiers.projectilePierces,
      hitMonsterIds: new Set<number>(),
      life: 2.5,
      friendly: true,
      element: skill.element,
      statusChance: skill.statusChance,
      traveled: 0,
      maxDistance: 10,
    });
    this.audio.shoot();
  }

  private applyPlayerElementalHit(monster: Monster, element: ElementType, damage: number, chance?: number): void {
    if (monster.dead) return;
    if (element === 'fire' && this.fireModifiers.enabled) {
      this.igniteMonster(monster, damage, this.fireModifiers);
      return;
    }
    const type = ELEMENTS[element].status;
    if (!type || monster.def.immunities?.includes(type)) return;
    const mastery = element === 'frost' && this.equipment.hasSpecial('freezeMastery')
      || element === 'lightning' && this.equipment.hasSpecial('shockMastery');
    if (Math.random() >= Math.min(1, elementStatusChance(element, chance) * (mastery ? 1.5 : 1))) return;
    const status = makeActorStatus(type, damage, element);
    if (element === 'fire' && this.equipment.hasSpecial('burnMastery')) status.damagePerTick *= 1.25;
    if (element === 'poison' && this.equipment.hasSpecial('poisonMastery')) {
      status.damagePerTick *= 1.35;
      status.duration *= 1.25;
    }
    if (element === 'frost' && mastery) status.duration *= 1.2;
    status.maxDuration = status.duration;
    applyStatus(monster, status);
  }

  private igniteMonster(monster: Monster, damage: number, mods: FireModifiers): void {
    if (monster.dead) return;
    const burn = createBurn(damage, mods, monster.def.immunities);
    if (burn) {
      if (this.equipment.hasSpecial('burnMastery')) burn.damagePerTick *= 1.25;
      applyStatus(monster, burn);
    }
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const origin = from.clone().add(new THREE.Vector3(0, 1, 0));
    const offset = to.clone().sub(from);
    const distance = offset.length();
    return !this.floorData || distance < 0.01 || worldRayDistance(this.floorData, origin, offset.normalize(), distance) >= distance - 0.05;
  }

  private spreadFire(source: Monster, damage: number, mods: FireModifiers): void {
    if (mods.spreadLimit <= 0) return;
    const nearby = this.monsters.filter(target => target !== source && !target.dead
      && target.position.distanceTo(source.position) <= mods.spreadRadius
      && this.hasLineOfSight(source.position, target.position))
      .sort((a, b) => a.position.distanceToSquared(source.position) - b.position.distanceToSquared(source.position))
      .slice(0, mods.spreadLimit);
    for (const target of nearby) {
      this.igniteMonster(target, damage * mods.spreadDamageMultiplier, mods);
      this.effects.burst(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xffa439, 5, 2);
    }
  }

  private detonationTargets(): Monster[] {
    if (!this.isSkillUnlocked('detonate')) return [];
    return this.getTargetsInFront(this.controller.getAimDirection(), 8, 1.35)
      .filter(target => target.statuses.some(status => status.type === 'burning' && status.duration > 0));
  }

  private useDetonate(): void {
    const targets = this.detonationTargets();
    let refund = 0;
    let shield = 0;
    for (const target of targets) {
      const result = consumeBurn(target, this.fireModifiers, { healthRatio: target.health / target.maxHealth, isBoss: target.def.behavior === 'boss' });
      if (!result.consumed) continue;
      refund = Math.max(refund, result.manaRefund);
      shield = Math.max(shield, result.shieldGain);
      this.applyMonsterDamage(target, elementalDamage(result.rawDamage, 'fire', target.def.resistances, target.statuses), false, 1.1, undefined, 'fire');
      this.effects.explosion(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff401a);
    }
    this.player.addMana(refund);
    if (shield > 0) this.player.grantShield(shield, this.player.maxHealth * this.fireModifiers.detonateShieldCapMaxHealthRatio);
    this.audio.explosion();
    this.controller.addShake(0.12);
  }

  private useFrostNova(stats: DerivedStats, skill: SkillState): void {
    const empowered = this.equipment.hasSpecial('glacialNova');
    const radius = empowered ? 6 : 5;
    const damage = stats.attack * 1.25 * (empowered ? 1.2 : 1);
    this.audio.explosion();
    this.controller.addShake(0.12);
    this.effects.explosion(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9ee7ff);
    this.monsters
      .filter((monster) => !monster.dead && monster.position.distanceTo(this.player.position) <= radius
        && this.hasLineOfSight(this.player.position, monster.position))
      .forEach((target) => {
        const result = CombatSystem.rollDamage(
          damage,
          stats.critChance,
          stats.critDamage,
          target.def.armor,
          this.floor,
          skill.element,
          target.def.resistances,
          target.statuses,
        );
        this.applyMonsterDamage(target, result.damage, result.crit, 0.85, undefined, skill.element);
        this.applyPlayerElementalHit(target, skill.element, damage, empowered ? 1 : skill.statusChance);
      });
  }

  private useLightningChain(stats: DerivedStats, skill: SkillState): void {
    const aim = this.controller.getAimDirection();
    const targets = this.getTargetsInFront(aim, 8, 1.35).slice(0, 4);
    if (targets.length === 0) return;
    this.audio.shoot();
    targets.forEach((target, index) => {
      const result = CombatSystem.rollDamage(
        stats.attack * Math.max(0.45, 1.35 - index * 0.25),
        stats.critChance,
        stats.critDamage,
        target.def.armor,
        this.floor,
        skill.element,
        target.def.resistances,
        target.statuses,
      );
      this.applyMonsterDamage(target, result.damage, result.crit, 0.45, undefined, skill.element);
      this.applyPlayerElementalHit(target, skill.element, stats.attack * Math.max(0.45, 1.35 - index * 0.25), skill.statusChance);
      this.effects.explosion(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x8ed4ff);
    });
  }

  private updateMonsters(dt: number): void {
    if (!this.floorData) return;
    this.encounterMechanics.update(dt, this.monsters, this.player, this.floorData, this.mechanicHost);
    if (this.isGameplayPaused() || !this.player.alive) return;
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      if (this.isGameplayPaused()) return;
      const monster = this.monsters[i];
      if (monster.dead) {
        monster.update(dt, this.elapsed);
        if (monster.removalTimer > 0.55) {
          this.disposeObject(monster.group);
          this.monsters.splice(i, 1);
        }
        continue;
      }

      const wasAttackState = monster.state === 'attack';
      const wasAliveBeforeUpdate = !monster.dead;
      if (monster.def.behavior === 'boss') {
        const host: BossHost = {
          damagePlayer: (amount, element, statusChance) => this.damagePlayerWithElement(amount, element, statusChance, 'boss_skill'),
          summonMinion: (position) => this.spawnBossMinion(position),
          showMessage: (title, subtitle) => this.hud.showCenterMessage(title, subtitle, 1.8),
        };
        if (monster.def.id === 'ruins_warden') this.finalBossController.update(dt, monster, this.player, this.floorData, {
          ...host,
          livingMinions: () => this.monsters.filter(other => !other.dead && other.roomId === monster.roomId && other !== monster).length,
        }, MonsterSpawner.baseAttack(monster, this.floor));
        else this.bossController.update(
          dt,
          monster,
          this.player,
          this.floorData,
          host,
          MonsterSpawner.baseAttack(monster, this.floor),
        );
      } else if (!this.encounterMechanics.handles(monster)) {
        MonsterAI.update(monster, dt, this.player, this.floorData);
      }
      this.encounterMechanics.afterAI(monster);
      monster.update(dt, this.elapsed);
      this.keepMonsterInBounds(monster);
      if (wasAliveBeforeUpdate && monster.dead) {
        this.onMonsterKilled(monster, false);
        if (this.isGameplayPaused()) return;
      }

      const dx = this.player.position.x - monster.position.x;
      const dz = this.player.position.z - monster.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (monster.dead || this.encounterMechanics.handles(monster)) continue;
      if (MonsterAI.shouldDealMelee(monster) && distance <= monster.def.attackRange + 0.5) {
        const damage = Math.max(1, MonsterSpawner.baseAttack(monster, this.floor));
        this.damagePlayerWithElement(damage, monster.def.element ?? 'physical', monster.def.statusChance, 'monster_melee');
        if (this.isGameplayPaused()) return;
        monster.attackCooldown = monster.def.attackCooldown;
        monster.state = 'chase';
      } else if (MonsterAI.shouldShoot(monster) && distance <= monster.def.attackRange + 4) {
        this.spawnEnemyProjectile(monster);
        monster.attackCooldown = monster.def.attackCooldown;
        monster.state = 'chase';
      }

      if (wasAttackState && monster.state !== 'attack' && monster.attackCooldown <= 0) {
        monster.attackCooldown = Math.max(.25, monster.def.attackCooldown*.65);
      }
    }

  }

  private keepMonsterInBounds(monster: Monster): void {
    const floorData = this.floorData;
    if (!floorData) return;
    const cellX = Math.floor(monster.position.x);
    const cellZ = Math.floor(monster.position.z);
    if (MonsterSpawner.isWalkableCell(floorData, cellX, cellZ)) return;

    const spot = MonsterSpawner.findNearestWalkable(floorData, monster.position.x, monster.position.z);
    if (!spot) {
      monster.position.x = Math.max(0.5, Math.min(floorData.size - 0.5, monster.position.x));
      monster.position.z = Math.max(0.5, Math.min(floorData.size - 0.5, monster.position.z));
      return;
    }
    monster.position.x = spot.x + 0.5;
    monster.position.z = spot.z + 0.5;
  }

  private spawnEnemyProjectile(monster: Monster): void {
    const start = monster.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const target = this.player.position.clone().add(new THREE.Vector3(0, 1.15, 0));
    const direction = target.sub(start).normalize();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4b4b }),
    );
    mesh.position.copy(start);
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      position: start,
      velocity: direction.multiplyScalar(11),
      damage: Math.max(1, MonsterSpawner.baseAttack(monster, this.floor)),
      life: 3,
      friendly: false,
      element: monster.def.element ?? 'physical',
      statusChance: monster.def.statusChance,
      traveled: 0,
      maxDistance: 10,
    });
    this.audio.shoot();
  }

  private damagePlayerWithElement(amount: number, element: ElementType, statusChance?: number, cause = 'unknown'): void {
    if (!this.running || !this.player.alive) return;
    if (this.player.invulnerable > 0) {
      this.player.interruptShieldRecovery();
      return;
    }
    const damage = Math.max(1, Math.round(amount));
    const wasAlive = this.player.alive;
    this.player.takeDamage(damage);
    if (this.player.lastHitDodged) {
      this.hud.spawnDamage('闪避', '#a7eadc', false, 0.85);
      return;
    }
    applyElementalHit(this.player, element, amount, statusChance);
    this.recordDeathTransition(wasAlive, cause, damage);
    this.audio.hurt();
    this.controller.addShake(0.16);
    this.hud.showCenterMessage('受到攻击', '', 0.35);
  }

  private spawnBossMinion(position: THREE.Vector3): void {
    if (!this.floorData) return;
    const rng = new RNG(((this.currentFloorSeed ^ Math.floor(position.x * 7919) ^ Math.floor(position.z * 7919)) >>> 0));
    const boss = this.monsters.find(monster => monster.def.behavior === 'boss' && !monster.dead);
    if (boss && this.monsters.filter(monster => !monster.dead && monster.roomId === boss.roomId && monster !== boss).length >= 4) return;
    const room = this.floorData.rooms.find(candidate => candidate.id === boss?.roomId);
    const spawnPosition = room ? findEncounterRoomPosition(this.floorData, room, position.x, position.z) : position;
    if (!spawnPosition) return;
    const minion = MonsterSpawner.spawnMinionAt(this.floorData, spawnPosition, rng);
    if (!minion) return;
    minion.maxHealth = Math.round(minion.maxHealth * 0.7);
    minion.health = minion.maxHealth;
    minion.roomId = boss?.roomId ?? '';
    minion.attackCooldown = 1.5;
    this.monsters.push(minion);
    this.scene.add(minion.group);
    this.effects.burst(minion.position.clone().add(new THREE.Vector3(0, 0.8, 0)), minion.def.color, 12, 3);
  }

  private updateProjectiles(dt: number): void {
    if (dt <= 0) return;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.isGameplayPaused()) return;
      const projectile = this.projectiles[i];
      const { hitWall, hitMonster, hitPlayer, expired } = stepProjectile(projectile,dt,this.floorData,this.monsters,this.player);
      projectile.mesh.position.copy(projectile.position);
      let remove = hitWall || hitPlayer || hitMonster !== null;
      if (hitMonster) {
        const crit = Math.random() < boundedCritChance(this.effectiveStats().critChance);
        const element = projectile.element ?? 'physical';
        const raw = projectile.damage * (crit ? this.effectiveStats().critDamage : 1);
        const damage = elementalDamage(raw * (1 - defenseMitigation(hitMonster.def.armor, this.floor)),
          element, hitMonster.def.resistances, hitMonster.statuses);
        this.applyMonsterDamage(hitMonster, damage, crit, projectile.impact ?? 0.7, projectile.position, element);
        if (this.isGameplayPaused()) return;
        const fire = projectile.fireModifiers ?? this.fireModifiers;
        if (element === 'fire' && fire.enabled) {
          this.igniteMonster(hitMonster, raw, fire);
          if (projectile.sourceSkillId === 'fireball') this.spreadFire(hitMonster, raw, fire);
        } else this.applyPlayerElementalHit(hitMonster, element, raw, projectile.statusChance);
        if (projectile.sourceSkillId === 'staff_attack') this.triggerBasicAttackEffects(hitMonster, this.effectiveStats());
        if ((projectile.piercesRemaining ?? 0) > 0 && !expired) {
          projectile.piercesRemaining!--;
          remove = false;
        }
      } else if (hitPlayer) {
        this.damagePlayerWithElement(projectile.damage, projectile.element ?? 'physical', projectile.statusChance, 'enemy_projectile');
        if (this.isGameplayPaused()) return;
      }
      if (remove) {
        this.effects.explosion(projectile.position, projectile.friendly ? 0xff8c1e : 0xff4b4b);
        if (hitWall) this.audio.explosion();
      } else if (expired) {
        if (projectile.sourceSkillId === 'fireball') this.effects.explosion(projectile.position, 0xff8c1e);
        else this.detonateProjectile(projectile);
        remove = true;
      }
      if (remove) {
        this.scene.remove(projectile.mesh);
        projectile.mesh.geometry.dispose();
        (projectile.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private detonateProjectile(projectile: Projectile): void {
    this.effects.explosion(projectile.position, projectile.friendly ? 0xff8c1e : 0xff4b4b);
    this.audio.explosion();
    const element = projectile.element ?? 'physical';

    if (projectile.friendly) {
      const stats = this.effectiveStats();
      const nearby = this.monsters.filter(
        (monster) => !monster.dead && monster.position.distanceTo(projectile.position) < 2.5,
      );
      nearby.forEach((monster) => {
        const result = CombatSystem.rollDamage(
          projectile.damage * 0.6,
          stats.critChance,
          stats.critDamage,
          monster.def.armor,
          this.floor,
          element,
          monster.def.resistances,
          monster.statuses,
        );
        this.applyMonsterDamage(monster, result.damage, result.crit, projectile.impact ?? 0.7, undefined, element);
        this.applyPlayerElementalHit(monster, element, projectile.damage * 0.6, projectile.statusChance);
      });
      return;
    }

    if (this.player.position.distanceTo(projectile.position) < 1.8) {
      this.damagePlayerWithElement(Math.max(1, Math.round(projectile.damage * 0.6)), element, projectile.statusChance, 'enemy_projectile_aoe');
    }
  }

  private applyMonsterDamage(monster: Monster, damage: number, crit: boolean, impact = 1, directSource?: THREE.Vector3, element: ElementType = 'physical', canLeech = true): void {
    if (monster.dead) return;
    if (this.equipment.hasSpecial('executeFullHealth') && this.player.health >= this.player.maxHealth) damage *= 1.25;
    if (directSource) damage = this.encounterMechanics.onDirectHit(monster, directSource, damage);
    if (monster.def.id === 'ruins_warden') damage = Math.max(1, Math.round(damage * this.finalBossController.damageMultiplier));
    damage = Math.max(1, Math.round(damage));
    const actualDamage = Math.min(monster.health, damage);
    const killed = monster.takeDamage(damage);
    if (canLeech) this.player.leech(actualDamage * this.effectiveStats().lifeSteal);
    const hitImpact = Math.max(0.25, Math.min(1.3, impact));
    monster.hitFlash = Math.max(monster.hitFlash, 0.05 + hitImpact * 0.07);
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.012 + hitImpact * 0.03);
    this.controller.addHitShake(hitImpact, crit);
    const color = DAMAGE_COLORS[element];
    this.hud.spawnDamage(String(damage), color, crit, crit ? 1.35 : 1);
    this.effects.burst(monster.position.clone().add(new THREE.Vector3(0, 0.8, 0)), monster.def.color, crit ? 10 : 5, crit ? 3 : 2);
    this.audio.hit(crit);
    if (crit) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.05);

    }
    if (killed) this.onMonsterKilled(monster, crit);
  }

  private onMonsterKilled(monster: Monster, crit: boolean): void {
    if (monster.def.id === 'ruins_warden') this.finalBossController.clear();
    else if (monster.def.behavior === 'boss') this.bossController.clearWarnings();
    this.kills++;
    this.player.heal(Math.min(this.effectiveStats().killHeal, this.player.maxHealth * 0.02));
    this.audio.kill();
    this.effects.burst(monster.position.clone().add(new THREE.Vector3(0, 0.9, 0)), monster.def.color, 22, 5);


    if (this.equipment.hasSpecial('explosiveKill')) {
      this.effects.explosion(monster.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7a2a);
      const nearby = this.monsters.filter(
        (other) => other !== monster && !other.dead && other.position.distanceTo(monster.position) < 3,
      );
      nearby.forEach((other) => {
        const damage = elementalDamage(this.effectiveStats().attack * 0.45 * (1 - defenseMitigation(other.def.armor, this.floor)),
          'fire', other.def.resistances, other.statuses);
        this.applyMonsterDamage(other, damage, false, 0.6, undefined, 'fire', false);
      });
    }

    const summonCap = this.equipment.hasSpecial('summonSkeletonOnKill') ? 4 : 0;
    if (this.summons.length < summonCap) {
      this.spawnSummonedSkeleton(monster.position.clone());
    }

    if (monster.elite) {
      this.changeGold(8 + this.floor * 3, 'elite_kill', { monsterId: monster.def.id });
      if (monster.eliteModifiers.includes('fireEnchanted')) {
        this.effects.explosion(monster.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff6a00);
        const nearby = this.monsters.filter(
          (other) => other !== monster && !other.dead && other.position.distanceTo(monster.position) < 3,
        );
        nearby.forEach((other) => {
          const damage = Math.max(1, Math.round(this.effectiveStats().attack * 0.3));
          this.applyMonsterDamage(other, damage, false, 0.6, undefined, 'fire', false);
        });
      }
      if (Math.random() < 0.4) {
        this.spawnDrop(monster.position, {
          kind: 'item',
          item: ItemGenerator.generate(this.floor, undefined, this.player.level, undefined, undefined, this.effectiveStats().luck),
        });
      }
    }

    this.comboCount = this.comboTimer > 0 ? this.comboCount + 1 : 1;
    this.comboTimer = 1.8;
    this.hud.setCombo(this.comboCount);

    const xp = MonsterSpawner.baseXp(monster, this.floor);
    this.addXp(xp);
    const drops = LootSystem.rollLoot(
      monster.def,
      this.floor,
      this.effectiveStats().luck,
      monster.def.behavior === 'boss',
      this.player.level,
    );
    drops.forEach((drop) => this.spawnDrop(monster.position, drop));
  }

  private spawnSummonedSkeleton(position: THREE.Vector3): void {
    const summon = new SummonedSkeleton(
      this.scene,
      position.x + (Math.random() - 0.5) * 0.5,
      position.z + (Math.random() - 0.5) * 0.5,
    );
    this.summons.push(summon);
    this.effects.burst(position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xe8e4d6, 12, 2.4);
  }

  private updateSummons(dt: number): void {
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const summon = this.summons[i];
      const target = summon.update(dt, this.monsters, this.player, this.elapsed);
      if (target && !target.dead) {
        const stats = this.effectiveStats();
        const result = CombatSystem.rollDamage(
          stats.attack * 0.55,
          stats.critChance,
          stats.critDamage,
          target.def.armor,
          this.floor,
          'physical',
          target.def.resistances,
          target.statuses,
        );
        this.applyMonsterDamage(target, result.damage, result.crit, 0.6, undefined, 'physical', false);
      }
      if (summon.life <= 0) {
        summon.dispose(this.scene);
        this.summons.splice(i, 1);
      }
    }
  }

  private addXp(amount: number): void {
    this.player.xp += amount;
    let leveled = false;
    while (this.player.xp >= xpToNext(this.player.level)) {
      this.player.xp -= xpToNext(this.player.level);
      this.player.level++;
      this.player.health = this.player.maxHealth;
      this.player.mana = this.player.maxMana;
      leveled = true;
      this.audio.levelUp();
    }
    if (leveled) {
      this.updatePlayerStats(this.effectiveStats());
      this.hud.showCenterMessage('升级！', `达到 Lv.${this.player.level} · 可用局内天赋 ${this.currentTalentBudget() - spentTalentPoints(this.runTalents)} 点，安全房可分配`, 2.2);
    }
  }

  private spawnDrop(position: THREE.Vector3, drop: LootDrop): void {
    const color =
      drop.kind === 'gold'
        ? 0xffd24a
        : drop.kind === 'health'
          ? 0xff4b4b
          : drop.kind === 'mana'
            ? 0x4da3ff
            : drop.kind === 'reforgeTicket'
              ? 0xd49bff
            : drop.kind === 'item'
              ? this.rarityColor(drop.item.rarity)
              : 0xffffff;
    const geometry =
      drop.kind === 'gold'
        ? new THREE.BoxGeometry(0.28, 0.12, 0.28)
        : drop.kind === 'health'
          ? new THREE.BoxGeometry(0.22, 0.32, 0.22)
          : drop.kind === 'mana'
            ? new THREE.BoxGeometry(0.22, 0.32, 0.22)
            : drop.kind === 'reforgeTicket'
              ? new THREE.BoxGeometry(0.34, 0.08, 0.26)
            : new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
    const pos = position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.drops.push({
      mesh,
      position: pos,
      kind: drop.kind,
      amount: drop.kind !== 'item' ? drop.amount : undefined,
      item: drop.kind === 'item' ? drop.item : undefined,
      bobPhase: Math.random() * Math.PI * 2,
      life: 30,
    });
  }

  private updateDrops(dt: number, stats: DerivedStats): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.life -= dt;
      drop.bobPhase += dt * 3;
      drop.mesh.position.y = drop.position.y + Math.sin(drop.bobPhase) * 0.12;
      drop.mesh.rotation.y += dt * 2;
      if (drop.life <= 0) {
        this.scene.remove(drop.mesh);
        drop.mesh.geometry.dispose();
        (drop.mesh.material as THREE.Material).dispose();
        this.drops.splice(i, 1);
        continue;
      }
      const dx = drop.position.x - this.player.position.x;
      const dz = drop.position.z - this.player.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < stats.pickupRange && this.pickupDrop(drop)) {
        this.scene.remove(drop.mesh);
        drop.mesh.geometry.dispose();
        (drop.mesh.material as THREE.Material).dispose();
        this.drops.splice(i, 1);
      }
    }
  }

  private pickupDrop(drop: DropEntity): boolean {
    if (drop.kind === 'gold') {
      this.changeGold(drop.amount ?? 0, 'loot_pickup');
      this.audio.coin();
      return true;
    } else if (drop.kind === 'health') {
      const amount = drop.amount ?? 0;
      this.player.heal(amount);
      this.hud.showCenterMessage(`生命药水 +${amount}`, '', 0.8);
      this.audio.pickup();
      return true;
    } else if (drop.kind === 'mana') {
      const amount = drop.amount ?? 0;
      this.player.addMana(amount);
      this.hud.showCenterMessage(`法力药水 +${amount}`, '', 0.8);
      this.audio.pickup();
      return true;
    } else if (drop.kind === 'reforgeTicket') {
      this.reforgeTickets += drop.amount ?? 1;
      this.audio.pickup();
      this.hud.showCenterMessage('获得重铸券', '可用于重铸装备', 1.2);
      return true;
    } else if (drop.kind === 'item' && drop.item) {
      if (this.inventory.add(drop.item)) {
        this.recordItemAcquired(drop.item, 'loot_pickup');
        this.audio.pickup();
        this.hud.showLootMessage(`获得 ${drop.item.name}`, this.rarityColor(drop.item.rarity));
        return true;
      } else {
        this.hud.showCenterMessage('背包已满', '无法拾取装备', 1.2);
        return false;
      }
    }
    return false;
  }

  private interactionLabel(): string | null {
    if (!this.floorData) return null;
    const p = this.player.position;
    const candidates: { label: string; distance: number }[] = [];
    const merchant = this.floorData.merchant;
    if (merchant) {
      const distance = Math.hypot(p.x - merchant.x - .5, p.z - merchant.z - .5);
      if (distance <= 2) candidates.push({ label: '进入商店', distance });
    }
    const room = this.encounters?.roomAt(p.x,p.z);
    if (room?.kind === 'sanctuary' && !this.encounters!.state.usedSanctuaries.includes(room.id!)
      && Math.hypot(p.x-roomCenter(room).x,p.z-roomCenter(room).z)<2) {
      candidates.push({ label: '圣所恢复', distance: Math.hypot(p.x-roomCenter(room).x,p.z-roomCenter(room).z) });
    }
    if (this.portalActive && Math.abs(Math.floor(p.x) - this.floorData.portal.x) <= 1
      && Math.abs(Math.floor(p.z) - this.floorData.portal.z) <= 1) {
      candidates.push({ label: '进入传送门', distance: Math.hypot(p.x-this.floorData.portal.x-.5,p.z-this.floorData.portal.z-.5) });
    }
    for (const chest of this.floorData.chests) {
      const distance = Math.hypot(p.x - chest.x - .5, p.z - chest.z - .5);
      if (!this.openedChests.has(`${chest.x},${chest.z}`) && distance <= 1.8) {
        candidates.push({ label: '打开宝箱', distance });
      }
    }
    // Nearby merchants must not capture every interaction with an adjacent exit.
    return candidates.sort((a, b) => a.distance - b.distance)[0]?.label ?? null;
  }

  private tryInteract(): boolean {
    if (!this.floorData || this.isGameplayPaused() || !this.player.alive) return false;
    const label = this.interactionLabel();
    if (label === '进入商店') {
      this.showShopMenu();
      return true;
    }
    if (label === '圣所恢复') {
      const room = this.encounters!.roomAt(this.player.position.x,this.player.position.z)!;
      this.encounters!.state.usedSanctuaries.push(room.id!);
      this.player.heal(this.player.maxHealth * 0.45);
      this.player.addMana(this.player.maxMana * 0.6);
      this.hud.showCenterMessage('圣所赐福', '恢复 45% 生命与 60% 法力', 1.5);
      this.saveGame();
      return true;
    }
    const playerX = Math.floor(this.player.position.x);
    const playerZ = Math.floor(this.player.position.z);

    if (label === '进入传送门' && this.portalActive) {
      const dx = playerX - this.floorData.portal.x;
      const dz = playerZ - this.floorData.portal.z;
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
        this.showFloorRestMenu();
        return true;
      }
    }

    if (label !== '打开宝箱') return false;
    const nearbyChests = [...this.floorData.chests].sort((a, b) =>
      Math.hypot(this.player.position.x-a.x-.5,this.player.position.z-a.z-.5)
      - Math.hypot(this.player.position.x-b.x-.5,this.player.position.z-b.z-.5));
    for (const chest of nearbyChests) {
      const key = `${chest.x},${chest.z}`;
      if (this.openedChests.has(key)) continue;
      const dx = this.player.position.x - (chest.x + 0.5);
      const dz = this.player.position.z - (chest.z + 0.5);
      if (Math.hypot(dx, dz) <= 1.8) {
        this.openedChests.add(key);
        this.reforgeTickets++;
        this.world.removeChest(chest.x, chest.z);
        const item = ItemGenerator.generate(this.floor, undefined, this.player.level, undefined, undefined, this.effectiveStats().luck);
        const gold = 10 + this.floor * 3;
        this.changeGold(gold, 'chest', { chest: key });
        if (this.inventory.add(item)) {
          this.recordItemAcquired(item, 'chest');
          this.audio.pickup();
          this.hud.showLootMessage(`宝箱：${item.name} + ${gold} 金币`, this.rarityColor(item.rarity));
        } else {
          this.spawnDrop(new THREE.Vector3(chest.x + 0.5, 0, chest.z + 0.5), { kind: 'item', item });
          this.hud.showCenterMessage('背包已满', '宝箱装备已掉落在地面', 1.4);
        }
        this.saveGame();
        return true;
      }
    }
    return false;
  }

  private async advanceFloor(): Promise<void> {
    if (this.loadingFloor) return;
    if (this.floor >= BASIC_RUN_DEFINITION.floorCount) {
      this.finishRun('victory');
      return;
    }
    this.floor++;
    this.player.heal(this.player.maxHealth * 0.25);
    this.player.addMana(this.player.maxMana * 0.5);
    if (!await this.generateCurrentFloor()) return;
    this.hud.showCenterMessage(`第 ${this.floor} 层`, this.floorData?.theme.name ?? '', 3);
    this.audio.portal();
    this.saveGame();
  }

  private finishRun(outcome: RunOutcome): void {
    const envelope = this.envelope;
    if (!envelope?.activeRun || this.failedSaveCandidate) return;
    const base = structuredClone(envelope);
    if (!base.activeRun) return;
    if (this.running) {
      base.activeRun.snapshot = this.captureRunSnapshot();
      base.activeRun.maxLevel = Math.max(base.activeRun.maxLevel, this.player.level);
      base.activeRun.upgradeCount = Math.max(base.activeRun.upgradeCount, this.upgradeCount);
    }
    base.revision += 1;
    const candidate = RunManager.finish(base, outcome, Date.now());
    const record = candidate.pendingSettlement;
    if (!record) return;
    this.running = false;
    this.paused = true;
    this.input.reset();
    this.attackBuffer = 0;
    this.player.moving = false;
    this.player.sprinting = false;
    this.audio.stopWalk();
    if (document.pointerLockElement) document.exitPointerLock();
    this.inventoryUI.close(false);
    this.closeSellOverlay();
    this.closeCraftOverlay();
    this.removePauseMenu();
    this.removeFloorRestMenu();
    this.closeAttributeAllocation();
    this.closeSkillBar();
    this.mobileBack.clear();
    const saved = this.commitEnvelope(
      candidate,
      () => this.showSettlement(record, true),
      (error) => this.showSettlement(record, false, error),
    );
    this.playtestRecorder.record('run_settled', {
      runId: record.runId,
      outcome: record.outcome,
      floor: record.finalFloor,
      level: record.finalLevel,
      completedObjectives: record.completedObjectives,
      totalXp: record.totalXp,
      pointsEarned: record.pointsEarned,
      saved,
    });
  }

  private getTargetsInFront(aim: THREE.Vector3, range: number, halfAngle: number): Monster[] {
    const targets: Monster[] = [];
    for (const monster of this.monsters) {
      if (monster.dead) continue;
      const offset = new THREE.Vector3(
        monster.position.x - this.player.position.x,
        0,
        monster.position.z - this.player.position.z,
      );
      const distance = offset.length();
      if (distance > 0 && this.floorData) {
        const origin = this.player.position.clone().add(new THREE.Vector3(0, 1.1, 0));
        if (worldRayDistance(this.floorData, origin, offset.clone().normalize(), distance) < distance - 0.05) continue;
      }
      if (distance <= range) {
        if (distance < 0.7) {
          targets.push(monster);
          continue;
        }
        const dot = aim.dot(offset.normalize());
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle <= halfAngle) {
          targets.push(monster);
        }
      }
    }
    return targets.sort((a, b) => a.position.distanceToSquared(this.player.position) - b.position.distanceToSquared(this.player.position));
  }

  private updateAimIndicator(): void {
    this.aimGuide.mesh.visible = false;
    const visible = this.running && !this.loadingFloor && this.player.alive && !this.paused && !this.restOpen
      && !this.attributeOpen && !this.skillOpen && !this.inventoryUI.open;
    this.hud.setInteraction(visible && !this.mobile ? this.interactionLabel() : null);
    this.touchControls?.setGameplayState(visible, this.controller.isFirstPerson, visible ? this.interactionLabel() : null);
    if (!visible || this.controller.isFirstPerson) {
      this.hud.setAimPoint(0, 0, visible, false);
      return;
    }
    const origin = this.controller.getProjectileOrigin();
    const weapon = this.equipment.get('weapon');
    const aimingSkill = this.controller.isTouchAiming ? this.skills.find(skill => skill.key === this.touchAimSkill) : undefined;
    const ranged = aimingSkill?.id === 'fireball' || this.isStaffWeapon(weapon);
    const aim = ranged ? this.controller.getProjectileDirection(this.monsters) : this.basicAimDirection();
    const skillRanges: Record<string, number> = { fireball: 10, dash: 3.9, whirlwind: 4.4, frost_nova: 5, lightning_chain: 8 };
    const range = aimingSkill ? skillRanges[aimingSkill.id] ?? 8 : ranged ? 10 : this.getMeleeProfile(weapon).range;
    const distance = this.floorData ? worldRayDistance(this.floorData, origin, aim, range) : range;
    if (this.controller.isTouchAiming) this.aimGuide.show(this.player.position, aim, distance);
    const point = origin.addScaledVector(aim, Math.max(0, distance - 0.05)).project(this.camera);
    this.hud.setAimPoint(point.x, point.y, point.z > -1 && point.z < 1, true, distance < range);
  }

  private updateSkills(dt: number): void {
    for (const id of Object.keys(this.skillCooldowns)) this.skillCooldowns[id] = Math.max(0, this.skillCooldowns[id] - dt);
    this.skills.forEach((skill) => {
      skill.cooldownRemaining = this.skillCooldowns[skill.id] ?? 0;
    });
  }

  private updateCombo(dt: number): void {
    if (this.comboCount > 1) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.hud.setCombo(0);
      }
    }
  }

  private updatePlayerStats(stats: DerivedStats): void {
    this.player.defense = stats.defense;
    this.player.dodgeChance = stats.dodgeChance;
    this.player.defenseFloor = this.floor;
    this.player.maxHealth = Math.round(stats.maxHealth);
    this.player.maxMana = Math.round(stats.maxMana);
    const aegisCount = this.equipment.getSpecialCount('aegisWalk');
    this.player.setShieldCapacity(stats.armor + this.player.maxHealth * 0.2 * aegisCount);
    this.player.shieldRechargeDelay = stats.shieldRechargeDelay;
    this.player.movingShieldRecovery = this.player.maxHealth * 0.01 * aegisCount;
    this.player.health = Math.min(this.player.health, this.player.maxHealth);
    this.player.mana = Math.min(this.player.mana, this.player.maxMana);
  }

  private updateWeaponVisual(): void {
    const weapon = this.equipment.get('weapon');
    this.player.setWeapon(weapon);
    this.firstPersonView.setWeapon(weapon);
  }

  private effectiveStats(): DerivedStats {
    return this.equipment.getDerivedStats(this.bonusAttributes);
  }

  private newGameSeed(): number {
    const value = new URL(window.location.href).searchParams.get('seed');
    if (value !== null && /^\d+$/.test(value)) {
      const parsed = Number(value);
      if (Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff) return parsed >>> 0;
    }
    return Math.floor(Math.random() * 0xffffffff);
  }

  private startPlaytestSession(mode: 'new' | 'continue'): void {
    this.playtestRecorder.startSession({
      baseline: 'f947e70',
      mode,
      partialSession: true,
      scopeNote: 'A playtest session from new/continue selection; it is not necessarily a complete run.',
      timingBasis: 'foregroundRafSeconds',
      seed: this.seed,
      saveSlot: this.saveSlot,
      startFloor: this.floor,
      initialGold: this.gold,
    });
    this.lastPlaytestFrameTime = performance.now();
    this.skipPlaytestFrameTime = true;
  }

  private playtestPhase(): PlaytestPhase {
    if (this.paused || this.restOpen || this.attributeOpen || this.inventoryUI.open || this.skillOpen
      || this.sellOverlay !== null || this.craftOverlay !== null) return 'menu';
    return this.monsters.some(monster => !monster.dead) ? 'combat' : 'exploration';
  }

  private changeGold(amount: number, source: string, context: Record<string, unknown> = {}): void {
    if (amount === 0) return;
    const balanceBefore = this.gold;
    this.gold += amount;
    this.playtestRecorder.record('gold_changed', {
      amount,
      source,
      balanceBefore,
      balanceAfter: this.gold,
      floor: this.floor,
      ...context,
    });
  }

  private recordItemAcquired(item: Item, source: string): void {
    this.playtestRecorder.record('item_acquired', {
      source,
      floor: this.floor,
      itemId: item.id,
      itemName: item.name,
      slot: item.slot,
      rarity: item.rarity,
      itemLevel: item.itemLevel,
    });
  }

  private recordDeathTransition(wasAlive: boolean, cause: string, incomingDamage?: number): void {
    if (!wasAlive || this.player.alive) return;
    this.playtestRecorder.record('player_died', {
      cause,
      incomingDamage,
      floor: this.floor,
      floorSeed: this.currentFloorSeed,
      level: this.player.level,
      position: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
      health: this.player.health,
      mana: this.player.mana,
      shield: this.player.shield,
      statuses: this.player.statuses,
      equipment: Object.fromEntries(Object.entries(this.equipment.equipment).map(([slot, item]) => [slot, item ? {
        id: item.id,
        name: item.name,
        rarity: item.rarity,
        itemLevel: item.itemLevel,
      } : null])),
      goldAtDeath: this.gold,
      endsRun: true,
    });
    this.finishRun('death');
  }

  private resourceSnapshot(): Record<string, unknown> {
    return {
      floor: this.floor,
      floorSeed: this.currentFloorSeed,
      gold: this.gold,
      materials: { ...this.materialCounts },
      reforgeTickets: this.reforgeTickets,
      level: this.player.level,
      xp: this.player.xp,
      health: this.player.health,
      mana: this.player.mana,
      inventoryCount: this.inventory.items.length,
      kills: this.kills,
    };
  }

  private recordResourceSnapshot(reason: string): void {
    this.playtestRecorder.record('resource_snapshot', { reason, ...this.resourceSnapshot() });
  }

  private hudState() {
    return {
      level: this.player.level,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      mana: this.player.mana,
      maxMana: this.player.maxMana,
      xp: this.player.xp,
      xpToNext: xpToNext(this.player.level),
      floor: this.floor,
      floorName: this.floorData?.theme.name ?? '',
      gold: this.gold,
      monstersRemaining: this.monsters.filter((monster) => !monster.dead).length,
      kills: this.kills,
      shield: this.player.shield,
    };
  }

  private skillHudStates(): SkillHUDState[] {
    return this.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      key: skill.key,
      cooldown: skill.cooldown,
      cooldownRemaining: skill.cooldownRemaining,
      manaCost: skill.manaCost,
    }));
  }

  private buildSkillStates(): SkillState[] {
    for (const skill of this.skills) this.skillCooldowns[skill.id] = skill.cooldownRemaining;
    const states: SkillState[] = [];
    for (const id of this.skillLoadout.slice(0, 4)) {
      const def = skillById(id);
      if (!def || !this.isSkillUnlocked(id)) continue;
      states.push({
        id: def.id,
        name: def.name,
        key: def.key,
        baseCooldown: def.cooldown * (def.id === 'fireball' ? this.fireModifiers.fireballCooldownMultiplier : 1),
        cooldown: def.cooldown * (def.id === 'fireball' ? this.fireModifiers.fireballCooldownMultiplier : 1),
        cooldownRemaining: this.skillCooldowns[def.id] ?? 0,
        manaCost: Math.max(0, Math.round(def.manaCost * (def.id === 'fireball' ? this.fireModifiers.fireballManaCostMultiplier : 1))),
        element: def.element,
        statusChance: def.statusChance,
        icon: def.icon,
      });
    }
    return states;
  }

  private isSkillUnlocked(id: string): boolean {
    const def = skillById(id);
    if (!def) return false;
    if (!def.talentId) return true;
    if (id === 'frost_nova') return this.equipment.hasSpecial('glacialNova');
    if (id === 'lightning_chain') return this.equipment.hasSpecial('shockMastery');
    return def.id === 'detonate' && this.runTalents.unlocked.includes('consuming_flame');
  }

  private equipFromInventory(index: number): void {
    const item = this.inventory.items[index];
    if (!item) return;
    if (item.requiredLevel > this.player.level) {
      this.hud.showCenterMessage('等级不足', `需要 Lv.${item.requiredLevel}`, 1.5);
      return;
    }
    this.inventory.remove(index);
    const previous = this.equipment.equip(item);
    if (previous) this.inventory.add(previous);
    this.updatePlayerStats(this.effectiveStats());
    this.updateWeaponVisual();
    this.inventoryUI.show(this.equipment, this.inventory);
    this.skills = this.buildSkillStates();
  }

  private unequipSlot(slot: Slot): void {
    const item = this.equipment.unequip(slot);
    if (!item) return;
    if (this.inventory.add(item)) {
      this.updatePlayerStats(this.effectiveStats());
      this.updateWeaponVisual();
      this.skills = this.buildSkillStates();
      this.showInventory();
    } else {
      this.equipment.equip(item);
      this.hud.showCenterMessage('背包已满', '无法卸下装备', 1.4);
      this.showInventory();
    }
  }

  private confirmSell(index: number): void {
    if (!this.shopOpen) return;
    const item = this.inventory.items[index];
    if (!item) return;
    this.closeSellOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'sunlit-menu-overlay sunlit-fixed-overlay';

    const panel = document.createElement('div');
    panel.className = 'panel sunlit-confirm-panel';
    const title = document.createElement('h2');
    title.textContent = '确认出售';
    title.className = 'sunlit-menu-title';
    panel.appendChild(title);
    const info = document.createElement('div');
    info.className = 'sunlit-confirm-copy';
    info.textContent = `${item.name} · 售价 ${item.sellPrice} 金币`;
    panel.appendChild(info);
    const confirm = this.makeMenuButton('确认出售');
    confirm.onclick = () => {
      this.closeSellOverlay();
      this.sellFromInventory(index);
    };
    panel.appendChild(confirm);
    const cancel = this.makeMenuButton('取消');
    cancel.classList.add('is-secondary');
    cancel.onclick = () => this.closeSellOverlay();
    panel.appendChild(cancel);

    overlay.appendChild(panel);
    this.sellOverlay = overlay;
    document.body.appendChild(overlay);
    this.addPanelCloseButton(panel, () => this.closeSellOverlay());
    this.mobileBack.register('sell', () => this.closeSellOverlay());
  }

  private closeSellOverlay(): void {
    this.mobileBack.unregister('sell');
    this.sellOverlay?.remove();
    this.sellOverlay = null;
  }

  private confirmSalvage(index: number): void {
    const item = this.inventory.items[index];
    if (!item) return;
    const yields = CraftingSystem.salvageYield(item);
    const info = yields.map((entry) => `${this.materialLabel(entry.materialId)} +${entry.amount}`).join(' · ') || '无材料';
    this.showCraftOverlay('确认分解', `${item.name} → ${info}`, () => this.salvageFromInventory(index));
  }

  private confirmUpgrade(index: number): void {
    const item = this.inventory.items[index];
    if (!item) return;
    const cost = CraftingSystem.upgradeCost(item);
    const affordable = this.canPayCost(cost);
    if (!affordable) this.audio.uiError();
    this.showCraftOverlay(
      affordable ? '确认升级' : '无法升级',
      `${item.name} → 等级 ${item.itemLevel + 1}<br>${this.formatCost(cost)}<br>当前 ${this.materialStatusText()}${affordable ? '' : '<br><span style="color:#ff7b7b">材料不足，无法升级</span>'}`,
      () => this.upgradeFromInventory(index),
      !affordable,
    );
  }

  private confirmReforge(index: number): void {
    const item = this.inventory.items[index];
    if (!item) return;
    const affordable = this.reforgeTickets >= 1;
    if (!affordable) this.audio.uiError();
    this.showCraftOverlay(
      affordable ? '确认重铸' : '无法重铸',
      `${item.name} 将重新随机词条<br>重铸券 x1<br>当前 重铸券 ${this.reforgeTickets}${affordable ? '' : '<br><span style="color:#ff7b7b">重铸券不足，无法重铸</span>'}`,
      () => this.reforgeFromInventory(index),
      !affordable,
    );
  }

  private materialStatusText(): string {
    const materials = MATERIAL_ORDER.map((id) => `${this.materialLabel(id)} ${this.materialCount(id)}`).join(' · ');
    return `重铸券 ${this.reforgeTickets}${materials ? ` · ${materials}` : ''}`;
  }

  private showCraftOverlay(title: string, infoHTML: string, onConfirm: () => void, confirmDisabled = false): void {
    this.closeCraftOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'sunlit-menu-overlay sunlit-fixed-overlay';

    const panel = document.createElement('div');
    panel.className = 'panel sunlit-confirm-panel';
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.className = 'sunlit-menu-title';
    panel.appendChild(titleEl);
    const info = document.createElement('div');
    info.className = 'sunlit-confirm-copy';
    info.innerHTML = infoHTML;
    panel.appendChild(info);
    const confirm = this.makeMenuButton(confirmDisabled ? '资源不足' : '确认');
    confirm.disabled = confirmDisabled;
    confirm.onclick = () => {
      if (confirmDisabled) return;
      this.audio.uiConfirm();
      this.closeCraftOverlay();
      onConfirm();
    };
    panel.appendChild(confirm);
    const cancel = this.makeMenuButton('取消');
    cancel.classList.add('is-secondary');
    cancel.onclick = () => {
      this.audio.uiClick();
      this.closeCraftOverlay();
    };
    panel.appendChild(cancel);

    overlay.appendChild(panel);
    this.craftOverlay = overlay;
    document.body.appendChild(overlay);
    this.addPanelCloseButton(panel, () => this.closeCraftOverlay());
    this.mobileBack.register('craft', () => this.closeCraftOverlay());
  }

  private closeCraftOverlay(): void {
    this.mobileBack.unregister('craft');
    this.craftOverlay?.remove();
    this.craftOverlay = null;
  }

  private sellFromInventory(index: number): void {
    if (!this.shopOpen) return;
    const item = this.inventory.remove(index);
    if (!item) return;
    this.changeGold(item.sellPrice, 'shop_sell_item', { itemId: item.id, itemName: item.name });
    this.playtestRecorder.record('shop_transaction', { action: 'sell_item', itemId: item.id, itemName: item.name, quantity: 1, goldAmount: item.sellPrice, floor: this.floor });
    this.audio.coin();
    this.saveGame();
    this.showShopMenu(`已出售 ${item.name}`);
  }

  private confirmSellAll(maxRarity: Rarity): void {
    if (!this.shopOpen) return;
    const maxIndex = RARITY_ORDER.indexOf(maxRarity);
    const eligible = this.inventory.items.filter((item) => RARITY_ORDER.indexOf(item.rarity) <= maxIndex);
    if (eligible.length === 0) {
      this.hud.showCenterMessage('没有可出售的装备', `${this.rarityLabel(maxRarity)}及以下没有装备`, 1.5);
      return;
    }
    const total = eligible.reduce((sum, item) => sum + item.sellPrice, 0);
    this.showCraftOverlay(
      '确认一键出售',
      `出售 ${eligible.length} 件 ${this.rarityLabel(maxRarity)}及以下装备<br>获得金币 ${total}`,
      () => this.sellAllBelow(maxRarity),
    );
  }

  private confirmSalvageAll(maxRarity: Rarity): void {
    const maxIndex = RARITY_ORDER.indexOf(maxRarity);
    const eligible = this.inventory.items.filter(item => RARITY_ORDER.indexOf(item.rarity) <= maxIndex);
    if (!eligible.length) {
      this.hud.showCenterMessage('没有可分解的装备', `${this.rarityLabel(maxRarity)}及以下没有装备`, 1.5);
      return;
    }
    const yields = CraftingSystem.bulkSalvageYield(eligible);
    const rewards = yields.map(entry => `${this.materialLabel(entry.materialId)} ×${entry.amount}`).join(' · ') || '无材料';
    this.showCraftOverlay('确认一键分解',
      `分解背包中 ${eligible.length} 件 ${this.rarityLabel(maxRarity)}及以下装备<br>获得：${rewards}<br>已穿戴装备不受影响`, () => {
        // Act on the previewed objects only; newly acquired items are not included.
        const selected = new Set(eligible);
        const removed = this.inventory.items.filter(item => selected.has(item));
        this.inventory.items = this.inventory.items.filter(item => !selected.has(item));
        this.addMaterials(CraftingSystem.bulkSalvageYield(removed));
        this.playtestRecorder.record('craft_completed', {
          action: 'bulk_salvage',
          floor: this.floor,
          itemCount: removed.length,
          itemIds: removed.map(item => item.id),
        });
        this.audio.pickup();
        this.showInventory();
        this.saveGame();
        this.hud.showCenterMessage(`已分解 ${removed.length} 件装备`, '材料已收入背包', 1.8);
      });
  }

  private sellAllBelow(maxRarity: Rarity): void {
    if (!this.shopOpen) return;
    const maxIndex = RARITY_ORDER.indexOf(maxRarity);
    let total = 0;
    let count = 0;
    for (let i = this.inventory.items.length - 1; i >= 0; i--) {
      const item = this.inventory.items[i];
      if (RARITY_ORDER.indexOf(item.rarity) <= maxIndex) {
        this.inventory.remove(i);
        total += item.sellPrice;
        count++;
      }
    }
    if (count === 0) return;
    this.changeGold(total, 'shop_sell_items', { quantity: count, maxRarity });
    this.playtestRecorder.record('shop_transaction', { action: 'sell_items', quantity: count, maxRarity, goldAmount: total, floor: this.floor });
    this.audio.coin();
    this.showShopMenu(`已出售 ${count} 件装备，获得 ${total} 金币`);
    this.hud.showCenterMessage(`已出售 ${count} 件装备`, `获得 ${total} 金币`, 1.8);
    this.saveGame();
  }

  private rarityLabel(rarity: Rarity): string {
    const labels: Record<Rarity, string> = {
      common: '普通',
      magic: '魔法',
      rare: '稀有',
      epic: '史诗',
      legendary: '传说',
    };
    return labels[rarity] ?? rarity;
  }

  private materialCount(id: MaterialId): number {
    return this.materialCounts[id] ?? 0;
  }

  private materialLabel(id: MaterialId): string {
    return MATERIALS[id]?.name ?? id;
  }

  private addMaterials(costs: { materialId: MaterialId; amount: number }[]): void {
    costs.forEach((cost) => {
      this.materialCounts[cost.materialId] = (this.materialCounts[cost.materialId] ?? 0) + cost.amount;
    });
  }

  private canPayCost(costs: { gold: number; materials: { materialId: MaterialId; amount: number }[] }): boolean {
    if (this.gold < costs.gold) return false;
    return costs.materials.every((cost) => this.materialCount(cost.materialId) >= cost.amount);
  }

  private payCost(costs: { gold: number; materials: { materialId: MaterialId; amount: number }[] }): void {
    this.changeGold(-costs.gold, 'craft_cost');
    costs.materials.forEach((cost) => {
      this.materialCounts[cost.materialId] = Math.max(0, (this.materialCounts[cost.materialId] ?? 0) - cost.amount);
    });
  }

  private formatCost(costs: { gold: number; materials: { materialId: MaterialId; amount: number }[] }): string {
    const materialText = costs.materials.map((cost) => `${this.materialLabel(cost.materialId)} x${cost.amount}`).join(' · ');
    return `金币 ${costs.gold}${materialText ? ` · ${materialText}` : ''}`;
  }

  private salvageFromInventory(index: number): void {
    const item = this.inventory.remove(index);
    if (!item) return;
    const yields = CraftingSystem.salvageYield(item);
    this.addMaterials(yields);
    this.playtestRecorder.record('craft_completed', {
      action: 'salvage',
      floor: this.floor,
      itemId: item.id,
      itemName: item.name,
      materialsGained: yields,
    });
    const text = yields.map((yieldItem) => `${this.materialLabel(yieldItem.materialId)} +${yieldItem.amount}`).join(' · ') || '无材料';
    this.hud.showLootMessage(`分解 ${item.name}：${text}`, this.rarityColor(item.rarity));
    this.audio.pickup();
    this.showInventory();
    this.saveGame();
  }

  private upgradeFromInventory(index: number): void {
    const item = this.inventory.items[index];
    if (!item) return;
    const cost = CraftingSystem.upgradeCost(item);
    if (!this.canPayCost(cost)) {
      this.audio.uiError();
      this.hud.showCenterMessage('无法升级：材料不足', this.formatCost(cost), 1.8);
      return;
    }
    this.payCost(cost);
    const upgraded = CraftingSystem.upgradeItem(item);
    this.inventory.items[index] = upgraded;
    this.upgradeCount++;
    if (this.envelope?.activeRun) this.envelope.activeRun.upgradeCount = this.upgradeCount;
    this.playtestRecorder.record('craft_completed', {
      action: 'upgrade',
      floor: this.floor,
      itemId: item.id,
      itemName: item.name,
      itemLevelBefore: item.itemLevel,
      itemLevelAfter: upgraded.itemLevel,
      cost,
    });
    this.audio.levelUp();
    this.showInventory();
    this.hud.showCenterMessage('升级成功', `${item.name} → Lv.${item.itemLevel + 1}`, 1.6);
    this.saveGame();
  }

  private reforgeFromInventory(index: number): void {
    const item = this.inventory.items[index];
    if (!item) return;
    if (this.reforgeTickets < 1) {
      this.audio.uiError();
      this.hud.showCenterMessage('无法重铸：重铸券不足', '击败怪物有 2% 概率掉落重铸券', 1.8);
      return;
    }
    this.reforgeTickets--;
    const reforged = CraftingSystem.reforgeItem(item);
    this.inventory.items[index] = reforged;
    this.playtestRecorder.record('craft_completed', {
      action: 'reforge',
      floor: this.floor,
      itemId: item.id,
      itemNameBefore: item.name,
      itemNameAfter: reforged.name,
      reforgeTicketsSpent: 1,
    });
    this.audio.pickup();
    this.showInventory();
    this.hud.showLootMessage(`重铸完成：${reforged.name}`, this.rarityColor(reforged.rarity));
    this.saveGame();
  }

  private rarityColor(rarity: string): number {
    const colors: Record<string, number> = {
      common: 0xc9ced6,
      magic: 0x4da3ff,
      rare: 0xffe14d,
      epic: 0xc05bff,
      legendary: 0xff8a1e,
    };
    return colors[rarity] ?? 0xc9ced6;
  }

  private captureRunSnapshot(): SaveData {
    const data: SaveData = {
      version: 2,
      floorProgress: this.encounters?.state,
      openedChests: [...this.openedChests],
      runTalents: structuredClone(this.runTalents),
      mapGenerationVersion: this.floorData?.generationVersion ?? 1,
      mapLayoutKind: this.floorData?.layoutKind,
      floor: this.floor,
      seed: this.seed,
      player: {
        level: this.player.level,
        xp: this.player.xp,
        xpToNext: xpToNext(this.player.level),
        attributePoints: 0,
        firstPerson: this.controller.isFirstPerson,
        stats: this.bonusAttributes,
        position: {
          x: this.player.position.x,
          y: this.player.position.y,
          z: this.player.position.z,
        },
        health: this.player.health,
        mana: this.player.mana,
      },
      gold: this.gold,
      materials: this.materials,
      materialCounts: this.materialCounts,
      reforgeTickets: this.reforgeTickets,
      monsters: this.serializeMonsters(),
      portalActive: this.portalActive,
      inventory: this.inventory.items,
      equipment: this.equipment.equipment,
      kills: this.kills,
      skillLoadout: [...this.skillLoadout],
      shopStock: [...this.shopStock],
      shopFloor: this.shopFloor,
      shopRefreshes: this.shopRefreshes,
      shopGambles: this.shopGambles,
      shopHeals: this.shopHeals,
      playerStatuses: this.player.statuses,
      runtime: {
        finalBoss: this.monsters.some(monster => monster.def.id === 'ruins_warden' && !monster.dead) ? this.finalBossController.snapshot() : undefined,
        elapsed: Math.max(0, this.elapsed),
        shield: Math.max(0, this.player.shield),
        shieldRechargeElapsed: this.player.shieldRechargeElapsed,
        invulnerable: Math.max(0, this.player.invulnerable),
        attackTimer: Math.max(0, this.attackTimer),
        comboCount: Math.max(0, this.comboCount),
        comboTimer: Math.max(0, this.comboTimer),
        lowHealthShieldCooldown: Math.max(0, this.lowHealthShieldCooldown),
        skillCooldowns: { ...this.skillCooldowns },
      },
    };
    return data;
  }

  private saveGame(): boolean {
    if (!this.envelope?.activeRun) return true;
    if (this.failedSaveCandidate) return false;
    const candidate = structuredClone(this.envelope);
    if (!candidate.activeRun) return true;
    candidate.activeRun.maxLevel = Math.max(candidate.activeRun.maxLevel, this.player.level);
    candidate.activeRun.upgradeCount = Math.max(candidate.activeRun.upgradeCount, this.upgradeCount);
    candidate.activeRun.snapshot = this.captureRunSnapshot();
    candidate.revision += 1;
    const resumeAfterRetry = () => {
      this.removeStartMenu();
      this.paused = false;
      this.lastTime = performance.now();
      if (this.attributeOpen) this.renderCharacterPanel();
      if (this.skillOpen) this.renderSkillPanel();
      if (this.running) this.requestPointerLock();
    };
    const result = SaveManager.saveEnvelope(candidate, this.saveSlot);
    if (result.ok) {
      this.envelope = candidate;
      return true;
    }
    this.failedSaveCandidate = candidate;
    this.retryAfterSave = resumeAfterRetry;
    this.paused = true;
    this.input.reset();
    this.attackBuffer = 0;
    this.showSaveRetry(result.error);
    return false;
  }
}

import * as THREE from 'three';
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
import { MonsterSpawner } from '../monsters/MonsterSpawner';
import { SummonedSkeleton } from '../monsters/SummonedSkeleton';
import { BossController, type BossHost } from '../monsters/BossController';
import { generateFloor } from '../world/FloorGenerator';
import { World } from '../world/World';
import { RNG } from '../utils/RNG';
import { RARITY_COLORS, RARITY_ORDER, xpToNext } from '../data/recipes';
import type { ActorStatus, ElementType, Item, MaterialId, Rarity, SaveData, SavedMonster, ShopStockEntry, Slot, StatMap } from '../types';
import { DEFAULT_SKILL_LOADOUT, SKILLS, keyToLabel, skillById } from '../data/skills';
import { MATERIALS, MATERIAL_ORDER } from '../data/materials';
import { elementalDamage, applyElementalHit, type StatusedActor } from '../combat/ElementSystem';
import { ShopSystem } from '../items/ShopSystem';
import { CraftingSystem } from '../items/CraftingSystem';
import { AudioManager } from './AudioManager';
import { Effects } from './Effects';
import { InputManager } from './InputManager';
import { SaveManager } from './SaveManager';
import { SettingsManager } from './SettingsManager';
import { PerformanceTierDetector } from './Performance';
import { MobileBackHandler } from './MobileBackHandler';
import { HUD, type SkillHUDState } from '../ui/HUD';
import { InventoryUI } from '../ui/InventoryUI';
import { Minimap } from '../ui/Minimap';
import { itemTooltipHTML } from '../ui/ItemTooltip';
import { TouchControls } from '../ui/TouchControls';
import { isMobileDevice } from '../utils/mobile';

interface Projectile {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  life: number;
  friendly: boolean;
  element?: ElementType;
  statusChance?: number;
  radius?: number;
  impact?: number;
  traveled: number;
  maxDistance?: number;
}

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

interface TalentDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requiredAllocated: number;
  group: string;
  requires?: string[];
  passive?: StatMap;
  skill?: { name: string; key: string; cooldown: number; manaCost: number };
}

const TALENT_DEFS: TalentDef[] = [
  {
    id: 'veteran_strength',
    name: '老兵之力',
    desc: '力量 +3',
    cost: 1,
    requiredAllocated: 0,
    group: '力量',
    passive: { strength: 3 },
  },
  {
    id: 'keen_reflexes',
    name: '敏锐反射',
    desc: '敏捷 +3',
    cost: 1,
    requiredAllocated: 0,
    group: '敏捷',
    passive: { agility: 3 },
  },
  {
    id: 'scholar_insight',
    name: '学者洞见',
    desc: '智力 +3',
    cost: 1,
    requiredAllocated: 0,
    group: '奥术',
    passive: { intelligence: 3 },
  },
  {
    id: 'sturdy_bones',
    name: '坚韧骨骼',
    desc: '体力 +3',
    cost: 1,
    requiredAllocated: 0,
    group: '生存',
    passive: { vitality: 3 },
  },
  {
    id: 'titan_grip',
    name: '泰坦之握',
    desc: '攻击 +5',
    cost: 1,
    requiredAllocated: 2,
    group: '力量',
    requires: ['veteran_strength'],
    passive: { attack: 5 },
  },
  {
    id: 'swift_strikes',
    name: '迅捷打击',
    desc: '攻击速度 +8%',
    cost: 1,
    requiredAllocated: 2,
    group: '敏捷',
    requires: ['keen_reflexes'],
    passive: { attackSpeed: 0.08 },
  },
  {
    id: 'iron_will',
    name: '钢铁意志',
    desc: '护甲 +6',
    cost: 1,
    requiredAllocated: 2,
    group: '生存',
    requires: ['sturdy_bones'],
    passive: { armor: 6 },
  },
  {
    id: 'vampirism',
    name: '吸血',
    desc: '生命偷取 +4%',
    cost: 1,
    requiredAllocated: 4,
    group: '力量',
    requires: ['titan_grip'],
    passive: { lifeSteal: 0.04 },
  },
  {
    id: 'precision',
    name: '精准',
    desc: '暴击率 +4%',
    cost: 1,
    requiredAllocated: 3,
    group: '敏捷',
    requires: ['swift_strikes'],
    passive: { critChance: 0.04 },
  },
  {
    id: 'assassin',
    name: '刺客本能',
    desc: '暴击伤害 +15%',
    cost: 2,
    requiredAllocated: 5,
    group: '敏捷',
    requires: ['precision'],
    passive: { critDamage: 0.15 },
  },
  {
    id: 'mana_spring',
    name: '法力之泉',
    desc: '法力回复 +1.2/s',
    cost: 1,
    requiredAllocated: 2,
    group: '奥术',
    requires: ['scholar_insight'],
    passive: { manaRegen: 1.2 },
  },
  {
    id: 'arcane_reservoir',
    name: '奥术池',
    desc: '最大法力 +20',
    cost: 1,
    requiredAllocated: 3,
    group: '奥术',
    requires: ['mana_spring'],
    passive: { maxMana: 20 },
  },
  {
    id: 'cooldown_flow',
    name: '冷却流转',
    desc: '技能冷却缩减 +8%',
    cost: 2,
    requiredAllocated: 5,
    group: '奥术',
    requires: ['arcane_reservoir'],
    passive: { cooldown: 0.08 },
  },
  {
    id: 'frost_nova',
    name: '冰霜新星',
    desc: '解锁技能：冰霜新星',
    cost: 2,
    requiredAllocated: 8,
    group: '奥术',
    requires: ['cooldown_flow'],
    skill: { name: '冰霜新星', key: 'Digit4', cooldown: 6, manaCost: 18 },
  },
  {
    id: 'lightning_chain',
    name: '闪电链',
    desc: '解锁技能：闪电链',
    cost: 2,
    requiredAllocated: 10,
    group: '奥术',
    requires: ['frost_nova'],
    skill: { name: '闪电链', key: 'Digit5', cooldown: 5, manaCost: 16 },
  },
  {
    id: 'blood_rage',
    name: '血怒',
    desc: '暴击率 +4%',
    cost: 1,
    requiredAllocated: 5,
    group: '力量',
    requires: ['vampirism'],
    passive: { critChance: 0.04 },
  },
  {
    id: 'fortress',
    name: '堡垒',
    desc: '最大生命 +30',
    cost: 2,
    requiredAllocated: 5,
    group: '生存',
    requires: ['iron_will'],
    passive: { maxHealth: 30 },
  },
  {
    id: 'lifebloom',
    name: '生命绽放',
    desc: '生命回复 +1.5/s',
    cost: 1,
    requiredAllocated: 6,
    group: '生存',
    requires: ['fortress'],
    passive: { lifeRegen: 1.5 },
  },
  {
    id: 'lucky_coin',
    name: '幸运硬币',
    desc: '幸运 +12',
    cost: 1,
    requiredAllocated: 4,
    group: '敏捷',
    requires: ['keen_reflexes'],
    passive: { luck: 12 },
  },
];

const TALENT_GROUPS = ['力量', '敏捷', '奥术', '生存'];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private app: HTMLElement;
  private uiRoot: HTMLElement;
  private input = new InputManager();
  private audio = new AudioManager();
  private effects: Effects;
  private bossController: BossController;
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
  private saveSlot = 0;
  private kills = 0;
  private bonusAttributes: StatMap = {};
  private attackTimer = 0;
  private attackAnimTimer = 0;
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
  private startOverlay: HTMLDivElement | null = null;
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
  private talentPoints = 0;
  private unlockedTalents = new Set<string>();
  private attributeAllocated = 0;
  private skillLoadout: string[] = [...DEFAULT_SKILL_LOADOUT];
  private skills: SkillState[] = [];

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
        onSkillPress: (key) => this.input.press(key),
        onSkillRelease: (key) => this.input.release(key),
        onAttackPress: () => {
          if (!this.tryInteract()) this.input.pressMouse(0);
        },
        onAttackRelease: () => this.input.releaseMouse(0),
        onPausePress: () => this.togglePause(),
        onInventoryPress: () => this.toggleInventory(),
        onViewPress: () => {
          this.controller.toggleView();
          this.updatePlayerVisibility();
        },
        onSkillBarPress: () => this.toggleSkillBar(),
      });
    }
    this.inventoryUI = new InventoryUI(this.uiRoot);
    this.inventoryUI.onEquip = (index) => this.equipFromInventory(index);
    this.inventoryUI.onUnequip = (slot) => this.unequipSlot(slot);
    this.inventoryUI.onSell = (index) => this.confirmSell(index);
    this.inventoryUI.onSalvage = (index) => this.confirmSalvage(index);
    this.inventoryUI.onUpgrade = (index) => this.confirmUpgrade(index);
    this.inventoryUI.onReforge = (index) => this.confirmReforge(index);
    this.inventoryUI.onAllocateClick = () => this.showAttributeAllocation();
    this.inventoryUI.onSellAll = (rarity) => this.confirmSellAll(rarity);
    this.inventoryUI.onClose = () => this.mobileBack.unregister('inventory');

    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.running && !this.inventoryUI.open && !this.mobile) {
        this.audio.ensure();
        this.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.hud.setPointerLocked(this.input.pointerLocked);
    });
    this.mobileBack.setRootHandler(() => {
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
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'radial-gradient(circle at center, rgba(20,28,42,0.88), rgba(5,7,12,0.96))';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '200';

    const panel = document.createElement('div');
    panel.style.textAlign = 'center';
    if (this.mobile) {
      panel.className = 'panel mobile-scroll';
      panel.style.minWidth = '92vw';
      panel.style.maxHeight = '82vh';
      panel.style.overflow = 'auto';
      panel.style.padding = '16px';
    }
    const title = document.createElement('div');
    title.textContent = 'MineWorld';
    title.style.fontSize = '52px';
    title.style.fontWeight = 'bold';
    title.style.color = '#fff';
    title.style.textShadow = '0 6px 20px #000';
    panel.appendChild(title);
    const subtitle = document.createElement('div');
    subtitle.textContent = '方块割草：深渊';
    subtitle.style.marginTop = '6px';
    subtitle.style.color = '#9fb4d0';
    subtitle.style.fontSize = '20px';
    panel.appendChild(subtitle);

    const slots = SaveManager.listSlots();
    const slotTitle = document.createElement('div');
    slotTitle.textContent = '存档位';
    slotTitle.style.marginTop = '22px';
    slotTitle.style.color = '#9fb4d0';
    slotTitle.style.fontSize = '14px';
    panel.appendChild(slotTitle);

    slots.forEach((slot) => {
      const button = this.makeMenuButton(
        slot.exists
          ? `存档 ${slot.slot + 1} · 第 ${slot.floor} 层 · Lv.${slot.level}`
          : `存档 ${slot.slot + 1} · 空`,
      );
      button.onclick = () => {
        this.removeStartMenu();
        this.saveSlot = slot.slot;
        if (slot.exists) {
          const save = SaveManager.load(slot.slot);
          if (save) this.loadGame(save);
        } else {
          this.startNewGame();
        }
      };
      panel.appendChild(button);
    });

    overlay.appendChild(panel);
    this.startOverlay = overlay;
    this.uiRoot.appendChild(overlay);
  }

  private makeMenuButton(label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.display = 'block';
    button.style.margin = '18px auto 0';
    button.style.minWidth = '220px';
    button.style.padding = '12px 24px';
    button.style.fontSize = '18px';
    button.style.fontFamily = 'inherit';
    button.style.background = '#2c5f8a';
    button.style.color = '#fff';
    button.style.border = '1px solid #6fa9d8';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.onmouseenter = () => {
      button.style.background = '#3b78ad';
    };
    button.onmouseleave = () => {
      button.style.background = '#2c5f8a';
    };
    return button;
  }

  private addPanelCloseButton(panel: HTMLDivElement, onClick: () => void): void {
    if (!this.mobile) return;
    panel.style.position = 'relative';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '✕';
    button.className = 'panel-close-button';
    button.style.position = 'absolute';
    button.style.right = '10px';
    button.style.top = '10px';
    button.style.width = '42px';
    button.style.height = '42px';
    button.style.minWidth = '42px';
    button.style.minHeight = '42px';
    button.style.padding = '0';
    button.style.background = 'rgba(20,28,42,0.86)';
    button.style.color = '#e7e9ee';
    button.style.border = '1px solid #59647a';
    button.style.borderRadius = '6px';
    button.style.fontSize = '18px';
    button.style.fontWeight = 'bold';
    button.style.cursor = 'pointer';
    button.style.touchAction = 'manipulation';
    button.onclick = onClick;
    panel.appendChild(button);
  }

  private bindOverlayMaskClose(overlay: HTMLDivElement, close: () => void): void {
    if (!this.mobile) return;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
  }

  private removeStartMenu(): void {
    this.startOverlay?.remove();
    this.startOverlay = null;
  }

  private startNewGame(): void {
    SaveManager.clear(this.saveSlot);
    this.floor = 1;
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.gold = 0;
    this.materials = 0;
    this.materialCounts = {};
    this.reforgeTickets = 0;
    this.pendingSavedMonsters = null;
    this.pendingPortalActive = null;
    this.shopStock = [];
    this.shopFloor = 0;
    this.skillLoadout = [...DEFAULT_SKILL_LOADOUT];
    this.skills = this.buildSkillStates();
    this.kills = 0;
    this.bonusAttributes = {};
    this.inventory.items = [];
    this.equipment.equipment = {};
    this.player.level = 1;
    this.player.xp = 0;
    this.player.attributePoints = 0;
    this.attributeAllocated = 0;
    this.talentPoints = 0;
    this.unlockedTalents.clear();
    this.controller.setFirstPerson(false);
    this.player.health = 9999;
    this.player.mana = 9999;
    this.beginRun();
  }

  private loadGame(save: SaveData): void {
    this.floor = save.floor;
    this.seed = save.seed;
    this.gold = save.gold;
    this.materials = save.materials;
    this.materialCounts = { ...(save.materialCounts ?? {}) };
    this.reforgeTickets = save.reforgeTickets ?? 0;
    this.pendingSavedMonsters = Array.isArray(save.monsters) ? save.monsters : null;
    this.pendingPortalActive = save.portalActive ?? null;
    this.skillLoadout = Array.isArray(save.skillLoadout) && save.skillLoadout.length > 0 ? [...save.skillLoadout] : [...DEFAULT_SKILL_LOADOUT];
    this.shopStock = Array.isArray(save.shopStock) ? [...save.shopStock] : [];
    this.shopFloor = save.shopFloor ?? 0;
    this.kills = save.kills;
    this.inventory.items = [...save.inventory];
    this.equipment.equipment = { ...save.equipment };
    this.player.level = save.player.level;
    this.player.xp = save.player.xp;
    this.player.attributePoints = save.player.attributePoints;
    this.attributeAllocated = save.player.attributeAllocated ?? 0;
    this.talentPoints = save.player.talentPoints ?? 0;
    this.unlockedTalents = new Set(save.player.unlockedTalents ?? []);
    this.skills = this.buildSkillStates();
    this.controller.setFirstPerson(Boolean(save.player.firstPerson));
    this.bonusAttributes = { ...(save.player.stats ?? {}) };
    this.player.health = save.player.health;
    this.player.mana = save.player.mana;
    this.player.statuses = Array.isArray(save.playerStatuses) ? [...save.playerStatuses] : [];
    this.beginRun();
  }

  private beginRun(): void {
    this.running = true;
    this.paused = false;
    this.restOpen = false;
    this.attributeOpen = false;
    this.skillOpen = false;
    this.skillOverlay?.remove();
    this.skillOverlay = null;
    this.skillPanel = null;
    this.removePauseMenu();
    this.removeFloorRestMenu();
    this.closeAttributeAllocation();
    this.lastTime = performance.now();
    this.generateCurrentFloor(this.pendingSavedMonsters, this.pendingPortalActive);
    this.pendingSavedMonsters = null;
    this.pendingPortalActive = null;
    this.updatePlayerStats(this.effectiveStats());
    this.updateWeaponVisual();
    this.player.health = Math.min(this.player.maxHealth, this.player.health || this.player.maxHealth);
    this.player.mana = Math.min(this.player.maxMana, this.player.mana || this.player.maxMana);
    this.saveGame();
    this.hud.showCenterMessage(`第 ${this.floor} 层`, this.floorData?.theme.name ?? '', 3);
    this.requestPointerLock();
  }

  private generateCurrentFloor(savedMonsters: SavedMonster[] | null = null, savedPortalActive: boolean | null = null): void {
    this.currentFloorSeed = (this.seed ^ Math.imul(this.floor, 0x9e3779b9)) >>> 0;
    const data = generateFloor(this.currentFloorSeed, this.floor);
    this.floorData = data;
    this.world.generate(data);
    this.audio.startAmbient(data.theme.id);
    this.audio.startBGM(data.theme.id);
    this.player.position.set(data.spawn.x + 0.5, 0, data.spawn.z + 0.5);
    this.player.velocity.set(0, 0, 0);
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.player.group.position.copy(this.player.position);
    this.player.group.rotation.y = 0;
    this.controller.resetView();
    this.updatePlayerVisibility();
    this.openedChests.clear();
    this.portalActive = false;
    this.clearEntities();
    if (savedMonsters) {
      this.restoreMonsters(savedMonsters);
      this.portalActive = savedPortalActive ?? savedMonsters.length === 0;
    } else {
      this.spawnMonsters();
    }
    this.saveGame();
  }

  private spawnMonsters(): void {
    if (!this.floorData) return;
    const count = Math.min(PerformanceTierDetector.monsterCap, 8 + this.floor * 2);
    const rng = new RNG((this.currentFloorSeed ^ 0x5bd1e995) >>> 0);
    this.monsters = MonsterSpawner.spawnWave(this.floorData, this.floorData.spawn, count, rng);
    this.monsters.forEach((monster) => this.scene.add(monster.group));
  }

  private restoreMonsters(savedMonsters: SavedMonster[]): void {
    if (!this.floorData) return;
    this.monsters = [];
    savedMonsters.forEach((saved) => {
      const monster = MonsterSpawner.spawnSaved(saved, this.floorData!);
      if (monster) {
        this.monsters.push(monster);
        this.scene.add(monster.group);
      }
    });
  }

  private serializeMonsters(): SavedMonster[] {
    return this.monsters
      .filter((monster) => !monster.dead)
      .map((monster) => ({
        defId: monster.def.id,
        x: monster.position.x,
        z: monster.position.z,
        health: monster.health,
        maxHealth: monster.maxHealth,
        elite: monster.elite,
        eliteModifiers: [...monster.eliteModifiers],
      }));
  }

  private clearEntities(): void {
    this.bossController.clearWarnings();
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
    if (!this.mobile) this.input.requestPointerLock(this.renderer.domElement);
  }

  private animate = (now: number): void => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.running) this.updateGame(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  };

  private updateGame(rawDt: number): void {
    if (this.paused || this.restOpen || this.attributeOpen) {
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
      if (this.equipment.hasSpecial('aegisWalk') && this.player.moving) {
        this.player.shield = Math.min(
          this.player.maxHealth * 0.2,
          this.player.shield + this.player.maxHealth * 0.01 * rawDt,
        );
      }
      if (
        this.equipment.hasSpecial('lowHealthShield') &&
        this.player.health < this.player.maxHealth * 0.3 &&
        this.lowHealthShieldCooldown <= 0
      ) {
        this.player.shield = Math.max(this.player.shield, this.player.maxHealth * 0.35);
        this.lowHealthShieldCooldown = 12;
        this.effects.explosion(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x7fc4ff);
        this.hud.showCenterMessage('血誓护盾触发', '获得临时护盾', 1.4);
      }
      if (this.equipment.hasSpecial('fireTrail') && this.player.moving && Math.random() < rawDt * 5) {
        this.spawnFireTrail();
      }
    }

    if (this.player.alive) {
      if (!this.inventoryUI.open && !this.skillOpen) {
        const wasGrounded = this.player.onGround;
        this.controller.update(dt, this.floorData, stats);
        if (this.input.wasPressed('Space') && wasGrounded) this.audio.jump();
      }
      this.handleInput(dt, stats);
      this.player.update(rawDt, this.elapsed);
      this.firstPersonView.update(rawDt, this.player.moving, this.player.sprinting);
      if (this.player.alive && this.player.moving && this.player.onGround && !this.inventoryUI.open && !this.skillOpen) {
        this.audio.startWalk();
      } else {
        this.audio.stopWalk();
      }
      if (this.attackAnimTimer > 0) {
        this.attackAnimTimer -= rawDt;
        const progress = Math.max(0, 1 - this.attackAnimTimer / 0.24);
        this.player.swingArm(progress);
        this.firstPersonView.swing(progress);
      }
    } else {
      this.audio.stopWalk();
      this.deathTimer -= rawDt;
      if (this.deathTimer <= 0) {
        this.respawnAfterDeath();
      }
    }

    if (this.player.alive && !this.inventoryUI.open && !this.skillOpen) {
      this.updateMonsters(dt);
      this.updateProjectiles(dt);
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
    this.hud.setState(this.hudState());
    this.hud.updateSkills(this.skillHudStates());
    this.touchControls?.updateSkillStates(this.skillHudStates());
    this.hud.setStatuses(this.player.statuses);
    this.minimap.update(this.floorData, this.player, this.monsters);

    this.saveTimer += rawDt;
    if (this.saveTimer >= 4) {
      this.saveTimer = 0;
      this.saveGame();
    }
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

    if (this.input.isMouseDown(0) && this.attackTimer <= 0) {
      this.doBasicAttack(stats);
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;

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
    this.inventoryUI.attributePoints = this.player.attributePoints;
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
    }
  }

  private showInventory(): void {
    this.inventoryUI.attributePoints = this.player.attributePoints;
    this.inventoryUI.materialText = this.materialStatusText();
    this.inventoryUI.show(this.equipment, this.inventory);
    this.mobileBack.register('inventory', () => this.toggleInventory());
  }

  private updatePlayerVisibility(): void {
    this.player.group.visible = !this.controller.isFirstPerson;
    this.firstPersonView.setVisible(this.controller.isFirstPerson);
  }

  private togglePause(): void {
    if (this.paused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  private pauseGame(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.player.moving = false;
    this.player.sprinting = false;
    this.audio.stopWalk();
    if (document.pointerLockElement) document.exitPointerLock();
    this.showPauseMenu();
  }

  private resumeGame(): void {
    if (!this.paused) return;
    this.paused = false;
    this.removePauseMenu();
    this.lastTime = performance.now();
    this.requestPointerLock();
  }

  private showPauseMenu(): void {
    this.removePauseMenu();
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(4,6,10,0.82)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '220';

    const panel = document.createElement('div');
    panel.style.textAlign = 'center';
    const title = document.createElement('div');
    title.textContent = '游戏暂停';
    title.style.fontSize = '34px';
    title.style.fontWeight = 'bold';
    title.style.color = '#fff';
    panel.appendChild(title);

    const continueBtn = this.makeMenuButton('继续游戏');
    continueBtn.onclick = () => this.resumeGame();
    panel.appendChild(continueBtn);
    const exitBtn = this.makeMenuButton('返回主菜单');
    exitBtn.onclick = () => this.exitToMainMenu();
    panel.appendChild(exitBtn);

    const lookLabel = document.createElement('div');
    lookLabel.textContent = '视角灵敏度';
    lookLabel.style.marginTop = '18px';
    lookLabel.style.color = '#b8c8de';
    lookLabel.style.fontSize = '14px';
    panel.appendChild(lookLabel);
    const lookSensitivity = document.createElement('input');
    lookSensitivity.type = 'range';
    lookSensitivity.min = '0.5';
    lookSensitivity.max = '2.5';
    lookSensitivity.step = '0.1';
    lookSensitivity.value = String(SettingsManager.getLookSensitivity());
    lookSensitivity.style.width = '220px';
    lookSensitivity.oninput = () => SettingsManager.setLookSensitivity(Number(lookSensitivity.value));
    panel.appendChild(lookSensitivity);

    const followRow = document.createElement('label');
    followRow.style.display = 'flex';
    followRow.style.alignItems = 'center';
    followRow.style.justifyContent = 'center';
    followRow.style.gap = '8px';
    followRow.style.marginTop = '12px';
    followRow.style.color = '#b8c8de';
    followRow.style.fontSize = '14px';
    followRow.textContent = '第三人称视角跟随角色';
    const followToggle = document.createElement('input');
    followToggle.type = 'checkbox';
    followToggle.checked = SettingsManager.getCameraFollow();
    followToggle.style.width = '18px';
    followToggle.style.height = '18px';
    followToggle.onchange = () => SettingsManager.setCameraFollow(followToggle.checked);
    followRow.appendChild(followToggle);
    panel.appendChild(followRow);

    const sfxLabel = document.createElement('div');
    sfxLabel.textContent = '音效音量';
    sfxLabel.style.marginTop = '18px';
    sfxLabel.style.color = '#b8c8de';
    sfxLabel.style.fontSize = '14px';
    panel.appendChild(sfxLabel);
    const sfxVolume = document.createElement('input');
    sfxVolume.type = 'range';
    sfxVolume.min = '0';
    sfxVolume.max = '1';
    sfxVolume.step = '0.05';
    sfxVolume.value = String(this.audio.currentVolume);
    sfxVolume.style.width = '220px';
    sfxVolume.oninput = () => this.audio.setSfxVolume(Number(sfxVolume.value));
    panel.appendChild(sfxVolume);

    const musicLabel = document.createElement('div');
    musicLabel.textContent = '背景音乐音量';
    musicLabel.style.marginTop = '12px';
    musicLabel.style.color = '#b8c8de';
    musicLabel.style.fontSize = '14px';
    panel.appendChild(musicLabel);
    const musicVolume = document.createElement('input');
    musicVolume.type = 'range';
    musicVolume.min = '0';
    musicVolume.max = '1';
    musicVolume.step = '0.05';
    musicVolume.value = String(this.audio.currentMusicVolume);
    musicVolume.style.width = '220px';
    musicVolume.oninput = () => this.audio.setMusicVolume(Number(musicVolume.value));
    panel.appendChild(musicVolume);

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
    this.saveGame();
    this.paused = false;
    this.removePauseMenu();
    this.running = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.showStartMenu();
  }

  private showFloorRestMenu(): void {
    this.removeFloorRestMenu();
    this.restOpen = true;
    this.player.moving = false;
    this.player.sprinting = false;
    if (document.pointerLockElement) document.exitPointerLock();

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(4,6,10,0.78)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '230';

    const panel = document.createElement('div');
    panel.style.textAlign = 'center';
    if (this.mobile) {
      panel.className = 'panel mobile-scroll';
      panel.style.minWidth = '92vw';
      panel.style.maxHeight = '84vh';
      panel.style.overflow = 'auto';
      panel.style.padding = '14px';
    } else {
      panel.style.minWidth = '300px';
    }
    const title = document.createElement('div');
    title.textContent = `第 ${this.floor} 层已肃清`;
    title.style.fontSize = '30px';
    title.style.fontWeight = 'bold';
    title.style.color = '#fff';
    panel.appendChild(title);

    const status = document.createElement('div');
    status.style.margin = '10px 0 16px';
    status.style.color = '#b8c8de';
    status.style.fontSize = '14px';
    status.textContent = `金币 ${this.gold} · 生命 ${Math.ceil(this.player.health)}/${this.player.maxHealth} · 法力 ${Math.ceil(this.player.mana)}/${this.player.maxMana}`;
    panel.appendChild(status);

    if (this.shopFloor !== this.floor || this.shopStock.length === 0) {
      this.shopStock = ShopSystem.generateStock(this.floor, this.player.level, Math.min(6, 4 + Math.floor(this.floor / 3)));
      this.shopFloor = this.floor;
      this.saveGame();
    }
    panel.appendChild(this.buildShopSection(status));

    const nextBtn = this.makeMenuButton('进入下一层');
    nextBtn.onclick = () => {
      this.closeFloorRest();
      this.advanceFloor();
    };
    panel.appendChild(nextBtn);

    const healCost = 20 + this.floor * 2;
    const healBtn = this.makeMenuButton(`休息恢复（${healCost} 金币）`);
    healBtn.onclick = () => {
      if (this.gold >= healCost) {
        this.gold -= healCost;
        this.player.health = this.player.maxHealth;
        this.player.mana = this.player.maxMana;
        status.textContent = `已恢复 · 金币 ${this.gold} · 生命 ${this.player.maxHealth}/${this.player.maxHealth} · 法力 ${this.player.maxMana}/${this.player.maxMana}`;
        this.audio.levelUp();
      } else {
        status.textContent = '金币不足';
      }
    };
    panel.appendChild(healBtn);

    const buyItemCost = 60 + this.floor * 12;
    const buyItemBtn = this.makeMenuButton(`购买随机装备（${buyItemCost} 金币）`);
    buyItemBtn.onclick = () => {
      if (this.gold >= buyItemCost) {
        this.gold -= buyItemCost;
        const item = ItemGenerator.generate(this.floor, undefined, this.player.level);
        if (this.inventory.add(item)) {
          status.textContent = `已购买：${item.name} · 金币 ${this.gold}`;
        } else {
          this.spawnDrop(this.player.position, { kind: 'item', item });
          status.textContent = `背包已满，装备已掉落 · 金币 ${this.gold}`;
        }
      } else {
        status.textContent = '金币不足';
      }
    };
    panel.appendChild(buyItemBtn);

    const buyPotionCost = 15 + this.floor * 2;
    const buyPotionBtn = this.makeMenuButton(`购买生命药水（${buyPotionCost} 金币）`);
    buyPotionBtn.onclick = () => {
      if (this.gold >= buyPotionCost) {
        this.gold -= buyPotionCost;
        this.player.heal(this.player.maxHealth * 0.4);
        status.textContent = `已使用生命药水 · 生命 ${Math.ceil(this.player.health)}/${this.player.maxHealth} · 金币 ${this.gold}`;
      } else {
        status.textContent = '金币不足';
      }
    };
    panel.appendChild(buyPotionBtn);

    const closeBtn = this.makeMenuButton('返回');
    closeBtn.onclick = () => {
      this.closeFloorRest();
      this.requestPointerLock();
    };
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    this.floorRestOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.addPanelCloseButton(panel, () => this.closeFloorRest());
    this.bindOverlayMaskClose(overlay, () => this.closeFloorRest());
    this.mobileBack.register('floorRest', () => this.closeFloorRest());
  }

  private buildShopSection(status: HTMLDivElement): HTMLDivElement {
    const section = document.createElement('div');
    if (this.mobile) section.className = 'mobile-scroll';
    section.style.marginTop = '16px';
    section.style.paddingTop = '10px';
    section.style.borderTop = '1px solid #354156';
    section.style.textAlign = 'left';
    section.style.maxHeight = '280px';
    section.style.overflow = 'auto';
    section.style.touchAction = this.mobile ? 'pan-y' : 'auto';

    const title = document.createElement('div');
    title.textContent = '深渊商店';
    title.style.fontWeight = 'bold';
    title.style.color = '#ffd76a';
    title.style.marginBottom = '6px';
    section.appendChild(title);

    this.shopStock.forEach((entry, stockIndex) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '5px 0';
      row.style.borderBottom = '1px solid #222a38';
      const name = document.createElement('span');
      name.style.flex = '1';
      name.style.color = RARITY_COLORS[entry.item.rarity];
      name.textContent = `${entry.item.name} Lv.${entry.item.itemLevel}`;
      name.style.cursor = 'default';
      const tooltip = itemTooltipHTML(entry.item);
      name.onmouseenter = (event) => {
        const tip = document.createElement('div');
        tip.className = 'panel tooltip';
        tip.style.zIndex = '1300';
        tip.innerHTML = tooltip;
        tip.style.left = `${Math.min(event.clientX + 12, window.innerWidth - 300)}px`;
        tip.style.top = `${Math.min(event.clientY + 12, window.innerHeight - 240)}px`;
        document.body.appendChild(tip);
        name.onmouseleave = () => tip.remove();
      };
      row.appendChild(name);
      const buy = document.createElement('button');
      buy.textContent = `${entry.price} 金币`;
      buy.style.padding = '4px 8px';
      buy.style.background = this.gold >= entry.price ? '#2c5f8a' : '#28303d';
      buy.style.color = '#fff';
      buy.style.border = '1px solid #6fa9d8';
      buy.style.borderRadius = '3px';
      buy.style.cursor = this.gold >= entry.price ? 'pointer' : 'default';
      buy.onclick = () => {
        if (this.gold < entry.price || this.inventory.items.length >= this.inventory.capacity) {
          status.textContent = this.inventory.items.length >= this.inventory.capacity ? '背包已满' : '金币不足';
          return;
        }
        this.gold -= entry.price;
        this.inventory.add(entry.item);
        this.shopStock.splice(stockIndex, 1);
        this.audio.coin();
        this.saveGame();
        this.showFloorRestMenu();
      };
      row.appendChild(buy);
      section.appendChild(row);
    });

    const sellTitle = document.createElement('div');
    sellTitle.textContent = '出售材料';
    sellTitle.style.marginTop = '10px';
    sellTitle.style.fontWeight = 'bold';
    sellTitle.style.color = '#9fd0ff';
    section.appendChild(sellTitle);

    MATERIAL_ORDER.forEach((materialId) => {
      const count = this.materialCount(materialId);
      if (count <= 0) return;
      const price = ShopSystem.materialPrice(materialId, this.floor);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '4px 0';
      const label = document.createElement('span');
      label.style.flex = '1';
      label.style.color = MATERIALS[materialId].color;
      label.textContent = `${MATERIALS[materialId].name} x${count}`;
      row.appendChild(label);
      const sell = document.createElement('button');
      sell.textContent = `+${price} 金币`;
      sell.style.padding = '4px 8px';
      sell.style.background = '#5a4a1f';
      sell.style.color = '#ffd76a';
      sell.style.border = '1px solid #8b7a3f';
      sell.style.borderRadius = '3px';
      sell.style.cursor = 'pointer';
      sell.onclick = () => {
        this.materialCounts[materialId] = Math.max(0, count - 1);
        this.gold += price;
        this.audio.coin();
        this.saveGame();
        this.showFloorRestMenu();
      };
      row.appendChild(sell);
      section.appendChild(row);
    });

    return section;
  }

  private closeFloorRest(): void {
    this.mobileBack.unregister('floorRest');
    this.restOpen = false;
    this.floorRestOverlay?.remove();
    this.floorRestOverlay = null;
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
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(4,6,10,0.82)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '240';

    const panel = document.createElement('div');
    panel.className = 'panel';
    if (this.mobile) panel.classList.add('mobile-scroll');
    panel.style.maxHeight = '86vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '18px';
    panel.style.minWidth = this.mobile ? '92vw' : '360px';
    this.attributePanel = panel;
    this.renderCharacterPanel();

    overlay.appendChild(panel);
    this.attributeOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.addPanelCloseButton(panel, () => this.closeAttributeAllocation());
    this.bindOverlayMaskClose(overlay, () => this.closeAttributeAllocation());
    this.mobileBack.register('attribute', () => this.closeAttributeAllocation());
  }

  private renderCharacterPanel(): void {
    const panel = this.attributePanel;
    if (!panel) return;
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = '角色加点 / 天赋';
    title.style.fontSize = '26px';
    title.style.fontWeight = 'bold';
    title.style.color = '#fff';
    title.style.textAlign = 'center';
    panel.appendChild(title);

    const stats = this.effectiveStats();
    const status = document.createElement('div');
    status.style.margin = '10px 0 14px';
    status.style.color = '#b8c8de';
    status.style.fontSize = '13px';
    status.style.textAlign = 'center';
    status.textContent = `属性点 ${this.player.attributePoints} · 已分配 ${this.attributeAllocated} · 天赋点 ${this.talentPoints} · 攻击 ${Math.round(stats.attack)} · 生命 ${Math.round(stats.maxHealth)}`;
    panel.appendChild(status);

    const sectionTitle = (text: string): HTMLDivElement => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.margin = '12px 0 8px';
      el.style.color = '#dce8ff';
      el.style.fontWeight = 'bold';
      el.style.fontSize = '15px';
      return el;
    };

    panel.appendChild(sectionTitle('属性'));
    const rows: { label: string; stat: keyof StatMap }[] = [
      { label: '力量', stat: 'strength' },
      { label: '敏捷', stat: 'agility' },
      { label: '体力', stat: 'vitality' },
      { label: '智力', stat: 'intelligence' },
      { label: '幸运', stat: 'luck' },
    ];
    rows.forEach((row) => {
      const button = document.createElement('button');
      button.textContent = `${row.label} +1`;
      button.style.display = 'block';
      button.style.width = '100%';
      button.style.margin = '4px 0';
      button.style.padding = '8px 14px';
      button.style.fontFamily = 'inherit';
      button.style.background = this.player.attributePoints > 0 ? '#2c5f8a' : '#28303d';
      button.style.color = '#fff';
      button.style.border = '1px solid #6fa9d8';
      button.style.borderRadius = '4px';
      button.style.cursor = this.player.attributePoints > 0 ? 'pointer' : 'default';
      button.onclick = () => {
        if (this.player.attributePoints <= 0) return;
        this.bonusAttributes = {
          ...this.bonusAttributes,
          [row.stat]: (this.bonusAttributes[row.stat] ?? 0) + 1,
        };
        this.player.attributePoints--;
        this.attributeAllocated++;
        this.talentPoints++;
        this.updatePlayerStats(this.effectiveStats());
        this.renderCharacterPanel();
      };
      panel.appendChild(button);
    });

    panel.appendChild(sectionTitle('天赋'));
    TALENT_GROUPS.forEach((group) => {
      const groupTitle = document.createElement('div');
      groupTitle.textContent = group;
      groupTitle.style.margin = '10px 0 6px';
      groupTitle.style.paddingLeft = '4px';
      groupTitle.style.color = '#ffd76a';
      groupTitle.style.fontWeight = 'bold';
      groupTitle.style.fontSize = '13px';
      panel.appendChild(groupTitle);

      const groupGrid = document.createElement('div');
      groupGrid.style.display = 'grid';
      groupGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(190px, 1fr))';
      groupGrid.style.gap = '7px';

      TALENT_DEFS.filter((talent) => talent.group === group).forEach((talent) => {
        const unlocked = this.unlockedTalents.has(talent.id);
        const prerequisitesMet = !talent.requires || talent.requires.every((id) => this.unlockedTalents.has(id));
        const affordable =
          !unlocked &&
          prerequisitesMet &&
          this.talentPoints >= talent.cost &&
          this.attributeAllocated >= talent.requiredAllocated;

        const node = document.createElement('button');
        node.type = 'button';
        node.style.display = 'block';
        node.style.textAlign = 'left';
        node.style.minHeight = '48px';
        node.style.padding = '8px 10px';
        node.style.fontFamily = 'inherit';
        node.style.background = unlocked ? '#315c42' : affordable ? '#5a4a1f' : '#28303d';
        node.style.color = '#fff';
        node.style.border = unlocked ? '1px solid #7ee8a2' : affordable ? '1px solid #c5a03b' : '1px solid #43516a';
        node.style.borderRadius = '5px';
        node.style.cursor = affordable ? 'pointer' : 'default';
        node.style.opacity = prerequisitesMet || unlocked ? '1' : '0.48';

        const name = document.createElement('div');
        name.style.fontWeight = 'bold';
        name.style.fontSize = '13px';
        name.textContent = unlocked ? `✓ ${talent.name}` : talent.name;
        node.appendChild(name);

        const desc = document.createElement('div');
        desc.style.marginTop = '3px';
        desc.style.fontSize = '11px';
        desc.style.color = '#b8c8de';
        desc.textContent = talent.desc;
        node.appendChild(desc);

        const meta = document.createElement('div');
        meta.style.marginTop = '4px';
        meta.style.fontSize = '10px';
        meta.style.color = prerequisitesMet ? '#7f8ca0' : '#ff9a9a';
        meta.textContent = `${talent.cost} 天赋点${talent.requiredAllocated > 0 ? ` · 需已分配 ${talent.requiredAllocated}` : ''}${
          prerequisitesMet ? '' : ' · 需前置天赋'
        }`;
        node.appendChild(meta);

        node.title = `${talent.desc} · ${meta.textContent}`;
        node.onclick = () => {
          if (!affordable) return;
          this.unlockTalent(talent);
        };
        groupGrid.appendChild(node);
      });
      panel.appendChild(groupGrid);
    });

    const skillButton = this.makeMenuButton('技能栏配置');
    skillButton.style.marginTop = '14px';
    skillButton.onclick = () => {
      this.closeAttributeAllocation();
      this.showSkillBar();
    };
    panel.appendChild(skillButton);

    const closeButton = this.makeMenuButton('关闭');
    closeButton.style.display = 'block';
    closeButton.style.marginTop = '14px';
    closeButton.onclick = () => {
      this.closeAttributeAllocation();
      this.requestPointerLock();
    };
    panel.appendChild(closeButton);
  }

  private unlockTalent(talent: TalentDef): void {
    const requirementsMet = !talent.requires || talent.requires.every((id) => this.unlockedTalents.has(id));
    if (
      this.unlockedTalents.has(talent.id) ||
      this.talentPoints < talent.cost ||
      this.attributeAllocated < talent.requiredAllocated ||
      !requirementsMet
    ) {
      return;
    }
    this.unlockedTalents.add(talent.id);
    this.talentPoints -= talent.cost;
    if (talent.passive) {
      for (const [stat, value] of Object.entries(talent.passive)) {
        this.bonusAttributes = {
          ...this.bonusAttributes,
          [stat]: (this.bonusAttributes[stat as keyof StatMap] ?? 0) + value,
        };
      }
    }
    if (talent.skill) {
      const skillDef = skillById(talent.id);
      if (skillDef && !this.skillLoadout.includes(skillDef.id) && this.skillLoadout.length < 4) {
        this.skillLoadout.push(skillDef.id);
      }
      this.skills = this.buildSkillStates();
    }
    this.updatePlayerStats(this.effectiveStats());
    this.renderCharacterPanel();
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
    else this.showSkillBar();
  }

  private showSkillBar(): void {
    if (this.skillOpen) return;
    this.skillOpen = true;
    this.player.moving = false;
    this.player.sprinting = false;
    if (document.pointerLockElement) document.exitPointerLock();

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(4,6,10,0.82)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '245';

    const panel = document.createElement('div');
    panel.className = 'panel';
    if (this.mobile) panel.classList.add('mobile-scroll');
    panel.style.maxHeight = '88vh';
    panel.style.overflow = 'auto';
    panel.style.padding = '18px';
    panel.style.minWidth = this.mobile ? '92vw' : '420px';
    this.skillPanel = panel;
    this.renderSkillPanel();

    overlay.appendChild(panel);
    this.skillOverlay = overlay;
    this.uiRoot.appendChild(overlay);
    this.addPanelCloseButton(panel, () => this.closeSkillBar());
    this.bindOverlayMaskClose(overlay, () => this.closeSkillBar());
    this.mobileBack.register('skillBar', () => this.closeSkillBar());
  }

  private renderSkillPanel(): void {
    const panel = this.skillPanel;
    if (!panel) return;
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = '技能栏配置';
    title.style.fontSize = '25px';
    title.style.fontWeight = 'bold';
    title.style.color = '#fff';
    title.style.textAlign = 'center';
    panel.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = `已装备 ${this.skillLoadout.length}/4 · 点击技能分配，再次点击卸载`;
    hint.style.margin = '10px 0 14px';
    hint.style.color = '#b8c8de';
    hint.style.fontSize = '13px';
    hint.style.textAlign = 'center';
    panel.appendChild(hint);

    SKILLS.forEach((skill) => {
      const unlocked = this.isSkillUnlocked(skill.id);
      const equipped = this.skillLoadout.includes(skill.id);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.margin = '6px 0';
      row.style.padding = '8px 10px';
      row.style.background = equipped ? '#243a52' : '#151c28';
      row.style.border = equipped ? '1px solid #6fa9d8' : '1px solid #354156';
      row.style.borderRadius = '4px';

      const icon = document.createElement('span');
      icon.textContent = skill.icon;
      icon.style.fontSize = '24px';
      row.appendChild(icon);

      const info = document.createElement('div');
      info.style.flex = '1';
      info.innerHTML = `<div style="font-weight:bold;color:#e7f4ff">${skill.name} <span style="color:#8fa7c5">[${keyToLabel(skill.key)}]</span></div><div style="font-size:12px;color:#8296ad;margin-top:2px">${skill.description} · ${skill.cooldown}s · 法力 ${skill.manaCost}</div>`;
      row.appendChild(info);

      const button = document.createElement('button');
      if (!unlocked) {
        button.textContent = '未解锁';
        button.disabled = true;
        button.style.background = '#28303d';
        button.style.color = '#677487';
      } else {
        button.textContent = equipped ? '卸载' : '装备';
        button.style.background = equipped ? '#5a4a1f' : '#2c5f8a';
        button.style.color = '#fff';
        button.style.border = '1px solid #8b7a3f';
        button.style.borderRadius = '4px';
        button.style.padding = '6px 10px';
        button.style.cursor = 'pointer';
        button.onclick = () => {
          if (equipped) this.removeSkillFromLoadout(skill.id);
          else this.addSkillToLoadout(skill.id);
          this.renderSkillPanel();
        };
      }
      row.appendChild(button);
      panel.appendChild(row);
    });

    const closeButton = this.makeMenuButton('关闭');
    closeButton.style.display = 'block';
    closeButton.style.marginTop = '14px';
    closeButton.onclick = () => this.closeSkillBar();
    panel.appendChild(closeButton);
  }

  private addSkillToLoadout(id: string): void {
    if (!this.isSkillUnlocked(id) || this.skillLoadout.includes(id) || this.skillLoadout.length >= 4) return;
    this.skillLoadout.push(id);
    this.skills = this.buildSkillStates();
    this.saveGame();
  }

  private removeSkillFromLoadout(id: string): void {
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
    this.requestPointerLock();
  }

  private doBasicAttack(stats: DerivedStats): void {
    const aim = this.controller.getAimDirection();
    const weapon = this.equipment.get('weapon');
    const attackSpeed = Math.max(0.15, Math.min(3.5, stats.baseAttackSpeed * (1 + stats.attackSpeedBonus)));
    this.attackAnimTimer = Math.max(0.12, Math.min(0.28, 0.34 / attackSpeed));
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
    const fullHealthBonus =
      this.equipment.hasSpecial('executeFullHealth') && this.player.health >= this.player.maxHealth ? 1.25 : 1;
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
        stats.attack * falloff * fullHealthBonus,
        stats.critChance,
        stats.critDamage,
        target.def.armor,
        this.floor,
        element,
        target.def.resistances,
        target.statuses,
      );
      this.applyMonsterDamage(target, result.damage, result.crit, profile.scale * 0.55);
      applyElementalHit(target, element, stats.attack * falloff, statusChance, target.def.immunities);
    });

    if (targets.length > 0 && this.equipment.hasSpecial('chainLightning') && Math.random() < 0.15) {
      const target = targets[0];
      const result = CombatSystem.rollDamage(stats.attack, stats.critChance, stats.critDamage, target.def.armor, this.floor);
      const chainTargets = this.monsters.filter(
        (monster) => monster !== target && !monster.dead && monster.position.distanceTo(target.position) < 4,
      );
      chainTargets.slice(0, 3).forEach((chainTarget, index) => {
        const chainDamage = Math.max(1, Math.round(result.damage * 0.55 * (1 - index * 0.18)));
        this.applyMonsterDamage(chainTarget, chainDamage, false);
      });
      this.effects.explosion(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x8ed4ff);
    }

    if (targets.length > 0 && this.equipment.hasSpecial('meteorOnAttack') && Math.random() < 0.18) {
      const target = targets[0];
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
    const position = this.player.position.clone().add(new THREE.Vector3(0, 1.25, 0)).addScaledVector(aim, 0.7);
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
      this.applyMonsterDamage(monster, result.damage, result.crit);
      applyElementalHit(monster, 'fire', stats.attack * 1.1, 0.2, monster.def.immunities);
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
        this.applyMonsterDamage(monster, result.damage, result.crit);
        applyElementalHit(monster, 'fire', stats.attack * 0.22, 0.12, monster.def.immunities);
      });
    window.setTimeout(() => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }, 900);
  }

  private tryUseSkill(skill: SkillState, stats: DerivedStats): void {
    if (skill.cooldownRemaining > 0 || this.player.mana < skill.manaCost) return;
    skill.cooldown = Math.max(0.3, skill.baseCooldown * (1 - stats.cooldownReduction));
    skill.cooldownRemaining = skill.cooldown;
    this.player.mana -= skill.manaCost;
    if (skill.id === 'whirlwind') this.useWhirlwind(stats, skill);
    if (skill.id === 'dash') this.useDash(stats, skill);
    if (skill.id === 'fireball') this.useFireball(stats, skill);
    if (skill.id === 'frost_nova') this.useFrostNova(stats, skill);
    if (skill.id === 'lightning_chain') this.useLightningChain(stats, skill);
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
      this.applyMonsterDamage(target, result.damage, result.crit);
      applyElementalHit(target, skill.element, stats.attack * 1.6, skill.statusChance, target.def.immunities);
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
      this.applyMonsterDamage(target, result.damage, result.crit);
      applyElementalHit(target, skill.element, stats.attack * 1.25, skill.statusChance, target.def.immunities);
    });
    if (this.equipment.hasSpecial('dashInvincibility')) {
      this.player.invulnerable = 0.8;
    }
  }

  private useFireball(stats: DerivedStats, skill: SkillState): void {
    const direction = this.controller.getAimDirection();
    const position = this.player.position.clone().add(new THREE.Vector3(0, 1.25, 0));
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
      damage: Math.round(stats.attack * 1.8),
      life: 2.5,
      friendly: true,
      element: skill.element,
      statusChance: skill.statusChance,
      traveled: 0,
      maxDistance: 10,
    });
    this.audio.shoot();
  }

  private useFrostNova(stats: DerivedStats, skill: SkillState): void {
    this.audio.explosion();
    this.controller.addShake(0.12);
    this.effects.explosion(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9ee7ff);
    this.monsters
      .filter((monster) => !monster.dead && monster.position.distanceTo(this.player.position) <= 5)
      .forEach((target) => {
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
        this.applyMonsterDamage(target, result.damage, result.crit);
        applyElementalHit(target, skill.element, stats.attack * 1.25, skill.statusChance, target.def.immunities);
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
      this.applyMonsterDamage(target, result.damage, result.crit);
      applyElementalHit(target, skill.element, stats.attack * Math.max(0.45, 1.35 - index * 0.25), skill.statusChance, target.def.immunities);
      this.effects.explosion(target.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x8ed4ff);
    });
  }

  private updateMonsters(dt: number): void {
    if (!this.floorData) return;
    for (let i = this.monsters.length - 1; i >= 0; i--) {
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
          damagePlayer: (amount, element, statusChance) => this.damagePlayerWithElement(amount, element, statusChance),
          summonMinion: (position) => this.spawnBossMinion(position),
          showMessage: (title, subtitle) => this.hud.showCenterMessage(title, subtitle, 1.8),
        };
        this.bossController.update(
          dt,
          monster,
          this.player,
          this.floorData,
          host,
          MonsterSpawner.baseAttack(monster, this.floor),
        );
      } else {
        MonsterAI.update(monster, dt, this.player, this.floorData);
      }
      monster.update(dt, this.elapsed);
      this.keepMonsterInBounds(monster);
      if (wasAliveBeforeUpdate && monster.dead) {
        this.onMonsterKilled(monster, false);
      }

      const dx = this.player.position.x - monster.position.x;
      const dz = this.player.position.z - monster.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (MonsterAI.shouldDealMelee(monster) && distance <= monster.def.attackRange + 0.5) {
        const damage = Math.max(1, MonsterSpawner.baseAttack(monster, this.floor));
        this.player.takeDamage(damage);
        applyElementalHit(this.player, monster.def.element ?? 'physical', damage, monster.def.statusChance);
        this.audio.hurt();
        this.controller.addShake(0.16);
        this.hud.showCenterMessage('受到攻击', '', 0.35);
        monster.attackCooldown = monster.def.attackCooldown;
        monster.state = 'chase';
      } else if (MonsterAI.shouldShoot(monster) && distance <= monster.def.attackRange + 4) {
        this.spawnEnemyProjectile(monster);
        monster.attackCooldown = monster.def.attackCooldown;
        monster.state = 'chase';
      }

      if (wasAttackState && monster.state !== 'attack' && monster.attackCooldown <= 0) {
        // nothing required; cooldown is assigned when the attack connects.
      }
    }

    const living = this.monsters.some((monster) => !monster.dead);
    if (!living && !this.portalActive && this.floorData) {
      this.portalActive = true;
      this.audio.portal();
      this.hud.showCenterMessage('本层已肃清', '传送门已开启，靠近后按 E 进入下一层', 3.2);
      this.saveGame();
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

  private damagePlayerWithElement(amount: number, element: ElementType, statusChance?: number): void {
    this.player.takeDamage(Math.max(1, Math.round(amount)));
    applyElementalHit(this.player, element, amount, statusChance);
    this.audio.hurt();
    this.controller.addShake(0.16);
    this.hud.showCenterMessage('受到攻击', '', 0.35);
  }

  private spawnBossMinion(position: THREE.Vector3): void {
    if (!this.floorData) return;
    const rng = new RNG(((this.currentFloorSeed ^ Math.floor(position.x * 7919) ^ Math.floor(position.z * 7919)) >>> 0));
    const minion = MonsterSpawner.spawnMinionAt(this.floorData, position, rng);
    if (!minion) return;
    minion.maxHealth = Math.round(minion.maxHealth * 0.7);
    minion.health = minion.maxHealth;
    this.monsters.push(minion);
    this.scene.add(minion.group);
    this.effects.burst(minion.position.clone().add(new THREE.Vector3(0, 0.8, 0)), minion.def.color, 12, 3);
  }

  private updateProjectiles(dt: number): void {
    if (dt <= 0) return;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.life -= dt;
      projectile.traveled += projectile.velocity.length() * dt;
      projectile.position.addScaledVector(projectile.velocity, dt);
      projectile.mesh.position.copy(projectile.position);

      let remove = projectile.life <= 0;
      if (!remove && projectile.maxDistance !== undefined && projectile.traveled >= projectile.maxDistance) {
        this.detonateProjectile(projectile);
        remove = true;
      }
      if (!remove && this.floorData) {
        const gx = Math.floor(projectile.position.x);
        const gz = Math.floor(projectile.position.z);
        const hitWall =
          gx < 0 ||
          gz < 0 ||
          gx >= this.floorData.size ||
          gz >= this.floorData.size ||
          (this.floorData.grid[gz][gx] === 2 || this.floorData.grid[gz][gx] === 3);
        if (hitWall) {
          this.effects.explosion(projectile.position, projectile.friendly ? 0xff8c1e : 0xff4b4b);
          this.audio.explosion();
          remove = true;
        }
      }

      if (!remove && projectile.friendly) {
        const hit = this.monsters.find(
          (monster) =>
            !monster.dead &&
            Math.hypot(monster.position.x - projectile.position.x, monster.position.z - projectile.position.z) <
              (projectile.radius ?? 1.1),
        );
        if (hit) {
          const crit = Math.random() < this.effectiveStats().critChance;
          const element = projectile.element ?? 'physical';
          const raw = projectile.damage * (crit ? 1.5 : 1);
          const final = elementalDamage(raw, element, hit.def.resistances, hit.statuses);
          this.applyMonsterDamage(hit, final, crit, projectile.impact ?? 0.7);
          applyElementalHit(hit, element, projectile.damage, projectile.statusChance, hit.def.immunities);
          this.effects.explosion(projectile.position, 0xff8c1e);
          remove = true;
        }
      } else if (!remove && !projectile.friendly) {
        const hitPlayer =
          Math.hypot(this.player.position.x - projectile.position.x, this.player.position.z - projectile.position.z) <
          (projectile.radius ?? 0.7);
        if (hitPlayer) {
          this.player.takeDamage(projectile.damage);
          applyElementalHit(this.player, projectile.element ?? 'physical', projectile.damage, projectile.statusChance);
          this.audio.hurt();
          this.controller.addShake(0.14);
          remove = true;
        }
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
        this.applyMonsterDamage(monster, result.damage, result.crit, projectile.impact ?? 0.7);
        applyElementalHit(monster, element, projectile.damage * 0.6, projectile.statusChance, monster.def.immunities);
      });
      return;
    }

    if (this.player.position.distanceTo(projectile.position) < 1.8) {
      this.damagePlayerWithElement(Math.max(1, Math.round(projectile.damage * 0.6)), element, projectile.statusChance);
    }
  }

  private applyMonsterDamage(monster: Monster, damage: number, crit: boolean, impact = 1): void {
    if (monster.dead) return;
    const killed = monster.takeDamage(damage);
    const hitImpact = Math.max(0.25, Math.min(1.3, impact));
    monster.hitFlash = Math.max(monster.hitFlash, 0.05 + hitImpact * 0.07);
    this.hitstopTimer = Math.max(this.hitstopTimer, 0.012 + hitImpact * 0.03);
    this.controller.addShake(Math.min(0.12, hitImpact * 0.055));
    const color = crit ? '#ff4b4b' : '#ffffff';
    this.hud.spawnDamage(String(damage), color, crit, crit ? 1.35 : 1);
    this.effects.burst(monster.position.clone().add(new THREE.Vector3(0, 0.8, 0)), monster.def.color, crit ? 10 : 5, crit ? 3 : 2);
    this.audio.hit(crit);
    if (crit) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.05);
      this.controller.addShake(0.09);
    }
    if (killed) this.onMonsterKilled(monster, crit);
  }

  private onMonsterKilled(monster: Monster, crit: boolean): void {
    this.kills++;
    this.audio.kill();
    this.effects.burst(monster.position.clone().add(new THREE.Vector3(0, 0.9, 0)), monster.def.color, 22, 5);
    if (crit) this.controller.addShake(0.08);

    if (this.equipment.hasSpecial('explosiveKill')) {
      this.effects.explosion(monster.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff7a2a);
      const nearby = this.monsters.filter(
        (other) => other !== monster && !other.dead && other.position.distanceTo(monster.position) < 3,
      );
      nearby.forEach((other) => {
        const damage = Math.max(1, Math.round(this.effectiveStats().attack * 0.45));
        this.applyMonsterDamage(other, damage, false);
      });
    }

    if (this.equipment.hasSpecial('summonSkeletonOnKill') && this.summons.length < 4) {
      this.spawnSummonedSkeleton(monster.position.clone());
    }

    if (monster.elite) {
      this.gold += 8 + this.floor * 3;
      if (monster.eliteModifiers.includes('fireEnchanted')) {
        this.effects.explosion(monster.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff6a00);
        const nearby = this.monsters.filter(
          (other) => other !== monster && !other.dead && other.position.distanceTo(monster.position) < 3,
        );
        nearby.forEach((other) => {
          const damage = Math.max(1, Math.round(this.effectiveStats().attack * 0.3));
          this.applyMonsterDamage(other, damage, false);
        });
      }
      if (Math.random() < 0.4) {
        this.spawnDrop(monster.position, {
          kind: 'item',
          item: ItemGenerator.generate(this.floor, undefined, this.player.level),
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
        this.applyMonsterDamage(target, result.damage, result.crit);
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
      this.player.attributePoints++;
      this.player.health = this.player.maxHealth;
      this.player.mana = this.player.maxMana;
      leveled = true;
      this.audio.levelUp();
    }
    if (leveled) {
      this.updatePlayerStats(this.effectiveStats());
      this.hud.showCenterMessage('升级！', `达到 Lv.${this.player.level}，获得 ${this.player.attributePoints} 点属性`, 2.2);
      this.showAttributeAllocation();
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
      this.gold += drop.amount ?? 0;
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

  private tryInteract(): boolean {
    if (!this.floorData) return false;
    const playerX = Math.floor(this.player.position.x);
    const playerZ = Math.floor(this.player.position.z);

    if (this.portalActive) {
      const dx = playerX - this.floorData.portal.x;
      const dz = playerZ - this.floorData.portal.z;
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
        this.showFloorRestMenu();
        return true;
      }
    }

    for (const chest of this.floorData.chests) {
      const key = `${chest.x},${chest.z}`;
      if (this.openedChests.has(key)) continue;
      const dx = this.player.position.x - (chest.x + 0.5);
      const dz = this.player.position.z - (chest.z + 0.5);
      if (Math.hypot(dx, dz) <= 1.8) {
        this.openedChests.add(key);
        this.world.removeChest(chest.x, chest.z);
        const item = ItemGenerator.generate(this.floor, undefined, this.player.level);
        const gold = 10 + this.floor * 3;
        this.gold += gold;
        if (this.inventory.add(item)) {
          this.audio.pickup();
          this.hud.showLootMessage(`宝箱：${item.name} + ${gold} 金币`, this.rarityColor(item.rarity));
        } else {
          this.spawnDrop(new THREE.Vector3(chest.x + 0.5, 0, chest.z + 0.5), { kind: 'item', item });
          this.hud.showCenterMessage('背包已满', '宝箱装备已掉落在地面', 1.4);
        }
        return true;
      }
    }
    return false;
  }

  private advanceFloor(): void {
    this.floor++;
    this.player.heal(this.player.maxHealth * 0.25);
    this.player.addMana(this.player.maxMana * 0.5);
    this.generateCurrentFloor();
    this.hud.showCenterMessage(`第 ${this.floor} 层`, this.floorData?.theme.name ?? '', 3);
    this.audio.portal();
    this.saveGame();
  }

  private respawnAfterDeath(): void {
    const lostGold = Math.floor(this.gold * 0.1);
    this.gold -= lostGold;
    this.player.alive = true;
    this.player.health = this.player.maxHealth;
    this.player.mana = this.player.maxMana;
    this.deathTimer = 0;
    this.generateCurrentFloor();
    this.hud.showCenterMessage('重新站起', `损失 ${lostGold} 金币`, 2.2);
    this.requestPointerLock();
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

  private updateSkills(dt: number): void {
    this.skills.forEach((skill) => {
      skill.cooldownRemaining = Math.max(0, skill.cooldownRemaining - dt);
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
    this.player.maxHealth = Math.round(stats.maxHealth);
    this.player.maxMana = Math.round(stats.maxMana);
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
      name: skill.name,
      key: skill.key,
      cooldown: skill.cooldown,
      cooldownRemaining: skill.cooldownRemaining,
      manaCost: skill.manaCost,
    }));
  }

  private buildSkillStates(): SkillState[] {
    const states: SkillState[] = [];
    for (const id of this.skillLoadout.slice(0, 4)) {
      const def = skillById(id);
      if (!def || !this.isSkillUnlocked(id)) continue;
      states.push({
        id: def.id,
        name: def.name,
        key: def.key,
        baseCooldown: def.cooldown,
        cooldown: def.cooldown,
        cooldownRemaining: 0,
        manaCost: def.manaCost,
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
    return this.unlockedTalents.has(def.talentId);
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
  }

  private unequipSlot(slot: Slot): void {
    const item = this.equipment.unequip(slot);
    if (!item) return;
    if (this.inventory.add(item)) {
      this.updatePlayerStats(this.effectiveStats());
      this.updateWeaponVisual();
      this.showInventory();
    } else {
      this.equipment.equip(item);
      this.hud.showCenterMessage('背包已满', '无法卸下装备', 1.4);
      this.showInventory();
    }
  }

  private confirmSell(index: number): void {
    const item = this.inventory.items[index];
    if (!item) return;
    this.closeSellOverlay();
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.65)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '260';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.padding = '18px 22px';
    panel.style.textAlign = 'center';
    const title = document.createElement('div');
    title.textContent = '确认出售';
    title.style.fontSize = '24px';
    title.style.fontWeight = 'bold';
    title.style.color = '#fff';
    panel.appendChild(title);
    const info = document.createElement('div');
    info.style.margin = '12px 0 18px';
    info.style.color = '#b8c8de';
    info.textContent = `${item.name} · 售价 ${item.sellPrice} 金币`;
    panel.appendChild(info);
    const confirm = this.makeMenuButton('确认出售');
    confirm.onclick = () => {
      this.closeSellOverlay();
      this.sellFromInventory(index);
    };
    panel.appendChild(confirm);
    const cancel = this.makeMenuButton('取消');
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
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.68)';
    overlay.style.pointerEvents = 'auto';
    overlay.style.zIndex = '260';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.padding = '18px 22px';
    panel.style.textAlign = 'center';
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.fontSize = '24px';
    titleEl.style.fontWeight = 'bold';
    titleEl.style.color = '#fff';
    panel.appendChild(titleEl);
    const info = document.createElement('div');
    info.style.margin = '12px 0 18px';
    info.style.color = '#b8c8de';
    info.style.fontSize = '13px';
    info.style.lineHeight = '1.55';
    info.innerHTML = infoHTML;
    panel.appendChild(info);
    const confirm = this.makeMenuButton(confirmDisabled ? '材料不足' : '确认');
    confirm.disabled = confirmDisabled;
    confirm.style.opacity = confirmDisabled ? '0.55' : '1';
    confirm.onclick = () => {
      if (confirmDisabled) return;
      this.audio.uiConfirm();
      this.closeCraftOverlay();
      onConfirm();
    };
    panel.appendChild(confirm);
    const cancel = this.makeMenuButton('取消');
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
    const item = this.inventory.remove(index);
    if (!item) return;
    this.gold += item.sellPrice;
    this.audio.coin();
    this.showInventory();
  }

  private confirmSellAll(maxRarity: Rarity): void {
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

  private sellAllBelow(maxRarity: Rarity): void {
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
    this.gold += total;
    this.audio.coin();
    this.showInventory();
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
    this.gold -= costs.gold;
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
    this.inventory.items[index] = CraftingSystem.upgradeItem(item);
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

  private saveGame(): void {
    const data: SaveData = {
      version: 1,
      floor: this.floor,
      seed: this.seed,
      player: {
        level: this.player.level,
        xp: this.player.xp,
        xpToNext: xpToNext(this.player.level),
        attributePoints: this.player.attributePoints,
        attributeAllocated: this.attributeAllocated,
        talentPoints: this.talentPoints,
        unlockedTalents: [...this.unlockedTalents],
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
      playerStatuses: this.player.statuses,
    };
    SaveManager.save(data, this.saveSlot);
  }
}

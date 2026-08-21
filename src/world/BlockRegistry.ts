import * as THREE from 'three';
import { BlockTextures } from './Textures';

export interface BlockDefinition {
  id: string;
  texture: THREE.Texture;
  color: number;
  emissive?: number;
}

const registry = new Map<string, BlockDefinition>();

export function registerBlock(def: BlockDefinition): void {
  registry.set(def.id, def);
}

export function getBlock(id: string): BlockDefinition {
  return registry.get(id) ?? registry.get('stone')!;
}

export function initBlockRegistry(): void {
  registerBlock({ id: 'grass', texture: BlockTextures.grass, color: 0xffffff });
  registerBlock({ id: 'dirt', texture: BlockTextures.dirt, color: 0xffffff });
  registerBlock({ id: 'stone', texture: BlockTextures.stone, color: 0xffffff });
  registerBlock({ id: 'brick', texture: BlockTextures.brick, color: 0xffffff });
  registerBlock({ id: 'dungeon', texture: BlockTextures.dungeon, color: 0xffffff });
  registerBlock({ id: 'mossy', texture: BlockTextures.mossy, color: 0xffffff });
  registerBlock({ id: 'darkstone', texture: BlockTextures.darkstone, color: 0xffffff });
  registerBlock({ id: 'lavafloor', texture: BlockTextures.lavafloor, color: 0xffffff });
  registerBlock({ id: 'lava', texture: BlockTextures.lava, color: 0xffffff, emissive: 0xff3300 });
  registerBlock({ id: 'void', texture: BlockTextures.void, color: 0xffffff });
  registerBlock({ id: 'voidfloor', texture: BlockTextures.voidfloor, color: 0xffffff });
  registerBlock({ id: 'glow', texture: BlockTextures.glow, color: 0xffffff, emissive: 0x9b30ff });
  registerBlock({ id: 'portal', texture: BlockTextures.portal, color: 0xffffff, emissive: 0xb56bff });
}

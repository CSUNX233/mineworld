export type DeepChapter = 'foundry' | 'sanctum';
export interface DeepChapterStyle {
  chapter: DeepChapter; name: string; landmark: string; wallHeight: number;
  tint: number; fog: number; ground: number; sun: number; sunIntensity: number; ambient: number;
  light: number; glow: number; exposure: number;
}

const foundry = { chapter: 'foundry' as const, ground: 0x29313a, ambient: 1.4, exposure: 1.32, light: 0xffa34b, glow: 0xffaa38 };
const sanctum = { chapter: 'sanctum' as const, ground: 0x3e504a, ambient: 1.35, exposure: 1.23, light: 0x83e1dc, glow: 0x75d8d4 };
/** Distinct silhouettes as well as palettes; no combat values live in art profiles. */
export const DEEP_CHAPTER_STYLES: Readonly<Record<number, DeepChapterStyle>> = {
  6: { ...foundry, name: '铸造前庭', landmark: 'tank', wallHeight: 1, tint: 0xe3ecf4, fog: 0x65727a, sun: 0xffe3bd, sunIntensity: 1.9 },
  7: { ...foundry, name: '运输支廊', landmark: 'hoist', wallHeight: 1.05, tint: 0xeadbc5, fog: 0x706456, sun: 0xffd6a1, sunIntensity: 1.85 },
  8: { ...foundry, name: '共鸣车间', landmark: 'coil', wallHeight: 1.12, tint: 0xcadfec, fog: 0x526a74, sun: 0xd8ecff, sunIntensity: 1.7, light: 0x87d9e1 },
  9: { ...foundry, name: '过载枢纽', landmark: 'chimney', wallHeight: 1.15, tint: 0xe0d2c4, fog: 0x655952, sun: 0xffc79a, sunIntensity: 2.0, glow: 0xff8432 },
  10: { ...foundry, name: '总炉核心', landmark: 'chimney', wallHeight: 1.25, tint: 0xd7d3cc, fog: 0x5e5050, sun: 0xffc092, sunIntensity: 2.0, glow: 0xff8c30 },
  11: { ...sanctum, name: '缄默墓廊', landmark: 'broken_bell', wallHeight: .9, tint: 0xd3e2dc, fog: 0x52645e, sun: 0xd4eeec, sunIntensity: 1.7 },
  12: { ...sanctum, name: '送葬回庭', landmark: 'tablet', wallHeight: 1, tint: 0xf0e8cb, fog: 0x727a68, sun: 0xf3e8c9, sunIntensity: 1.8 },
  13: { ...sanctum, name: '万名骨殿', landmark: 'ossuary', wallHeight: 1.15, tint: 0xeee8d7, fog: 0x666e67, sun: 0xe5e8df, sunIntensity: 1.85 },
  14: { ...sanctum, name: '倒悬钟庭', landmark: 'bell_gantry', wallHeight: 1.12, tint: 0xcde0da, fog: 0x506b69, sun: 0xc7e3e7, sunIntensity: 1.8 },
  15: { ...sanctum, name: '无名王座', landmark: 'ossuary', wallHeight: 1.1, tint: 0xfff1d6, fog: 0x758079, sun: 0xe5f2ed, sunIntensity: 2.0, ambient: 1.4 },
};
export function deepChapterStyle(floor: number): DeepChapterStyle | undefined { return DEEP_CHAPTER_STYLES[floor]; }

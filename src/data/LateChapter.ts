import type { FloorData, FloorTheme, Room } from '../types';
import type { ChapterRoomSpec, ChapterEncounterSpec } from './RuinsChapter';
import { roomContainsCell } from '../world/RoomGeometry';
import { BlockKind } from '../world/Block';

export const LATE_ROOMS = {
  'abyss-lamp': [16,14,'cut-corners'], 'abyss-mirror': [18,14,'crescent'],
  'abyss-eye': [18,17,'three-leaf'], 'abyss-sweep': [20,14,'cut-corners'],
  'abyss-store': [13,12,'cut-corners'], 'abyss-trial': [19,18,'twin-hall'], 'abyss-throne': [24,23,'octagon'],
  'citadel-banner': [18,16,'cut-corners'], 'citadel-wave': [21,14,'cut-corners'],
  'citadel-seal': [20,18,'three-leaf'], 'citadel-muster': [21,16,'cut-corners'],
  'citadel-store': [14,13,'cut-corners'], 'citadel-trial': [22,18,'twin-hall'], 'citadel-throne': [25,24,'octagon'],
} as const;
export type LateTemplate = keyof typeof LATE_ROOMS;
export const LATE_NAMES = ['失灯外庭','千面观廊','悬瞳裂庭','无昼观台','三瞳王庭','归军外堡','镇印长堤','千锁兵庭','天衡内关','封界王垒'];
export const isLateChapter = (floor:number) => floor >=16 && floor<=25;
export const hasLateContent = (data:FloorData) => isLateChapter(data.floor) && (data.generationVersion??1)>=7;
export function lateRoomSpec(floor:number,id:string):ChapterRoomSpec|undefined {
  if(!isLateChapter(floor))return;
  const abyss=floor<=20, stage=(floor-16)%5;
  const basics:LateTemplate[]=abyss?['abyss-lamp','abyss-mirror','abyss-eye','abyss-sweep']:['citadel-banner','citadel-wave','citadel-seal','citadel-muster'];
  const template:LateTemplate = id==='room-7'||id==='room-3'||id==='room-5' ? abyss?'abyss-store':'citadel-store'
    :id==='room-1'&&stage===4?abyss?'abyss-throne':'citadel-throne'
    :id==='room-6'?abyss?'abyss-trial':'citadel-trial'
    :id==='room-2'?basics[3]:id==='room-4'?basics[Math.min(2,stage)]:basics[Math.min(stage,2)];
  const [width,depth,shape]=LATE_ROOMS[template];
  return {template,width:id==='room-7'?10:width,depth:id==='room-7'?10:depth,shape};
}
export function lateTheme(floor:number):FloorTheme {
  return {id:floor<=20?'abyss':'citadel',name:`${floor<=20?'蚀光深庭':'封界天垒'} · ${LATE_NAMES[floor-16]}`,wallType:'darkstone',floorType:'dungeon',accentType:'brick'};
}
export type LateDeviceKind='lamp'|'mirror'|'eye'|'banner'|'redirector'|'seal';
export interface LateAnchor {id:string;kind:LateDeviceKind;x:number;z:number;angle:number;roomId:string}
export function lateMechanismAnchors(data:FloorData):LateAnchor[] {
  if(!hasLateContent(data))return [];
  const result:LateAnchor[]=[];
  for(const room of data.rooms){
    const t=room.template??'';
    if(['start','treasure','sanctuary'].includes(room.kind??''))continue;
    const kinds:LateDeviceKind[]=t==='abyss-throne'?['eye','eye','eye']:t==='citadel-throne'?['redirector','seal','seal']
      :t.includes('lamp')||t==='abyss-trial'?['lamp','lamp']:t.includes('mirror')?['mirror','mirror']:t.includes('eye')?['eye','eye']
      :t.includes('banner')||t==='citadel-trial'?['banner']:t.includes('wave')?['redirector','redirector']:t.includes('seal')?['seal','seal']:[];
    kinds.forEach((kind,i)=>{
      const target={x:i===2?room.x+room.width/2:i===0?room.x+3:room.x+room.width-4,z:i===2?room.z+room.depth-4:room.z+room.depth/2};
      const cells=(room.cells??[]).filter(p=>roomContainsCell(room,p.x,p.z)&&data.grid[p.z]?.[p.x]===BlockKind.Floor
        &&![data.portal,data.spawn,...data.chests,...(data.merchant?[data.merchant]:[]),...(room.entrances??[])].some(q=>Math.hypot(p.x-q.x,p.z-q.z)<2.5)
        &&!result.some(q=>Math.hypot(p.x+.5-q.x,p.z+.5-q.z)<3));
      cells.sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z));
      const p=cells[0];if(p)result.push({id:`${room.id}:${kind}:${i}`,roomId:room.id!,kind,x:p.x+.5,z:p.z+.5,angle:i===0?Math.PI/2:-Math.PI/2});
    });
  }
  return result;
}
export function lateEncounter(floor:number,id:string):ChapterEncounterSpec|undefined {
  if(!isLateChapter(floor)||id==='room-7'||id==='room-3'||id==='room-5')return;
  if(id==='room-1'&&floor%5===0)return {monsterIds:[floor===20?'boss':'ruins_warden'],intent:'利用已学机关，集中输出首领。'};
  const abyss=floor<=20,stage=(floor-16)%5;
  const weak=abyss?'ash_wanderer':'lost_soldier';
  const specialists=abyss?['shade_hunter','facet_mage','eye_keeper','rift_weaver']:['banner_captain','seal_engine','seal_scribe','lock_arbalist'];
  const key=specialists[Math.min(stage,3)];
  const ids=id==='room-2'?[]:id==='room-4'&&stage>=2?[key,abyss?'crystal_guard':'linked_guard']:[key];
  ids.push(...Array.from({length:id==='room-2'?10:id==='room-0'&&stage===0?4:7},()=>weak));
  return {monsterIds:ids,intent:abyss?'观察显影、镜像与凝视，侧移后反击。':'先拆支援，借用镇印，截断有限增援。'};
}

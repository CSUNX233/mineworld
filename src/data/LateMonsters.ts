import type { MonsterDefinition } from '../types';
const base={armor:2,speed:2.0,detectRadius:28,attackRange:1.6,attackCooldown:2,xp:40,behavior:'melee' as const,element:'physical' as const};
export const LATE_MONSTERS:MonsterDefinition[]=[
  {...base,id:'ash_wanderer',name:'灰壳游民',health:70,attack:16,xp:22,color:0x918799,minFloor:16},
  {...base,id:'shade_hunter',name:'薄影猎手',health:135,attack:25,speed:2.6,color:0x78618f,minFloor:16},
  {...base,id:'facet_mage',name:'折面术士',health:120,attack:24,attackRange:9,color:0xa997c8,minFloor:17},
  {...base,id:'eye_keeper',name:'瞳灯看守',health:155,attack:27,attackRange:10,color:0x9171b0,minFloor:18},
  {...base,id:'rift_weaver',name:'缝隙织者',health:135,attack:23,attackRange:7,color:0x6c6481,minFloor:19},
  {...base,id:'crystal_guard',name:'晶背负卫',health:190,attack:27,speed:1.5,color:0x9584aa,minFloor:18},
  {...base,id:'lost_soldier',name:'失籍兵卒',health:76,attack:17,xp:23,color:0xa6a393,minFloor:21},
  {...base,id:'banner_captain',name:'持旗军士',health:155,attack:26,color:0xb18c55,minFloor:21},
  {...base,id:'seal_engine',name:'镇印执械',health:185,attack:27,attackRange:7,color:0x637d87,minFloor:22},
  {...base,id:'seal_scribe',name:'缄印司录',health:140,attack:23,attackRange:8,color:0xbda870,minFloor:23},
  {...base,id:'lock_arbalist',name:'索敌弩手',health:120,attack:25,attackRange:10,color:0x7a9298,minFloor:24},
  {...base,id:'linked_guard',name:'连盾卫',health:185,attack:27,speed:1.65,color:0x66777c,minFloor:23},
];

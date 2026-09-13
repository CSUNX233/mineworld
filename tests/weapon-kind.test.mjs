import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildSync}=createRequire(require.resolve('vite/package.json'))('esbuild');
const result=buildSync({stdin:{contents:`export {weaponKind} from './src/items/WeaponKind'; export {P5_SET_ITEMS} from './src/items/SetItems'; export {starterWeapon} from './src/items/StarterEquipment';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {weaponKind,P5_SET_ITEMS,starterWeapon}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
test('starter, generated set and saved-content staff variants select the staff',()=>{
  assert.equal(weaponKind(starterWeapon('arcanist')),'staff');
  assert.equal(weaponKind(starterWeapon('summoner')),'staff');
  assert.equal(weaponKind(starterWeapon('vanguard')),'sword');
  for(const item of P5_SET_ITEMS.filter(item=>item.slot==='weapon'))assert.equal(weaponKind({...item,id:'generated-instance',contentId:item.id}),item.name.includes('法杖')?'staff':'sword');
  assert.equal(weaponKind({slot:'weapon',id:'instance',contentId:'staff_glacier',name:'旧冰川武器',icon:'hammer'}),'staff');
  assert.equal(weaponKind(null),null);
});

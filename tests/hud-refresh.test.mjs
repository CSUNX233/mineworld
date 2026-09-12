import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {buildSync}=createRequire(require.resolve('vite/package.json'))('esbuild');
// Isolate asset loading, retaining the actual HUD and pixel text implementations.
const source=readFileSync(new URL('../src/ui/HUD.ts',import.meta.url),'utf8')
  .replace("import { createUiIcon } from './UiAssets';","const createUiIcon = (...args: unknown[]) => document.createElement('span');")
  .replace("import { combatArtUrl } from './CombatArt';","const combatArtUrl = (...args: unknown[]) => ''; ");
const built=buildSync({stdin:{contents:source,loader:'ts',resolveDir:fileURLToPath(new URL('../src/ui',import.meta.url))},define:{'import.meta.env.BASE_URL':'"/"'},bundle:true,write:false,format:'esm',platform:'node'});
const {HUD}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
test('unchanged HUD retains nodes while health interpolation and changed labels keep updating',()=>{
  class Element {
    style={};dataset={};children=[];writes=0;markup='';hidden=false;
    setAttribute(){} appendChild(c){this.children.push(c);} prepend(c){this.children.unshift(c);} append(c){this.children.push(c);}
    replaceChildren(...c){this.children=c;}
    set innerHTML(v){this.markup=v;this.writes++;} get innerHTML(){return this.markup;}
    set textContent(v){this.markup=v;this.children=[];this.writes++;} get textContent(){return this.markup;}
    get outerHTML(){return this.markup+this.children.map(c=>c.outerHTML).join('');}
  }
  const original=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try {
    const hud=Object.create(HUD.prototype);
    for(const key of ['hpText','mpText','levelText','infoText','lowHealth','buildIndicator'])hud[key]=new Element();
    hud.barValues=[0,0,0,0];hud.barTargets=[0,0,0,0];hud.barsReady=false;hud.barLevel=0;
    const state={health:100,maxHealth:100,mana:50,maxMana:50,xp:10,xpToNext:100,level:1,floor:1,floorName:'遗迹',gold:3,monstersRemaining:2,kills:0,shield:10};
    hud.setState(state);hud.setBuildState({meleeCharges:1,guardRemaining:3},true);
    const icon=hud.buildIndicator.children[0];
    for(let i=0;i<20;i++){hud.setState({...state,health:80});hud.setBuildState({meleeCharges:1,guardRemaining:2},true);}
    assert.equal(hud.levelText.writes,1);assert.equal(hud.infoText.writes,1);
    assert.equal(hud.buildIndicator.children[0],icon);assert.equal(hud.barTargets[0],80);
    hud.setState({...state,xp:20,gold:8});
    assert.equal(hud.levelText.writes,2);assert.equal(hud.infoText.writes,2);
    assert.match(hud.levelText.innerHTML,/经验 20\/100/);
    hud.setBuildState({meleeCharges:1,guardRemaining:0},true);
    assert.equal(hud.buildIndicator.children.length,1);
    hud.setBuildState({meleeCharges:1,guardRemaining:0},false);assert.equal(hud.buildIndicator.hidden,true);
  }finally{globalThis.document=original;}
});

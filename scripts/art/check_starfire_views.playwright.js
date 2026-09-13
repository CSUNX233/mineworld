async page => {
 const out='D:/34229/mineworld/art/sunlit-actors/starfire-hero/review/stage-b/';
 await page.waitForFunction(()=>game.player.presentation.ready&&!game.loadingFloor);
 const reports={};
 await page.evaluate(()=>{game.running=false;game.controller.setFirstPerson(true);game.updatePlayerVisibility();game.player.update(1/60,game.elapsed);});
 await page.screenshot({path:out+'game-fp-final.png'});
 await page.evaluate(()=>{
  const h=game.player.presentation;
  h.setWeapon({id:'starter_staff_legacy',contentId:'starter_staff',slot:'weapon',name:'Renamed weapon'});
  game.player.update(1/60,game.elapsed);
 });
 await page.screenshot({path:out+'game-fp-staff.png'});
 reports.staff=await page.evaluate(()=>({kind:game.player.presentation.kind,parent:game.player.presentation.weapons.get('staff').parent.name}));
 await page.evaluate(()=>{game.controller.setFirstPerson(false);game.updatePlayerVisibility();for(let i=0;i<30;i++)game.player.update(1/60,game.elapsed);});
 reports.staffStable=await page.evaluate(()=>{
  const h=game.player.presentation,b=h.bones.get('handR'),before=b.quaternion.clone();
  for(let i=0;i<60;i++)game.player.update(1/60,game.elapsed);
  if(before.angleTo(b.quaternion)>1e-6)throw Error('held wrist accumulates rotation');
  return {angle:before.angleTo(b.quaternion),parent:h.weapons.get('staff').parent.name};
 });
 await page.screenshot({path:out+'game-third-person-staff.png'});
 await page.evaluate(()=>{game.player.presentation.setWeapon(game.player.equipment.getWeapon());game.player.update(1/60,game.elapsed);});
 await page.screenshot({path:out+'game-third-person-final.png'});
 const state=await page.context().storageState();
 const mobile=await page.context().browser().newContext({storageState:state,viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const mp=await mobile.newPage();
 await mp.goto('http://127.0.0.1:5173/');
 await mp.getByRole('button',{name:'开始游戏',exact:true}).click();await mp.getByRole('button',{name:/继续游戏/}).first().click();
 await mp.waitForFunction(()=>game.player.presentation.ready&&!game.loadingFloor);
 await mp.evaluate(()=>{game.running=false;game.controller.setFirstPerson(true);game.updatePlayerVisibility();game.player.update(1/60,game.elapsed);});
 await mp.screenshot({path:out+'game-mobile-fp.png'});
 reports.mobile=await mp.evaluate(()=>({width:innerWidth,height:innerHeight,touch:navigator.maxTouchPoints,ready:game.player.presentation.ready}));
 await mp.evaluate(()=>{game.controller.setFirstPerson(false);game.updatePlayerVisibility();game.player.update(1/60,game.elapsed);});
 await mp.screenshot({path:out+'game-mobile-third-person.png'});
 await mobile.close();
 const failed=await page.context().browser().newContext({storageState:state,viewport:{width:1280,height:800}});
 const fp=await failed.newPage();await fp.route('**/starfire-motion.glb',route=>route.abort());
 await fp.goto('http://127.0.0.1:5173/');await fp.getByRole('button',{name:'开始游戏',exact:true}).click();await fp.getByRole('button',{name:/继续游戏/}).first().click();
 await fp.waitForFunction(()=>game.player.presentation.failed&&!game.loadingFloor);
 reports.fallback=await fp.evaluate(()=>{game.running=false;return {failed:game.player.presentation.failed,ready:game.player.presentation.ready,bodyChildren:game.player.group.children.length,fpChildren:game.firstPersonView.group.children.length,alive:game.player.alive};});
 if(!reports.fallback.bodyChildren||!reports.fallback.fpChildren||!reports.fallback.alive)throw Error('invisible/unplayable fallback');
 await fp.screenshot({path:out+'game-load-fallback.png'});
 await failed.close();
 return reports;
}

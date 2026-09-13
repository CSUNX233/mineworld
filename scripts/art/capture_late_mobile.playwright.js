async page=>{
 await page.setViewportSize({width:1000,height:460});
 await page.evaluate(()=>{window.mobileOriginalUpdate=window.game.updateGame;});
 for(const floor of [18,23]){
  await page.evaluate(async floor=>{
   const g=window.game;g.floor=floor;g.running=false;await g.generateCurrentFloor();g.removeStartMenu();document.querySelector('#ui-root').style.visibility='visible';g.player.group.visible=true;
   const r=g.floorData.rooms.find(r=>r.id==='room-0');g.player.position.set(r.center.x,0,r.center.z+3);g.player.yaw=Math.PI;g.player.velocity.set(0,0,0);g.player.onGround=true;g.controller.setFirstPerson(false);g.controller.resetView(g.floorData);
   g.running=true;g.paused=false;g.saveTimer=0;
   for(let i=0;i<20;i++)window.mobileOriginalUpdate.call(g,.016);
   g.updateGame=()=>{};g.running=true;g.touchControls?.setGameplayState(true,false,g.interactionLabel());g.hud.setState(g.hudState());g.hud.update(.1);
   g.world.update(.1,0);g.world.group.getObjectByName('deep-chapter-scenery').userData.lightPool.update(0,g.player.position);g.renderer.shadowMap.needsUpdate=true;g.renderer.render(g.scene,g.camera);
  },floor);
  await page.screenshot({path:`D:/34229/mineworld/art/sunlit-world/chapters-16-25-kit/floor-${floor}-mobile-gameplay.png`});
  await page.evaluate(()=>{const g=window.game;g.controller.setFirstPerson(true);for(let i=0;i<10;i++)g.controller.updateCamera(.1,g.floorData);g.updatePlayerVisibility();g.touchControls.setGameplayState(true,true,g.interactionLabel());});
  await page.screenshot({path:`D:/34229/mineworld/art/sunlit-world/chapters-16-25-kit/floor-${floor}-mobile-first-person.png`});

 }
 await page.evaluate(()=>{window.game.updateGame=window.mobileOriginalUpdate;window.game.running=false;});
}

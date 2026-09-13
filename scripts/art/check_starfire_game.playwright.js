async page => {
 const out='D:/34229/mineworld/art/sunlit-actors/starfire-hero/review/stage-b/';
 await page.waitForFunction(()=>!game.loadingFloor && game.player.presentation.ready);
 const report=await page.evaluate(()=>{
  const g=game,p=g.player,h=p.presentation;
  g.running=false;g.paused=false;g.input.reset();g.controller.setFirstPerson(false);
  const spawn=p.position.clone();
  window.sfSamples=[];window.sfTransitions=[];
  window.sfStep=(count,input=0,jump=false)=>{
   g.input.setAnalogMovement(0,input);
   if(jump)g.input.justPressed.add('Space');
   for(let i=0;i<count;i++){
    g.controller.update(1/60,g.floorData,g.effectiveStats(),1/60);
    p.update(1/60,g.elapsed);g.firstPersonView.update(1/60,p.moving,p.sprinting);g.updatePlayerVisibility();
    g.input.endFrame();g.renderer.render(g.scene,g.camera);h.renderFirstPerson(g.renderer);
    window.sfSamples.push({y:p.position.y,vy:p.velocity.y,ground:p.onGround,state:h.motion.state,air:h.motion.airTime,speed:h.motion.speed});
   }
  };
  window.sfReset=()=>{p.position.copy(spawn);p.velocity.set(0,0,0);p.onGround=true;g.input.reset();g.controller.resetView(g.floorData);h.resetMotion();window.sfStep(2);};
  window.sfSwitch=()=>{
   const before=JSON.stringify([h.motion.state,h.motion.stateTime,h.phase,...[...h.actions.values()].map(a=>a.time)]);
   g.controller.toggleView();g.updatePlayerVisibility();
   const after=JSON.stringify([h.motion.state,h.motion.stateTime,h.phase,...[...h.actions.values()].map(a=>a.time)]);
   if(before!==after)throw Error('view switch reset animation');
   window.sfTransitions.push(h.motion.state);
  };
  return {spawn:spawn.toArray()};
 });
 await page.evaluate(()=>{sfReset();sfStep(25,.4);});
 await page.screenshot({path:out+'game-walk.png'});
 report.walk=await page.evaluate(()=>({...game.player.presentation.motion}));
 await page.evaluate(()=>{sfReset();game.input.keys.add('ShiftLeft');sfStep(25,1);});
 await page.screenshot({path:out+'game-run.png'});
 report.run=await page.evaluate(()=>({...game.player.presentation.motion}));
 await page.evaluate(()=>{sfReset();sfStep(1,0,true);sfSwitch();sfStep(1);});
 await page.screenshot({path:out+'game-jump-start-fp.png'});
 await page.evaluate(()=>{sfStep(12);sfSwitch();sfStep(1);});
 await page.screenshot({path:out+'game-jump-rise.png'});
 await page.evaluate(()=>{sfStep(5);sfSwitch();sfStep(1);});
 await page.screenshot({path:out+'game-jump-apex-fp.png'});
 await page.evaluate(()=>{sfStep(7);sfSwitch();sfStep(1);});
 await page.screenshot({path:out+'game-jump-fall.png'});
 await page.evaluate(()=>{while(!game.player.onGround)sfStep(1);sfSwitch();sfStep(3);});
 await page.screenshot({path:out+'game-land-light-fp.png'});
 report.light=await page.evaluate(()=>({...game.player.presentation.motion}));
 await page.evaluate(()=>{sfStep(1,.4,true);if(game.player.onGround)throw Error('landing locked jump');sfSwitch();sfStep(1,.4);});
 report.rejump=await page.evaluate(()=>({...game.player.presentation.motion}));
 await page.evaluate(()=>{sfReset();game.player.position.y=4;game.player.onGround=false;while(!game.player.onGround)sfStep(1);sfStep(6);});
 await page.screenshot({path:out+'game-land-heavy.png'});
 report.heavy=await page.evaluate(()=>({...game.player.presentation.motion}));
 await page.evaluate(()=>{sfSwitch();sfStep(1,1);});
 report.movingLanding=await page.evaluate(()=>({speed:game.player.velocity.length(),input:game.player.motionInput,state:game.player.presentation.motion.state}));
 await page.evaluate(()=>{sfReset();game.controller.setFirstPerson(true);sfStep(10);});
 await page.screenshot({path:out+'game-fp-final.png'});
 report.transitions=await page.evaluate(()=>sfTransitions);
 report.states=await page.evaluate(()=>[...new Set(sfSamples.map(s=>s.state))]);
 report.maxScenarioHeight=await page.evaluate(()=>Math.max(...sfSamples.filter(s=>s.state.startsWith('Jump')).map(s=>s.y)));
 report.visibility=await page.evaluate(()=>({world:game.player.presentation.root.visible,fp:game.player.presentation.fpRoot.visible,oldChildren:game.player.group.children.map(o=>o.name),firstPersonFallbackChildren:game.firstPersonView.group.children.length}));
 return report;
}

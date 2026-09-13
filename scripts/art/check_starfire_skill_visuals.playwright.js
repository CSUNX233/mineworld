async page => {
 const out='D:/34229/mineworld/art/sunlit-actors/starfire-hero/review/stage-b/';
 await page.reload();
 await page.getByRole('button',{name:'开始游戏',exact:true}).click();
 await page.getByRole('button',{name:/继续游戏/}).first().click();
 await page.waitForFunction(()=>game.player.presentation.ready&&!game.loadingFloor);
 const result=await page.evaluate(()=>{
  const g=game,p=g.player,h=p.presentation;g.running=false;g.paused=false;
  g.skillLoadout=['whirlwind','dash','fireball','guard_counter'];g.skills=g.buildSkillStates();
  g.controller.setFirstPerson(true);g.controller.updateCamera(0,g.floorData);g.updatePlayerVisibility();p.update(1/60,g.elapsed);
  const skill=g.skills.find(s=>s.id==='fireball');
  skill.cooldownRemaining=0;const mana=p.mana,projectiles=g.projectiles.length;
  g.tryUseSkill(skill,g.effectiveStats());
  if(h.skillVisual.castTime<=0 || h.skillVisual.slashTime!==0)throw Error('successful spell did not trigger palm energy');
  if(p.mana!==mana-skill.manaCost || g.projectiles.length!==projectiles+1)throw Error('spell gameplay changed');
  const timer=h.skillVisual.castTime;g.tryUseSkill(skill,g.effectiveStats());
  if(timer!==h.skillVisual.castTime || p.mana!==mana-skill.manaCost)throw Error('rejected cast changed presentation/cost');
  p.update(.10,g.elapsed);
  return {successfulSpell:true,rejectedCooldown:true};
 });
 await page.screenshot({path:out+'skill-palm-fp.png'});
 await page.evaluate(()=>{
  const h=game.player.presentation,t=h.skillVisual.castTime;
  game.controller.setFirstPerson(false);game.controller.boomDistance=4;game.controller.updateCamera(0,null);game.updatePlayerVisibility();
  if(h.skillVisual.castTime!==t || h.skillVisual.flame.parent.name!=='SF_Skill_L')throw Error('third-person switch lost effect');
 });
 await page.screenshot({path:out+'skill-palm-tp.png'});
 await page.evaluate(()=>{
  const g=game,p=g.player,h=p.presentation;
  g.controller.setFirstPerson(true);g.controller.updateCamera(0,g.floorData);g.updatePlayerVisibility();
  p.update(.65,g.elapsed);
  if(h.skillVisual.flame.visible)throw Error('palm effect did not expire');
  const skill=g.skills.find(s=>s.id==='whirlwind');skill.cooldownRemaining=0;
  g.tryUseSkill(skill,g.effectiveStats());p.update(.06,g.elapsed);
  if(h.skillVisual.slashTime<=0 || h.skillVisual.castTime>0)throw Error('melee used wrong hand effect');
  const before=h.fpBones.get('forearmR').quaternion.clone(),timer=h.skillVisual.slashTime;
  g.controller.setFirstPerson(false);g.updatePlayerVisibility();g.controller.setFirstPerson(true);g.updatePlayerVisibility();
  if(h.skillVisual.slashTime!==timer || before.angleTo(h.fpBones.get('forearmR').quaternion)>1e-6)throw Error('switch changed slash pose');
 });
 await page.screenshot({path:out+'skill-slash-fp-contact.png'});
 await page.evaluate(()=>game.player.update(.12,game.elapsed));
 await page.screenshot({path:out+'skill-slash-fp-followthrough.png'});
 await page.evaluate(()=>{game.controller.setFirstPerson(false);game.controller.boomDistance=4;game.controller.updateCamera(0,null);game.updatePlayerVisibility();});
 await page.screenshot({path:out+'skill-slash-tp.png'});
 await page.evaluate(()=>{
  const h=game.player.presentation;game.player.update(.5,game.elapsed);
  if(h.skillVisual.slashTime!==0)throw Error('slash never recovered');
  h.skillVisual.castTime=.5;h.stopSkillVisual();
  if(h.skillVisual.flame.visible || h.skillVisual.castTime!==0)throw Error('death/reset left effect active');
 });
 console.log(JSON.stringify({...result,viewSync:true,melee:true,expiration:true}));
}

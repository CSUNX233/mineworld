async page => {
  await page.reload();
  await page.getByRole('button', {name:'开始游戏',exact:true}).click();
  await page.getByRole('button', {name:/继续游戏/}).first().click();
  await page.waitForFunction(()=>window.game.player.presentation.ready&&!window.game.loadingFloor);
  const report = await page.evaluate(()=>{
    const g=window.game;g.running=false;g.controller.setFirstPerson(true);g.updatePlayerVisibility();g.player.update(1/60,g.elapsed);
    const h=g.player.presentation;
    const before=JSON.stringify([h.phase,h.stateTime]);
    g.controller.setFirstPerson(false);g.updatePlayerVisibility();
    g.controller.setFirstPerson(true);g.updatePlayerVisibility();
    return {viewSwitchClockUnchanged:before===JSON.stringify([h.phase,h.stateTime]),meshes:h.fpRoot.children.filter(o=>o.isMesh).map(o=>o.name)};
  });
  await page.screenshot({path:'D:/34229/mineworld/art/sunlit-actors/starfire-hero/review/stage-b/game-hands-only-retracted.png'});
  console.log(JSON.stringify(report));
}

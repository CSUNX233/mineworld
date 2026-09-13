async page => {
 await page.setViewportSize({width:900,height:750});
 await page.evaluate(async()=>{
  const g=window.game;g.running=false;g.clearEntities();g.player.group.visible=false;g.firstPersonView.setVisible(false);document.querySelector('#ui-root').style.visibility='hidden';
  const src=await(await fetch('/src/world/World.ts')).text();
  for(const [name,method,args] of [['DeepChapterAssets','preloadDeepChapterKit',[16,21]],['InteractionProps','preloadInteractionProps',[1]]]){
    const path=src.match(new RegExp('from "([^" ]*'+name+'[^" ]*)"'))[1];for(const arg of args)await(await import(path))[method](arg);
  }
  window.roomSheets=[];window.originalGameCamera=g.camera;
 });
 const specs=[['abyss-lamp',16,'room-0'],['abyss-mirror',17,'room-0'],['abyss-eye',18,'room-0'],['abyss-sweep',19,'room-2'],['abyss-store',16,'room-3'],['abyss-trial',19,'room-6'],['abyss-throne',20,'room-1'],['citadel-banner',21,'room-0'],['citadel-wave',22,'room-0'],['citadel-seal',23,'room-0'],['citadel-muster',24,'room-2'],['citadel-store',21,'room-3'],['citadel-trial',24,'room-6'],['citadel-throne',25,'room-1']];
 for(const [name,floor,id] of specs){
  await page.evaluate(async({name,floor,id})=>{
   const g=window.game,{generateFloor}=await import('/src/world/FloorGenerator.ts'),{configureChapterLighting}=await import('/src/world/ChapterLighting.ts');
   const src=await(await fetch('/src/world/World.ts')).text(),three=src.match(/import \* as THREE from "([^"]+)"/)[1],T=await import(three);window.sheetThree=T;
   const data=generateFloor(411485540,floor,7),r=data.rooms.find(r=>r.id===id),old=data.grid;
   data.rooms=[r];data.grid=Array.from({length:data.size},()=>Array(data.size).fill(0));
   for(let z=r.z-1;z<=r.z+r.depth;z++)for(let x=r.x-1;x<=r.x+r.width;x++)if(old[z]?.[x]!==undefined)data.grid[z][x]=old[z][x];
   data.spawn={x:Math.floor(r.center.x),z:Math.floor(r.center.z)};data.portal={x:Math.floor(r.center.x),z:r.z+1};
   data.chests=data.chests.filter(c=>c.x>=r.x&&c.x<r.x+r.width&&c.z>=r.z&&c.z<r.z+r.depth);data.merchant=name.endsWith('store')?{x:Math.floor(r.center.x),z:Math.floor(r.center.z)}:undefined;
   g.world.generate(data);g.floorData=data;g.floor=floor;g.lateChapter.setup(data);configureChapterLighting(g.scene,g.renderer,data);g.scene.fog=null;g.scene.background=new T.Color(floor<=20?0x302d40:0x718595);
   window.sheetRoom=r;window.sheetOriginals=[];
   g.world.group.traverse(o=>{if(o.isInstancedMesh){window.sheetOriginals.push([o,o.instanceMatrix.array.slice()]);if(o.name.startsWith('distant_tower'))o.visible=false;}});
   const atmosphere=g.world.group.getObjectByName('chapter-atmosphere');if(atmosphere)atmosphere.visible=false;
   g.player.position.set(r.center.x,0,r.center.z);g.world.update(1,0);g.world.group.getObjectByName('deep-chapter-scenery').userData.lightPool.update(0,g.player.position);
   window.roomSheets.push({name,floor,width:r.width,depth:r.depth});
  },{name,floor,id});
  for(const view of ['top','front','right']){
   await page.evaluate(view=>{
    const g=window.game,T=window.sheetThree,r=window.sheetRoom,m=new T.Matrix4(),p=new T.Vector3();
    for(const [o,arr]of window.sheetOriginals){o.instanceMatrix.array.set(arr);if(view!=='top'&&/^(wall|pillar|arch|lamp|wall_banner)/.test(o.name))for(let i=0;i<o.count;i++){
      o.getMatrixAt(i,m);p.setFromMatrixPosition(m);
      if((view==='front'?p.z>r.center.z:p.x>r.center.x)&&p.y>=0)o.setMatrixAt(i,new T.Matrix4().makeScale(0,0,0));
    }o.instanceMatrix.needsUpdate=true;}
    const span=Math.max(r.width,r.depth)+8,aspect=900/750,camera=new T.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.1,180);
    const x=r.center.x,z=r.center.z;
    if(view==='top'){camera.position.set(x,60,z);camera.up.set(0,0,-1);camera.lookAt(x,0,z);}else if(view==='front'){camera.position.set(x,3,z+60);camera.lookAt(x,3,z);}else{camera.position.set(x+60,3,z);camera.lookAt(x,3,z);}
    camera.updateProjectionMatrix();g.camera=camera;g.renderer.setSize(900,750,false);g.renderer.shadowMap.needsUpdate=true;g.renderer.render(g.scene,camera);
   },view);
   await page.screenshot({path:`D:/34229/mineworld/art/sunlit-world/chapters-16-25-kit/${name}-room-${view}.png`});
  }
 }
 await page.evaluate(()=>{window.game.camera=window.originalGameCamera;});
}

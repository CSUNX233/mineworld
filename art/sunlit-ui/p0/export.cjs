// Run with SHARP_MODULE pointing at sharp when it is not installed locally.
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const groups = [
  ['status-a', 'statuses', 4, ['burning','frozen','slow','poisoned','shocked','shield','damage','regeneration']],
  ['effects-b', 'effects', 4, ['slash','impact','fire','ice','lightning','smoke','shockwave','shadow']],
  ['telegraphs-b', 'telegraphs', 3, ['circle','cone','lane','landing','target','elite']],
];
(async () => {
  for (const [source, group, columns, names] of groups) {
    const file = path.join(__dirname, source + '.png');
    const {width, height} = await sharp(file).metadata();
    const out = path.resolve(__dirname, '../../../public/assets/ui/sunlit/p0', group);
    await fs.mkdir(out, {recursive:true});
    for (let i=0;i<names.length;i++) {
      const left=Math.round(i%columns*width/columns), top=Math.round(Math.floor(i/columns)*height/2);
      const w=Math.round((i%columns+1)*width/columns)-left, h=Math.round((Math.floor(i/columns)+1)*height/2)-top;
      const {data,info}=await sharp(file).extract({left,top,width:w,height:h}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      // Discard broad, faint generated halos; retain opaque pixel silhouettes.
      let x0=w,y0=h,x1=0,y1=0;
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const k=(y*w+x)*4;
        const a=data[k+3];
        data[k+3]=a<110?0:Math.min(255,Math.round((a-110)*255/145));
        if(data[k+3]>32){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
      }
      if(x1<x0||y1<y0) throw Error('Empty sprite '+names[i]);
      const cropped = await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
        .extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}).png().toBuffer();
      await sharp(cropped)
        .resize(240,240,{fit:'contain',kernel:'nearest',background:{r:0,g:0,b:0,alpha:0}})
        .extend({top:8,bottom:8,left:8,right:8,background:{r:0,g:0,b:0,alpha:0}})
        .webp({lossless:true}).toFile(path.join(out,names[i]+'.webp'));
    }
  }
  console.log('Exported 22 selected transparent sprites; original A/B atlases preserved.');
})();

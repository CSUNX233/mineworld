import {build} from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const version = process.argv[2] ?? '1.0.3';
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid version');
const output = path.join(root, 'releases', `abysswait-wovoon-${version}`);
await build({root, publicDir:false, build:{outDir:output, emptyOutDir:true,
  lib:{entry:path.join(root,'src/main.ts'),name:'AbyssWait',formats:['iife'],fileName:()=> 'game.js'},
  rollupOptions:{output:{inlineDynamicImports:true}}}});
const types={'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4',
  '.glb':'model/gltf-binary','.json':'application/json','.html':'text/html;charset=utf-8'};
const entries={};
async function collect(dir, prefix='') {
  for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const key=prefix+entry.name,absolute=path.join(dir,entry.name);
    if(entry.isDirectory()) await collect(absolute,key+'/');
    else entries[key]=[types[path.extname(key)]??'application/octet-stream',(await fs.readFile(absolute)).toString('base64')];
  }
}
await collect(path.join(root,'public'));
await fs.writeFile(path.join(output,'resources.js'),'window.__wovoonAssets='+JSON.stringify(entries)+';\n'+await fs.readFile(path.join(root,'scripts/wovoon/runtime.js'),'utf8'));
for(const name of await fs.readdir(output)) if(name.endsWith('.css')) {
  const css=await fs.readFile(path.join(output,name),'utf8');
  await fs.writeFile(path.join(output,'styles.js'),'window.__wovoonStyle('+JSON.stringify(css)+');');
  await fs.unlink(path.join(output,name));
}
// Relative URLs also cover browser-native HTML/CSS paths before the resource observer runs.
let game=await fs.readFile(path.join(output,'game.js'),'utf8');
game=game.replace(/(["'`])\/(assets|audio|textures|uiPNG)\//g,'$1./$2/');
await fs.writeFile(path.join(output,'game.js'),game);
await fs.copyFile(path.join(root,'public/privacy.html'),path.join(output,'privacy.html'));
// These three HUD backgrounds may be painted before their detached style is observed.
// Keep small native-file fallbacks so the first paint never requests a missing file.
for (const name of ['assets/ui/sunlit/bag-transparent.webp','assets/ui/sunlit/p4/view_toggle.webp','assets/ui/sunlit/p4/pause.webp']) {
  await fs.mkdir(path.dirname(path.join(output,name)),{recursive:true});
  await fs.copyFile(path.join(root,'public',name),path.join(output,name));
}
await fs.writeFile(path.join(output,'index.html'),`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>深渊，请等一下</title></head>
<body style="margin:0;background:#14232b;color:#f1eadc">
<div id="boot-loading" style="position:fixed;inset:0;z-index:20000;display:grid;place-content:center;background:#14232b;font:18px system-ui;text-align:center"><strong>深渊，请等一下</strong><p id="boot-label">正在准备离线游戏资源…</p></div>
<div id="app"></div><div id="ui-root"></div>
<script src="./resources.js"></script><script src="./styles.js"></script><script src="./game.js"></script>
</body></html>`);
// Create marker only after manual file:// validation; --verified is used for final packaging.
if(process.argv.includes('--verified')) {
  await fs.writeFile(path.join(output,'.wovoongame'),'');
  const zip=output+'.zip';
  const python=`import zipfile,pathlib,hashlib\np=pathlib.Path(${JSON.stringify(output)})\nz=pathlib.Path(${JSON.stringify(zip)})\nwith zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as f:\n for a in p.rglob('*'):\n  if a.is_file(): f.write(a,a.relative_to(p).as_posix())\nz.with_suffix('.zip.sha256').write_text(hashlib.sha256(z.read_bytes()).hexdigest()+'  '+z.name)\nprint(z.stat().st_size)\n`;
  execFileSync('python',['-c',python],{stdio:'inherit'});
}
console.log(`Standalone game: ${output}`);

"""Cut generated artwork; preserve originals. Python 3.12 + Pillow, no image API."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'export'
OUT.mkdir(exist_ok=True)
entries = []
groups = {}

def remove_background(im, checker=False):
    im = im.convert('RGBA')
    pixels = []
    for r,g,b,a in im.getdata():
        background = (max(r,g,b)-min(r,g,b)<22 and min(r,g,b)>85) if checker else (r>g+12 and b>g+12 and b>r*.75 and min(r,b)>20)
        pixels.append((0,0,0,0) if background or a<128 else (r,g,b,255))
    im.putdata(pixels)
    return im

def crop_content(im):
    bounds = im.getchannel('A').getbbox()
    if not bounds: raise ValueError('Empty sprite')
    return im.crop(bounds)

def band_bounds(im, expected):
    # The model's spacing is not a precise grid: find real empty horizontal gutters.
    alpha=im.getchannel('A')
    rows=[]
    for y in range(im.height):
        if sum(v>0 for v in alpha.crop((0,y,im.width,y+1)).getdata())>=16: rows.append(y)
    bands=[]
    for y in rows:
        if not bands or y-bands[-1][-1]>12: bands.append([y,y])
        else: bands[-1][-1]=y
    if len(bands)!=expected: raise ValueError(f'Expected {expected} rows, got {bands}')
    return [(max(0,a-3),min(im.height,b+4)) for a,b in bands]

def pixelize(im, size):
    im=im.resize(size,Image.Resampling.NEAREST)
    return im.quantize(colors=96,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).convert('RGBA')

def export(group,name,label,im,size=(128,128),mode='contain',logical=None,**meta):
    source=crop_content(im)
    if mode=='stretch':
        result=pixelize(source,logical or size).resize(size,Image.Resampling.NEAREST)
    else:
        logical=logical or (size[0]//2,size[1]//2)
        source.thumbnail((logical[0]-8,logical[1]-8),Image.Resampling.NEAREST)
        canvas=Image.new('RGBA',logical)
        canvas.alpha_composite(source,((logical[0]-source.width)//2,(logical[1]-source.height)//2))
        result=pixelize(canvas,logical).resize(size,Image.Resampling.NEAREST)
    folder=OUT/group;folder.mkdir(exist_ok=True)
    result.save(folder/f'{name}.png',optimize=True)
    result.save(folder/f'{name}.webp',lossless=True)
    record=dict(id=name,label=label,group=group,width=size[0],height=size[1],png=f'export/{group}/{name}.png',webp=f'export/{group}/{name}.webp',**meta)
    entries.append(record);groups.setdefault(group,[]).append((record,result))
    return result

def load(name,checker=False): return remove_background(Image.open(ROOT/'originals'/f'{name}.png'),checker)

im=load('p0-panels',True)
for row in range(2):
    for col,(name,label) in enumerate([('primary','主面板'),('inset','内嵌层'),('reading','阅读层')]):
        part=im.crop((col*512,row*512,(col+1)*512,(row+1)*512))
        export('panels',('panel-' if row==0 else 'surface-')+name,label+('边框' if row==0 else '底纹'),part,size=(192,192) if row==0 else (128,128),mode='stretch',logical=(96,96) if row==0 else (64,64),**({'nineSlice':[24,24,24,24]} if row==0 else {}))

im=load('p0-buttons')
for (top,bottom),(name,label) in zip(band_bounds(im,5),[('normal','普通'),('pressed','按下'),('selected','选中'),('disabled','禁用'),('danger','危险操作')]):
    export('buttons','button-'+name,label,im.crop((0,top,im.width,bottom)),size=(576,80),mode='stretch',logical=(288,40),nineSlice=[16,32,16,32])

im=load('p0-talents')
for row,(top,bottom) in enumerate(band_bounds(im,4)):
    for col,(state,label) in enumerate([('locked','未解锁'),('available','可解锁'),('learned','已点亮')]):
        name=['minor','major','core','link'][row]
        source=im.crop((col*512,top,(col+1)*512,bottom))
        size=[(96,96),(128,128),(160,160),(256,32)][row]
        export('talents',f'{name}-{state}',['小节点','重要节点','核心节点','连线'][row]+' · '+label,source,size=size,mode='stretch',logical=(size[0]//2,size[1]//2),**({'nineSlice':[0,32,0,32]} if row==3 else {'socket':True}))

im=load('p1-navigation')
for i,(name,label) in enumerate([('attributes','角色属性'),('equipment-set','套装'),('talent-tree','天赋'),('skill-loadout','技能配置'),('shop','商店'),('crafting','打造'),('sort','整理'),('dismantle','分解')]):
    x,y=i%4*384,i//4*512
    export('navigation',name,label,im.crop((x,y,x+384,y+512)))

im=load('p1-ornaments')
for i,(name,label) in enumerate([('corner-tl','左上角花'),('corner-tr','右上角花'),('corner-bl','左下角花'),('corner-br','右下角花')]):
    export('ornaments',name,label,im.crop((i*384,0,(i+1)*384,512)),size=(96,96),mode='stretch',logical=(48,48))
cuts=[0,490,805,1160,1536]
for i,(name,label,size) in enumerate([('divider','分隔线',(384,64)),('title-left','标题左端',(160,96)),('title-right','标题右端',(160,96)),('chapter-seal','章节徽记',(128,128))]):
    export('ornaments',name,label,im.crop((cuts[i],512,cuts[i+1],1024)),size=size)

im=load('p1-feedback')
for row,(name,label) in enumerate([('selection','选中微光'),('equip','装备成功'),('unlock','天赋点亮'),('click','点击反馈')]):
    frames=[]
    for col in range(4):
        # Shared scale and cell pivot preserve expansion and prevent frame-to-frame auto-fit pumping.
        tile=im.crop((col*384,row*256,(col+1)*384,(row+1)*256))
        frames.append(tile)
    boxes=[f.getchannel('A').getbbox() for f in frames]
    left=min(b[0] for b in boxes);top=min(b[1] for b in boxes)
    right=max(b[2] for b in boxes);bottom=max(b[3] for b in boxes)
    common=max(right-left,bottom-top)+8
    center=((left+right)//2,(top+bottom)//2)
    strip=Image.new('RGBA',(512,128))
    folder=OUT/'feedback';folder.mkdir(exist_ok=True)
    for col,frame in enumerate(frames):
        square=frame.crop((center[0]-common//2,center[1]-common//2,center[0]-common//2+common,center[1]-common//2+common))
        normalized=pixelize(square,(64,64)).resize((128,128),Image.Resampling.NEAREST)
        # Export without recentering individual frames.
        filename=f'{name}-{col+1}'
        normalized.save(folder/f'{filename}.png',optimize=True)
        normalized.save(folder/f'{filename}.webp',lossless=True)
        record=dict(id=filename,label=f'{label} · {col+1}',group='feedback',width=128,height=128,png=f'export/feedback/{filename}.png',webp=f'export/feedback/{filename}.webp',animation=name,frame=col,pivot=[64,64])
        entries.append(record);groups.setdefault('feedback',[]).append((record,normalized))
        strip.alpha_composite(normalized,(col*128,0))
    strip.save(folder/f'{name}-strip.webp',lossless=True)

fontpath='C:/Windows/Fonts/msyh.ttc'
font=ImageFont.truetype(fontpath,18);headingfont=ImageFont.truetype(fontpath,28)
titles={'panels':'P0 · 三层面板与内衬','buttons':'P0 · 按钮五态','talents':'P0 · 天赋节点与连线','navigation':'P1 · 功能导航图标','ornaments':'P1 · 标题装饰与分隔件','feedback':'P1 · 交互反馈序列帧'}
previews=[]
for group,items in groups.items():
    cols=1 if group=='buttons' else 3 if group in ('panels','talents') else 4
    rows=(len(items)+cols-1)//cols
    w=960;cellw=w//cols;cellh=128 if group=='buttons' else 210
    sheet=Image.new('RGB',(w,70+rows*cellh),'#101d2d');draw=ImageDraw.Draw(sheet)
    draw.text((24,18),titles[group],font=headingfont,fill='#f0dfb8')
    for i,(record,sprite) in enumerate(items):
        x,y=i%cols*cellw,70+i//cols*cellh
        draw.rectangle((x+8,y+4,x+cellw-8,y+cellh-8),fill='#1c304a')
        display=sprite.copy();display.thumbnail((cellw-40,cellh-54),Image.Resampling.NEAREST)
        sheet.paste(display,(x+(cellw-display.width)//2,y+12+(cellh-54-display.height)//2),display)
        draw.text((x+cellw//2,y+cellh-30),record['label'],font=font,fill='#c9d4d8',anchor='mm')
    sheet.save(ROOT/f'preview-{group}.png')
    previews.append(sheet)
overview=Image.new('RGB',(1440,1860),'#101d2d')
for i,sheet in enumerate(previews):
    sheet.thumbnail((704,604),Image.Resampling.NEAREST)
    overview.paste(sheet,((i%2)*720+(720-sheet.width)//2,(i//2)*620))
overview.save(ROOT/'preview.png')
manifest=dict(version=1,style='Sunlit Quest / 明亮冒险②',sourceTool='built-in image_gen',integrated=True,assets=entries,animations=[dict(id=n,frames=4,width=128,height=128,durationMs=480 if n=='selection' else 320,loop=n=='selection',strip=f'export/feedback/{n}-strip.webp') for n in ['selection','equip','unlock','click']])
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'manifest.js').write_text('window.UIKIT = '+json.dumps(manifest,ensure_ascii=False)+';',encoding='utf-8')
print(json.dumps({'sprites':len(entries),'webp_bytes':sum(p.stat().st_size for p in OUT.rglob('*.webp')),'groups':{k:len(v) for k,v in groups.items()}},ensure_ascii=False))

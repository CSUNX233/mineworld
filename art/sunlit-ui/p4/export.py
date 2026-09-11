"""User-authorized checkerboard extraction and five-icon atlas slicing.

Keep original generated images untouched. Remove connected low-chroma background
regions, retaining isolated flat highlights. Export actual RGBA PNGs.
"""
from pathlib import Path
from collections import deque
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
for folder in ('transparent', 'icons', 'native'):
    (ROOT / folder).mkdir(exist_ok=True)

def extract_alpha(image):
    rgb = np.array(image.convert('RGB'))
    values = rgb.astype(np.int16)
    lo, hi = values.min(axis=2), values.max(axis=2)
    eligible = ((hi - lo) <= 17) & (lo >= 85)
    h, w = eligible.shape
    seen = np.zeros((h, w), dtype=bool)
    removed = np.zeros((h, w), dtype=bool)
    # Components separate gray background from protected enclosed highlights.
    for y, x in zip(*np.nonzero(eligible)):
        if seen[y, x]:
            continue
        q = deque([(int(y), int(x))])
        seen[y, x] = True
        component = []
        border = False
        minimum, maximum = 255, 0
        while q:
            cy, cx = q.popleft()
            component.append((cy, cx))
            minimum = min(minimum, int(lo[cy, cx]))
            maximum = max(maximum, int(hi[cy, cx]))
            border |= cy == 0 or cx == 0 or cy == h - 1 or cx == w - 1
            for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                if 0 <= ny < h and 0 <= nx < w and eligible[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx] = True
                    q.append((ny,nx))
        checker = False
        if not border and len(component) >= 32 and maximum - minimum >= 28:
            # Real checker gaps alternate in BOTH axes. Silver blade shading
            # can span the same gray values but must never be erased for that.
            ys, xs = zip(*component)
            y0,y1,x0,x1 = min(ys),max(ys)+1,min(xs),max(xs)+1
            patch = values[y0:y1,x0:x1].mean(axis=2)
            mask = np.zeros((y1-y0,x1-x0),dtype=bool)
            mask[np.array(ys)-y0,np.array(xs)-x0] = True
            hits = 0
            for step in (4,6,8):
                if patch.shape[0] <= step or patch.shape[1] <= step:
                    continue
                a,b,c,d = patch[:-step,:-step],patch[:-step,step:],patch[step:,:-step],patch[step:,step:]
                square = mask[:-step,:-step] & mask[:-step,step:] & mask[step:,:-step] & mask[step:,step:]
                hits += np.count_nonzero(square & (abs(a-d)<12) & (abs(b-c)<12) & (abs(a-b)>25))
            checker = hits >= 6
        if border or checker:
            ys, xs = zip(*component)
            removed[ys,xs] = True
    rgba = np.dstack([rgb, np.where(removed, 0, 255).astype(np.uint8)])
    rgba[removed, :3] = 0
    return Image.fromarray(rgba)

previews = []
report = []
for entry in manifest:
    number = entry['sheet']
    source = Image.open(ROOT / 'originals' / f'sheet-{number}.png')
    clean = extract_alpha(source)
    width, height = clean.size
    alpha = np.array(clean.getchannel('A'))
    atlas = Image.new('RGBA', (1536, 1024))
    for index, name in enumerate(entry['icons']):
        col, row = index % 3, index // 3
        left, right = round(col*width/3), round((col+1)*width/3)
        # Find the empty row between icons rather than cutting an oversize tip.
        lower, upper = round(height*.46), round(height*.55)
        occupancy = (alpha[lower:upper,left:right] > 0).sum(axis=1)
        candidates = np.where(occupancy == occupancy.min())[0] + lower
        split = int(candidates[np.argmin(abs(candidates-height/2))])
        top, bottom = (0, split) if row == 0 else (split, height)
        icon = clean.crop((left, top, right, bottom))
        bounds = icon.getbbox()
        if bounds is None:
            raise ValueError(f'Empty icon: {name}')
        icon = icon.crop(bounds)
        # Resample coverage on a single 128px design grid, then threshold alpha.
        # Nearest sampling preserves original color steps. Final 4x nearest
        # enlargement keeps every pixel the same size without softening details.
        icon.thumbnail((112,112), Image.Resampling.NEAREST)
        native = Image.new('RGBA', (128,128))
        native.alpha_composite(icon, ((128-icon.width)//2, (128-icon.height)//2))
        pixels = np.array(native)
        solid = pixels[:,:,3] >= 155
        visited = np.zeros_like(solid)
        for py,px in zip(*np.nonzero(solid)):
            if visited[py,px]:
                continue
            queue = [(int(py),int(px))]
            visited[py,px] = True
            component = []
            while queue:
                yy,xx=queue.pop()
                component.append((yy,xx))
                for ny in range(max(0,yy-1),min(128,yy+2)):
                    for nx in range(max(0,xx-1),min(128,xx+2)):
                        if solid[ny,nx] and not visited[ny,nx]:
                            visited[ny,nx]=True
                            queue.append((ny,nx))
            if len(component)<3:
                ys,xs=zip(*component)
                solid[ys,xs]=False
        pixels[:,:,3]=np.where(solid,255,0)
        pixels[~solid,:3]=0
        # Remove averaged near-duplicate shades: no dithering or soft ramps.
        rgb = Image.fromarray(pixels[:,:,:3]).quantize(colors=40, dither=Image.Dither.NONE).convert('RGB')
        pixels[:,:,:3] = np.array(rgb)
        pixels[~solid,:3]=0
        native=Image.fromarray(pixels)
        native.save(ROOT / 'native' / f'{name}.png')
        tile=native.resize((512,512),Image.Resampling.NEAREST)
        tile.save(ROOT / 'icons' / f'{name}.png')
        atlas.alpha_composite(tile, (col*512,row*512))
        report.append({'id':name,'sheet':number,'cell':index,'alpha':tile.getchannel('A').getextrema()})
    atlas.save(ROOT / 'transparent' / f'sheet-{number}.png')
    preview = Image.new('RGBA',atlas.size,'#1c304a')
    preview.alpha_composite(atlas)
    preview.thumbnail((768,512),Image.Resampling.NEAREST)
    previews.append(preview)
    print(f'Exported sheet {number}: 5 RGBA icons', flush=True)
contact = Image.new('RGB',(1536,1536),'#1c304a')
for index,preview in enumerate(previews):
    contact.paste(preview,((index%2)*768,(index//2)*512))
contact.save(ROOT/'preview.png')
(ROOT/'export-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

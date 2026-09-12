"""Selected RGBA atlas slicing using the previously authorized local pixel cleanup workflow.

Read-only inputs: every A/B source is retained. Public files are small lossless WebP.
No color-key removal: selected atlases already have real alpha, protecting ivory armor.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[2]
PUBLIC = PROJECT / 'public/assets/ui/sunlit/equipment'
NATIVE = ROOT / 'native'
PUBLIC.mkdir(parents=True, exist_ok=True)
NATIVE.mkdir(exist_ok=True)
SLOTS = ['weapon', 'helmet', 'chest', 'legs', 'boots', 'ring', 'ring2', 'necklace', 'offhand']
selection = json.loads((ROOT / 'selection.json').read_text(encoding='utf-8'))['sets']

def separators(mask, axis):
    length = mask.shape[axis]
    occupancy = mask.sum(axis=1-axis)
    cuts = [0]
    for numerator in (1, 2):
        center = round(length * numerator / 3)
        radius = round(length * .025)
        positions = range(center-radius, center+radius+1)
        cuts.append(min(positions, key=lambda p: (int(occupancy[p]), abs(p-center))))
    return cuts + [length]

def clean_cell(cell):
    pixels = np.array(cell.convert('RGBA'))
    pixels[:, :, 3] = np.where(pixels[:, :, 3] >= 190, 255, 0)
    cell = Image.fromarray(pixels)
    bounds = cell.getbbox()
    if not bounds:
        raise ValueError('Empty source cell')
    cell = cell.crop(bounds)
    cell.thumbnail((108, 108), Image.Resampling.NEAREST)
    native = Image.new('RGBA', (128, 128))
    native.alpha_composite(cell, ((128-cell.width)//2, (128-cell.height)//2))
    pixels = np.array(native)
    solid = pixels[:, :, 3] > 0
    visited = np.zeros_like(solid)
    # Clear tiny isolated fringe pixels; never erode the main silhouette or ring openings.
    for y, x in zip(*np.nonzero(solid)):
        if visited[y, x]:
            continue
        queue = [(int(y), int(x))]
        visited[y, x] = True
        component = []
        while queue:
            yy, xx = queue.pop()
            component.append((yy, xx))
            for ny in range(max(0, yy-1), min(128, yy+2)):
                for nx in range(max(0, xx-1), min(128, xx+2)):
                    if solid[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))
        if len(component) < 3:
            ys, xs = zip(*component)
            solid[ys, xs] = False
    pixels[:, :, 3] = np.where(solid, 255, 0)
    pixels[~solid, :3] = 0
    # Limited discrete shades, without interpolation or dithering.
    rgb = Image.fromarray(pixels[:, :, :3]).quantize(colors=40, dither=Image.Dither.NONE).convert('RGB')
    pixels[:, :, :3] = np.array(rgb)
    pixels[~solid, :3] = 0
    return Image.fromarray(pixels), bounds

font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 21)
preview = Image.new('RGB', (1536, 3*430), '#14283e')
draw = ImageDraw.Draw(preview)
report = []
for index, entry in enumerate(selection):
    source = Image.open(ROOT / entry['source']).convert('RGBA')
    alpha = np.array(source.getchannel('A'))
    if alpha.min() != 0 or alpha.max() != 255:
        raise ValueError('Expected existing transparent source: ' + entry['source'])
    mask = alpha >= 190
    xs, ys = separators(mask, 1), separators(mask, 0)
    px, py = (index % 4)*384, (index // 4)*430
    draw.text((px+12, py+8), f"{entry['number']}{entry['variant']}  {entry['name']}", font=font, fill='#f0dfb8')
    for cell_index, slot in enumerate(SLOTS):
        col, row = cell_index % 3, cell_index // 3
        box = (xs[col], ys[row], xs[col+1], ys[row+1])
        native, bounds = clean_cell(source.crop(box))
        filename = f"{entry['id']}-{slot}"
        native.save(NATIVE / (filename + '.png'))
        tile = native.resize((256, 256), Image.Resampling.NEAREST)
        tile.save(PUBLIC / (filename + '.webp'), lossless=True, exact=True, method=6)
        preview.paste(native, (px+col*128, py+40+row*128), native)
        report.append({'setId': entry['id'], 'variant': entry['variant'], 'slot': slot,
            'source': entry['source'], 'sourceCell': box, 'sourceBounds': bounds,
            'file': f'assets/ui/sunlit/equipment/{filename}.webp',
            'size': [256, 256], 'alphaValues': [0, 255]})
    print(f"{entry['number']}{entry['variant']} {entry['id']}: 9 icons", flush=True)
preview.save(ROOT / 'selected-preview.png')
(ROOT / 'export-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(report)} lossless icons exported; all source candidates retained.')

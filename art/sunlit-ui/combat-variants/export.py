"""Authorized local alpha cleanup and pixel sprite export; preserve generated original."""
from pathlib import Path
from PIL import Image
import numpy as np

base = Path(__file__).resolve().parent
# Project root is three directories above sunlit-ui/combat-variants.
out = base.parent.parent.parent / 'public/assets/ui/sunlit/p0/effects'
out.mkdir(parents=True, exist_ok=True)
source = Image.open(base / 'original.png').convert('RGBA')
w, h = source.size
preview = Image.new('RGBA', (768, 512), '#243344')
for i, name in enumerate(['slash-1', 'slash-2', 'slash-3', 'impact-1', 'impact-2', 'impact-3']):
    cell = source.crop((i % 3 * w // 3, i // 3 * h // 2, (i % 3 + 1) * w // 3, (i // 3 + 1) * h // 2))
    pixels = np.array(cell)
    # The generator baked gray glow into RGB. Keep crisp bright pixel clusters only.
    mask = pixels[:, :, :3].min(axis=2) >= 170
    pixels[:, :, 3] = np.where(mask, pixels[:, :, 3], 0)
    cleaned = Image.fromarray(pixels)
    box = cleaned.getbbox()
    if not box:
        raise ValueError(f'Empty effect: {name}')
    cleaned = cleaned.crop(box)
    cleaned.thumbnail((112, 112), Image.Resampling.NEAREST)
    sprite = Image.new('RGBA', (128, 128))
    sprite.alpha_composite(cleaned, ((128-cleaned.width)//2, (128-cleaned.height)//2))
    sprite.save(out / f'{name}.webp', lossless=True)
    preview.alpha_composite(sprite.resize((256,256), Image.Resampling.NEAREST), (i%3*256,i//3*256))
preview.convert('RGB').save(base / 'preview.png')

from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json
root = Path(__file__).resolve().parent
out = root.parents[2] / 'public/assets/ui/sunlit/death-reaper'
out.mkdir(parents=True, exist_ok=True)
jobs = json.loads((root/'prompts.json').read_text(encoding='utf-8'))['jobs']
names = ['冥河收割镰','渡魂冕','断命丧衣','祭骨缚腿','越冥靴','摄魂指环·戒指1','回葬指环·戒指2','终息沙漏','引魂灯']
preview = Image.new('RGB',(900,1020),'#101b2e')
draw = ImageDraw.Draw(preview)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',20)
for i,job in enumerate(jobs):
    im = Image.open(root/'originals'/f"{job['slot']}.png").convert('RGBA')
    alpha = im.getchannel('A').point(lambda a:255 if a>=160 else 0)
    im.putalpha(alpha)
    im = im.crop(alpha.getbbox())
    im.thumbnail((82,82),Image.Resampling.NEAREST)
    icon = Image.new('RGBA',(96,96))
    icon.alpha_composite(im,((96-im.width)//2,(96-im.height)//2))
    icon.save(out/f"{job['slot']}.webp",lossless=True)
    x,y = (i%3)*300,(i//3)*340
    draw.rounded_rectangle((x+14,y+14,x+286,y+310),radius=8,fill='#16263c',outline='#b42c4e',width=3)
    enlarged = icon.resize((240,240),Image.Resampling.NEAREST)
    preview.paste(enlarged,(x+30,y+30),enlarged)
    draw.text((x+150,y+280),names[i],font=font,fill='#edc687',anchor='mm')
preview.save(root/'preview.png')

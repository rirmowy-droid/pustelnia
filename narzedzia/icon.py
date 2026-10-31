"""App icon: a monastery with a dome and a bell tower on a rock, crescent moon, dunes, in desert colours."""
from PIL import Image, ImageDraw, ImageFilter
import os, sys
def icon(S=1024):
    im = Image.new('RGB', (S, S)); d = ImageDraw.Draw(im)
    for y in range(S):                                   # dusk sky
        t = y / S; c = (int(40 + 200 * t ** 1.3), int(28 + 120 * t ** 1.6), int(64 + 30 * t)); d.line([(0, y), (S, y)], fill=c)
    d.ellipse([S*.66, S*.12, S*.82, S*.28], fill=(255, 232, 190)); d.ellipse([S*.7, S*.1, S*.86, S*.26], fill=(70, 46, 82))   # crescent
    rock, wall = (110, 58, 46), (226, 168, 104)
    d.polygon([(S*.1, S*.82), (S*.2, S*.66), (S*.8, S*.66), (S*.92, S*.82)], fill=rock)
    d.rectangle([S*.22, S*.52, S*.78, S*.67], fill=wall)
    for x in range(22, 78, 5): d.rectangle([S*x/100, S*.49, S*(x+2.6)/100, S*.52], fill=wall)
    d.rectangle([S*.38, S*.42, S*.56, S*.53], fill=wall); d.pieslice([S*.37, S*.32, S*.57, S*.52], 180, 360, fill=wall)
    d.line([(S*.47, S*.33), (S*.47, S*.24)], fill=wall, width=int(S*.014)); d.line([(S*.44, S*.27), (S*.5, S*.27)], fill=wall, width=int(S*.012))
    d.rectangle([S*.62, S*.3, S*.72, S*.53], fill=wall); d.polygon([(S*.61, S*.3), (S*.67, S*.22), (S*.73, S*.3)], fill=wall)
    d.pieslice([S*.645, S*.33, S*.695, S*.38], 180, 360, fill=(40, 20, 30)); d.rectangle([S*.645, S*.355, S*.695, S*.42], fill=(40, 20, 30))
    d.polygon([(S*.655, S*.415), (S*.67, S*.37), (S*.685, S*.415)], fill=(232, 190, 110))      # bell
    for i in range(7): x = S*(.26 + i*.075); d.pieslice([x, S*.56, x + S*.03, S*.59], 180, 360, fill=(255, 196, 96)); d.rectangle([x, S*.575, x + S*.03, S*.62], fill=(255, 196, 96))
    d.polygon([(0, S*.84)] + [(x, S*(.84 - .03 * __import__('math').sin(x / S * 6))) for x in range(0, S + 1, 16)] + [(S, S)], fill=(214, 150, 86))
    d.polygon([(0, S*.92)] + [(x, S*(.92 - .03 * __import__('math').sin(x / S * 4 + 2))) for x in range(0, S + 1, 16)] + [(S, S), (0, S)], fill=(190, 126, 70))
    return im
out = sys.argv[1]
im = icon(); im.resize((512, 512), Image.LANCZOS).save(f'{out}/icon.png')
for name, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    p = f'{out}/android/app/src/main/res/mipmap-{name}'; os.makedirs(p, exist_ok=True); im.resize((px, px), Image.LANCZOS).save(f'{p}/ic_launcher.png')

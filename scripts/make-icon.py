"""build/icon.ico (16–256, multi-size) va build/icon.png (512) ni yaratadi: oltin "S" monogramma, to'q ko'k-grafit fon.
Ishga tushirish: python3 scripts/make-icon.py  (Pillow kerak: pip install pillow)"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'build')
N = 1024
GOLD, GOLD_HI, GOLD_LO = (227, 177, 90), (245, 205, 130), (190, 140, 60)
FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    'C:/Windows/Fonts/georgiab.ttf',
    '/Library/Fonts/Georgia Bold.ttf',
]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render(n=N):
    # Fon: vertikal gradient, yumaloq kvadrat
    bg = Image.new('RGBA', (n, n))
    top, bot = (30, 40, 58), (11, 16, 25)
    px = bg.load()
    for y in range(n):
        c = lerp(top, bot, y / (n - 1))
        for x in range(n):
            px[x, y] = c + (255,)
    mask = Image.new('L', (n, n), 0)
    r = int(n * 0.22)
    pad = int(n * 0.03)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, n - pad, n - pad], radius=r, fill=255)
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    img.paste(bg, (0, 0), mask)
    # Ingichka oltin hoshiya (alohida qatlamda — fon bilan aralashsin)
    ring = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    w = max(2, int(n * 0.016))
    inset = pad + int(n * 0.045)
    ImageDraw.Draw(ring).rounded_rectangle([inset, inset, n - inset, n - inset], radius=int(r * 0.78), outline=GOLD + (120,), width=w)
    img.alpha_composite(ring)
    # "S" monogramma (oltin gradient + yengil nur)
    font = next((ImageFont.truetype(f, int(n * 0.66)) for f in FONT_CANDIDATES if os.path.exists(f)), None)
    if font is None:
        font = ImageFont.load_default()
    glyph = Image.new('L', (n, n), 0)
    gd = ImageDraw.Draw(glyph)
    bbox = gd.textbbox((0, 0), 'S', font=font)
    gx = (n - (bbox[2] - bbox[0])) / 2 - bbox[0]
    gy = (n - (bbox[3] - bbox[1])) / 2 - bbox[1]
    gd.text((gx, gy), 'S', font=font, fill=255)
    glow = Image.new('RGBA', (n, n), GOLD + (0,))
    glow.putalpha(glyph.filter(ImageFilter.GaussianBlur(n * 0.035)).point(lambda v: int(v * 0.45)))
    img.alpha_composite(glow)
    grad = Image.new('RGBA', (n, n))
    gp = grad.load()
    for y in range(n):
        c = lerp(GOLD_HI, GOLD_LO, y / (n - 1))
        for x in range(n):
            gp[x, y] = c + (255,)
    grad.putalpha(glyph)
    img.alpha_composite(grad)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    big = render()
    big.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon.png'))
    sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    big.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'icon.ico'), sizes=[(s, s) for s in sizes])
    print('build/icon.ico, build/icon.png yaratildi')


if __name__ == '__main__':
    main()

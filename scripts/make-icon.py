"""Delfin Sauna ilova ikonkasi: build/icon.ico (16–256, ko'p o'lchamli) va build/icon.png (512).

Dizayn: moviy-feruza gradient yumaloq kvadrat (basseyn suvi) + oq sakrayotgan delfin + to'lqin.
Kichik o'lchamlarda (<= 32px) to'lqin va ko'z olib tashlanadi, delfin kattalashtiriladi — 16px da ham taniladi.
Shakl src/renderer/ui/Logo.tsx dagi DOLPHIN_PATH bilan bir xil (viewBox 0 0 64 64).

Ishga tushirish: python3 scripts/make-icon.py   (Pillow kerak: pip install pillow)
"""
from PIL import Image, ImageDraw, ImageFilter
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'build')
N = 1024  # ishchi o'lcham (keyin LANCZOS bilan kichraytiriladi)

# Ranglar: tokens.css dagi --brand-1/2/3 bilan bir xil
BRAND_1 = (103, 232, 249)  # #67e8f9 — yuza yorug'i
BRAND_2 = (6, 182, 212)    # #06b6d4 — basseyn feruzasi
BRAND_3 = (3, 105, 161)    # #0369a1 — chuqurlik
WHITE = (255, 255, 255)

DOLPHIN = (
    'M61 28C58 27.5 55.5 26 54.5 24C53 18 46.5 13.5 38.5 13.8C29 14.2 21.5 20 17 28C15 31.5 13.8 35 13.4 38.5'
    'C11 36.6 7 35.6 3.2 36.6C6.5 38.8 9.6 41.4 11.3 44C9.2 46.6 7.9 50 8.2 53.8C11.2 50.6 14.6 47.6 17.2 45'
    'C21 37.5 27 31.5 34 28C41 25 47.5 25.5 52.5 27.3C55.5 28.3 58.5 28.6 61 28Z'
    'M37 14.1C32 12.6 27.6 10 23.6 6C24.6 11 24.2 16 22.5 22Z'
    'M42 25.5C41.5 30.5 39.5 34 36 36.5C36.3 32.5 36.8 30 37 27.5Z'
)
WAVE = 'M5 52C12 47.5 18 47.5 25 52S38 56.5 45 52S55 48 60 50'


def parse_path(d, steps=40):
    """Oddiy SVG yo'l tahlilchisi (M, C, S, Z — absolyut). Har subyo'l uchun nuqtalar ro'yxati."""
    toks = re.findall(r'[MCSZ]|-?\d*\.?\d+', d)
    i, cmd = 0, None
    subs, cur = [], []
    pos = (0.0, 0.0)
    last_ctrl = None

    def num():
        nonlocal i
        v = float(toks[i])
        i += 1
        return v

    def cubic(p0, p1, p2, p3):
        out = []
        for k in range(1, steps + 1):
            t = k / steps
            u = 1 - t
            out.append((
                u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
            ))
        return out

    while i < len(toks):
        if re.match(r'[MCSZ]', toks[i]):
            cmd = toks[i]
            i += 1
            if cmd == 'Z':
                if cur:
                    subs.append(cur)
                cur = []
                continue
        if cmd == 'M':
            if cur:
                subs.append(cur)
            pos = (num(), num())
            cur = [pos]
            last_ctrl = None
        elif cmd == 'C':
            c1 = (num(), num())
            c2 = (num(), num())
            p = (num(), num())
            cur += cubic(pos, c1, c2, p)
            pos, last_ctrl = p, c2
        elif cmd == 'S':
            c1 = (2 * pos[0] - last_ctrl[0], 2 * pos[1] - last_ctrl[1]) if last_ctrl else pos
            c2 = (num(), num())
            p = (num(), num())
            cur += cubic(pos, c1, c2, p)
            pos, last_ctrl = p, c2
    if cur:
        subs.append(cur)
    return subs


def lerp(a, b, t):
    return tuple(int(round(a[k] + (b[k] - a[k]) * t)) for k in range(3))


def gradient(n):
    """Diagonal 3 rangli gradient (chap-yuqori yorug' → o'ng-past chuqur)."""
    s = 256
    g = Image.new('RGB', (s, s))
    px = g.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * (s - 1))
            px[x, y] = lerp(BRAND_1, BRAND_2, t / 0.5) if t < 0.5 else lerp(BRAND_2, BRAND_3, (t - 0.5) / 0.5)
    return g.resize((n, n), Image.BICUBIC).convert('RGBA')


def render(small=False, n=N):
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    # Fon: yumaloq kvadrat (kichik o'lchamda chetga yaqinroq — maydon kattaroq)
    pad = int(n * (0.02 if small else 0.035))
    radius = int(n * (0.2 if small else 0.22))
    mask = Image.new('L', (n, n), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, n - 1 - pad, n - 1 - pad], radius=radius, fill=255)
    img.paste(gradient(n), (0, 0), mask)

    # Yuqori-chapdagi yumshoq yaltirash (suv yuzasi)
    hl = Image.new('L', (n, n), 0)
    ImageDraw.Draw(hl).ellipse([int(-0.25 * n), int(-0.45 * n), int(0.85 * n), int(0.5 * n)], fill=70)
    hl = hl.filter(ImageFilter.GaussianBlur(n * 0.08))
    hl = Image.composite(hl, Image.new('L', (n, n), 0), mask)
    shine = Image.new('RGBA', (n, n), WHITE + (0,))
    shine.putalpha(hl)
    img.alpha_composite(shine)

    # Delfin: viewBox 64 → piksel. Kichik o'lchamda biroz kattaroq va markazga.
    if small:
        scale, ox, oy = n / 64 * 1.08, -n * 0.05, -n * 0.02
    else:
        scale, ox, oy = n / 64 * 0.94, n * 0.03, n * 0.035
    tf = lambda p: (ox + p[0] * scale, oy + p[1] * scale)  # noqa: E731

    # Delfin ostidagi yumshoq soya (chuqurlik hissi)
    shadow = Image.new('L', (n, n), 0)
    sd = ImageDraw.Draw(shadow)
    for sub in parse_path(DOLPHIN):
        sd.polygon([(x + n * 0.012, y + n * 0.02) for x, y in map(tf, sub)], fill=90)
    shadow = shadow.filter(ImageFilter.GaussianBlur(n * 0.02))
    shadow = Image.composite(shadow, Image.new('L', (n, n), 0), mask)
    sh = Image.new('RGBA', (n, n), BRAND_3 + (0,))
    sh.putalpha(shadow)
    img.alpha_composite(sh)

    layer = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for sub in parse_path(DOLPHIN):
        d.polygon([tf(p) for p in sub], fill=WHITE + (255,))
    if not small:
        # Ko'z
        ex, ey = tf((49.5, 19.5))
        r = 1.35 * scale
        d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=BRAND_3 + (255,))
    img.alpha_composite(layer)
    if not small:
        # To'lqin: alohida niqobda zich doirachalar bilan (silliq, yumaloq uchli), keyin shaffoflik bilan
        wave = Image.new('L', (n, n), 0)
        wd = ImageDraw.Draw(wave)
        r = 3.0 * scale / 2
        for sub in parse_path(WAVE, steps=160):
            for x, y in map(tf, sub):
                wd.ellipse([x - r, y - r, x + r, y + r], fill=255)
        wl = Image.new('RGBA', (n, n), WHITE + (0,))
        wl.putalpha(wave.point(lambda v: int(v * 0.88)))
        img.alpha_composite(wl)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    big = render(small=False)
    tiny = render(small=True)
    big.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icon.png'))

    sizes = [256, 128, 64, 48, 40, 32, 24, 20, 16]
    frames = []
    for s in sizes:
        src = tiny if s <= 32 else big
        im = src.resize((s, s), Image.LANCZOS)
        if s <= 32:
            im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=1))
        frames.append(im)
    frames[0].save(
        os.path.join(OUT, 'icon.ico'),
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=frames[1:],
    )
    print('build/icon.ico (' + ', '.join(str(s) for s in sizes) + '), build/icon.png (512) yaratildi')


if __name__ == '__main__':
    main()

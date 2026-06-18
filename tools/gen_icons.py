#!/usr/bin/env python3
"""Generate app icons (PNG via pure-python encoder + an SVG) with no deps."""
import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)


def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y * w * 4:(y + 1) * w * 4]

    def chunk(typ, data):
        return (struct.pack(">I", len(data)) + typ + data +
                struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


def hsl(h, s, l):
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h // 60) % 6]
    return int((r + m) * 255), int((g + m) * 255), int((b + m) * 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render(size, maskable):
    px = bytearray(size * size * 4)
    cx = cy = size / 2
    radius = size * (0.5 if maskable else 0.46)
    corner = size * 0.22
    top = (27, 36, 64)
    bot = (10, 15, 31)
    # snake body dots along an S curve
    dots = []
    n = 13
    for i in range(n):
        t = i / (n - 1)
        ang = t * math.pi * 2.3
        sx = cx + math.sin(ang) * size * 0.20
        sy = size * 0.24 + t * size * 0.52
        rr = size * (0.085 - t * 0.045)
        col = hsl(165 + t * 80, 0.85, 0.6)
        dots.append((sx, sy, rr, col))

    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            inside = True
            if not maskable:
                # rounded square mask
                dx = abs(x - cx) - (size / 2 - corner)
                dy = abs(y - cy) - (size / 2 - corner)
                if dx > 0 and dy > 0:
                    inside = (dx * dx + dy * dy) <= corner * corner
                else:
                    inside = (abs(x - cx) <= size / 2) and (abs(y - cy) <= size / 2)
            if not inside:
                continue
            # gradient background
            t = y / size
            br, bg, bb = lerp(top, bot, t)
            r, g, b, a = br, bg, bb, 255
            # subtle vignette glow center
            d = math.hypot(x - cx, y - cy * 0.8)
            glow = max(0, 1 - d / (size * 0.5)) * 0.18
            r = min(255, int(r + 90 * glow)); g = min(255, int(g + 110 * glow)); b = min(255, int(b + 150 * glow))
            # draw snake dots
            for (sx, sy, rr, col) in dots:
                dd = math.hypot(x - sx, y - sy)
                if dd < rr:
                    edge = max(0, min(1, (rr - dd) / max(1, rr * 0.4)))
                    r = int(r + (col[0] - r) * edge)
                    g = int(g + (col[1] - g) * edge)
                    b = int(b + (col[2] - b) * edge)
            # eye on head (first dot)
            hx, hy, hr, _ = dots[0]
            de = math.hypot(x - (hx + hr * 0.3), y - (hy - hr * 0.2))
            if de < hr * 0.32:
                r, g, b = 255, 255, 255
            px[idx] = r; px[idx + 1] = g; px[idx + 2] = b; px[idx + 3] = a
    return px


for size, mask, name in [(192, False, "icon-192.png"),
                          (512, False, "icon-512.png"),
                          (512, True, "icon-512-maskable.png")]:
    write_png(os.path.join(OUT, name), size, size, render(size, mask))
    print("wrote", name)

# SVG version
svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#1b2440"/><stop offset="1" stop-color="#0a0f1f"/>
</linearGradient>
<radialGradient id="head" cx="0.35" cy="0.35" r="0.7">
<stop offset="0" stop-color="#9bffe9"/><stop offset="0.5" stop-color="#38e1c9"/><stop offset="1" stop-color="#6c8cff"/>
</radialGradient>
</defs>
<rect width="512" height="512" rx="112" fill="url(#bg)"/>
'''
n = 13
for i in range(n):
    t = i / (n - 1)
    ang = t * math.pi * 2.3
    sx = 256 + math.sin(ang) * 102
    sy = 123 + t * 266
    rr = 44 - t * 23
    hue = 165 + t * 80
    rcol, gcol, bcol = hsl(hue, 0.85, 0.6)
    fill = "url(#head)" if i == 0 else f"rgb({rcol},{gcol},{bcol})"
    svg += f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="{rr:.1f}" fill="{fill}"/>\n'
hx = 256 + math.sin(0) * 102
svg += f'<circle cx="{hx+13:.1f}" cy="{123-9:.1f}" r="13" fill="#fff"/>\n'
svg += f'<circle cx="{hx+17:.1f}" cy="{123-6:.1f}" r="6" fill="#04122a"/>\n'
svg += "</svg>\n"
with open(os.path.join(OUT, "icon.svg"), "w") as f:
    f.write(svg)
print("wrote icon.svg")

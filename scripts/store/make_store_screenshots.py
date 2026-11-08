"""Benefit store screenshots: a headline that sells the benefit over a real FitNFree screen in a phone frame.

  python scripts/store/make_store_screenshots.py                # every size, from benefit-screens.json
  python scripts/store/make_store_screenshots.py --only android

Needs Python 3 with Pillow. Reads real screenshots from assets/store/source-screens/<name>.png (1080x1920 or any
9:16 capture of the released app) and writes assets/store/benefit/<size>/NN-<name>.png.

Rules (App Store 2.3.3 / Google Play): show the app actually in use, only features in the released version,
no fake data or invented results. Phone sizes only: iPad screenshots should be captured at iPad size instead of
showing a phone frame.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "store" / "source-screens"
OUT = ROOT / "assets" / "store" / "benefit"
SPEC = Path(__file__).with_name("benefit-screens.json")
SIZES = {"android": (1080, 1920), "ios-6.5in": (1284, 2778), "ios-6.7in": (1290, 2796)}
BG, INK, MUTED = (8, 9, 12), (245, 247, 250), (160, 166, 178)
LIME = (163, 230, 53)  # theme accent #a3e635
FOCUS = {"top": (0.0, 0.55), "middle": (0.25, 0.8), "bottom": (0.45, 1.0)}
FONTS = Path("C:/Windows/Fonts")


def font(size, heavy=False):
    names = ["seguibl.ttf", "segoeuib.ttf", "arialbd.ttf"] if heavy else ["segoeui.ttf", "arial.ttf"]
    for n in names:
        if (FONTS / n).exists():
            return ImageFont.truetype(str(FONTS / n), size)
    return ImageFont.load_default(size)


def words(text):
    """[(word, is_accent)] from text with *accent* markup."""
    out = []
    for part in re.split(r"(\*[^*]+\*)", text):
        acc = part.startswith("*") and part.endswith("*")
        out += [(w, acc) for w in part.strip("*").split()]
    return out


def wrap(d, ws, fnt, width):
    lines, line = [], []
    for w in ws:
        trial = line + [w]
        if line and d.textlength(" ".join(x for x, _ in trial), font=fnt) > width:
            lines.append(line)
            line = [w]
        else:
            line = trial
    return lines + [line] if line else lines


def draw_line(d, x_center, y, line, fnt, color, accent):
    text = " ".join(w for w, _ in line)
    x = x_center - d.textlength(text, font=fnt) / 2
    for i, (w, acc) in enumerate(line):
        piece = w + (" " if i < len(line) - 1 else "")
        d.text((x, y), piece, font=fnt, fill=accent if acc else color)
        x += d.textlength(piece, font=fnt)


def phone(pic, max_w, max_h):
    bezel, r, pad = round(max_w * 0.022), round(max_w * 0.07), round(max_w * 0.05)
    scale = min((max_w - 2 * (bezel + pad)) / pic.width, (max_h - 2 * (bezel + pad)) / pic.height)
    pic = pic.resize((round(pic.width * scale), round(pic.height * scale)), Image.LANCZOS)
    fw, fh = pic.width + 2 * bezel, pic.height + 2 * bezel
    img = Image.new("RGBA", (fw + 2 * pad, fh + 2 * pad), (0, 0, 0, 0))
    box = [pad, pad, pad + fw, pad + fh]
    glow = Image.new("L", img.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle(box, r, fill=110)
    img.paste(Image.new("RGBA", img.size, LIME + (255,)), (0, 0), glow.filter(ImageFilter.GaussianBlur(pad // 2)))
    ImageDraw.Draw(img).rounded_rectangle(box, r, fill=(0, 0, 0, 255), outline=(64, 68, 76, 255),
                                          width=max(2, bezel // 5))
    mask = Image.new("L", pic.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pic.width - 1, pic.height - 1], max(4, r - bezel), fill=255)
    img.paste(pic, (pad + bezel, pad + bezel), mask)
    return img


def make(shot, size):
    W, H = size
    k = W / 1080
    pic = Image.open(SRC / f"{shot['screen']}.png").convert("RGB")
    band = FOCUS.get(shot.get("focus", ""))
    if band:
        pic = pic.crop((0, round(pic.height * band[0]), pic.width, round(pic.height * band[1])))
    img = Image.new("RGB", (W, H), BG)
    # soft lime light behind the phone
    light = Image.new("L", (W, H), 0)
    ImageDraw.Draw(light).ellipse([-W * 0.3, H * 0.45, W * 1.3, H * 1.25], fill=70)
    img.paste(Image.new("RGB", (W, H), (40, 70, 10)), (0, 0), light.filter(ImageFilter.GaussianBlur(220 * k)))
    d = ImageDraw.Draw(img)
    hf, sf = font(round(96 * k), True), font(round(44 * k))
    y = round(H * 0.075)
    for line in wrap(d, words(shot["headline"]), hf, W - 140 * k)[:3]:
        draw_line(d, W / 2, y, line, hf, INK, LIME)
        y += round(112 * k)
    y += round(18 * k)
    for line in wrap(d, words(shot.get("sub", "")), sf, W - 180 * k)[:2]:
        draw_line(d, W / 2, y, line, sf, MUTED, MUTED)
        y += round(58 * k)
    top = y + round(40 * k)
    ph = phone(pic, W - round(110 * k), H - top - round(50 * k))
    img.paste(ph, ((W - ph.width) // 2, top), ph)  # right under the headline, so short (zoomed) screens sit high
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=sorted(SIZES))
    a = ap.parse_args()
    shots = json.loads(SPEC.read_text(encoding="utf-8"))["shots"]
    ready = [s for s in shots if (SRC / f"{s['screen']}.png").exists()]
    for s in shots:
        if s not in ready:
            print(f"skipped {s['screen']}: no assets/store/source-screens/{s['screen']}.png yet")
    for name, size in SIZES.items():
        if a.only and name != a.only:
            continue
        out = OUT / name
        out.mkdir(parents=True, exist_ok=True)
        for old in out.glob("*.png"):
            old.unlink()
        for i, s in enumerate(ready, 1):
            p = out / f"{i:02}-{s['screen']}.png"
            make(s, size).save(p, optimize=True)
        print(f"{name}: {len(ready)} screenshots in {out}")


if __name__ == "__main__":
    sys.exit(main())

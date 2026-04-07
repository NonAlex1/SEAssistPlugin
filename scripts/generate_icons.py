#!/usr/bin/env python3
"""
Generate SE Assist Outlook add-in icons from the Extreme Networks logo.
Sizes: 16x16, 32x32, 64x64, 80x80
- Small (16, 32): logo only, scaled down
- Large (64, 80): logo + "SE Assist" text beside it
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

SRC  = os.path.expanduser("~/Downloads/Screenshot 2026-04-07 at 08.18.05.png")
DEST = os.path.join(os.path.dirname(__file__), "..", "assets")
os.makedirs(DEST, exist_ok=True)

# Brand colours
BG_COLOR   = (30, 27, 75)    # dark navy/purple  #1e1b4b
TEXT_COLOR = (30, 27, 75)    # same navy for text on white background

# ── Helpers ───────────────────────────────────────────────────────────────────

def best_font(size):
    """Try to load a clean sans-serif font, fall back to default."""
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/System/Library/Fonts/SFNSText.ttf",
        "/System/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_small(logo: Image.Image, size: int) -> Image.Image:
    """Just the logo, resized with high-quality downsampling."""
    return logo.resize((size, size), Image.LANCZOS)


def make_large(logo: Image.Image, canvas_size: int) -> Image.Image:
    """Logo centred in top 62%, 'SE Assist' text centred below."""
    img = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 255))  # white bg
    draw = ImageDraw.Draw(img)

    # Logo: square, centred horizontally, in top 60% of canvas
    logo_size = int(canvas_size * 0.58)
    logo_resized = logo.resize((logo_size, logo_size), Image.LANCZOS)
    logo_x = (canvas_size - logo_size) // 2
    logo_y = int(canvas_size * 0.03)
    img.paste(logo_resized, (logo_x, logo_y), logo_resized)

    # "SE Assist" single line, centred below logo
    font = best_font(int(canvas_size * 0.175))
    text = "SE Assist"
    _, _, tw, th = draw.textbbox((0, 0), text, font=font)
    text_x = (canvas_size - tw) // 2
    text_y = logo_y + logo_size + int(canvas_size * 0.03)
    draw.text((text_x, text_y), text, font=font, fill=TEXT_COLOR)

    return img


def save(img: Image.Image, name: str):
    path = os.path.join(DEST, name)
    img.save(path, "PNG")
    print(f"  Saved {path}  ({img.size[0]}x{img.size[1]})")


# ── Main ──────────────────────────────────────────────────────────────────────

logo = Image.open(SRC).convert("RGBA")

# Crop to tight square if there's extra whitespace
w, h = logo.size
sq = min(w, h)
left = (w - sq) // 2
top  = (h - sq) // 2
logo = logo.crop((left, top, left + sq, top + sq))

print("Generating icons...")

save(make_small(logo, 16), "icon-16.png")
save(make_small(logo, 32), "icon-32.png")
save(make_large(logo, 64), "icon-64.png")
save(make_large(logo, 80), "icon-80.png")

print("\nDone. Check assets/ folder.")

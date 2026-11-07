#!/usr/bin/env python3
"""Builds the Voidreg logo files in static/brand/.

Run `python3 scripts/make-logo.py` from apps/web after changing the mark or wordmark.
Needs fonttools, HarfBuzz's `hb-shape` and `rsvg-convert`.

The mark comes from static/favicon.svg, the wordmark is IBM Plex Sans SemiBold turned into
outlines (kerned by HarfBuzz), so the SVGs render the same everywhere with no font installed.
Void takes the ink color, reg the accent, as in the site footer.
"""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
out = root / "static" / "brand"
font_file = root / "node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff"

THEMES = {
    # name: (ink, accent, page background used only for the flat PNG previews)
    "light": ("#17212B", "#9A3412", "#FFFFFF"),
    "dark": ("#F3F4F6", "#FB923C", "#0B0F14"),
}

MARK_SIZE = 128  # the favicon viewBox
FONT_SIZE = 92  # wordmark size in mark units (header ratio: 24px text beside a 32px mark)
TRACKING = -0.02  # em, same as the share image
MARK_EDGE = 114.6  # right edge of the drawn mark; the favicon box keeps 13.4 of padding
GAP = 28  # between the drawn mark and the "V"

# Mark paths per theme, lifted from favicon.svg so there is one source for the mark.
favicon = (root / "static" / "favicon.svg").read_text()


def mark_group(theme: str) -> str:
    match = re.search(rf'<g class="mark-{theme}">(.*?)</g>', favicon, re.S)
    assert match, theme
    return match.group(1).strip()


# Text outlines
tmp = Path(tempfile.mkdtemp())
ttf = tmp / "plex-600.ttf"
font = TTFont(font_file)
font.flavor = None
font.save(ttf)
font = TTFont(ttf)
glyphs = font.getGlyphSet()
order = font.getGlyphOrder()
units = font["head"].unitsPerEm
scale = FONT_SIZE / units

shaped = json.loads(
    subprocess.run(
        ["hb-shape", "--output-format=json", "--no-glyph-names", str(ttf), "Voidreg"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
)

cap = font["OS/2"].sCapHeight * scale
baseline = MARK_SIZE / 2 + cap / 2


def wordmark_paths(x0: float) -> tuple[list[tuple[str, str]], float]:
    """Return [(path_d, part)] for the letters and the right edge of the wordmark."""
    pen_x = 0.0
    parts: list[tuple[str, str]] = []
    track = TRACKING * units
    for index, glyph in enumerate(shaped):
        name = order[glyph["g"]]
        svg = SVGPathPen(glyphs)
        transform = (scale, 0, 0, -scale, x0 + pen_x * scale, baseline)
        glyphs[name].draw(TransformPen(svg, transform))
        # "Void" is the first four letters, "reg" the rest.
        parts.append((svg.getCommands(), "ink" if index < 4 else "accent"))
        pen_x += glyph["ax"] + track
    right = x0 + (pen_x - track) * scale
    return parts, right


def compact(d: str) -> str:
    return re.sub(r"(\d+\.\d{2})\d+", r"\1", d)


def lockup(theme: str) -> tuple[str, float]:
    ink, accent, _ = THEMES[theme]
    x0 = MARK_EDGE + GAP
    parts, right = wordmark_paths(x0)
    width = right + 13.4
    ink_d = " ".join(compact(d) for d, part in parts if part == "ink")
    accent_d = " ".join(compact(d) for d, part in parts if part == "accent")
    body = f"""  <g>
    {mark_group(theme)}
  </g>
  <path fill="{ink}" d="{ink_d}"/>
  <path fill="{accent}" d="{accent_d}"/>"""
    return body, width


out.mkdir(parents=True, exist_ok=True)
for theme in THEMES:
    body, width = lockup(theme)
    # Crop to the drawn mark (13.4 .. 114.6) and the wordmark, so the file has even padding.
    view_x, view_y, view_h = 13.4, 13.4, 101.2
    view_w = width - 13.4 - 13.4
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{view_w * 4:.0f}" height="{view_h * 4:.0f}" viewBox="{view_x} {view_y} {view_w:.2f} {view_h}" fill="none" role="img" aria-label="Voidreg">
  <title>Voidreg</title>
{body}
</svg>
"""
    path = out / f"voidreg-logo-{theme}.svg"
    path.write_text(svg)
    print("wrote", path)

# Raster files: transparent lockups at 2400 px wide, a square avatar for OAuth consoles and
# social profiles, and the mark on a solid square.
for theme, (ink, accent, background) in THEMES.items():
    svg = out / f"voidreg-logo-{theme}.svg"
    subprocess.run(
        ["rsvg-convert", "-w", "2400", str(svg), "-o", str(out / f"voidreg-logo-{theme}.png")],
        check=True,
    )

# Square mark on a solid color: 512 for general use, 120 for the Google OAuth consent screen.
for theme, (ink, accent, background) in THEMES.items():
    square = f"""<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-14 -14 156 156">
  <rect x="-14" y="-14" width="156" height="156" fill="{background}"/>
  {mark_group(theme)}
</svg>"""
    tmp_svg = tmp / f"square-{theme}.svg"
    tmp_svg.write_text(square)
    for size in (512, 120):
        subprocess.run(
            [
                "rsvg-convert",
                "-w",
                str(size),
                "-h",
                str(size),
                str(tmp_svg),
                "-o",
                str(out / f"voidreg-mark-{theme}-{size}.png"),
            ],
            check=True,
        )
print("done")

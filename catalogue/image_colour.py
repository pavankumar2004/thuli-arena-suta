"""Last-resort colour for products whose tags, title, handle and description name none:
the dominant colour of the garment in the first product photo.

Only the centre of the photo is read (the garment, not the backdrop), and pixels that
look like skin or a plain white/grey backdrop are skipped. Results are marked
`colour_source = "image"` so later tasks can treat them as less certain than text.
"""

import colorsys
import hashlib
import io
import math
import logging
import time
from collections import Counter
from pathlib import Path

import requests
from PIL import Image

from .fetch import USER_AGENT

log = logging.getLogger(__name__)

# Reference shades for the names in normalise.COLOURS (Multicolour is not a shade).
SHADES = {
    "White": (245, 245, 240), "Off White": (236, 230, 215), "Cream": (240, 228, 196),
    "Beige": (215, 195, 160), "Black": (25, 25, 25), "Grey": (128, 128, 128),
    "Silver": (192, 192, 196), "Gold": (196, 160, 70), "Red": (190, 30, 40),
    "Maroon": (110, 20, 35), "Wine": (95, 25, 55), "Pink": (230, 130, 165),
    "Peach": (245, 185, 150), "Coral": (240, 115, 95), "Orange": (235, 120, 30),
    "Rust": (170, 70, 35), "Mustard": (205, 160, 30), "Yellow": (240, 210, 50),
    "Green": (50, 130, 60), "Olive": (110, 115, 50), "Mint": (165, 220, 190),
    "Teal": (20, 120, 120), "Turquoise": (60, 195, 195), "Blue": (40, 80, 180),
    "Navy": (25, 35, 80), "Purple": (110, 50, 140), "Lavender": (185, 165, 215),
    "Magenta": (200, 30, 130), "Brown": (110, 70, 40),
}


def _lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


_SHADE_LAB = {name: _lab(rgb) for name, rgb in SHADES.items()}
NEUTRALS = {"White", "Black", "Grey", "Silver"}
CHROMATIC = {n: lab for n, lab in _SHADE_LAB.items() if n not in NEUTRALS}
MIN_CHROMA = 10    # Lab chroma below this reads as black/grey/white
MIN_SHARE = 0.15   # share of the crop one colour needs to beat the neutrals


def _nearest(lab: tuple[float, float, float], shades: dict) -> str:
    return min(shades, key=lambda n: sum((x - y) ** 2 for x, y in zip(lab, shades[n])))


def nearest_shade(rgb: tuple[int, int, int]) -> str:
    return _nearest(_lab(rgb), _SHADE_LAB)


def _is_skin(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return r > g > b and 0.0 <= h <= 0.11 and 0.18 <= s <= 0.6 and 0.3 <= v <= 0.97


def _is_backdrop(rgb: tuple[int, int, int]) -> bool:
    return min(rgb) > 225 and max(rgb) - min(rgb) < 18


def _shade_counts(img: Image.Image) -> Counter:
    raw = img.tobytes()
    counts = Counter()
    for i in range(0, len(raw), 3):
        px = tuple(raw[i:i + 3])
        if _is_skin(px) or _is_backdrop(px):
            continue
        lab = _lab(px)
        # Below MIN_CHROMA a pixel reads as black/grey/white whatever its hue.
        counts[_nearest(lab, CHROMATIC if math.hypot(lab[1], lab[2]) >= MIN_CHROMA
                        else _SHADE_LAB)] += 1
    return counts


def dominant_colours(image: Image.Image) -> list[str]:
    """The single most common garment shade; a runner-up is too often backdrop to trust."""
    img = image.convert("RGB").resize((60, 80))
    centre = _shade_counts(img.crop((18, 24, 42, 68)))
    total = sum(centre.values())
    if not total:
        return []
    # The photo's edge is backdrop (a jute mat, a wall); its main shade doesn't count
    # unless it also fills most of the centre, i.e. the garment matches the backdrop.
    edge = sum((_shade_counts(img.crop(box)) for box in
                [(0, 0, 60, 6), (0, 74, 60, 80), (0, 6, 6, 74), (54, 6, 60, 74)]), Counter())
    if edge:
        backdrop = edge.most_common(1)[0][0]
        if centre[backdrop] < 0.6 * total:
            del centre[backdrop]
    # Shadows, hair and stone floors are neutral, so a real colour wins whenever it
    # covers a fair share of the centre; a neutral only when nothing else does.
    ranked = centre.most_common()
    colour = next((s for s, n in ranked if s not in NEUTRALS and n >= MIN_SHARE * total), None)
    return [colour or ranked[0][0]] if ranked else []


class ImageFetcher:
    """Fetches small renditions of product photos from Shopify's CDN, ~1 request/s, cached."""

    def __init__(self, cache_dir: Path, delay: float = 1.0, width: int = 240):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.delay = delay
        self.width = width
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self._last = 0.0

    def get(self, src: str) -> Image.Image:
        url = f"{src}{'&' if '?' in src else '?'}width={self.width}"
        cache_file = self.cache_dir / (hashlib.sha1(url.encode()).hexdigest()[:20] + ".img")
        if not cache_file.exists():
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            resp = self.session.get(url, timeout=60)
            resp.raise_for_status()
            cache_file.write_bytes(resp.content)
        return Image.open(io.BytesIO(cache_file.read_bytes()))


def fill_missing_colours(records: list[dict], fetcher: ImageFetcher) -> int:
    """Give every colourless product with a photo an image-derived colour. Returns how many."""
    filled = 0
    for r in records:
        if r["colours"] or not r["images"]:
            continue
        try:
            found = dominant_colours(fetcher.get(r["images"][0]))
        except (requests.RequestException, OSError) as exc:
            log.warning("no image colour for %s: %s", r["handle"], exc)
            continue
        if found:
            r["colours"], r["colour_source"] = found, "image"
            filled += 1
    return filled

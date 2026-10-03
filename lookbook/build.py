"""Build the static lookbook from the catalogue export.

    python -m lookbook.build          # -> lookbook/dist/

Every product shown comes from data/export/products.jsonl (the same rows loaded into
Neon), with its catalogue price, and links to its page on suta.in.
"""

import html
import json
import shutil
from datetime import datetime
from pathlib import Path

from .chapters import CHAPTERS, LOOKS_PER_CHAPTER

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "data" / "export" / "products.jsonl"
STATIC = Path(__file__).resolve().parent / "static"
DIST = Path(__file__).resolve().parent / "dist"

# The piece a look is built around; its brand-styled partners complete it.
LEAD_CATEGORIES = {"Sarees", "Ready To Wear Sarees", "Lehengas", "Dresses",
                   "Co-ords & Kurta Sets"}

esc = html.escape


def inr(amount: float) -> str:
    """Indian digit grouping: 123456 -> ₹1,23,456."""
    whole = f"{int(round(amount))}"
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return "₹" + ",".join(([head] if head else []) + groups + [tail])


def img(src: str, width: int) -> str:
    return f"{src}{'&' if '?' in src else '?'}width={width}"


def srcset(src: str, widths=(400, 700, 1000, 1400)) -> str:
    return ", ".join(f"{esc(img(src, w))} {w}w" for w in widths)


def load() -> tuple[dict[str, dict], str]:
    records = [json.loads(line) for line in EXPORT.open(encoding="utf-8")]
    return {r["handle"]: r for r in records}, records[0]["scraped_at"]


def in_chapter(r: dict, chapter: dict) -> bool:
    if "edit" in chapter:
        return chapter["edit"] in r["edits"]
    return chapter["style"] in r["attributes"].get("style", [])


def caption(r: dict) -> str:
    a = r["attributes"]
    parts = (a.get("fabric", [])[:1] + a.get("technique", [])[:1]
             + a.get("pattern", [])[:1])
    return " · ".join(dict.fromkeys(parts)) or r["category"]


def pick_looks(by_handle: dict[str, dict], chapter: dict, used: set[str]) -> list[dict]:
    looks = []
    leads = [r for r in by_handle.values()
             if r["available"] and r["category"] in LEAD_CATEGORIES
             and len(r["images"]) >= 2 and r["handle"] not in used and in_chapter(r, chapter)]
    for r in leads:
        r["_partners"] = [by_handle[h] for h in r["pairs_with"]
                          if h in by_handle and by_handle[h]["available"]
                          and by_handle[h]["images"] and h not in used][:2]
    # Brand-styled looks first, bestsellers next, newest after that.
    leads.sort(key=lambda r: (not r["_partners"], "bestseller-sarees" not in r["edits"],
                              -datetime.fromisoformat(r["published_at"]).timestamp()))
    seen_colours: dict[str, int] = {}
    for r in leads:
        # Keep a chapter from turning into six red sarees.
        colour = (r["colours"] or ["?"])[0]
        if seen_colours.get(colour, 0) >= 2:
            continue
        seen_colours[colour] = seen_colours.get(colour, 0) + 1
        pieces = [r] + r["_partners"]
        used.update(p["handle"] for p in pieces)
        looks.append({"lead": r, "pieces": pieces})
        if len(looks) == LOOKS_PER_CHAPTER:
            break
    return looks


# ---------------------------------------------------------------- rendering

def page(title: str, description: str, body: str, depth: int, preload: str = "") -> str:
    up = "../" * depth
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="preconnect" href="https://cdn.shopify.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{preload}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400;500&display=swap">
<link rel="stylesheet" href="{up}styles.css">
</head>
<body>
<header class="masthead">
  <a class="wordmark" href="{up}index.html">SUTA</a>
  <span class="masthead-note">The Lookbook · Autumn 2026</span>
</header>
{body}
<footer class="colophon">
  <p class="wordmark small">SUTA</p>
  <p>Every piece in this lookbook is from Suta's catalogue, shown at its current price.
  Tap any piece to buy it on suta.in.</p>
</footer>
</body>
</html>
"""


def price_html(r: dict) -> str:
    out = f'<span class="price">{inr(r["price"])}</span>'
    if r.get("compare_at_price"):
        out += f' <s class="was">{inr(r["compare_at_price"])}</s>'
    return out


def piece_html(p: dict, role: str) -> str:
    sizes = p["sizes_in_stock"]
    size_note = ("Free size" if sizes == ["Free Size"]
                 else "Sizes " + " · ".join(sizes[:6]))
    return f"""<li class="piece">
  <a href="{esc(p['url'])}" target="_blank" rel="noopener">
    <img src="{esc(img(p['images'][0], 300))}" alt="{esc(p['title'])}" width="150" height="200" loading="lazy" decoding="async">
    <span class="piece-text">
      <span class="piece-role">{esc(role)}</span>
      <span class="piece-name">{esc(p['title'])}</span>
      <span class="piece-meta">{price_html(p)}</span>
      <span class="piece-sizes">{esc(size_note)}</span>
      <span class="piece-cta">View on suta.in →</span>
    </span>
  </a>
</li>"""


def look_html(n: int, look: dict) -> str:
    lead = look["lead"]
    roles = [lead["category"].rstrip("s") if lead["category"].endswith("s") else lead["category"]]
    roles += ["Styled with"] * (len(look["pieces"]) - 1)
    pieces = "\n".join(piece_html(p, r) for p, r in zip(look["pieces"], roles))
    eager = 'loading="eager" fetchpriority="high"' if n == 1 else 'loading="lazy"'
    return f"""<article class="look" id="look-{n}">
  <figure class="look-images">
    <a href="{esc(lead['url'])}" target="_blank" rel="noopener" class="look-main">
      <img src="{esc(img(lead['images'][0], 1000))}" srcset="{srcset(lead['images'][0])}" sizes="(min-width: 900px) 40vw, 100vw" alt="{esc(lead['title'])}, look {n}" width="1000" height="1333" {eager} decoding="async">
    </a>
    <img class="look-detail" src="{esc(img(lead['images'][1], 600))}" alt="{esc(lead['title'])}, detail" width="600" height="800" loading="lazy" decoding="async">
  </figure>
  <div class="look-text">
    <p class="look-number">Look {n:02d}</p>
    <h3>{esc(lead['title'])}</h3>
    <p class="look-caption">{esc(caption(lead))}</p>
    <ul class="pieces">
{pieces}
    </ul>
  </div>
</article>"""


def chapter_page(i: int, chapter: dict, looks: list[dict], next_ch: dict | None) -> str:
    hero = looks[0]["lead"]["images"][0]
    nav = (f'<a class="next-chapter" href="../{next_ch["slug"]}/index.html">'
           f'<span>Next chapter</span>{esc(next_ch["title"])} →</a>') if next_ch else \
          '<a class="next-chapter" href="../../index.html"><span>The end</span>Back to all chapters →</a>'
    body = f"""<main>
<section class="chapter-head">
  <p class="kicker">{esc(chapter['kicker'])}</p>
  <h1>{esc(chapter['title'])}</h1>
  <p class="intro">{esc(chapter['intro'])}</p>
  <p class="count">{len(looks)} looks · {sum(len(l['pieces']) for l in looks)} pieces</p>
</section>
{''.join(look_html(n, look) for n, look in enumerate(looks, 1))}
<nav class="chapter-nav">{nav}</nav>
</main>"""
    preload = (f'<link rel="preload" as="image" href="{esc(img(hero, 1000))}" '
               f'imagesrcset="{srcset(hero)}" imagesizes="(min-width: 900px) 40vw, 100vw">')
    return page(f"{chapter['title']} · Suta Lookbook", chapter["intro"], body, 2, preload)


def index_page(chapters: list[tuple[dict, list[dict]]], scraped_at: str) -> str:
    hero = chapters[0][1][0]["lead"]["images"][0]
    cards = []
    for i, (ch, looks) in enumerate(chapters):
        cover = looks[min(1, len(looks) - 1)]["lead"]["images"][0]
        cards.append(f"""<a class="chapter-card{' flip' if i % 2 else ''}" href="chapters/{ch['slug']}/index.html">
  <img src="{esc(img(cover, 900))}" srcset="{srcset(cover, (400, 700, 900, 1200))}" sizes="(min-width: 900px) 50vw, 100vw" alt="{esc(ch['title'])}" width="900" height="1200" loading="lazy" decoding="async">
  <span class="chapter-card-text">
    <span class="kicker">{esc(ch['kicker'])}</span>
    <span class="chapter-card-title">{esc(ch['title'])}</span>
    <span class="chapter-card-intro">{esc(ch['intro'])}</span>
    <span class="chapter-card-cta">{len(looks)} looks →</span>
  </span>
</a>""")
    toc = "".join(f'<li><a href="chapters/{ch["slug"]}/index.html"><span>{ch["kicker"].split(" · ")[0]}</span>{esc(ch["title"])}</a></li>'
                  for ch, _ in chapters)
    body = f"""<main>
<section class="hero">
  <img src="{esc(img(hero, 1400))}" srcset="{srcset(hero, (600, 1000, 1400, 2000))}" sizes="100vw" alt="Agomoni, from Suta's autumn lookbook" width="1400" height="1867" loading="eager" fetchpriority="high" decoding="async">
  <div class="hero-text">
    <p class="kicker">Suta · Autumn 2026</p>
    <h1>Stories in<br><em>Handloom</em></h1>
    <p>Five chapters for the season of homecomings, weddings and new beginnings.</p>
  </div>
</section>
<nav class="toc" aria-label="Chapters"><ol>{toc}</ol></nav>
<section class="chapters">
{''.join(cards)}
</section>
<p class="as-of">Prices from Suta's catalogue, {esc(scraped_at[:10])}.</p>
</main>"""
    preload = (f'<link rel="preload" as="image" href="{esc(img(hero, 1400))}" '
               f'imagesrcset="{srcset(hero, (600, 1000, 1400, 2000))}" imagesizes="100vw">')
    return page("Suta · The Lookbook, Autumn 2026",
                "Stories in handloom: Suta's autumn lookbook, in five chapters.", body, 0, preload)


def main() -> None:
    by_handle, scraped_at = load()
    used: set[str] = set()
    chapters = []
    for ch in CHAPTERS:
        looks = pick_looks(by_handle, ch, used)
        print(f"{ch['slug']:<18} {len(looks)} looks, "
              f"{sum(len(l['pieces']) for l in looks)} pieces")
        if looks:
            chapters.append((ch, looks))

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    shutil.copy(STATIC / "styles.css", DIST / "styles.css")
    (DIST / "index.html").write_text(index_page(chapters, scraped_at), encoding="utf-8")
    for i, (ch, looks) in enumerate(chapters):
        nxt = chapters[i + 1][0] if i + 1 < len(chapters) else None
        out = DIST / "chapters" / ch["slug"]
        out.mkdir(parents=True)
        (out / "index.html").write_text(chapter_page(i, ch, looks, nxt), encoding="utf-8")
    print(f"wrote {DIST}")


if __name__ == "__main__":
    main()

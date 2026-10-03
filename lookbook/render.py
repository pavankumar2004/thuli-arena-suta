"""Render the edit to static HTML."""

import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from markupsafe import Markup

from .chapters import EDIT
from .select import Look

HERE = Path(__file__).parent
FONTS = ("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,400"
         "&family=Jost:wght@300;400;500&display=swap")
IMAGE_WIDTHS = (360, 540, 720, 900, 1200)
IST = timezone(timedelta(hours=5, minutes=30))

# How a partner piece is named in a look's note: "the Hemam blouse".
PIECE_NOUNS = {"Blouses": "blouse", "T-Shirt Blouses": "blouse", "Jewellery": "",
               "Petticoats": "petticoat", "Shirts": "shirt"}


def img(url: str, width: int) -> str:
    """Shopify's CDN resizes on request and serves WebP to browsers that accept it."""
    return f"{url}{'&' if '?' in url else '?'}width={width}"


def srcset(url: str) -> str:
    return ", ".join(f"{img(url, w)} {w}w" for w in IMAGE_WIDTHS)


def inr(amount: float) -> str:
    """₹ with Indian digit grouping: 1,25,000."""
    digits = str(int(round(amount)))
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return "₹" + ",".join(([head] if head else []) + groups + [tail])


def note(look: Look) -> str:
    attrs = look.saree["attributes"]
    fabric = " & ".join(attrs.get("fabric", [])[:1]) or "Handcrafted"
    technique = ", ".join(t.lower() for t in attrs.get("technique", [])[:1])
    pieces = []
    for p in look.partners:
        noun = PIECE_NOUNS.get(p["category"], "")
        name = p["title"] if noun.lower() in p["title"].lower() else f"{p['title']} {noun}"
        pieces.append(f"the {name.strip()}")
    saree = f"{fabric} saree" + (f", {technique}" if technique else "")
    return f"{saree}. Styled by Suta with {' and '.join(pieces)}."


def as_of(scraped_at: str) -> str:
    return datetime.fromisoformat(scraped_at).astimezone(IST).strftime("%-d %b %Y, %H:%M IST")


def render(edit: list, scraped_at: str, out: Path) -> int:
    env = Environment(loader=FileSystemLoader(HERE / "templates"), autoescape=True,
                      undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)
    env.filters["inr"] = inr
    env.globals.update(img=img, srcset=srcset, edit=EDIT, chapters=edit, fonts=FONTS,
                       # Our own stylesheet, inlined: autoescaping would turn its quotes
                       # into &#34; and silently break every font-family.
                       css=Markup((HERE / "site.css").read_text()), as_of=as_of(scraped_at),
                       current=None)

    if out.exists():
        shutil.rmtree(out)
    pages = 0

    def write(path: str, template: str, **ctx) -> None:
        nonlocal pages
        target = out / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(env.get_template(template).render(**ctx))
        pages += 1

    first_chapter_looks = edit[0][1]
    write("index.html", "index.html", hero=first_chapter_looks[:3])
    write("404.html", "404.html")
    for i, (chapter, looks) in enumerate(edit):
        prev_ch = edit[i - 1][0] if i > 0 else None
        next_ch = edit[i + 1][0] if i + 1 < len(edit) else None
        write(f"{chapter.slug}/index.html", "chapter.html", chapter=chapter, looks=looks,
              prev=prev_ch, next=next_ch, current=chapter.slug)
        for j, look in enumerate(looks):
            gallery = [u for k, u in enumerate(look.saree["images"]) if k != look.lead_image][:4]
            write(f"look/{look.slug}/index.html", "look.html", look=look, chapter=chapter,
                  position=j + 1, count=len(looks), gallery=gallery, note=note(look),
                  prev=looks[j - 1] if j > 0 else None,
                  next=looks[j + 1] if j + 1 < len(looks) else None,
                  next_chapter=next_ch, current=chapter.slug)
    return pages

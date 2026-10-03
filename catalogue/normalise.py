"""Turn a raw Shopify product into one clean catalogue record. Pure functions, no I/O."""

import html
import re
from decimal import Decimal

STORE_URL = "https://suta.in"
BRAND = "Suta"
CURRENCY = "INR"

# Shopify option names that mean "the thing you pick a size by".
SIZE_OPTION_NAMES = {"size", "age group"}
FREE_SIZE = "Free Size"

# Tag prefixes Suta uses as structured facets, e.g. "Fabric_Tissue Cotton".
FACETS = {"Fabric", "Pattern", "Style", "Technique", "Type", "Neckline", "Sleeves",
          "Back", "Blouse Type", "Length", "Fit", "Occasion"}

# Colour vocabulary, used only when a product has no Colour_ tag.
COLOURS = [
    "Off White", "White", "Cream", "Ivory", "Beige", "Black", "Grey", "Silver", "Gold",
    "Red", "Maroon", "Wine", "Pink", "Peach", "Coral", "Orange", "Rust", "Mustard",
    "Yellow", "Green", "Olive", "Mint", "Teal", "Turquoise", "Blue", "Navy", "Purple",
    "Lavender", "Magenta", "Brown", "Multicolour",
]
# Hindi/Bengali colour words Suta uses in product names ("Gulabi Chidiya", "Godhuli Gerua").
COLOUR_WORDS = {
    # Words that double as names (rani, hari, sona, neel) are left out on purpose.
    "laal": "Red", "gulabi": "Pink", "kesari": "Orange", "gerua": "Rust", "peela": "Yellow",
    "peeli": "Yellow", "haldi": "Yellow", "sabz": "Green", "neela": "Blue", "jamuni": "Purple",
    "baingani": "Purple", "lavendula": "Lavender", "kaala": "Black", "safed": "White",
    "sunehri": "Gold", "bhura": "Brown", "badami": "Beige",
}
_COLOUR_RE = re.compile(r"\b(" + "|".join(re.escape(c) for c in COLOURS) + r")\b", re.I)
_PRODUCT_LINK_RE = re.compile(r"suta\.in/products/([a-z0-9][a-z0-9\-]*)")


def product_url(handle: str) -> str:
    return f"{STORE_URL}/products/{handle}"


def _money(value) -> Decimal | None:
    if value in (None, ""):
        return None
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _plain_text(body_html: str | None) -> str:
    text = re.sub(r"<(br|/p|/h\d|/li)\s*/?>", "\n", body_html or "", flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    lines = (re.sub(r"[ \t\xa0]+", " ", line).strip() for line in text.splitlines())
    return "\n".join(line for line in lines if line)


def facets(tags: list[str]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for tag in tags:
        prefix, sep, value = tag.partition("_")
        if prefix == "Size" and "meter" in value.lower():
            prefix = "Length"  # sarees and fabric: "Size_5.5 Meters" is a length, not a size
        if sep and prefix in FACETS and value.strip():
            values = out.setdefault(prefix.lower().replace(" ", "_"), [])
            if value.strip() not in values:
                values.append(value.strip())
    return out


def colours(tags: list[str], title: str) -> list[str]:
    """Colour_ tags first; else bare colour tags ("Gold"); else colour words in the title,
    English or Hindi."""
    tagged = []
    for tag in tags:
        if tag.startswith("Colour_"):
            for part in re.split(r"[,/&]", tag[len("Colour_"):]):
                if part.strip() and part.strip().title() not in tagged:
                    tagged.append(part.strip().title())
    if tagged:
        return tagged
    bare = [tag.strip().title() for tag in tags if _COLOUR_RE.fullmatch(tag.strip())]
    if bare:
        return list(dict.fromkeys(bare))
    found = [m.title() for m in _COLOUR_RE.findall(title)]
    found += [COLOUR_WORDS[w] for w in re.findall(r"[a-z]+", title.lower()) if w in COLOUR_WORDS]
    return list(dict.fromkeys(found))


def _size_option_index(options: list[dict]) -> int | None:
    for i, option in enumerate(options):
        if option["name"].strip().lower() in SIZE_OPTION_NAMES:
            return i
    return None


def variants(raw: dict) -> list[dict]:
    options = raw["options"]
    size_idx = _size_option_index(options)
    out = []
    for v in sorted(raw["variants"], key=lambda v: v["position"]):
        values = [v.get(f"option{i + 1}") for i in range(len(options))]
        out.append({
            "id": v["id"],
            "sku": v.get("sku") or None,
            "size": values[size_idx] if size_idx is not None else FREE_SIZE,
            "options": {o["name"].strip(): val for o, val in zip(options, values)
                        if val and val != "Default Title"},
            "price": _money(v["price"]),
            "compare_at_price": _money(v.get("compare_at_price")),
            "available": bool(v["available"]),
        })
    return out


def normalise(raw: dict, categories: list[tuple[str, str]], edits: list[str],
              category_source: str | None = None) -> dict:
    """`categories` is [(department, category)] in taxonomy order; the first is primary.
    `category_source` says where they came from: "menu" or "product_type"."""
    vs = variants(raw)
    price = min(v["price"] for v in vs)
    compare_at = max((v["compare_at_price"] for v in vs
                      if v["compare_at_price"] and v["compare_at_price"] > price), default=None)
    sizes = list(dict.fromkeys(v["size"] for v in vs))
    in_stock = list(dict.fromkeys(v["size"] for v in vs if v["available"]))
    tags = [t.strip() for t in raw["tags"]]
    department, category = categories[0] if categories else (None, None)

    return {
        "id": raw["id"],
        "handle": raw["handle"],
        "url": product_url(raw["handle"]),
        "title": raw["title"].strip(),
        "brand": BRAND,
        "department": department,
        "category": category,
        "categories": [f"{d} / {c}" for d, c in categories],
        "category_source": category_source,
        "edits": edits,
        "product_type": raw["product_type"],
        "price": price,
        "compare_at_price": compare_at,
        "currency": CURRENCY,
        "available": any(v["available"] for v in vs),
        "sizes": sizes,
        "sizes_in_stock": in_stock,
        "colours": colours(tags, raw["title"]),
        "attributes": facets(tags),
        "images": [img["src"] for img in sorted(raw["images"], key=lambda i: i["position"])],
        "variants": vs,
        "pairs_with": sorted(set(_PRODUCT_LINK_RE.findall(raw.get("body_html") or ""))
                             - {raw["handle"]}),
        "description": _plain_text(raw.get("body_html")),
        "tags": tags,
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
        "published_at": raw.get("published_at"),
    }

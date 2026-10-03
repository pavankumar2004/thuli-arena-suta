"""Step 2: shortlist real, in-stock catalogue products for each moment. No AI here."""

import hashlib

PER_MOMENT = 10
ACCESSORIES = 10


def _key(p: dict) -> str:
    return f"{p['department']} / {p['category']}"


def _fabric_hit(p: dict, fabrics: list[str]) -> bool:
    have = " ".join(p["attributes"].get("fabric", [])).lower()
    return any(word in have for f in fabrics for word in f.lower().split() if len(word) > 3)


def _jitter(handle: str, pid) -> float:
    """Stable per-person tie-break, so two people don't get the same bestsellers."""
    return int(hashlib.sha1(f"{handle}:{pid}".encode()).hexdigest()[:6], 16) / 0xFFFFFF


def partners(p: dict, products: dict) -> list[dict]:
    """Pieces Suta's own product copy styles this with, if they're in stock."""
    return [products[h] for h in p.get("pairs_with", [])
            if h in products and products[h]["available"] and h != p["handle"]]


def shortlist(handle: str, taste: dict, products: dict) -> tuple[list[list[dict]], list[dict]]:
    """Return ([candidates per moment], accessories). Each candidate is a look dict."""
    avoid_colours = set(taste["avoid"]["colours"])
    avoid_cats = set(taste["avoid"]["categories"])
    palette = [p["colour"] for p in taste["palette"]]
    live = [p for p in products.values()
            if p["available"] and p["price"] > 0 and len(p["images"]) >= 2
            and not avoid_colours & set(p["colours"])]

    per_moment, used = [], set()
    for m in taste["moments"]:
        cats = set(m["categories"]) - avoid_cats
        colours = set(m["colours"] or palette)

        def score(p: dict) -> float:
            return (3 * (m["style"] in p["attributes"].get("style", []))
                    + 2 * len(colours & set(p["colours"]))
                    + 1 * (bool(set(palette) & set(p["colours"])))
                    + 1 * _fabric_hit(p, taste["fabrics"])
                    + 0.5 * _jitter(handle, p["id"]))

        pool = sorted((p for p in live if _key(p) in cats and p["handle"] not in used),
                      key=score, reverse=True)[:PER_MOMENT]
        used.update(p["handle"] for p in pool[:3])  # keep moments from sharing top picks
        per_moment.append([{"anchor": p, "partners": partners(p, products),
                            "score": round(score(p), 2)} for p in pool])

    accessories = []
    if taste["wardrobe"] == "womenswear":
        accessories = sorted(
            (p for p in live if p["category"] in ("Jewellery", "Bags")),
            key=lambda p: (len(set(palette) & set(p["colours"])), _jitter(handle, p["id"])),
            reverse=True)[:ACCESSORIES]
    return per_moment, accessories

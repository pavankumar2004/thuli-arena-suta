"""Turn catalogue products into looks and fill each chapter."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .chapters import CHAPTERS, LOOKS_PER_CHAPTER, Chapter

# Suta's own merchandising signals, used to rank looks that weren't hand-picked.
EDIT_WEIGHTS = {"bestseller-sarees": 3, "new-arrival-sarees": 2, "show": 2, "zar": 1,
                "influencer-picks": 1}


@dataclass
class Look:
    saree: dict
    partners: list[dict]
    lead_image: int = 0  # which saree photo leads

    @property
    def slug(self) -> str:
        return self.saree["handle"]

    @property
    def hero(self) -> str:
        return self.saree["images"][self.lead_image]

    @property
    def pieces(self) -> list[dict]:
        return [self.saree, *self.partners]

    @property
    def total(self) -> float:
        return sum(p["price"] for p in self.pieces)


def candidate_looks(products: dict[str, dict]) -> dict[str, Look]:
    """Every in-stock saree whose brand-styled partner pieces are also in stock."""
    looks = {}
    for p in products.values():
        if p["department"] != "Sarees" or not p["available"] or len(p["images"]) < 3:
            continue
        partners = [products[h] for h in p["pairs_with"]
                    if h in products and products[h]["available"]]
        if partners:
            looks[p["handle"]] = Look(p, partners)
    return looks


def _score(look: Look, now: datetime) -> float:
    p = look.saree
    score = sum(w for edit, w in EDIT_WEIGHTS.items() if edit in p["edits"])
    score += len(p["images"]) >= 5
    if p["created_at"] and datetime.fromisoformat(p["created_at"]) > now - timedelta(days=365):
        score += 1
    return score


def _fill(chapter: Chapter, pool: list[Look], looks: dict[str, Look], taken: set[str],
          now: datetime) -> list[Look]:
    chosen: list[Look] = []
    used_partners: set[str] = set()
    colour_count: dict[str, int] = {}

    def take(look: Look) -> None:
        chosen.append(look)
        taken.add(look.slug)
        used_partners.update(p["handle"] for p in look.partners)
        for c in look.saree["colours"][:1]:
            colour_count[c] = colour_count.get(c, 0) + 1

    for pick in chapter.picks:
        handle, _, index = pick.partition("#")
        look = looks.get(handle)
        if look and handle not in taken:
            if index and int(index) < len(look.saree["images"]):
                look.lead_image = int(index)
            take(look)

    def varied(look: Look) -> bool:
        # One look per blouse, at most two looks led by the same colour.
        return (not used_partners & {p["handle"] for p in look.partners}
                and all(colour_count.get(c, 0) < 2 for c in look.saree["colours"][:1]))

    ranked = sorted((lk for lk in pool if lk.slug not in taken),
                    key=lambda lk: (-_score(lk, now), lk.slug))
    # Variety is a preference, not a reason to leave a chapter short after sell-outs.
    for must_vary in (True, False):
        for look in ranked:
            if len(chosen) >= LOOKS_PER_CHAPTER:
                break
            if look.slug not in taken and (varied(look) or not must_vary):
                take(look)
    return chosen[:LOOKS_PER_CHAPTER]


def build_edit(products: dict[str, dict]) -> list[tuple[Chapter, list[Look]]]:
    looks = candidate_looks(products)
    now = datetime.now(timezone.utc)
    taken: set[str] = set()
    edit = []
    for chapter in CHAPTERS:
        pool = [lk for lk in looks.values() if chapter.belongs(lk.saree)]
        edit.append((chapter, _fill(chapter, pool, looks, taken, now)))
    return edit

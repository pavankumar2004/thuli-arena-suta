from foryou.pick import _validate
from foryou.shortlist import shortlist


def product(handle, department, category, colours=("Red",), style=("Festive Wear",), **kw):
    return {"id": hash(handle) % 10**9, "handle": handle, "title": handle.title(),
            "department": department, "category": category, "colours": list(colours),
            "attributes": {"style": list(style), "fabric": ["Mul Cotton"]}, "available": True,
            "price": 2000.0, "images": ["a", "b"], "pairs_with": [], **kw}


def taste(wardrobe="womenswear", avoid_colours=(), categories=("Sarees / Sarees",)):
    moment = {"name": "m", "style": "Festive Wear", "categories": list(categories),
              "colours": ["Red"], "evidence_image": 1, "why": "x"}
    return {"wardrobe": wardrobe, "summary": "", "fabrics": [], "silhouettes": [],
            "palette": [{"colour": "Red", "evidence": [1]}],
            "avoid": {"colours": list(avoid_colours), "categories": [], "notes": ""},
            "moments": [moment, dict(moment), dict(moment)]}


CATALOGUE = {p["handle"]: p for p in [
    product("red-saree", "Sarees", "Sarees"),
    product("black-saree", "Sarees", "Sarees", colours=("Black",)),
    product("mens-kurta", "Men", "Kurtas"),
    product("sold-out", "Sarees", "Sarees", available=False),
    product("necklace", "Accessories", "Jewellery"),
]}


def test_shortlist_respects_wardrobe_stock_and_avoid_list():
    per_moment, accessories = shortlist("x", taste(avoid_colours=["Black"]), CATALOGUE)
    handles = {c["anchor"]["handle"] for cands in per_moment for c in cands}
    assert handles == {"red-saree"}            # no menswear, no sold-out, no avoided colour
    assert [a["handle"] for a in accessories] == ["necklace"]


def test_menswear_gets_only_menswear_and_no_accessories():
    per_moment, accessories = shortlist("x", taste("menswear", categories=["Men / Kurtas"]),
                                        CATALOGUE)
    assert {c["anchor"]["handle"] for c in per_moment[0]} == {"mens-kurta"}
    assert accessories == []


def test_validate_rejects_unknown_duplicate_or_missing_picks():
    ids = {"m1c1": (1, "A"), "m2c1": (2, "B"), "m3c1": (3, "C"), "a1": (0, "N")}
    good = {"looks": [{"moment": i, "id": f"m{i}c1"} for i in (1, 2, 3)]}
    assert [lk["candidate"] for lk in _validate(good, ids, 3)] == ["A", "B", "C"]
    assert _validate({"looks": [{"id": "m9c9"}]}, ids, 3) is None             # invented id
    assert _validate({"looks": [{"id": "m1c1"}] * 3}, ids, 3) is None         # same pick twice
    assert _validate({"looks": [{"id": "a1"}]}, ids, 3) is None               # accessory as a look
    assert _validate({"looks": good["looks"][:2]}, ids, 3) is None            # a moment missing

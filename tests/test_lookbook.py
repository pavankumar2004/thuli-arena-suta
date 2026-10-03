from lookbook.chapters import CHAPTERS, LOOKS_PER_CHAPTER
from lookbook.render import img, inr, note
from lookbook.select import build_edit, candidate_looks


def product(handle, department="Sarees", available=True, pairs_with=(), edits=(), style=()):
    return {"handle": handle, "title": handle.title(), "department": department,
            "category": "Sarees" if department == "Sarees" else "Blouses",
            "available": available, "pairs_with": list(pairs_with), "edits": list(edits),
            "attributes": {"style": list(style), "fabric": ["Mul Cotton"]},
            "images": [f"https://cdn/{handle}-{i}.jpg?v=1" for i in range(4)],
            "colours": ["Red"], "price": 3000.0, "created_at": "2026-09-01T00:00:00+05:30"}


def catalogue(*products):
    return {p["handle"]: p for p in products}


def test_a_look_needs_the_saree_and_a_partner_in_stock():
    looks = candidate_looks(catalogue(
        product("ok", pairs_with=["blouse"]),
        product("partner-sold-out", pairs_with=["gone"]),
        product("saree-sold-out", available=False, pairs_with=["blouse"]),
        product("blouse", department="Blouses"),
        product("gone", department="Blouses", available=False),
    ))
    assert set(looks) == {"ok"}
    assert [p["handle"] for p in looks["ok"].partners] == ["blouse"]


def test_sold_out_pick_is_backfilled_and_chapters_never_share_a_look():
    agomoni = CHAPTERS[0]
    first_pick = agomoni.picks[0]
    products = catalogue(
        product(first_pick, available=False, pairs_with=["b0"], edits=["agomoni-puja-collection"]),
        *[product(f"s{i}", pairs_with=[f"b{i}"], edits=["agomoni-puja-collection"],
                  style=["Festive Wear"]) for i in range(1, 12)],
        *[product(f"b{i}", department="Blouses") for i in range(12)],
    )
    edit = dict((ch.slug, looks) for ch, looks in build_edit(products))
    chosen = [lk.slug for lk in edit["agomoni"]]
    assert first_pick not in chosen
    assert len(chosen) == LOOKS_PER_CHAPTER
    festive = [lk.slug for lk in edit["festive-nights"]]
    assert not set(chosen) & set(festive)


def test_inr_uses_indian_grouping():
    assert inr(950) == "₹950"
    assert inr(21040) == "₹21,040"
    assert inr(125000) == "₹1,25,000"
    assert inr(12345678) == "₹1,23,45,678"


def test_image_urls_ask_shopify_to_resize():
    assert img("https://cdn/a.jpg?v=1", 540) == "https://cdn/a.jpg?v=1&width=540"
    assert img("https://cdn/a.jpg", 540) == "https://cdn/a.jpg?width=540"


def test_note_names_pieces_without_repeating_the_noun():
    looks = candidate_looks(catalogue(
        product("s", pairs_with=["kashi-sa-mann-blouse", "hemam"]),
        product("kashi-sa-mann-blouse", department="Blouses"),
        product("hemam", department="Blouses"),
    ))
    assert note(looks["s"]) == ("Mul Cotton saree. Styled by Suta with the "
                                "Kashi-Sa-Mann-Blouse and the Hemam blouse.")

from decimal import Decimal

from catalogue.build import exclusion_reason
from catalogue.normalise import colours, facets, normalise


def raw_product(**overrides):
    product = {
        "id": 1, "handle": "sunehri-laal", "title": " Sunehri Laal ", "product_type": "Saree",
        "tags": ["Colour_Gold", "Fabric_Tissue Cotton", "Size_5.5 Meters", "Festive"],
        "options": [{"name": "Title", "position": 1, "values": ["Default Title"]}],
        "variants": [{"id": 11, "position": 1, "sku": "SUTACOT358", "option1": "Default Title",
                      "option2": None, "option3": None, "price": "3500.00",
                      "compare_at_price": None, "available": True}],
        "images": [{"src": "https://cdn/b.jpg", "position": 2},
                   {"src": "https://cdn/a.jpg", "position": 1}],
        "body_html": "<p><strong>Blouse:</strong> wearing "
                     "<a href='https://suta.in/products/dry-cherry'>Dry Cherry</a></p>",
        "created_at": "2026-09-29T16:07:33+05:30", "updated_at": "2026-10-03T10:59:04+05:30",
        "published_at": "2026-10-01T18:42:48+05:30",
    }
    return {**product, **overrides}


def sized_blouse():
    sizes = ["XS", "S", "M"]
    return raw_product(
        handle="dry-cherry", product_type="Blouse",
        options=[{"name": "Size ", "position": 1, "values": sizes}],
        variants=[{"id": 20 + i, "position": i + 1, "sku": f"B-{s}", "option1": s,
                   "option2": None, "option3": None, "price": "1200.00",
                   "compare_at_price": "1500.00", "available": s != "S"}
                  for i, s in enumerate(sizes)],
    )


def test_one_size_saree():
    r = normalise(raw_product(), [("Sarees", "Sarees")], ["new-arrival-sarees"])
    assert r["url"] == "https://suta.in/products/sunehri-laal"
    assert r["title"] == "Sunehri Laal"
    assert r["price"] == Decimal("3500.00") and r["compare_at_price"] is None
    assert r["sizes"] == ["Free Size"] and r["sizes_in_stock"] == ["Free Size"]
    assert r["variants"][0]["options"] == {}
    assert r["attributes"]["length"] == ["5.5 Meters"]  # a length, not a size
    assert r["colours"] == ["Gold"]
    assert r["images"] == ["https://cdn/a.jpg", "https://cdn/b.jpg"]  # by position
    assert r["pairs_with"] == ["dry-cherry"]
    assert r["category"] == "Sarees" and r["categories"] == ["Sarees / Sarees"]


def test_sized_product_groups_variants_and_tracks_stock():
    r = normalise(sized_blouse(), [("Blouses", "Blouses")], [])
    assert r["sizes"] == ["XS", "S", "M"]
    assert r["sizes_in_stock"] == ["XS", "M"]
    assert r["compare_at_price"] == Decimal("1500.00")
    assert r["variants"][1] == {"id": 21, "sku": "B-S", "size": "S", "options": {"Size": "S"},
                                "price": Decimal("1200.00"),
                                "compare_at_price": Decimal("1500.00"), "available": False}


def test_primary_category_is_first_match():
    r = normalise(raw_product(), [("Sarees", "Sarees"), ("Sarees", "Ready To Wear Sarees")], [])
    assert r["category"] == "Sarees"
    assert r["categories"] == ["Sarees / Sarees", "Sarees / Ready To Wear Sarees"]


def test_uncategorised_product():
    r = normalise(raw_product(), [], [])
    assert r["category"] is None and r["department"] is None


def test_colour_fallbacks():
    assert colours(["Colour_Red, Pink"], "x") == ["Red", "Pink"]
    assert colours(["Gold", "Festive"], "x") == ["Gold"]
    assert colours(["Festive"], "Off White Mulmul Saree") == ["Off White"]
    assert colours([], "Gulabi Chidiya") == ["Pink"]
    assert colours([], "Paan Truffles (Kurta)") == []


def test_facets_ignore_non_facet_tags():
    assert facets(["Fabric_Linen", "lgsy_123", "__with:pre-drape", "Style_Festive Wear"]) == {
        "fabric": ["Linen"], "style": ["Festive Wear"]}


def test_exclusions():
    assert exclusion_reason(raw_product(product_type="Freebies")) == "product_type=Freebies"
    assert exclusion_reason(raw_product(title="Test Product")) == "test product"
    assert exclusion_reason(raw_product()) is None

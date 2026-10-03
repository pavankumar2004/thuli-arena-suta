from catalogue.build import build
from catalogue.scrape import RawCatalogue
from tests.test_normalise import raw_product


def test_menu_category_and_product_type_fallbacks():
    saree = raw_product(id=1, handle="a")
    bag = raw_product(id=2, handle="b", product_type="Bag")
    orphan_blouse = raw_product(id=3, handle="c", product_type="garage_blouse")
    freebie = raw_product(id=4, handle="d", product_type="Freebies")
    untyped_blouse = raw_product(id=5, handle="e", product_type="",
                                 body_html="<p>Blouse Length: 0.32 m</p>")
    untyped_other = raw_product(id=6, handle="f", product_type="", body_html="")
    raw = RawCatalogue(
        products={p["id"]: p for p in (saree, bag, orphan_blouse, freebie,
                                           untyped_blouse, untyped_other)},
        members={"saree": {1}, "suta-bags": set()},  # bags feed empty, as on suta.in
        site_counts={"saree": 1, "suta-bags": 1},
    )
    cat = build(raw)
    by_id = {r["id"]: r for r in cat.records}

    assert set(by_id) == {1, 2, 3, 5, 6} and cat.excluded[0]["id"] == 4
    assert (by_id[1]["category"], by_id[1]["category_source"]) == ("Sarees", "menu")
    assert (by_id[2]["category"], by_id[2]["category_source"]) == ("Bags", "menu")
    assert (by_id[3]["category"], by_id[3]["category_source"]) == ("Blouses", "product_type")
    assert (by_id[5]["category"], by_id[5]["category_source"]) == ("Blouses", "description")
    assert by_id[6]["category"] is None

    coverage = {c["handle"]: c for c in cat.coverage}
    assert coverage["saree"]["match"] and coverage["saree"]["via"] == "collection feed"
    assert coverage["suta-bags"]["match"] and coverage["suta-bags"]["via"] == "product_type"

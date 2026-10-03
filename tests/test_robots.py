from catalogue.fetch import RobotsRules

SHOPIFY_ROBOTS = """
User-agent: *
Allow: /
Disallow: /cart/
Disallow: /collections/*sort_by*
Disallow: /collections/*+*
Disallow: /*?*oseid=*
Allow: /collections/checkout

User-agent: Nutch
Disallow: /
"""


def test_shopify_rules():
    robots = RobotsRules(SHOPIFY_ROBOTS)
    assert robots.allowed("/products.json?limit=250&page=3")
    assert robots.allowed("/collections/saree/products.json?limit=250&page=1")
    assert robots.allowed("/products/sunehri-laal.js")
    assert not robots.allowed("/collections/saree?sort_by=price")
    assert not robots.allowed("/collections/saree+silk")
    assert not robots.allowed("/cart/add")
    assert not robots.allowed("/products/x?oseid=abc")


def test_other_agents_rules_ignored():
    assert RobotsRules(SHOPIFY_ROBOTS).allowed("/collections/saree")


def test_end_anchor():
    robots = RobotsRules("User-agent: *\nDisallow: /*.json$\n")
    assert not robots.allowed("/products.json")
    assert robots.allowed("/products.json?page=1")

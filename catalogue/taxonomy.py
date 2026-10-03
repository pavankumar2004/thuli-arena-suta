"""Suta's own category tree, transcribed from the suta.in navigation menu (Oct 2026).

Judges score coverage against the brand's category counts, so categories come from
the collections the site itself navigates by, not from Shopify's free-text
`product_type` (which has values like `garage_saree` and `Saree with blouse piece`).

A product can sit in several categories (a ready-to-wear saree is in both "Sarees"
and "Ready To Wear Sarees"). Its primary `category` is the first match in the order
below, so broad categories come before the narrower lists that overlap them.
"""

# (collection handle, department, category label)
CATEGORIES: list[tuple[str, str, str]] = [
    ("saree", "Sarees", "Sarees"),
    ("blouses", "Blouses", "Blouses"),
    ("lehengas", "Women", "Lehengas"),
    ("women-dresses", "Women", "Dresses"),
    ("kurta-sets-co-ords", "Women", "Co-ords & Kurta Sets"),
    ("women-shirts", "Women", "Shirts"),
    ("women-jackets", "Women", "Jackets"),
    ("dupatta", "Women", "Dupattas"),
    ("women-t-shirts", "Women", "T-Shirt Blouses"),
    ("women-trousers", "Women", "Trousers"),
    ("womens-underskirts-petticoats", "Women", "Petticoats"),
    ("mens-kurtas", "Men", "Kurtas"),
    ("mens-shirts", "Men", "Shirts"),
    ("shorts-and-trousers", "Men", "Shorts & Trousers"),
    ("gamchas-for-men", "Men", "Gamchas"),
    ("womens-jewellery", "Accessories", "Jewellery"),
    ("shoes", "Accessories", "Shoes"),
    ("suta-bags", "Accessories", "Bags"),
    ("pashmina-khwaab", "Accessories", "Pashmina"),
    ("handkerchiefs", "Accessories", "Handkerchiefs"),
    ("brooches", "Accessories", "Brooches"),
    ("eye-masks", "Accessories", "Travel Accessories"),
    ("scrunchies", "Accessories", "Hair Accessories"),
    ("rakhi-thread-of-love", "Accessories", "Rakhi"),
    ("fabric", "Fabric", "Fabric"),
    ("lace", "Fabric", "Laces"),
    ("buntings", "Home", "Buntings"),
    ("cushions", "Home", "Cushions"),
    ("curtains", "Home", "Curtains"),
    ("home-decor", "Home", "Decor"),
    ("quilts", "Home", "Quilts"),
    ("super-saver-combos", "Gifting", "Super Saver Combos"),
    ("gift-box", "Gifting", "Gift Box"),
    ("kids-wear", "Kids", "Kids"),
    # Narrower lists that overlap the categories above.
    ("ready-to-wear-sarees", "Sarees", "Ready To Wear Sarees"),
    ("suta-garage-saree", "Sarees", "Garage Sarees"),
    ("suta-garage-blouse", "Blouses", "Garage Blouses"),
]

# Merchandising and editorial collections from the same menu. Not categories, but
# the stories the brand already tells: raw material for the lookbook (Task 2).
EDITS: list[str] = [
    "bestseller-sarees",
    "new-arrival-sarees",
    "one-of-a-kind-unique-sarees",
    "best-seller-blouses",
    "new-arrival-blouses",
    "one-of-a-kind-blouses",
    "alat-palat",
    "influencer-picks",
    "show",
    "suta-x-dushara",
    "suta-x-priya-malik",
    "jalebi",
    "chandrama",
    "gulaab",
    "zar",
    "jui",
    "agomoni-puja-collection",
    "out-of-the-box",
]

# Fallback when the menu doesn't place a product: Shopify `product_type` (lower-cased)
# -> (department, category). Used for products the store publishes but leaves out of
# every menu collection, and for menu collections whose JSON feed comes back empty
# even though the page lists products (suta-bags, Oct 2026).
PRODUCT_TYPE_CATEGORIES: dict[str, tuple[str, str]] = {
    "saree": ("Sarees", "Sarees"),
    "saree with blouse piece": ("Sarees", "Sarees"),
    "garage_saree": ("Sarees", "Sarees"),
    "ready to wear": ("Sarees", "Ready To Wear Sarees"),
    "blouse": ("Blouses", "Blouses"),
    "garage_blouse": ("Blouses", "Blouses"),
    "kurta set": ("Women", "Co-ords & Kurta Sets"),
    "kurta": ("Women", "Co-ords & Kurta Sets"),
    "co-ord set": ("Women", "Co-ords & Kurta Sets"),
    "pantsuit set": ("Women", "Co-ords & Kurta Sets"),
    "lounge wear": ("Women", "Loungewear"),
    "dress": ("Women", "Dresses"),
    "saree gown": ("Women", "Dresses"),
    "saree gown & blouse": ("Women", "Dresses"),
    "skirt": ("Women", "Skirts"),
    "skirt, blouse and dupatta": ("Women", "Lehengas"),
    "skirt & dupatta": ("Women", "Lehengas"),
    "semi stitched lehenga set": ("Women", "Lehengas"),
    "trousers": ("Women", "Trousers"),
    "underskirt (petticoat)": ("Women", "Petticoats"),
    "dupatta": ("Women", "Dupattas"),
    "shirt": ("Women", "Shirts"),
    "dhoti": ("Men", "Dhotis"),
    "bag": ("Accessories", "Bags"),
    "neckpiece": ("Accessories", "Jewellery"),
    "earrings": ("Accessories", "Jewellery"),
    "accessories": ("Accessories", "Other Accessories"),
    "scarf": ("Accessories", "Stoles & Shawls"),
    "shawl": ("Accessories", "Stoles & Shawls"),
    "rakhi": ("Accessories", "Rakhi"),
    "fabric": ("Fabric", "Fabric"),
    "home decor": ("Home", "Decor"),
    "painting": ("Home", "Decor"),
    "table runner": ("Home", "Decor"),
    "curtains": ("Home", "Curtains"),
    "cushion cover": ("Home", "Cushions"),
    "swaddle": ("Kids", "Kids"),
    "combo of 3": ("Gifting", "Super Saver Combos"),
    "combo of 5": ("Gifting", "Super Saver Combos"),
    "kit": ("Gifting", "Gift Box"),
    "gift cards": ("Gifting", "Gift Cards"),
    "gift wrapping": ("Gifting", "Gift Wrapping"),
}

# Last resort for products with no menu collection and no product_type: a measurement
# only one kind of garment has, in the description ("Blouse Length: 0.32 m").
DESCRIPTION_HINTS: list[tuple[str, tuple[str, str]]] = [
    ("blouse length", ("Blouses", "Blouses")),
    ("kurta length", ("Women", "Co-ords & Kurta Sets")),
    ("dress length", ("Women", "Dresses")),
]

# Shopify products that are not shoppable items: free add-ons, services, test rows.
EXCLUDED_PRODUCT_TYPES = {"freebies", "service"}

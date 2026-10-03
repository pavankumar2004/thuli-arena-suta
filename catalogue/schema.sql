-- Suta catalogue. One row per product; sizes/colours live as variants under it.

CREATE TABLE IF NOT EXISTS products (
    id               bigint PRIMARY KEY,          -- Shopify product id
    handle           text NOT NULL UNIQUE,
    url              text NOT NULL,
    title            text NOT NULL,
    brand            text NOT NULL,
    department       text,                        -- Sarees, Blouses, Women, Men, ...
    category         text,                        -- primary menu category
    categories       text[] NOT NULL DEFAULT '{}',-- every menu category it appears under
    category_source  text,                        -- 'menu', or 'product_type' fallback
    edits            text[] NOT NULL DEFAULT '{}',-- bestsellers, new arrivals, named edits
    product_type     text,
    price            numeric(10, 2) NOT NULL,     -- lowest variant price, INR
    compare_at_price numeric(10, 2),              -- pre-sale price when on sale
    currency         char(3) NOT NULL,
    available        boolean NOT NULL,
    sizes            text[] NOT NULL,
    sizes_in_stock   text[] NOT NULL,
    colours          text[] NOT NULL,
    attributes       jsonb NOT NULL,              -- {"fabric": [...], "style": [...], ...}
    images           text[] NOT NULL,
    pairs_with       text[] NOT NULL,             -- handles the brand styles it with
    description      text,
    tags             text[] NOT NULL,
    created_at       timestamptz,
    updated_at       timestamptz,
    published_at     timestamptz,
    scraped_at       timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS products_category_idx   ON products (category);
CREATE INDEX IF NOT EXISTS products_price_idx      ON products (price);
CREATE INDEX IF NOT EXISTS products_colours_idx    ON products USING gin (colours);
CREATE INDEX IF NOT EXISTS products_attributes_idx ON products USING gin (attributes);

CREATE TABLE IF NOT EXISTS product_variants (
    id               bigint PRIMARY KEY,          -- Shopify variant id
    product_id       bigint NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    position         int NOT NULL,
    sku              text,
    size             text NOT NULL,
    options          jsonb NOT NULL,
    price            numeric(10, 2) NOT NULL,
    compare_at_price numeric(10, 2),
    available        boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id);

-- What suta.in shows per category vs. what we scraped, for the coverage check.
CREATE TABLE IF NOT EXISTS category_counts (
    handle     text PRIMARY KEY,
    category   text NOT NULL,
    site_count int,
    scraped    int NOT NULL,
    scraped_at timestamptz NOT NULL
);

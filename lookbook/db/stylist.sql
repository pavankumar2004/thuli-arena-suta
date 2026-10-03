-- Indexes the stylist's searches use. Additive and idempotent: run once against the
-- Task 1 `products` table (npm run db:stylist). No data is changed.

-- Fuzzy, typo-tolerant title lookup ("price of saawan?", "is gulab in M?").
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS products_title_trgm_idx ON products USING gin (lower(title) gin_trgm_ops);

-- Occasion and edit filters.
CREATE INDEX IF NOT EXISTS products_tags_idx ON products USING gin (tags);
CREATE INDEX IF NOT EXISTS products_edits_idx ON products USING gin (edits);
CREATE INDEX IF NOT EXISTS products_sizes_in_stock_idx ON products USING gin (sizes_in_stock);
CREATE INDEX IF NOT EXISTS products_available_category_idx ON products (available, category);

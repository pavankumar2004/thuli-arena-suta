-- Task 3 "Made for you". Additive: the catalogue tables (products, ...) are untouched.
-- Apply with: uv run --env-file .env python -m foryou.web_db   (from the repo root)

-- One-off vision tags for catalogue photos, in the same vocabulary as people's photos
-- (src/lib/foryou/vocab.json). Written by `python -m foryou.tag_catalogue`.
CREATE TABLE IF NOT EXISTS product_tags (
    product_id  bigint PRIMARY KEY REFERENCES products (id) ON DELETE CASCADE,
    garment     text NOT NULL,
    colours     text[] NOT NULL,
    fabric_look text,
    silhouette  text,
    occasion    text NOT NULL,
    vibe        text[] NOT NULL DEFAULT '{}',
    model       text NOT NULL,
    tagged_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_tags_lookup ON product_tags (garment, occasion);
CREATE INDEX IF NOT EXISTS product_tags_colours ON product_tags USING gin (colours);

CREATE TABLE IF NOT EXISTS ig_profiles (
    handle      text PRIMARY KEY,
    full_name   text,
    verified    boolean NOT NULL DEFAULT false,
    followers   bigint,
    post_count  int,
    source      text NOT NULL,          -- live-session | live-embed | cache | organiser
    fetched_at  timestamptz NOT NULL
);

-- A person's photos, small JPEGs kept in the database so the app needs no file storage.
CREATE TABLE IF NOT EXISTS ig_photos (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle        text NOT NULL REFERENCES ig_profiles (handle) ON DELETE CASCADE,
    position      int NOT NULL,         -- newest first
    post_url      text,
    caption       text NOT NULL DEFAULT '',
    taken_at      timestamptz,
    is_video      boolean NOT NULL DEFAULT false,
    image         bytea NOT NULL,       -- JPEG, longest side <= 640px
    -- vision tags (null until read)
    is_outfit     boolean,
    worn_by_owner boolean,
    garment       text,
    colours       text[],
    occasion      text,
    note          text,
    UNIQUE (handle, position)
);

CREATE TABLE IF NOT EXISTS wardrobes (
    handle      text PRIMARY KEY REFERENCES ig_profiles (handle) ON DELETE CASCADE,
    taste       jsonb NOT NULL,
    model       text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Results. Only reachable by the random id; looks hold product ids, never prices.
CREATE TABLE IF NOT EXISTS personal_lookbooks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle      text NOT NULL,
    status      text NOT NULL,          -- running | done | error
    stage       text,
    error       text,
    looks       jsonb,                  -- [{moment, headline, reason, photo_id, product_ids}]
    taste       jsonb,
    cost_usd    numeric(8, 4) NOT NULL DEFAULT 0,
    timings     jsonb NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fixed-window rate limiting by client key (IP), without an extra service.
CREATE TABLE IF NOT EXISTS rate_limits (
    key         text NOT NULL,
    bucket      timestamptz NOT NULL,
    hits        int NOT NULL DEFAULT 0,
    PRIMARY KEY (key, bucket)
);

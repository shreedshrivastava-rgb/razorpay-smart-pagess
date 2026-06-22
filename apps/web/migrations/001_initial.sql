-- Smart Pages: Initial schema
-- Run: psql $DATABASE_URL -f migrations/001_initial.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Pages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'published', 'archived')),
  owner_email    TEXT REFERENCES users(email) ON DELETE CASCADE,
  edit_token     TEXT,
  page_data      JSONB NOT NULL,  -- full PageSchema
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pages_owner ON pages(owner_email);
CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at DESC);

-- ─── Chat Sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id           TEXT PRIMARY KEY,
  slug         TEXT REFERENCES pages(slug) ON DELETE CASCADE,
  owner_email  TEXT REFERENCES users(email) ON DELETE CASCADE,
  brand_name   TEXT NOT NULL DEFAULT '',
  preview_version INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner ON chat_sessions(owner_email);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_slug ON chat_sessions(slug);

-- ─── Chat Messages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'preview')),
  content        TEXT NOT NULL DEFAULT '',
  image_url      TEXT,
  preview_slug   TEXT,
  preview_version INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);

-- ─── Orders (for reconciliation) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  page_slug       TEXT REFERENCES pages(slug) ON DELETE SET NULL,
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  status          TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  buyer_email     TEXT,
  buyer_phone     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_page ON orders(page_slug);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON orders(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ─── Rate limit audit (optional — for debugging abuse) ─────────────────
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  key        TEXT NOT NULL,
  allowed    BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events ON rate_limit_events(name, created_at DESC);

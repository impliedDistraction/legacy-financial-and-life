-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Apollo list cache — persist downloaded lists locally
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS.
--
-- Stores full Apollo contact lists in Supabase so imports don't need
-- to re-fetch from Apollo API. Lists are downloaded once and cached
-- indefinitely (with optional refresh via the UI).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS apollo_list_cache (
  list_id TEXT PRIMARY KEY,                        -- Apollo label/list ID
  list_name TEXT,                                  -- Human-readable list name
  contact_count INTEGER NOT NULL DEFAULT 0,        -- Number of contacts cached
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,     -- Full contact array from Apollo
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- When the list was last fetched
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE apollo_list_cache IS 'Cached Apollo contact lists — downloaded once, used for repeated imports without hitting Apollo API';
COMMENT ON COLUMN apollo_list_cache.contacts IS 'Full Apollo contact objects as-is from /api/v1/contacts/search';

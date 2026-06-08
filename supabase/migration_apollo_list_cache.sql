-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Apollo list cache + bulk import RPC
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS / OR REPLACE.
--
-- 1. Caches downloaded Apollo lists so imports don't re-fetch the API
-- 2. Provides an RPC for bulk prospect import with ON CONFLICT DO NOTHING
--    (PostgREST headers don't work with partial unique indexes)
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. Apollo list cache table                                     │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS apollo_list_cache (
  list_id TEXT PRIMARY KEY,
  list_name TEXT,
  contact_count INTEGER NOT NULL DEFAULT 0,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE apollo_list_cache IS 'Cached Apollo contact lists — downloaded once, used for repeated imports without hitting Apollo API';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. Bulk import RPC with ON CONFLICT DO NOTHING                 │
-- └─────────────────────────────────────────────────────────────────┘
-- Works with the partial unique index idx_recruitment_prospects_email_active
-- which PostgREST's Prefer: resolution=ignore-duplicates cannot handle.

CREATE OR REPLACE FUNCTION import_prospects_bulk(rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inserted integer;
  total integer;
BEGIN
  total := jsonb_array_length(rows);

  WITH ins AS (
    INSERT INTO recruitment_prospects (
      name, email, state, city, current_agency,
      source, status, interaction_stage, research_status,
      sales_campaign_id, properties, notes, created_at, updated_at
    )
    SELECT
      (r->>'name'),
      lower(r->>'email'),
      (r->>'state'),
      (r->>'city'),
      (r->>'current_agency'),
      (r->>'source'),
      (r->>'status'),
      (r->>'interaction_stage'),
      (r->>'research_status'),
      (r->>'sales_campaign_id')::uuid,
      (r->'properties')::jsonb,
      (r->>'notes'),
      COALESCE((r->>'created_at')::timestamptz, now()),
      COALESCE((r->>'updated_at')::timestamptz, now())
    FROM jsonb_array_elements(rows) AS r
    WHERE (r->>'email') IS NOT NULL AND (r->>'name') IS NOT NULL
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;

  RETURN jsonb_build_object(
    'inserted', inserted,
    'skipped', total - inserted
  );
END;
$$;

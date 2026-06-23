-- dialog_trees — Persistable dialog tree storage for voice agents.
-- Trees can be used across multiple systems: sales qualifying, recruitment,
-- agent-designed custom flows, birthday/client outreach, etc.

CREATE TABLE IF NOT EXISTS dialog_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                           -- Human-readable name ("Sales Qualifying v3")
  slug TEXT NOT NULL UNIQUE,                    -- URL-safe identifier ("sales-qualifying-v3")
  description TEXT,                             -- What this tree does
  category TEXT NOT NULL DEFAULT 'sales'        -- sales, recruitment, client_outreach, custom
    CHECK (category IN ('sales', 'recruitment', 'client_outreach', 'custom')),
  
  -- The actual tree data (same format as sales-dialog-tree-v2.json)
  tree_data JSONB NOT NULL,
  
  -- Metadata
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived', 'testing')),
  
  -- Ownership & permissions
  created_by TEXT,                              -- email of creator
  agent_id UUID REFERENCES carrier_agents(id), -- if agent-created (premium tier)
  is_template BOOLEAN NOT NULL DEFAULT false,   -- available as starting point for custom trees
  
  -- TTS pre-rendering state
  tts_rendered BOOLEAN NOT NULL DEFAULT false,  -- all nodes have pre-rendered audio
  tts_render_ts TIMESTAMPTZ,                    -- when audio was last generated
  
  -- Usage tracking
  total_calls INTEGER NOT NULL DEFAULT 0,
  avg_qualification_rate NUMERIC(5,2),          -- % of calls reaching transfer
  avg_duration_s INTEGER,
  
  -- Compliance
  compliance_approved BOOLEAN NOT NULL DEFAULT false, -- LLM + human review passed
  compliance_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by slug + status
CREATE INDEX IF NOT EXISTS idx_dialog_trees_slug ON dialog_trees(slug);
CREATE INDEX IF NOT EXISTS idx_dialog_trees_status ON dialog_trees(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_dialog_trees_category ON dialog_trees(category);
CREATE INDEX IF NOT EXISTS idx_dialog_trees_agent ON dialog_trees(agent_id) WHERE agent_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_dialog_trees_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dialog_trees_updated
  BEFORE UPDATE ON dialog_trees
  FOR EACH ROW EXECUTE FUNCTION update_dialog_trees_timestamp();

-- ═══════════════════════════════════════════════════════════════
-- Seed: Current sales tree as the first active entry
-- ═══════════════════════════════════════════════════════════════
-- (Tree data will be inserted via API on first deploy — too large for inline SQL)

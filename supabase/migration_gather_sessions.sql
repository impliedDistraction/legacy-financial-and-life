-- gather_sessions: Log every LLM gather interaction for escape path analysis
-- Used by the dialog tree editor to show how gather nodes are performing

CREATE TABLE IF NOT EXISTS gather_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid REFERENCES dialog_trees(id) ON DELETE SET NULL,
  node_id text NOT NULL,
  call_id text,
  session_id text,
  turns jsonb NOT NULL DEFAULT '[]',
  slots_extracted jsonb DEFAULT '{}',
  outcome text NOT NULL CHECK (outcome IN ('returned', 'max_turns', 'hangup', 'transfer', 'error')),
  return_node text,
  duration_ms int,
  created_at timestamptz DEFAULT now()
);

-- Index for querying by tree + node (editor escape path panel)
CREATE INDEX idx_gather_sessions_tree_node ON gather_sessions(tree_id, node_id);
CREATE INDEX idx_gather_sessions_created ON gather_sessions(created_at DESC);

-- gather_insights: Nightly analysis suggestions from gather-analyst worker
-- Surfaces unhandled patterns, slot gaps, and early bails to the editor

CREATE TABLE IF NOT EXISTS gather_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id uuid REFERENCES dialog_trees(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  insight_type text NOT NULL CHECK (insight_type IN ('unhandled_pattern', 'slot_gap', 'early_bail', 'common_path')),
  pattern text,
  examples jsonb DEFAULT '[]',
  occurrence_count int DEFAULT 1,
  suggested_edge jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'promoted', 'dismissed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for editor fetching insights for a specific node
CREATE INDEX idx_gather_insights_tree_node ON gather_insights(tree_id, node_id, status);

-- RLS policies
ALTER TABLE gather_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gather_insights ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (workers write, dashboard reads)
CREATE POLICY "service_role_all_gather_sessions" ON gather_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_gather_insights" ON gather_insights
  FOR ALL USING (true) WITH CHECK (true);

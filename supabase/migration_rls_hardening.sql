-- ═══════════════════════════════════════════════════════════════════
-- RLS Hardening: Enable Row-Level Security on all tables
-- All access is via service_role key (server-side only), so no public
-- SELECT/INSERT/UPDATE/DELETE policies are needed.
-- RLS + no policies = zero access for anon key if ever exposed.
-- ═══════════════════════════════════════════════════════════════════

-- recruitment_prospects (PII: names, emails, phones, research data)
ALTER TABLE IF EXISTS public.recruitment_prospects ENABLE ROW LEVEL SECURITY;

-- recruitment_campaigns (operational config)
ALTER TABLE IF EXISTS public.recruitment_campaigns ENABLE ROW LEVEL SECURITY;

-- escalated_issues (internal escalation data)
ALTER TABLE IF EXISTS public.escalated_issues ENABLE ROW LEVEL SECURITY;

-- lead_flow_events (analytics with IP addresses)
ALTER TABLE IF EXISTS public.lead_flow_events ENABLE ROW LEVEL SECURITY;

-- recruitment_chat_logs (already has RLS, ensure it stays)
ALTER TABLE IF EXISTS public.recruitment_chat_logs ENABLE ROW LEVEL SECURITY;

-- sales_leads (converted lead PII)
ALTER TABLE IF EXISTS public.sales_leads ENABLE ROW LEVEL SECURITY;

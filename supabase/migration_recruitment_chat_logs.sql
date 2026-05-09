-- Recruitment Chat Logs
-- Stores every chat exchange on /join for worker review and improvement.
-- Workers can query flagged conversations, analyze patterns, and refine prompts.

create table if not exists public.recruitment_chat_logs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,           -- groups messages in the same conversation
  client_ip text,                     -- for abuse correlation (hashed or truncated in future)
  user_message text not null,         -- what the visitor said (truncated to 2000 chars)
  assistant_message text not null,    -- what the AI responded (truncated to 4000 chars)
  flagged boolean not null default false,  -- true if injection attempt or output leak detected
  flag_reason text,                   -- 'injection_attempt' | 'output_leak_detected' | worker-set reasons
  latency_ms integer,                 -- response time in milliseconds
  token_count integer,                -- completion tokens used
  reviewed_by text,                   -- worker name that reviewed (e.g. 'chat-qa-agent')
  review_score integer,               -- 1-10 quality score from worker review
  review_notes text,                  -- worker review notes
  created_at timestamptz not null default now()
);

-- Index for worker review queue: flagged/unreviewed first
create index if not exists idx_chat_logs_review_queue
  on public.recruitment_chat_logs (flagged desc, reviewed_by, created_at desc);

-- Index for session grouping
create index if not exists idx_chat_logs_session
  on public.recruitment_chat_logs (session_id, created_at);

-- Index for analytics queries
create index if not exists idx_chat_logs_created
  on public.recruitment_chat_logs (created_at desc);

-- RLS: service role only (no public access)
alter table public.recruitment_chat_logs enable row level security;

-- No public policies — only service_role can read/write
-- Workers and the API endpoint use the service role key

create extension if not exists pgcrypto;

create table if not exists public.lead_flow_events (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null,
  route text not null,
  event_name text not null,
  source text not null,
  stage text not null,
  status text not null,
  owner_scope text not null,
  lead_email text,
  lead_phone text,
  interest text,
  provider text,
  occurred_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_flow_events_tracking_id_idx
  on public.lead_flow_events (tracking_id, occurred_at desc);

create index if not exists lead_flow_events_event_name_idx
  on public.lead_flow_events (event_name, occurred_at desc);

create index if not exists lead_flow_events_lead_email_idx
  on public.lead_flow_events (lead_email, occurred_at desc);

create index if not exists lead_flow_events_stage_idx
  on public.lead_flow_events (stage, occurred_at desc);
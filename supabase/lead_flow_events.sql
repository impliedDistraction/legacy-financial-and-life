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

alter table public.lead_flow_events
  add column if not exists recipient_email text;

alter table public.lead_flow_events
  add column if not exists provider_event_at timestamptz;

comment on column public.lead_flow_events.occurred_at is
  'Time the event happened in the app or upstream provider flow.';

comment on column public.lead_flow_events.created_at is
  'Time the analytics row was inserted into Supabase.';

comment on column public.lead_flow_events.recipient_email is
  'Actual recipient for delivery-oriented events. This is separate from lead_email.';

comment on column public.lead_flow_events.provider_event_at is
  'Original upstream provider timestamp when available, such as a Resend webhook event timestamp.';

create index if not exists lead_flow_events_tracking_id_idx
  on public.lead_flow_events (tracking_id, occurred_at desc);

create index if not exists lead_flow_events_event_name_idx
  on public.lead_flow_events (event_name, occurred_at desc);

create index if not exists lead_flow_events_lead_email_idx
  on public.lead_flow_events (lead_email, occurred_at desc);

create index if not exists lead_flow_events_recipient_email_idx
  on public.lead_flow_events (recipient_email, occurred_at desc);

create index if not exists lead_flow_events_stage_idx
  on public.lead_flow_events (stage, occurred_at desc);

-- Phone-based dedup index (used by 30-day duplicate lead check)
create index if not exists lead_flow_events_lead_phone_idx
  on public.lead_flow_events (lead_phone, occurred_at desc);

-- JSONB index for IP-based rate limiting (queries properties->>'client_ip')
create index if not exists lead_flow_events_client_ip_idx
  on public.lead_flow_events ((properties->>'client_ip'), occurred_at desc)
  where event_name = 'quote_request_received';
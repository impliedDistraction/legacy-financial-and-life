# Legacy Financial & Life — AI Agent Instructions

@.github/copilot-instructions.md

## Quick Context for Agents

This is the **frontend + API layer** for Tim & Beth Byrd's insurance agency. It's an Astro site on Vercel with Supabase backend. The heavy backend processing (AI drafting, research, email sending) happens in the **Sentinel** project — this project provides dashboards and API endpoints that Sentinel calls or that the dashboard JS fetches.

## How the System Fits Together

```
┌─────────────────────────────────────────────────────────────┐
│ This Project (Vercel)                                        │
│                                                              │
│  Public Site ─── /free-quote, /book, /hiring, /estate-plan  │
│  AI Chat ────── /ai-demo (proxies to Sentinel → vLLM)       │
│  Dashboards ─── /recruitment, /analytics, /sales            │
│  API Layer ──── /api/* (51 endpoints)                        │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ OLLAMA_URL (ngrok tunnel)
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ Sentinel (Josh's local machine)                              │
│                                                              │
│  GPU Scheduler ─── Priority queue for LLM requests           │
│  Cron Workers ──── Recruitment, research, sending, analytics │
│  Voice Bridge ──── Real-time phone calls via Telnyx          │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ Supabase (kxmojndpgxgbykxjtxba)                              │
│                                                              │
│  recruitment_campaigns, recruitment_prospects                 │
│  survey_campaigns, survey_responses                           │
│  chatbot_conversations, lead_flow_events                     │
│  calendly_events, meeting_outcomes                           │
│  quote_threads, escalated_issues                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Recruitment Pipeline (The Main Workload)

The recruitment dashboard at `/recruitment` is the operational heart. Here's how prospects flow:

### Campaign → Prospect → Outreach → Conversion

1. **Campaign created** via dashboard (POST `/api/recruitment-campaigns`)
   - Source type: prophog, fl_licensee, state_licensee, apollo_recruitment, or csv
   - Targeting: state, license type, filters
   - Limits: send_limit, credit_budget

2. **Sentinel imports prospects** (runs on cron schedule per campaign)
   - Inserts rows with `status='pending'` into `recruitment_prospects`

3. **AI drafts outreach** (Sentinel's recruitment.js)
   - Generates personalized email + call script per prospect
   - Status: `pending` → `drafted`

4. **QA gate** (Sentinel's qa-agent.js)
   - Deterministic checks: format, length, CTA, compliance
   - Status: `drafted` → `reviewed` (or `rejected`)

5. **Review + approval** (Sentinel's review-agent.js)
   - Scores fit and research quality
   - Status: `reviewed` → `approved`

6. **Send** (Sentinel drains approved queue via send-pacer)
   - Sends via Resend during business hours
   - Status: `approved` → `sent`

7. **Follow-up** (Sentinel's follow-up.js)
   - Day-3, Day-7 emails if no response
   - Status: `sent` → `follow_up_1` → `follow_up_2` → `follow_up_exhausted`

8. **Conversion** (Calendly sync or manual)
   - Status: → `converted` or → `scheduled`/`booked`

### Cross-Campaign Deduplication
- Same email can't be active in multiple campaigns simultaneously
- Terminal statuses (rejected, opted_out, exhausted, converted) free the email for future campaigns

## API Endpoint Patterns

All API endpoints in `src/pages/api/` follow these conventions:
- `export const prerender = false` (required for SSR)
- Rate limiting via in-memory per-IP counters
- Auth via magic-link session cookies (dashboard endpoints)
- Input validation + truncation at the top of each handler
- JSON responses with appropriate HTTP status codes

## Survey System

Surveys are a separate campaign type for re-engaging exhausted prospects:
- First question embedded in email as clickable buttons
- Clicks hit `/api/survey-response` (HMAC-verified)
- Response recorded → next question shown in browser
- Engagement signals feed back into the passive pipeline

## AI Chat (`/ai-demo`)

- Proxies chat messages to Sentinel (which routes to vLLM)
- Uses `legacy-messenger` model with system prompt from `ai/prompts/messenger-system.md`
- Includes injection detection + output leak prevention
- Session-based with conversation history in Supabase

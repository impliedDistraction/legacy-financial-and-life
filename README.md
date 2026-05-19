# Legacy Financial & Life

Professional insurance agency website and AI-powered recruitment platform for Tim & Beth Byrd's agency, built with Astro and Tailwind CSS.

**Live site:** https://legacyfinancial.app  
**Hosting:** Vercel (static + serverless functions)  
**Backend:** Supabase (kxmojndpgxgbykxjtxba)

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 6.2+ (SSG with hybrid SSR for API routes) |
| Styling | Tailwind CSS 3.4 with custom brand colors |
| Language | TypeScript |
| Hosting | Vercel (static + serverless, 120s max duration) |
| Database | Supabase (PostgreSQL) |
| Email | Resend (transactional + webhooks) |
| AI Backend | vLLM (Qwen3-30B via Sentinel proxy) |
| Analytics | Vercel Analytics + custom Supabase lead funnel |
| Scheduling | Calendly (via Sentinel sync worker) |

## Project Structure

```
├── public/                   Static assets (images, scripts, favicon)
├── scripts/                  Build & utility scripts
│   ├── ai-launcher.js        Start local AI stack (Ollama + proxy + tunnel)
│   ├── ensure-lfs.sh         Prebuild LFS verification
│   ├── fetch-images.js       Download/optimize images
│   └── generate-images.cjs   AI image generation
├── ai/                       AI prompts and tools
│   ├── prompts/              System prompts (messenger, comment drafts)
│   └── Modelfile.messenger   Ollama model definition
├── src/
│   ├── components/           Reusable Astro components
│   ├── content/site.ts       Centralized site content & config
│   ├── layouts/              Page layouts (Base.astro)
│   ├── pages/                Route pages (see below)
│   └── styles/               Global CSS
├── supabase/                 Database migrations
├── astro.config.mjs          Astro + Vercel adapter config
├── tailwind.config.cjs       Tailwind brand colors + extensions
├── vercel.json               Headers, redirects, LFS config
└── package.json              Dependencies and scripts
```

## Pages & Routes

### Public Pages
| Route | Purpose |
|-------|---------|
| `/` | Homepage — hero, services, team, contact |
| `/free-quote` | Lead capture quote form |
| `/estate-planning` | Estate planning services |
| `/schedule` | Calendly booking embed |
| `/hiring` | Public agent recruitment page |
| `/group` | Group health insurance for businesses (50+ employees) |
| `/join` | Personalized prospect landing page (dynamic per `?pid=`) |
| `/privacy` | Privacy policy |

### Protected Dashboards
| Route | Purpose |
|-------|---------|
| `/recruitment` | Agent recruitment campaign dashboard (CSV upload, AI outreach, call scripts, surveys) |
| `/ai-demo` | AI chat + comment draft demo for client evaluation |
| `/t65-heatmap` | Turning-65 population density heatmap by state/zip |
| `/analytics/` | Lead flow analytics dashboard |

### API Endpoints
| Endpoint | Purpose |
|----------|---------|
| `/api/fb-lead` | Quote form submission handler |
| `/api/ai-chat` | Streaming SSE chat proxy to AI backend |
| `/api/ai-comments` | Batch comment draft generation |
| `/api/ai-scout` | Facebook post engagement scoring |
| `/api/ai-approve` | Approve AI-drafted content |
| `/api/recruitment-*` | Recruitment pipeline management (8 endpoints) |
| `/api/survey-campaigns` | Survey CRUD |
| `/api/survey-response` | HMAC-verified survey answer recording |
| `/api/resend-webhook` | Resend delivery/bounce/reply webhook |
| `/api/escalate` | Issue escalation to Sentinel |
| `/api/lead-analytics` | Client-side funnel event ingestion |
| `/api/state-discovery` | Prophog state monitoring proxy |
| `/api/t65-data` | T65 heatmap data |
| `/api/unsubscribe` | HMAC-verified opt-out |
| `/api/call-form` | Voice agent SMS form submission |

## Development

**Requirements:** Node.js >= 22.12.0

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:4321)
npm run build        # Production build
npm run preview      # Preview production build locally
npm run ai           # Start local AI infrastructure (Ollama + proxy + tunnel)
```

### Environment Variables

Required for core functionality:
| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Transactional email sending |
| `RESEND_WEBHOOK_SECRET` | Webhook signature verification (Svix) |
| `SUPABASE_URL` | Legacy Financial Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access |
| `OLLAMA_URL` | AI backend URL (set by `npm run ai` via tunnel) |

Optional:
| Variable | Purpose |
|----------|---------|
| `RESEND_REPLY_MONITOR_ADDRESS` | Inbound reply monitoring address |
| `RESEND_CONTACT_SEGMENT_ID` | Auto-enroll leads into Resend segment |
| `RESEND_CONTACT_TOPIC_ID` | Auto-opt-in leads to Resend topic |
| `RESEND_ALERT_RECIPIENTS` | Comma-separated alert email recipients |
| `AI_DEMO_ALLOWED_EMAILS` | Email allowlist for AI demo access |
| `SUPABASE_LEAD_ANALYTICS_TABLE` | Override analytics table name (default: `lead_flow_events`) |

## Security

Security headers are applied via `vercel.json`:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

API-level protections:
- **Webhook verification**: Svix signature validation on Resend webhooks
- **HMAC tokens**: Unsubscribe and survey links use HMAC-SHA256 with constant-time comparison
- **Rate limiting**: Per-IP rate limits on all public API endpoints
- **Auth**: Magic-link sessions for admin dashboards (email allowlist)
- **AI guardrails**: Prompt injection detection (20+ patterns), output leak detection, session-level IP blocking after 3 injection attempts
- **Anti-spam**: Honeypot fields, timing checks, per-IP rate limiting on quote form
- **Lead dedup**: 30-day window deduplication by email/phone

See [CLIENT_SERVICE_HARDENING.md](CLIENT_SERVICE_HARDENING.md) for the full security audit.

## Lead Funnel Analytics

Two analytics layers track the quote flow end-to-end:
1. **Vercel Analytics** — Client-side funnel events on `/free-quote`, `/quote-success`, `/quote-error`
2. **Supabase persistence** — Server-side lead ledger covering page events, API milestones, Resend contact sync, and webhook delivery events

Events are correlated via a `tracking_id` generated in the browser and passed through the API and Resend email tags.

Schema: [supabase/lead_flow_events.sql](supabase/lead_flow_events.sql)

## AI Services

Local AI powers several features (see [AI_SERVICES_IMPLEMENTATION.md](AI_SERVICES_IMPLEMENTATION.md)):
- **Messenger-style chat** — Insurance Q&A assistant at `/ai-demo`
- **Comment draft generation** — AI replies to Facebook comments
- **Facebook Scout** — Engagement scoring and reply drafting for social posts
- **Recruitment outreach** — Personalized email/call script generation (via Sentinel)

Infrastructure: vLLM serving Qwen3-30B-A3B (GPTQ-Int4) on RTX 4090, proxied through Sentinel to Vercel via ngrok tunnel.

## Recruitment System

The `/recruitment` dashboard provides:
- CSV prospect upload and deduplication
- AI-generated personalized outreach emails
- Review/edit/approve workflow before sending
- Call script generation for phone outreach
- Survey campaign management (embedded, no external tools)
- T65 heatmap for territory targeting
- Pipeline tracking (new → contacted → responded → scheduled → contracted)

## Database Migrations

All migrations live in `supabase/`. Key tables:
- `recruitment_prospects` — Prospect pipeline
- `recruitment_campaigns` — Campaign configuration
- `lead_flow_events` — Quote funnel analytics
- `survey_campaigns` / `survey_questions` / `survey_responses` — Survey system
- `escalated_issues` — Support escalation tracking
- `sales_leads` — Inbound lead storage

## Deployment

Push to `main` triggers Vercel deployment. The build process:
1. Runs `scripts/ensure-lfs.sh` to verify Git LFS images
2. Builds Astro static + serverless output
3. Applies security headers from `vercel.json`

Git LFS is enabled in `vercel.json` (`"git": { "lfs": true }`) — see [VERCEL_LFS_FIX.md](VERCEL_LFS_FIX.md) for details.

## Related Projects

| Project | Role |
|---------|------|
| [Sentinel](../../../sentinel) | AI orchestrator — cron workers, research pipeline, Calendly sync, voice agent |
| [vLLM](../../../vllm) | Model serving (Qwen3-30B-A3B-GPTQ-Int4) |
| [Fieldwork Systems](../../../fieldwork-systems) | Client management platform (fwsys.ai) |
	If you already ran it earlier, rerun it so the idempotent `recipient_email` and `provider_event_at` columns are added.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
3. Optionally set `SUPABASE_LEAD_ANALYTICS_TABLE` if you want a different table name.

Notes:
- This implementation uses Vercel custom events for funnel measurement. It does not currently wire up the separate Vercel Flags product.
- For lead-generation reporting, event properties already capture the practical "flag flip" states such as validation passed, contact synced, email sent, delivery confirmed, and handoff ready.
- `occurred_at` is the canonical event time used for funnel ordering. For provider-backed events such as Resend webhooks, `provider_event_at` preserves the original provider timestamp as a dedicated query field.
- `lead_email` is the person who submitted or replied when that identity is known. `recipient_email` is the actual delivery recipient, which keeps internal notification emails from being mistaken for leads.

## Customization

### Update site content
Edit `src/content/site.ts` to customize:
- Company information (name, phone, email, location)
- Hero section content
- Feature cards
- Team information
- Contact form messaging

### Update styling
- Brand colors are defined in `tailwind.config.cjs`
- Custom styles can be added to `src/styles/tailwind.css`

### Contact form setup
1. Sign up for [Formspree](https://formspree.io)
2. Create a new form and get your form ID
3. Replace `your-form-id` in `src/components/ContactForm.astro` with your actual form ID

## Deployment

This site is optimized for deployment on Vercel, but can be deployed anywhere that supports static sites:

1. **Vercel**: Connect your GitHub repo and deploy automatically
2. **Netlify**: Drag and drop the `dist` folder after running `npm run build`
3. **GitHub Pages**: Use GitHub Actions to build and deploy

## File Structure

```
legacyf-l/
├─ package.json
├─ astro.config.mjs
├─ tsconfig.json
├─ tailwind.config.cjs
├─ postcss.config.cjs
├─ public/
│  ├─ favicon.svg
│  └─ og-image.jpg
├─ src/
│  ├─ styles/
│  │  └─ tailwind.css
│  ├─ content/
│  │  └─ site.ts
│  ├─ layouts/
│  │  └─ Base.astro
│  ├─ components/
│  │  ├─ SEO.astro
│  │  ├─ Header.astro
│  │  ├─ Hero.astro
│  │  ├─ FeatureCards.astro
│  │  ├─ Team.astro
│  │  ├─ ContactForm.astro
│  │  └─ Footer.astro
│  └─ pages/
│     └─ index.astro
└─ README.md
```
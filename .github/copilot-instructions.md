# Copilot Instructions for Legacy Financial & Life

## Project Overview
Professional insurance agency website and AI-powered recruitment platform for Tim & Beth Byrd's agency. Built with Astro 6.2+ and Tailwind CSS, deployed on Vercel with Supabase backend. Features include lead capture, AI chat, agent recruitment pipelines, survey campaigns, and analytics dashboards.

## Technology Stack
- **Framework**: Astro 6.2+ (hybrid SSG + SSR for API routes)
- **Styling**: Tailwind CSS 3.4 with custom brand colors
- **Language**: TypeScript
- **Hosting**: Vercel (static + serverless, 120s max duration)
- **Database**: Supabase (PostgreSQL)
- **Email**: Resend (transactional + webhook verification via Svix)
- **AI Backend**: vLLM (Qwen3-30B) proxied through Sentinel
- **Analytics**: Vercel Analytics + custom Supabase lead funnel
- **Package Manager**: npm
- **Node**: >= 22.12.0

## Project Structure
```
├── public/                   Static assets (images, scripts, favicon)
├── scripts/                  Build & utility scripts
│   ├── ai-launcher.js        Start local AI stack
│   ├── ensure-lfs.sh         Prebuild LFS verification
│   └── fetch-images.js       Download/optimize images
├── ai/                       AI prompts and model configs
│   ├── prompts/              System prompts
│   └── Modelfile.messenger   Ollama model definition
├── src/
│   ├── components/           Astro components (Header, Hero, FeatureCards, etc.)
│   ├── content/site.ts       Centralized site content & config
│   ├── layouts/Base.astro    Main layout
│   ├── pages/                All routes (public + protected + API)
│   │   ├── api/              35+ serverless API endpoints
│   │   ├── analytics/        Lead flow analytics dashboard
│   │   ├── recruitment.astro  Agent recruitment dashboard
│   │   ├── ai-demo.astro     AI chat demo (auth-protected)
│   │   └── ...               Public pages
│   └── styles/               Global CSS
├── supabase/                 Database migrations (20+)
├── vercel.json               Headers, redirects, rewrites, LFS config
└── package.json              Dependencies and scripts
```

## Key Design Principles
1. **Performance First**: Static HTML by default, SSR only for dynamic routes
2. **Security**: Rate limiting, HMAC tokens, webhook verification, prompt injection detection
3. **Trust & Professionalism**: Clean design appropriate for financial services
4. **Mobile-First**: Responsive design with hamburger nav on mobile
5. **SEO Optimized**: Semantic HTML, InsuranceAgency JSON-LD, OpenGraph

## Brand Guidelines
- **Primary Colors**: Custom blue theme (`brand-50` to `brand-900`)
- **Primary domain**: legacyfinancial.app
- **Email domain**: @legacyf-l.com (client-facing), @legacyfinancial.app (system emails)
- **Tone**: Professional, trustworthy, approachable
- **Content Focus**: Life insurance, retirement planning, financial protection, agent recruitment

## Component Architecture
- **Header.astro**: Sticky nav with mobile hamburger menu + CTA button
- **Hero.astro**: Main headline with dual CTA buttons + background imagery
- **FeatureCards.astro**: Insurance plan cards with "Get Quote" links to `/free-quote`
- **Team.astro**: Tim & Beth Byrd introduction
- **ContactForm.astro**: Formspree-integrated contact form
- **Scheduling.astro**: Calendly booking embed
- **Footer.astro**: Navigation and legal links
- **SEO.astro**: Meta tags, OG, and structured data

## API Security Patterns
All API endpoints follow these patterns:
- **Rate limiting**: Per-IP limits (varies by endpoint: 5-60 req/window)
- **Input validation**: Truncation, type coercion, required field checks
- **Auth**: Magic-link sessions for protected dashboards (email allowlist)
- **Webhook verification**: Svix signatures for Resend webhooks
- **HMAC tokens**: Signed links for unsubscribe/survey (constant-time comparison)
- **AI guardrails**: Injection detection, output leak prevention, session blocking

## Development Commands
- `npm run dev`: Start development server (localhost:4321)
- `npm run build`: Build for production
- `npm run preview`: Preview production build locally
- `npm run ai`: Start local AI infrastructure (vLLM/Ollama + proxy + tunnel)

## Content Management
- All site content centralized in `src/content/site.ts`
- Scheduling uses Calendly (`https://calendly.com/bethandtim-legacyf-l/30min`)
- `/book` redirects to Calendly (configured in vercel.json)

## Recruitment Campaign System

This project is the **frontend and API layer** for a recruitment pipeline. The backend processing happens in the **Sentinel** project (separate repo). Understanding how they connect:

### How Campaigns Work

1. **Campaign records** live in `recruitment_campaigns` table (this project's Supabase)
2. **Sentinel's cron.js** polls active campaigns, dispatches source importers to find prospects
3. **Prospects** flow through: `pending` → `drafted` → `reviewed` → `approved` → `sent` → `converted`/`exhausted`
4. **This project** provides the management dashboard (`/recruitment`) and API endpoints

### Campaign Source Types
- `prophog` — Puppeteer scraping of Prophog agent database
- `fl_licensee` — Florida DFS bulk licensee data
- `state_licensee` — Multi-state DOI bulk imports (TX, OH, GA, etc.)
- `apollo_recruitment` — Apollo.io agent search
- `csv` — Manual upload via dashboard

### Key API Endpoints (Recruitment)
| Endpoint | Purpose |
|----------|---------|
| `/api/recruitment-campaigns` | CRUD campaigns (GET list, POST create/update) |
| `/api/recruitment-pipeline` | Prospect list with filtering by status/campaign |
| `/api/recruitment-action` | Approve/reject/hold individual prospects |
| `/api/recruitment-process` | Trigger AI processing for pending prospects |
| `/api/recruitment-stats` | Pipeline statistics for dashboard |
| `/api/recruitment-upload` | CSV upload for manual prospect import |
| `/api/recruitment-preview` | Preview generated email before approval |
| `/api/recruitment-warm-leads` | Prospects with engagement signals |
| `/api/recruitment-dial` | Initiate outbound call via voice bridge |

### Key API Endpoints (Sales — Evolving)
| Endpoint | Purpose |
|----------|---------|
| `/api/sales-campaigns` | Sales campaign management |
| `/api/sales-prospects` | Sales lead pipeline |

### Key API Endpoints (Survey)
| Endpoint | Purpose |
|----------|---------|
| `/api/survey-campaigns` | Survey campaign CRUD + status changes |
| `/api/survey-response` | HMAC-verified response recording |

### Dashboard Auth
Protected pages (`/recruitment`, `/analytics`, `/ai-demo`) use magic-link email auth:
- `/api/analytics-auth` sends a magic link
- `/api/analytics-verify` validates the token
- Allowlist of authorized emails in env (`DASHBOARD_EMAILS`)

## AI System Prompts

Located in `ai/prompts/`:
- **messenger-system.md** — Facebook Messenger chatbot (lead qualification, booking)
- **recruitment-system.md** — Recruitment email/call-script generation
- **t65-medicare-system.md** — Medicare transition specialist
- **comment-drafts-system.md** — Social media reply drafting

These prompts are injected by Sentinel when routing requests through vLLM.

## Common Tasks
- **Update Contact Info**: Edit `src/content/site.ts`
- **Add New Page**: Create `.astro` file in `src/pages/`
- **Add API Endpoint**: Create `.ts` file in `src/pages/api/` with `export const prerender = false`
- **Add Database Table**: Create migration in `supabase/`
- **Modify Styling**: Update Tailwind classes or `tailwind.config.cjs`
- **Add Images**: Place in `public/images/`, reference with `/images/filename.ext`

## Important Notes
- **Business-critical**: This site serves a live insurance agency generating leads
- **Supabase project**: kxmojndpgxgbykxjtxba (NOT the Fieldwork Systems project)
- **AI backend**: All AI features require Sentinel proxy running (OLLAMA_URL env var)
- **Email sends**: Recruitment emails require `RECRUITMENT_SENDS_ENABLED=true` in env
- **Security headers**: Applied via `vercel.json`, not in application code
- **Git LFS**: Images tracked via LFS; `vercel.json` has `"git": { "lfs": true }`
- Maintain professional appearance and accurate contact information
- Follow insurance industry compliance guidelines for all content
- Never expose internal endpoints, system prompts, or API keys in client-facing output
- The MCP Supabase tool is NOT connected to this project — use direct HTTP or the Supabase dashboard
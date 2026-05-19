# AI Services — Implementation Tracker

**Client:** Tim & Beth Byrd — Legacy Financial & Life  
**Goal:** Local AI-powered recruitment outreach, Facebook engagement, and client-facing chat  
**Started:** April 23, 2026  
**Last updated:** May 19, 2026

---

## Executive Summary

AI services running on Josh's RTX 4090 power multiple features for Legacy Financial:

1. **AI Chat Assistant** — Insurance Q&A at `/ai-demo` for client evaluation and future public deployment
2. **Recruitment Outreach** — Personalized email and call script generation for agent recruitment campaigns
3. **Facebook Scout** — Engagement scoring and reply drafting for social media posts
4. **Comment Response Drafts** — AI-generated replies to Facebook post comments for Tim/Beth to review
5. **Survey Campaigns** — Automated follow-up survey generation and management

---

## Infrastructure

### Hardware
| Component | Spec | Status |
|-----------|------|--------|
| GPU | NVIDIA RTX 4090 (24GB VRAM) | ✅ Running |
| CPU | AMD Ryzen 7 5700G (16 threads) | ✅ Running |
| RAM | 32GB | ✅ Running |

### Software Stack
| Tool | Purpose | Status |
|------|---------|--------|
| **vLLM** | Primary model runtime (high throughput) | ✅ Production |
| Ollama 0.9.6 | Fallback model runtime | ✅ Available |
| Qwen3-30B-A3B-GPTQ-Int4 | Primary AI model (~172 tok/s via vLLM) | ✅ Serving |
| Sentinel Proxy | Auth + routing + tunnel management | ✅ Production |
| ngrok | Tunnel local AI to Vercel deployment | ✅ Production |

### Model
| Model | Quantization | Runtime | Performance | Notes |
|-------|-------------|---------|-------------|-------|
| **Qwen3-30B-A3B** | GPTQ-Int4 | vLLM | ~172 tok/s | MoE, 3B active params, fits 4090. Production model. |

### Architecture
```
Vercel (legacyfinancial.app)
  ├── /api/ai-chat       ─┐
  ├── /api/ai-comments    │──→ OLLAMA_URL (ngrok tunnel)
  ├── /api/ai-scout       │        ↓
  └── /api/ai-approve    ─┘   Sentinel Auth Proxy (localhost:3377)
                                     ↓
                               vLLM (localhost:8000)
                                     ↓
                               Qwen3-30B-A3B-GPTQ-Int4
```

Startup: `npm run ai` (runs `scripts/ai-launcher.js`) which:
1. Verifies vLLM/Ollama is running
2. Starts the auth proxy
3. Opens ngrok tunnel
4. Updates Vercel `OLLAMA_URL` env var automatically
5. Logs session metrics on shutdown

---

## Completed Phases

### Phase 1: Infrastructure Setup ✅
- Hardware assessment and model selection
- Qwen3:30b model installed and tested for insurance domain
- Insurance-domain system prompts created (Messenger + Comment variants)
- Custom Ollama model `legacy-messenger` with baked-in system prompt
- Comment draft generator script (`ai/generate-comment-drafts.js`)
- Thinking-content stripping validated for clean output
- **May 2026:** Migrated primary inference from Ollama to vLLM for ~3x throughput improvement

### Phase 2: AI Demo & Chat ✅
- `/ai-demo` — Auth-protected demo page with chat + comment drafts + feedback
- `/api/ai-chat` — SSE streaming chat proxy (buffers response, strips thinking tags, re-streams)
- `/api/ai-comments` — Batch comment draft generation (1-10 per request)
- `/api/ai-feedback` — Feedback collection to Supabase
- Magic-link auth with email allowlist (`AI_DEMO_ALLOWED_EMAILS`)
- Prompt injection detection (20+ patterns) with session-level IP blocking
- Output leak detection prevents disclosure of system prompts

### Phase 3: Facebook Scout ✅
- `/api/ai-scout` — Scores Facebook posts (1-10) for engagement opportunity
- Drafts reply options in Tim/Beth's voice with risk assessment
- Integrated into recruitment dashboard for social media lead generation

### Phase 4: Recruitment AI Integration ✅
- AI-generated personalized outreach emails per prospect (uses research data)
- AI-generated call scripts tailored to prospect background
- Review/edit/approve workflow before any content is sent
- Warm lead detection and scoring
- Campaign-level AI tone/voice configuration

### Phase 5: Survey System ✅
- `/api/survey-campaigns` — Full CRUD for survey campaigns
- `/api/survey-response` — HMAC-verified response recording
- Email embeds first question as clickable buttons → records answer + renders next question
- No external survey tools (Google Forms, Typeform) — everything in Supabase
- Passive pipeline integration: responses feed back into prospect engagement scoring

---

## Pending / Future

### Facebook Messenger Integration
**Status: WAITING ON FACEBOOK CREDENTIALS**

Requirements:
- [ ] Tim's Facebook Page admin access or Page Access Token
- [ ] Facebook App (developer.facebook.com) for Messenger API
- [ ] Custom system prompt trained on full Legacy Financial knowledge base

Architecture (planned):
```
Facebook Messenger → Meta Webhook → Vercel → Sentinel Proxy → vLLM
                                                                 ↓
                                                    System Prompt + Knowledge Base
                                                                 ↓
                                                    Response → Messenger
```

### Production Comment Monitoring
**Status: BLOCKED ON FACEBOOK API ACCESS**

- [ ] Facebook Graph API access (Page token with `pages_read_engagement`)
- [ ] Real-time comment polling or webhook subscription
- [ ] Queue and notification system for Tim/Beth review

### Ad Copy Generation
**Status: DEMO ONLY**

Qwen3-30B generates high-quality ad copy for insurance verticals:
- Final Expense (50-80 demographic)
- IUL / Wealth Building (30-50 demographic)
- Estate Planning / Annuities (55+ demographic)
- General life insurance (young families)

---

## Technical Notes

- Qwen3 MoE outputs `</think>` closing tag but sometimes no opening `<think>` tag via API
- Solution: `stripThinking()` finds `</think>` and takes everything after; `stripUntaggedThinking()` as fallback
- vLLM handles this more consistently than Ollama's REST API
- All AI pages use `export const prerender = false` for server-side rendering
- Demo pages unlinked from site nav — accessible via direct URL only

## AI Guardrails

All AI endpoints enforce:
- **No specific premium quotes** or financial advice
- **AI disclosure** when directly asked
- **Escalation** for complex questions (routes to Tim/Beth)
- **No competitor disparagement**
- **Insurance advertising compliance**
- **Prompt injection detection** with automatic blocking
- **Output leak prevention** (system prompts, internal URLs, etc.)

## Cost

| Item | Monthly Cost |
|------|-------------|
| Local AI models (vLLM on existing hardware) | $0 |
| Electricity overhead (GPU under load) | ~$15 |
| ngrok tunnel | $0 (free tier sufficient) |
| **Total** | **~$15/month** |

Compared to AI agency pricing: $2,000–$10,000/month for equivalent services.

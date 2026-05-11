# AI Promotional Services — Implementation Tracker

**Client:** Tim & Beth Byrd — Legacy Financial & Life  
**Goal:** Local AI-powered Facebook engagement automation  
**Started:** April 23, 2026

---

## Executive Summary

Tim is exploring AI promotional services (currently being quoted high prices by vendors). We're building a local-first alternative using open-source AI models running on Josh's RTX 4090, providing:

1. **Facebook Messenger Auto-Responder** — 24/7 AI assistant on Tim's Facebook page answering insurance questions, qualifying leads, and booking consultations
2. **Comment Response Drafts** — AI-generated replies to Facebook post comments for Tim/Beth to review and post
3. **Ad Copy Generation** (demo/evaluation) — Local AI generating Facebook ad copy variations

---

## Infrastructure

### Hardware
| Component | Spec | Status |
|-----------|------|--------|
| GPU | NVIDIA RTX 4090 (24GB VRAM) | ✅ Available |
| CPU | AMD Ryzen 7 5700G (16 threads) | ✅ Available |
| RAM | 32GB | ✅ Available |
| Disk | 39GB free / 148GB total | ⚠️ Tight — consider removing old models |

### Software Stack
| Tool | Purpose | Status |
|------|---------|--------|
| Ollama 0.9.6 | Local model runtime | ✅ Installed |
| Qwen3:30b | Primary AI model (19GB, MoE 3B active) | ✅ Installed |
| Crush v0.62.0 | AI coding agent (successor to OpenCode) | ✅ Installed |
| OpenClaw v2026.4.22 | Messenger ↔ AI bridge | ✅ Installed |
| OpenRouter | Cloud API fallback for bigger models | ⬜ Account setup |

### Models Considered
| Model | Size | Where | Notes |
|-------|------|-------|-------|
| **Qwen3:30b** | 19GB | Local (Ollama) | MoE, 3B active params, fits 4090. Primary choice. |
| Qwen3:14b | 9.3GB | Local (Ollama) | Dense, faster. Good for real-time chat. |
| Qwen3:8b | 5.2GB | Local (Ollama) | Quick drafts, lowest latency. |
| Kimi K2 | 1T params | Cloud only | Very capable but requires API costs. |

---

## Phase 1: Infrastructure Setup
**Status: COMPLETE** ✅

- [x] Hardware assessment
- [x] Research models & tools (Qwen3, Crush, OpenClaw, OpenRouter, Kimi K2)
- [x] Pull Qwen3:30b model (19GB, installed)
- [x] Install Crush v0.62.0
- [x] Install OpenClaw v2026.4.22
- [x] Add npm-global/bin to PATH
- [x] Test Qwen3:30b locally — response quality for insurance domain ✅ Excellent
- [x] Create insurance-domain system prompt (Messenger + Comment variants)
- [x] Create custom Ollama model: `legacy-messenger`
- [x] Build comment draft generator script (`ai/generate-comment-drafts.js`)
- [x] Validate thinking-content stripping for clean output

### Files Created
- `ai/prompts/messenger-system.md` — Full Messenger bot system prompt with guardrails
- `ai/prompts/comment-drafts-system.md` — Facebook comment reply system prompt
- `ai/Modelfile.messenger` — Ollama Modelfile for custom `legacy-messenger` model
- `ai/generate-comment-drafts.js` — Batch/interactive comment draft generator

### Technical Notes
- Qwen3:30b MoE outputs chain-of-thought in `<think>...</think>` tags even via API
- `think: false` API param doesn't fully suppress this in the 30B variant
- Solution: increased `num_predict` to 2048 and strip `</think>` tags from output
- Custom model `legacy-messenger` has system prompt baked in for quick access
- Comment generator supports: batch JSON, stdin pipe, and interactive modes

## Phase 2: Client Demo Page
**Status: COMPLETE** ✅

Built an internal demo page at `/ai-demo` so Tim can preview AI capabilities before we get Facebook credentials.

### What Was Built
- [x] `/api/ai-chat` — Streaming SSE chat endpoint (buffers Ollama response, strips thinking, re-streams)
- [x] `/api/ai-comments` — Batch comment draft generation (1-10 comments per request)
- [x] `/api/ai-feedback` — Feedback collection to Supabase (`lead_flow_events` table)
- [x] `/ai-demo` — Full demo page with chat interface, comment draft tool, and feedback widgets
- [x] Thinking content stripping (handles both `<think>` tags and untagged chain-of-thought)
- [x] End-to-end testing against local Ollama

### Files Created
- `src/pages/ai-demo.astro` — Demo page with tabbed UI (Messenger Chat + Comment Drafts)
- `src/pages/api/ai-chat.ts` — SSE streaming chat proxy to Ollama
- `src/pages/api/ai-comments.ts` — Batch comment draft generation endpoint
- `src/pages/api/ai-feedback.ts` — Feedback collection endpoint

### Demo Features
- **Messenger Chat Tab**: Real-time conversation with the insurance AI assistant, suggestion chips for starter questions, typing indicators
- **Comment Drafts Tab**: Paste Facebook comments (1 per line), generates reply drafts with copy button
- **Feedback Widgets**: Star rating + text feedback on both tabs, saves to Supabase
- **Cost Comparison**: Bottom section showing vendor costs vs. our approach
- **Branded**: Uses Legacy Financial brand colors and styling

### Technical Notes
- Qwen3 MoE outputs chain-of-thought without opening `<think>` tag but WITH closing `</think>` tag
- Solution: `stripThinking()` finds `</think>` and takes everything after; `stripUntaggedThinking()` as fallback
- Ollama response is collected non-streaming, cleaned, then re-streamed as SSE chunks for typing effect
- Page is unlinked from site nav — only accessible via direct URL
- Built with `export const prerender = false` for server-side rendering

## Phase 3: Facebook Messenger Integration (OpenClaw)
**Status: WAITING ON FACEBOOK CREDENTIALS**

### Requirements
- [ ] Tim's Facebook Page admin access or Page Access Token
- [ ] Facebook App (developer.facebook.com) for Messenger API
- [ ] Webhook URL (publicly accessible — Vercel or ngrok for dev)
- [ ] OpenClaw configured with Messenger bridge
- [ ] Custom system prompt trained on Legacy Financial knowledge base

### Architecture
```
Facebook Messenger → Meta Webhook → OpenClaw Gateway → Ollama (Qwen3:30b)
                                                         ↓
                                              System Prompt + Knowledge Base
                                              (products, states, carriers, FAQs)
                                                         ↓
                                              Response → OpenClaw → Messenger
```

### System Prompt Requirements
The AI must know:
- Legacy Financial's products: Term Life, Whole Life, Universal Life, Final Expense, IUL, Annuities
- Licensed states: GA, OH, OK, SC, MS, MI, TX, UT, AL, LA
- Carriers: Mutual of Omaha, Transamerica, Aflac, etc.
- Tim & Beth's background and experience
- Booking link: https://calendly.com/legacy-financial/consultation
- Compliance: Cannot give specific policy quotes, must refer to consultation
- Tone: Professional, warm, trustworthy — matching the brand

### Guardrails Needed
- Must not provide specific premium quotes or financial advice
- Must disclose it's an AI assistant when asked
- Must escalate complex questions to Tim/Beth
- Must not discuss competitors negatively
- Must comply with insurance advertising regulations

## Phase 4: Comment Response Drafts (Production)
**Status: NOT STARTED**

### Approach Options
1. **OpenClaw bridge** — If Facebook comments can be bridged, same infrastructure
2. **Custom script** — Facebook Graph API → fetch comments → Qwen3 generates drafts → review UI
3. **Browser extension/tool** — Manual trigger, copies comment, generates draft

### Requirements
- [ ] Facebook Graph API access (Page token with `pages_read_engagement`)
- [ ] Comment fetching script or integration
- [ ] Draft generation with insurance-appropriate tone
- [ ] Review/approval workflow (could be simple CLI, web UI, or email)
- [ ] Draft queue for Tim/Beth to review

## Phase 5: Ad Copy Generation (Demo)
**Status: NOT STARTED**

### Goal
Demonstrate Qwen3:30b capability to generate Facebook ad copy for Tim's review. Not a production system yet — evaluate if quality justifies building a workflow.

### Test Verticals
- Final Expense (seniors, 50-80 demographic)
- IUL / Wealth Building (30-50 demographic)
- Estate Planning / Annuities (55+ demographic)
- General life insurance (young families)

---

## Decisions & Notes

### 2026-04-23 (Session 3)
- **Built:** Client demo page at `/ai-demo` with chat + comment drafts + feedback
- **Discovery:** Qwen3:30b MoE emits `</think>` closing tag but no opening `<think>` tag via Ollama API
- **Discovery:** `think: false` API parameter and `/nothink` prefix do NOT work through Ollama REST API
- **Solution:** Buffer full response, strip with `</think>` detection, re-stream as SSE chunks
- **Note:** Assistant prefill technique works for single exchanges but not multi-turn
- **Waiting on:** Tim's Facebook credentials for Phase 3

### 2026-04-23
- **Decision:** Start with Qwen3:30b as primary model — best local fit for 24GB VRAM
- **Decision:** OpenClaw for Messenger bridge — runs locally, supports Ollama natively
- **Decision:** Crush as AI development tool (replaces archived OpenCode)
- **Note:** We don't control Tim's ad copy generation currently — demo capability to evaluate
- **Note:** OpenCode is archived → moved to Crush by Charmbracelet
- **Note:** "BetterClaw" = OpenClaw (formerly Clawdbot/Moltbot)
- **Note:** Kimi K2 is cloud-only through Ollama, can access via OpenRouter

### Open Questions
- [ ] Does Tim have a Facebook Developer account? Need App ID for Messenger API
- [ ] What hosting for webhooks? Vercel (existing), separate VPS, or ngrok for dev?
- [ ] Budget for OpenRouter API (cloud fallback) if needed?
- [ ] Does Tim want the Messenger bot branded as "AI assistant" or as "Legacy Financial team"?
- [ ] Comment response: real-time monitoring vs. batch review (daily digest)?

---

## Cost Comparison

### What AI promotional agencies charge
- Typical Messenger chatbot: $500–$3,000/month
- AI content generation: $1,000–$5,000/month  
- Social media management w/ AI: $2,000–$10,000/month

### Our approach (estimated)
- Local AI models: **$0/month** (running on existing hardware)
- OpenRouter API (optional fallback): **$5–50/month** depending on usage
- Facebook Developer account: **Free**
- OpenClaw: **Free** (open source, runs locally)
- Hosting for webhook: **Free** (Vercel existing plan) or **$5/month** (small VPS)
- **Total: $0–55/month** vs. $2,000–10,000/month from vendors

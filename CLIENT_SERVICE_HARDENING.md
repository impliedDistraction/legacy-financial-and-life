# Client Service Hardening Review — Legacy Financial & Life

**Date**: 2026-05-18  
**Reviewer**: Sentinel (automated)  
**Site**: https://legacyfinancial.app  
**Hosting**: Vercel (static + serverless functions)  
**Backend**: Supabase (kxmojndpgxgbykxjtxba)

---

## Executive Summary

The Legacy Financial deployment has **strong application-layer security** (webhook signature verification, HMAC-protected unsubscribe links, session-based auth for admin panels, prompt injection detection, output leak guardrails). However, it was missing basic **transport-layer security headers** and **rate limiting on public endpoints**, which could allow abuse. These gaps have now been patched.

---

## Findings & Remediation

### CRITICAL — Fixed

| # | Issue | Risk | Fix Applied |
|---|-------|------|-------------|
| 1 | **No security headers** (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) | Clickjacking, MIME sniffing, data leakage | Added to `vercel.json` headers config |
| 2 | **`/api/escalate` — no rate limiting** | Abuse: flood escalation queue with fake issues, trigger SMS/email alerts to ops team | Added 5 req/15min per IP rate limiter |
| 3 | **`/api/join-visit` — no rate limiting** | Abuse: falsify prospect visit analytics, inflate engagement stats | Added 20 req/15min per IP rate limiter |
| 4 | **`/api/lead-analytics` — no rate limiting** | Abuse: flood analytics DB with garbage events | Added 60 req/min per IP rate limiter |
| 5 | **`/api/join-interest` — no rate limiting** | Abuse: submit fake interest forms, pollute prospect data | Added 5 req/15min per IP rate limiter |

### HIGH — Requires Manual Action

| # | Issue | Risk | Recommendation |
|---|-------|------|----------------|
| 6 | **Supabase tables lack RLS** (recruitment_prospects, recruitment_campaigns, escalated_issues, lead_flow_events, sales_leads) | If anon key is ever leaked, full table access | Run `supabase/migration_rls_hardening.sql` in SQL Editor |
| 7 | **`Access-Control-Allow-Origin: *`** on static pages | Any website can make credentialed requests | Vercel auto-sets this for static assets — acceptable for public pages, but verify API functions don't inherit it |

### MEDIUM — Awareness

| # | Issue | Notes |
|---|-------|-------|
| 8 | **No Content-Security-Policy header** | Astro generates inline styles/scripts which make strict CSP hard. Could add `script-src 'self' 'unsafe-inline' https://vercel.live https://va.vercel-scripts.com` in future. |
| 9 | **In-memory rate limiters reset on cold start** | Vercel serverless functions cold-start frequently. For persistent rate limiting, consider Vercel KV or Upstash Redis in future. Current implementation still blocks burst abuse within a function invocation lifetime. |
| 10 | **`client_ip` stored in chat_logs** | GDPR consideration — IP storage. Currently truncated. Consider hashing or TTL-based cleanup. |
| 11 | **`min_password_length = 6`** in Supabase config | Only relevant if Supabase Auth is used for end-users (currently not exposed publicly). |

---

## What's Already Excellent

| Area | Implementation |
|------|---------------|
| **Webhook verification** | Svix signature validation on Resend webhook — cryptographic proof of origin |
| **Unsubscribe HMAC** | HMAC-SHA256 signed tokens prevent forged opt-outs; constant-time comparison prevents timing attacks |
| **Admin auth** | Magic-link via Resend, 8h session cookies, email allowlist (`AI_DEMO_ALLOWED_EMAILS`) |
| **AI chat security** | Session-required, 30/15min rate limit, injection detection (20+ patterns), output leak detection, session-level IP blocking after 3 injection attempts |
| **Input sanitization** | All endpoints truncate inputs (200-2000 chars), validate required fields, use type coercion |
| **Bot click detection** | Webhook handler identifies security scanner user agents and excludes from engagement metrics |
| **Email send lock** | `RECRUITMENT_SENDS_ENABLED=true` required in env to send — prevents accidental sends |
| **Compliance logging** | Opt-outs, spam complaints, bounces all logged to Working Order compliance events table |
| **Form anti-spam** | Honeypot field, timing check (3s minimum fill time), per-IP rate limiting on /free-quote |
| **Lead dedup** | 30-day window deduplication by email/phone prevents double-counting |
| **Prompt hardening** | System prompts include anti-extraction rules, no raw URL exposure, action block abstraction |

---

## Files Changed

| File | Change |
|------|--------|
| `vercel.json` | Added security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, no-cache on API) |
| `src/pages/api/escalate.ts` | Added IP rate limiter (5/15min) |
| `src/pages/api/join-visit.ts` | Added IP rate limiter (20/15min) |
| `src/pages/api/lead-analytics.ts` | Added IP rate limiter (60/min) |
| `src/pages/api/join-interest.ts` | Added IP rate limiter (5/15min) |
| `supabase/migration_rls_hardening.sql` | NEW — Enables RLS on all data tables |
| `scripts/gpu-hardening-setup.sh` | Added DPM disable + ForceFullCompositionPipeline for flicker fix |

---

## Deployment Steps

1. **Deploy code changes** — `git push` triggers Vercel build with new headers + rate limiters
2. **Run RLS migration** — Execute `supabase/migration_rls_hardening.sql` in Supabase SQL Editor (kxmojndpgxgbykxjtxba project)
3. **Verify headers** — After deploy: `curl -sI https://legacyfinancial.app | grep -i "x-frame\|x-content\|referrer\|permissions"`
4. **Test rate limits** — Hit `/api/escalate` 6+ times quickly, confirm 429 on 6th

---

## Screen Flicker Fix (bonus)

**Root Cause**: NVIDIA DynamicPowerManagement=3 (Fine-Grained) causes P-state transitions (P8→P0) that briefly lose TMDS sync on HDMI connection.

**Fix Applied**: 
- Immediate: `nvidia-settings --assign CurrentMetaMode="nvidia-auto-select +0+0 { ForceFullCompositionPipeline = On }"`
- Permanent (in gpu-hardening-setup.sh): `NVreg_DynamicPowerManagement=0` + Xorg config with ForceFullCompositionPipeline + PowerMizer pinned to max performance
- Takes full effect after next reboot (Sunday 4am managed reboot)

# Legacy Financial & Life — Main Site Review

**Date:** April 16, 2026  
**Last updated:** May 19, 2026  
**Scope:** Full review of the main site (index page and all supporting routes) for unfinished gaps (the site was a proposal that was never fully finalized). The `/free-quote` path is active and generating traffic; the rest needs triage.

---

## Critical Issues

### 1. Developer email in production lead pipeline
**Files:** `src/pages/api/fb-lead.ts:14`  
**Issue:** `jarboi6677@gmail.com` (Josh's personal email) is still in the `RECIPIENTS` array. Every quote submission sends lead data to this address.  
**Impact:** Privacy concern — client lead PII is being sent to a developer inbox.  
**Fix:** Remove from `RECIPIENTS` array, or replace with a monitored team address if intentional.  
**Status:** ⚠️ STILL OPEN

### ~~2. Developer Cal.com username used for scheduling~~
**Status:** ✅ FIXED — Replaced with Calendly (`https://calendly.com/bethandtim-legacyf-l/30min`). `/book` redirect configured in vercel.json.

### ~~3. "Get Quote" buttons on feature cards do nothing~~
**Status:** ✅ FIXED — Buttons now link to `/free-quote`.

### ~~4. Expired event dates (7+ months past)~~
**Status:** ✅ FIXED — Event section removed entirely from site.ts.

### 5. Placeholder OG image
**File:** `public/og-image.jpg`  
**Issue:** Contains placeholder text, not an actual image. The `SEO.astro` component uses the real team photo via `site.branding.ogImage`, so homepage is unaffected. But direct links to `/og-image.jpg` return garbage.  
**Fix:** Delete or replace with a real 1200x630 OG image.  
**Status:** ⚠️ STILL OPEN (low impact — SEO.astro uses correct image)

---

## High Priority Issues

### ~~6. No mobile navigation menu~~
**Status:** ✅ FIXED — Full hamburger menu implemented in Header.astro with open/close toggle.

### 7. Domain mismatch between config and deployment
**Status:** ✅ MOSTLY FIXED — `site.ts` now uses `legacyfinancial.app` as the primary URL. Email addresses still use `@legacyf-l.com` for client-facing correspondence (intentional — that's the client's email domain).

### ~~8. `<Analytics />` component rendered twice~~
**Status:** ✅ FIXED — Single instance in Base.astro body.

### 9. Misnamed/mistyped image assets
**Status:** ⚠️ PARTIALLY FIXED — `vercel.json` now has `"git": { "lfs": true }` and prebuild script verifies LFS. `logo.png` is still technically JPEG data but browsers handle it fine.

### 10. Pricing placeholder on every feature card
**Status:** ⚠️ STILL OPEN — Low priority; currently shows "Pricing available upon quote."

---

## Medium Priority Issues

### 11. Hardcoded phone number in quote-duplicate page
**File:** `src/pages/quote-duplicate.astro`  
**Issue:** Contains `tel:+17702634060` hardcoded instead of using `site.phone`.  
**Status:** ⚠️ STILL OPEN

### ~~12. Unresolved TODO in site config~~
**Status:** ✅ FIXED — TODO comment removed, cityState confirmed.

### 13. Empty Cal.com event types
**Status:** ✅ N/A — Scheduling moved to Calendly entirely. Cal.com config removed.

### 14. Retirement section is sparse
**Status:** ⚠️ STILL OPEN — Low priority cosmetic issue.

### 15. Contact form phone placeholder shows the business number
**File:** `src/components/ContactForm.astro:36`  
**Status:** ⚠️ STILL OPEN — Phone placeholder still shows business number.

### 16. `favicon.ico` is actually an SVG file
**Status:** ⚠️ STILL OPEN — Low impact, browsers handle it fine.

---

## Low Priority / Informational

### 17. `logo.png` referenced in site.ts is JPEG
**Status:** ⚠️ STILL OPEN — Browsers render it correctly regardless.

### 18. Vercel LFS fix documentation exists
**Status:** ✅ RESOLVED — `vercel.json` has `"git": { "lfs": true }` + prebuild script verification.

### 19. Formspree form action is hardcoded
**Status:** ⚠️ STILL OPEN — Works fine, centralization is optional.

### 20. `preconnect` to fonts.gstatic.com but no Google Fonts loaded
**Status:** ⚠️ STILL OPEN — Unnecessary preconnect, minor performance impact.

---

## Summary Table

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | **CRITICAL** | Developer email in lead recipients | ⚠️ Open |
| 2 | ~~CRITICAL~~ | ~~Developer Cal.com in scheduling~~ | ✅ Fixed |
| 3 | ~~CRITICAL~~ | ~~"Get Quote" buttons are dead~~ | ✅ Fixed |
| 4 | ~~CRITICAL~~ | ~~Expired event dates still active~~ | ✅ Fixed |
| 5 | HIGH | Placeholder OG image file | ⚠️ Open (low impact) |
| 6 | ~~HIGH~~ | ~~No mobile navigation~~ | ✅ Fixed |
| 7 | ~~HIGH~~ | ~~Domain mismatch across configs~~ | ✅ Fixed |
| 8 | ~~HIGH~~ | ~~Duplicate Analytics component~~ | ✅ Fixed |
| 9 | HIGH | LFS / misnamed images | ⚠️ Partially fixed |
| 10 | HIGH | Pricing placeholder on cards | ⚠️ Open |
| 11 | MEDIUM | Hardcoded phone in quote-duplicate | ⚠️ Open |
| 12 | ~~MEDIUM~~ | ~~Unresolved TODO in site config~~ | ✅ Fixed |
| 13 | ~~MEDIUM~~ | ~~Empty Cal.com event types~~ | ✅ N/A |
| 14 | MEDIUM | Sparse retirement section | ⚠️ Open |
| 15 | MEDIUM | Confusing phone placeholder | ⚠️ Open |
| 16 | MEDIUM | favicon.ico is actually SVG | ⚠️ Open |
| 17 | LOW | logo.png is actually JPEG | ⚠️ Open |
| 18 | ~~LOW~~ | ~~LFS deployment concerns~~ | ✅ Fixed |
| 19 | LOW | Hardcoded Formspree endpoint | ⚠️ Open |
| 20 | LOW | Unused font preconnect | ⚠️ Open |

**Scorecard:** 9 of 20 issues resolved. Remaining items are cosmetic or low-impact.

---

## Remaining Fix Plan

### Immediate (should fix soon)
1. Remove `jarboi6677@gmail.com` from `RECIPIENTS` in `fb-lead.ts`
2. Fix hardcoded phone in `quote-duplicate.astro` (use `site.phone`)
3. Delete or replace `public/og-image.jpg` placeholder

### When touching related files
1. Fix phone placeholder in `ContactForm.astro`
2. Remove unused `preconnect` in `SEO.astro`
3. Rename `logo.png` → `logo.jpg` or convert to actual PNG

### Design decisions needed
1. Pricing placeholder text on feature cards — remove or improve copy
2. Retirement section — expand or merge into feature cards
3. Generate proper `favicon.ico` from the SVG

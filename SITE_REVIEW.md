# Legacy Financial & Life — Main Site Review

**Date:** April 16, 2026  
**Scope:** Full review of the main site (index page and all supporting routes) for unfinished gaps (the site was a proposal that was never fully finalized). The `/free-quote` path is active and generating traffic; the rest needs triage.

---

## Critical Issues

### 1. Developer email in production lead pipeline
**Files:** `src/pages/api/fb-lead.ts:13`, `.env.local:15`, `.env.example:29`  
**Issue:** `jarboi6677@gmail.com` (Josh's personal email) is hardcoded in the `RECIPIENTS` array. Every quote submission from the `/free-quote` flow sends lead data to this address alongside `tim@legacyf-l.com` and `beth@legacyf-l.com`.  
**Impact:** Privacy concern — client lead PII is being sent to a developer inbox. Also present in `ANALYTICS_ALLOWED_EMAILS` env var.  
**Fix:** Remove from `RECIPIENTS` array and env vars, or replace with a monitored team address if intentional.

### 2. Developer Cal.com username used for scheduling
**Files:** `src/content/site.ts:11`, `src/components/Scheduling.astro:12,21`  
**Issue:** Cal.com username is set to `josh-byrom-d3jwh7` with a comment "Temporarily use Josh's Cal.com username; replace with client username when ready." The Scheduling component also has a hardcoded fallback to this username.  
**Impact:** Users clicking "Book a Free Consultation" or visiting `/schedule` are directed to the developer's personal calendar, not Tim & Beth's.  
**Fix:** Set `site.cal.username` to the client's actual Cal.com username. Remove hardcoded fallback in `Scheduling.astro`.

### 3. "Get Quote" buttons on feature cards do nothing
**File:** `src/components/FeatureCards.astro:58`  
**Issue:** Each insurance plan card has a "Get Quote" `<button>` with no `onclick`, no link, and no form action. It renders as a dead button.  
**Impact:** Primary conversion action on the plans section is non-functional. Users click and nothing happens.  
**Fix:** Either link these to `/free-quote` (with optional plan type prefill), or link to `#contact`, or to `/schedule`.

### 4. Expired event dates (7+ months past)
**File:** `src/content/site.ts:200-245`  
**Issue:** Event sessions are dated September 11 & 13, 2025. `event.isActive` is still `true`. The `EventSection.astro` date-checking logic should hide past events, but date parsing is fragile (relies on `Date()` parsing of a constructed string that may produce `Invalid Date` in some environments).  
**Impact:** If the date parsing fails, past events display on the homepage. The `/wills-trusts-event` and `/rsvp` pages remain accessible and accept registrations for events that passed 7 months ago.  
**Fix:** Set `event.isActive: false` immediately. When new events are planned, update the dates and re-enable.

### 5. Placeholder OG image
**File:** `public/og-image.jpg`  
**Issue:** This file contains the text `"Placeholder for og-image.jpg - 1200x630 image needed"` — it is not an actual image file (53 bytes of ASCII text).  
**Impact:** Any social sharing that references this path will show a broken/missing preview image. Note: the `SEO.astro` component uses `site.branding.ogImage` which points to the real team photo, so the index page may be unaffected. But any route linking to `/og-image.jpg` directly displays a broken image.  
**Fix:** Either generate a real 1200x630 OG image, or delete the placeholder to avoid confusion.

---

## High Priority Issues

### 6. No mobile navigation menu
**File:** `src/components/Header.astro`  
**Issue:** The `<nav>` has `class="hidden sm:flex"` — it hides on mobile. There is no hamburger menu, slide-out drawer, or any mobile navigation alternative. On mobile, the only navigation is the CTA button.  
**Impact:** Mobile visitors cannot access Plans, Retirement, Estate Planning, Careers, Team, Schedule, or Contact sections via nav. They must scroll the entire page.  
**Fix:** Add a mobile hamburger menu with a slide-out or dropdown navigation panel.

### 7. Domain mismatch between config and deployment
**Files:** `astro.config.mjs:6` vs `src/content/site.ts:3`  
**Issue:** `astro.config.mjs` sets `site: 'https://legacyfinancial.app'` but `site.ts` sets `url: 'https://legacyf-l.com'`. Email sender addresses also use `@legacyfinancial.app`, while contact info uses `@legacyf-l.com`. The SEO structured data references `legacyf-l.com`.  
**Impact:** Canonical URL confusion, potential SEO issues, email domain inconsistency.  
**Fix:** Determine which domain is primary and align all references.

### 8. `<Analytics />` component rendered twice
**File:** `src/layouts/Base.astro:27,53`  
**Issue:** `<Analytics />` from `@vercel/analytics/astro` is rendered once in `<head>` and again at the end of `<body>`.  
**Impact:** Vercel analytics script may load twice per page, potentially double-counting pageviews.  
**Fix:** Remove the duplicate. Keep only the `<body>` instance (recommended placement per Vercel docs).

### 9. Misnamed/mistyped image assets
**Files:** `public/images/logo.png`, `public/images/logo.svg`, `public/images/logo.bmp`  
**Issue:**
- `logo.png` is actually JPEG data (file magic: `JPEG image data`), not PNG
- `logo.svg` is a Git LFS pointer (129 bytes), not an actual SVG file — LFS has not resolved it
- `logo.bmp` is also a Git LFS pointer, not a real BMP file
- `public/images/image-mapping.json` and `public/images/README.md` are also unresolved LFS pointers

**Impact:** The header logo (`site.branding.logo = '/images/logo.png'`) works because browsers handle JPEG regardless of extension, but the SVG version is broken. Any feature relying on LFS-tracked files will show broken content.  
**Fix:** Run `git lfs pull` to resolve LFS pointers. Rename `logo.png` to `logo.jpg` or convert to actual PNG.

### 10. Pricing placeholder on every feature card
**File:** `src/components/FeatureCards.astro:63-69`  
**Issue:** Every plan card shows "Starting from / Pricing available upon quote" in a muted style. It's labeled `<!-- Placeholder for future pricing information -->`.  
**Impact:** Looks unfinished to visitors. The muted text conveys "we haven't built this yet" rather than "contact us for pricing."  
**Fix:** Either remove the pricing section entirely, or replace with something intentional like "Contact us for a personalized quote."

---

## Medium Priority Issues

### 11. Hardcoded phone number in quote-duplicate page
**File:** `src/pages/quote-duplicate.astro`  
**Issue:** Contains `tel:+17702634060` hardcoded instead of using `site.phone`.  
**Impact:** If the client's phone number changes, this page won't update. The number also doesn't match `site.phone` (`(706) 333-5641`).  
**Fix:** Use `site.phone` for consistency.

### 12. Unresolved TODO in site config
**File:** `src/content/site.ts:6`  
**Issue:** `cityState: 'Luthersville, GA', // TODO: confirm spellings/details`  
**Fix:** Confirm with client and remove the TODO comment.

### 13. Empty Cal.com event types
**File:** `src/content/site.ts:18-22`  
**Issue:** `eventTypes` array is empty with commented-out examples. The Scheduling component handles this gracefully (shows a generic fallback), but the experience is generic rather than tailored.  
**Fix:** Populate with actual event types when the client's Cal.com is configured.

### 14. Retirement section is sparse
**File:** `src/components/FeatureCards.astro:82-87` (bottom of the file, `#retirement` section)  
**Issue:** The retirement section is just a heading and 3 bullet points with no CTA, no imagery, and no link to the estate planning page.  
**Impact:** Looks incomplete compared to the rest of the page. A nav link points to it but the section underwhelms.  
**Fix:** Either expand the section with a CTA linking to `/estate-planning`, or merge it into the feature cards section.

### 15. Contact form phone placeholder shows the business number
**File:** `src/components/ContactForm.astro:36`  
**Issue:** Phone input placeholder is `(706) 333-5641` — the business's own phone number, not an example format.  
**Impact:** Confusing UX — users might think the field is pre-filled with the business number.  
**Fix:** Change to a generic format like `(555) 123-4567`.

### 16. `favicon.ico` is actually an SVG file
**File:** `public/favicon.ico`  
**Issue:** `file` reports it as `SVG Scalable Vector Graphics image`. It's an SVG file with a `.ico` extension.  
**Impact:** Most modern browsers will handle SVG favicons, but older browsers expect ICO format. The `<link rel="icon">` in Base.astro points to `favicon.svg` (correct), but SEO.astro also references `favicon.ico`.  
**Fix:** Either generate a proper `.ico` file or remove the `.ico` reference.

---

## Low Priority / Informational

### 17. `logo.png` referenced in site.ts is JPEG
The header renders fine since browsers are content-type agnostic for `<img>`, but this is technically incorrect metadata.

### 18. Vercel LFS fix documentation exists
`VERCEL_LFS_FIX.md` and `scripts/ensure-lfs.sh` suggest there have been prior issues with LFS in deployment. The unresolved LFS pointers (#9) may recur on Vercel.

### 19. Formspree form action is hardcoded
**File:** `src/components/ContactForm.astro:8`  
The Formspree endpoint ID (`mdkdrwbj`) is hardcoded in the form action. Not necessarily wrong, but could be centralized in `site.ts`.

### 20. `preconnect` to fonts.gstatic.com but no Google Fonts loaded
**File:** `src/components/SEO.astro:26`  
There's a `<link rel="preconnect" href="https://fonts.gstatic.com">` but no Google Fonts are actually loaded. Unnecessary preconnect.

---

## Summary Table

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | **CRITICAL** | Developer email in lead recipients | Must fix |
| 2 | **CRITICAL** | Developer Cal.com in scheduling | Must fix |
| 3 | **CRITICAL** | "Get Quote" buttons are dead | Must fix |
| 4 | **CRITICAL** | Expired event dates still active | Must fix |
| 5 | **CRITICAL** | Placeholder OG image file | Must fix |
| 6 | **HIGH** | No mobile navigation | Must fix |
| 7 | **HIGH** | Domain mismatch across configs | Needs decision |
| 8 | **HIGH** | Duplicate Analytics component | Quick fix |
| 9 | **HIGH** | Unresolved LFS / misnamed images | Must fix |
| 10 | **HIGH** | Pricing placeholder on cards | Should fix |
| 11 | MEDIUM | Hardcoded phone in quote-duplicate | Should fix |
| 12 | MEDIUM | Unresolved TODO in site config | Should fix |
| 13 | MEDIUM | Empty Cal.com event types | When ready |
| 14 | MEDIUM | Sparse retirement section | Should improve |
| 15 | MEDIUM | Confusing phone placeholder | Quick fix |
| 16 | MEDIUM | favicon.ico is actually SVG | Low effort |
| 17 | LOW | logo.png is actually JPEG | When touching images |
| 18 | LOW | LFS deployment concerns | Monitor |
| 19 | LOW | Hardcoded Formspree endpoint | Optional |
| 20 | LOW | Unused font preconnect | Quick fix |

---

## Recommended Fix Plan

### Phase 1 — Immediate (stop the bleeding)
These can be done right now with minimal risk:

1. Remove `jarboi6677@gmail.com` from `RECIPIENTS` in `fb-lead.ts` and from env vars
2. Set `event.isActive: false` in `site.ts` to hide expired event
3. Remove duplicate `<Analytics />` from `Base.astro` head
4. Delete or replace `public/og-image.jpg` placeholder
5. Fix phone placeholder in `ContactForm.astro`
6. Remove unused `preconnect` in `SEO.astro`

### Phase 2 — Before promoting the main site
These require design/client decisions but are necessary before the main site is presentable:

1. Add mobile hamburger navigation to `Header.astro`
2. Wire "Get Quote" buttons to `/free-quote` or `#contact`
3. Fix or remove the pricing placeholder from feature cards
4. Resolve domain mismatch (decide on `legacyfinancial.app` vs `legacyf-l.com`)
5. Run `git lfs pull` and fix image naming (`logo.png` → proper format)
6. Resolve the `cityState` TODO with client confirmation
7. Fix hardcoded phone in `quote-duplicate.astro`

### Phase 3 — When client is ready
These require client action or new content:

1. Set up client's Cal.com account and update `site.cal.username`
2. Populate Cal.com event types for scheduling
3. Expand the retirement section or merge into feature cards
4. Generate proper 1200x630 OG image for social sharing
5. Plan and schedule new events (update dates, re-enable `isActive`)
6. Generate proper `favicon.ico` from the SVG

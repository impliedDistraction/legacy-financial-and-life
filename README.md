# Legacy Financial & Life (Astro + Tailwind)

A fast, respectful insurance site designed for clarity, trust, and accessibility.

## Quick start (no CLI needed)
1. Create this repo on GitHub and add the files above using **Add file → Create new file**.
2. Go to **Vercel → New Project → Import GitHub Repo** and deploy.
3. In `astro.config.mjs`, update `site` to your deployed URL.
4. In `src/content/site.ts`, update `phone`, `email`, location, and copy.
5. In `ContactForm.astro`, replace the Formspree action with your form ID.

## Why it's faster
- Astro ships **zero JS by default**; this page renders as static HTML.
- Tailwind is purged at build → tiny CSS.
- Minimal third-party scripts. Lazy images recommended.
- Great Core Web Vitals out of the box.

## SEO & schema
- OpenGraph + Twitter tags in `SEO.astro`.
- `InsuranceAgency` JSON-LD injected.

## Accessibility
- Good color contrast, large touch targets, focus-safe nav, reduced-motion friendly.

## Development

Node runtime:
- Use Node 20 for local development and dependency installs.
- If you use `nvm`, run `nvm use` from the repo root before `npm install` or `npm run build`.

Install dependencies:
```bash
npm install
```

Start the development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Resend Instrumentation

The Facebook quote flow now carries template metadata and supports Resend webhook monitoring.

Environment variables:
- `RESEND_API_KEY`: required for the quote form and alert emails.
- `RESEND_WEBHOOK_SECRET`: required by `/api/resend-webhook` to verify Resend signatures.
- `RESEND_REPLY_MONITOR_ADDRESS`: optional inbound address for monitored replies. This must be an address on a domain configured for Resend receiving, for example `quotes@reply.legacyfinancial.app`.
- `RESEND_CONTACT_SEGMENT_ID`: optional Resend segment to auto-enroll new lead and inbound contacts for broadcasts.
- `RESEND_CONTACT_TOPIC_ID`: optional Resend topic to auto-opt-in new lead and inbound contacts.
- `RESEND_ALERT_RECIPIENTS`: optional comma-separated alert recipients.
- `RESEND_ALERT_WEBHOOK_URL`: optional outbound webhook for alert fan-out to Slack or another relay.
- `RESEND_ALERT_FROM`: optional sender override for alert emails.
- `SUPABASE_URL`: optional Supabase project URL for lead funnel analytics persistence.
- `SUPABASE_SERVICE_ROLE_KEY`: optional server-only Supabase key used by API routes and webhook handlers to persist lead events.
- `SUPABASE_LEAD_ANALYTICS_TABLE`: optional override for the analytics table name. Defaults to `lead_flow_events`.

Current production contact sync IDs:
- `RESEND_CONTACT_SEGMENT_ID=8aca73ce-937c-49e2-a1db-b7d18beef750`
- `RESEND_CONTACT_TOPIC_ID=ad459268-9afc-4719-9487-664f8d1fb8c8`

Resend dashboard setup:
1. Enable receiving on the reply domain if you want reply monitoring.
2. Point your Resend webhook at `https://your-domain/api/resend-webhook`.
3. Subscribe at minimum to `email.failed`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.suppressed`, and `email.received`.

What this adds:
- Consistent `utm_*` parameters on quote confirmation email links.
- Consistent Resend tags and headers per quote email template.
- Automatic Resend contact sync for quote leads and inbound received emails.
- Automatic creation of missing Resend contact-property definitions before syncing lead metadata.
- Verified webhook processing for failures, delivery delays, suppressions, complaints, and inbound replies.
- Correlated lead-flow analytics across page interactions, API milestones, Resend delivery events, and handoff checkpoints.

## Lead Funnel Analytics

The quote flow now supports two analytics layers:
- Vercel Analytics custom events for client-side funnel visibility on `/free-quote`, `/quote-success`, and `/quote-error`.
- Optional Supabase persistence for a server-side lead ledger covering page events, API milestones, Resend contact sync, and webhook delivery/reply events.

Lead events are correlated with a shared `tracking_id` generated in the browser and passed through the quote API and Resend email tags. This makes it possible to answer questions such as:
- Did the visitor reach and start the quote form?
- Did the quote request hit our API and validate successfully?
- Was the contact synced into Resend?
- Were internal and confirmation emails accepted?
- Did Resend later mark those emails as sent, delivered, delayed, bounced, or replied to?
- Where does the flow leave Legacy's ownership and move into client follow-up?

Supabase setup:
1. Run the schema in [supabase/lead_flow_events.sql](supabase/lead_flow_events.sql).
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel.
3. Optionally set `SUPABASE_LEAD_ANALYTICS_TABLE` if you want a different table name.

Notes:
- This implementation uses Vercel custom events for funnel measurement. It does not currently wire up the separate Vercel Flags product.
- For lead-generation reporting, event properties already capture the practical "flag flip" states such as validation passed, contact synced, email sent, delivery confirmed, and handoff ready.

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
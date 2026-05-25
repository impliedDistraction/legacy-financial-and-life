# Agent Onboarding Portal — Design Document

## Concept

Transform the passive recruitment pipeline into an **active self-service onboarding experience**. Once a prospect crosses the interest threshold (books a call, expresses interest, or is manually promoted), they receive access to an Agent Portal — a guided checklist based on Tim's real onboarding flow.

**Goal**: Recruits arrive at their first Zoom call with Tim already partially or fully onboarded (carrier contracts submitted, training watched, schedule defined). Tim's time shifts from hand-holding to verification and relationship-building.

---

## Tim's 8-Step Flow → Portal Tasks

| Step | Portal Phase | Self-Service? | Notes |
|------|-------------|---------------|-------|
| 1. Fast Track / Agent Agreement | **Gate** (Tim signs off) | ❌ Tim-initiated | Portal unlocks after this |
| 2. Contracting | **Phase 1** | ✅ Guided | Links to carrier portals, tax doc uploads, wallet setup |
| 3. The Pack Training | **Phase 2** | ✅ Self-paced | ARC Videos by Robbie Craft, training module checklist |
| 4. Personal Use | **Phase 3** | ⚡ Hybrid | Green Sheet form, quoting walkthrough (Tim verifies on Zoom) |
| 5. Schedule Breakdown | **Phase 4** | ✅ Self-service | Goal-setting form, availability picker |
| 6. Get Leads | **Phase 5** | ✅ Guided | Lead investment options, Lesley scheduling link |
| 7. 4 W's | **Phase 4** (merged) | ✅ Form | When dialing, when running, where, weekly investment |
| 8. First Dial Day | **Phase 6** | ⚡ Hybrid | Checklist + upline call-after-3-NOs reminder |

---

## Architecture

### Access Model

```
Prospect Journey:
  email outreach → /join (interest) → /join (books call)
                                           ↓
                              Tim approves Fast Track
                                           ↓
                          Magic link to /agent-portal?token=HMAC
                                           ↓
                         Self-service onboarding dashboard
```

- **Auth**: HMAC-signed token (same pattern as survey links + unsubscribe)
- **Token payload**: `prospect_id + expires_at` → constant-time verified
- **Session**: Cookie set on first visit, valid 30 days
- **Admin view**: Tim sees all recruits' progress on `/recruitment` dashboard (new tab: 📋 Onboarding)

### Pages

| Route | Purpose |
|-------|---------|
| `/agent-portal` | Main onboarding dashboard (task list, progress, resources) |
| `/agent-portal/[task]` | Individual task detail with instructions + completion form |
| `/api/onboard-progress` | GET/POST progress for authenticated recruit |
| `/api/onboard-admin` | Admin endpoints for Tim (view all, override steps, promote) |

### Database

**New table: `onboarding_progress`**

```sql
CREATE TABLE onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES recruitment_prospects(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Overall status
  phase TEXT NOT NULL DEFAULT 'contracting',  -- contracting, training, personal_use, scheduling, leads, first_dial, complete
  completed_at TIMESTAMPTZ,
  
  -- Phase 1: Contracting
  agent_agreement_completed BOOLEAN DEFAULT false,
  carrier_contracts_started BOOLEAN DEFAULT false,
  carrier_contracts_completed BOOLEAN DEFAULT false,
  tax_documents_submitted BOOLEAN DEFAULT false,
  wallet_info_completed BOOLEAN DEFAULT false,
  contracting_notes TEXT,
  
  -- Phase 2: Training
  arc_videos_watched BOOLEAN DEFAULT false,
  training_modules_completed JSONB DEFAULT '[]',  -- array of completed module IDs
  training_started_at TIMESTAMPTZ,
  training_completed_at TIMESTAMPTZ,
  
  -- Phase 3: Personal Use
  green_sheet_completed BOOLEAN DEFAULT false,
  green_sheet_data JSONB,  -- structured form data
  quoting_navigation_learned BOOLEAN DEFAULT false,
  policy_review_completed BOOLEAN DEFAULT false,
  personal_use_policy_completed BOOLEAN DEFAULT false,
  
  -- Phase 4: Schedule & 4 W's
  goals TEXT,
  dial_days TEXT[],  -- e.g. ['monday', 'wednesday', 'friday']
  run_days TEXT[],
  availability JSONB,  -- structured availability windows
  weekly_lead_investment TEXT,
  dial_location TEXT,
  run_location TEXT,
  
  -- Phase 5: Leads
  lead_investment_model TEXT,  -- 'paying' | 'matching' | 'self_paying'
  lesley_appointment_scheduled BOOLEAN DEFAULT false,
  lesley_appointment_at TIMESTAMPTZ,
  
  -- Phase 6: First Dial
  first_dial_scheduled_at TIMESTAMPTZ,
  first_dial_completed BOOLEAN DEFAULT false,
  first_dial_notes TEXT,
  
  -- Metadata
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  admin_notes TEXT,
  promoted_by TEXT  -- who triggered the portal access
);

CREATE INDEX idx_onboarding_prospect ON onboarding_progress(prospect_id);
CREATE INDEX idx_onboarding_phase ON onboarding_progress(phase);
CREATE INDEX idx_onboarding_activity ON onboarding_progress(last_activity_at);
```

**Extend recruitment_prospects:**
```sql
ALTER TABLE recruitment_prospects 
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT NULL;
-- Values: NULL (not started), 'invited', 'in_progress', 'complete'
```

---

## Portal UI Design

### Dashboard View (`/agent-portal`)

```
┌─────────────────────────────────────────────────────────┐
│  Legacy Financial & Life — Agent Onboarding             │
│  Welcome back, [Name]!                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ████████████░░░░░░░░  45% Complete                     │
│                                                         │
│  📋 Phase 1: Contracting          ✅ Complete           │
│  📚 Phase 2: Training             🔄 In Progress (3/6) │
│  📝 Phase 3: Personal Use         ⬜ Locked            │
│  📅 Phase 4: Schedule & Goals     ⬜ Locked            │
│  💰 Phase 5: Lead Setup           ⬜ Locked            │
│  📞 Phase 6: First Dial Day       ⬜ Locked            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  📖 Resources                                          │
│  • New Agent Guide (flipbook)                           │
│  • Welcome to ARC - Video Training                      │
│  • Your Upline: Tim Byrd — Book a Check-in             │
│                                                         │
│  💬 Need Help?                                         │
│  Chat with our AI assistant or call Tim directly        │
└─────────────────────────────────────────────────────────┘
```

### Task Detail View (`/agent-portal/training`)

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                    │
│                                                         │
│  📚 Phase 2: The Pack Training                          │
│                                                         │
│  Complete the ARC training modules to learn our         │
│  systems and sales methodology.                         │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ☑️  Welcome to ARC - Intro Video                  │   │
│  │ ☑️  Getting Started Quickly                       │   │
│  │ ☑️  Products Overview                            │   │
│  │ ⬜  Quoting & Enrollment Systems                 │   │
│  │ ⬜  Client Communication                         │   │
│  │ ⬜  Compliance & Best Practices                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  🎬 Current: Quoting & Enrollment Systems               │
│  [YouTube Embed or Link]                                │
│                                                         │
│  ✅ Mark as Watched                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Promotional Materials Integration

| Resource | Source | Portal Placement |
|----------|--------|-----------------|
| New Agent Guide | [Flipbook](https://online.fliphtml5.com/thgjn/NAG-Q2-2026-V4-NoBleed/) | Resources sidebar + Phase 2 |
| Welcome Video | [YouTube](https://www.youtube.com/watch?v=bgn3esWUjLM) | Phase 2, first task |
| ARC Training | Robbie Craft videos (URLs from Tim) | Phase 2, training modules |
| Carrier Portals | Links per carrier (from Tim) | Phase 1, contracting tasks |
| Green Sheet | Form built into portal | Phase 3, embedded |
| Calendly (Tim) | [30min call](https://calendly.com/bethandtim-legacyf-l/30min) | Available throughout |

---

## Integration Points

### Sentinel Workers

**New worker: `onboarding-nudge.js`**
- Runs every 6 hours via cron
- Checks for stalled onboarding (no activity in 48h)
- Sends nudge email with next uncompleted task
- After 7 days inactive → alert Tim

**Existing integrations:**
- `calendly-sync.js`: When prospect books, auto-create onboarding record
- `recruitment.js`: After Tim marks "Fast Track complete", send portal invite
- `follow-up.js`: Onboarding invite as alternative to survey for warm prospects

### Admin Dashboard (new tab on `/recruitment`)

**📋 Onboarding Tab:**
- Table of all recruits in onboarding
- Columns: Name, Phase, % Complete, Last Activity, Days Since Start
- Quick actions: Send Nudge, Mark Step Complete, Schedule Zoom
- Drill-down: See individual progress + admin notes

### Passive → Active Conversion

```
Current passive path:
  exhausted → survey → survey_engaged → (wait) → warm lead

New path:
  exhausted → survey → survey_engaged → onboarding invite → self-service portal
  interested → (no booking) → onboarding invite → self-service portal  
  booked → (after call) → Tim promotes → full portal access
```

**Trigger rules:**
1. `interaction_stage = 'interested'` + 48h no booking → send onboarding preview email
2. `interaction_stage = 'booked'` + Tim marks Fast Track → full portal access
3. `interaction_stage = 'survey_engaged'` + 2+ responses → onboarding invite (Phase 2+ only, no contracting yet)
4. Manual: Tim can invite anyone from the dashboard

---

## Implementation Phases

### Phase 1: Foundation (MVP)
- [ ] Database migration (`onboarding_progress` table)
- [ ] `/agent-portal` page with task checklist (static content)
- [ ] HMAC token auth (reuse survey token system)
- [ ] `/api/onboard-progress` GET/POST endpoints
- [ ] Embed promotional materials (flipbook + video)
- [ ] Admin tab on `/recruitment` dashboard

### Phase 2: Interactive Tasks
- [ ] Green Sheet form (structured data collection)
- [ ] Schedule/availability picker
- [ ] Lead investment calculator
- [ ] Training module completion tracking
- [ ] Auto-nudge worker in Sentinel

### Phase 3: Deep Integration
- [ ] Carrier portal direct links + status tracking
- [ ] Tax document upload (Supabase Storage)
- [ ] Zoom scheduling integration for verification steps
- [ ] Tim's admin approval gates between phases
- [ ] Progress-triggered email sequences

### Phase 4: AI Enhancement
- [ ] AI chat on portal (context-aware of their progress)
- [ ] Auto-generate personalized next-steps based on profile
- [ ] Smart scheduling (suggest optimal dial days based on location/market)
- [ ] Completion prediction (flag recruits likely to drop off)

---

## Security Considerations

- **HMAC tokens**: Same constant-time comparison as unsubscribe/survey
- **Token expiry**: 30 days, renewable on activity
- **Rate limiting**: 30 req/IP/15min on progress endpoints
- **Data isolation**: Recruits can only see/modify their own progress
- **Admin auth**: Same magic-link session as recruitment dashboard
- **No PII in URL**: Token is opaque, prospect_id never in query string
- **Audit trail**: All state changes logged with timestamp + source

---

## Open Questions for Tim

1. **Which carrier portals** should we link directly? (Need URLs + any affiliate/referral codes)
2. **ARC Training modules** — can you share the full video list/URLs from Robbie Craft?
3. **Green Sheet template** — can you share a blank one so we can digitize it as a form?
4. **Lesley's scheduling link** — does she have a Calendly or preferred booking method?
5. **Phase gating**: Should recruits be able to skip ahead, or strictly sequential?
6. **Portal access without Fast Track**: Should survey-engaged prospects see a "preview" version?

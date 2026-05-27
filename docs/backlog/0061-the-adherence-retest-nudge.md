---
id: 0061
title: The adherence retest nudge — when you've held the protocol for 30+ days, Today asks honestly whether it's time to retest
status: proposed
priority: P1
area: today
created: 2026-05-27
owner: gtm-innovation
---

## User story

As a user who has actually held my protocol for the last 30+ days — daily check-ins logged, most habits hit — I want Today to surface a calm, honest card that says "you've held this for N days; the markers this protocol aimed at would show movement by now if it's working — worth retesting?" with a one-tap path to the labs upload, so that the moment the protocol has earned a real read-out is the moment the app names it, instead of me drifting through another month wondering whether anything is changing and the next draw silently slipping by.

## Why now (four lenses)

### Product Owner

The product already nudges retest two ways: 0028 (shipped) surfaces the plan's own retest cadence as a calendar countdown, and 0054 (shipped) lets the user put that date on their device's calendar. Both are calendar-anchored — they fire when the *plan's* clock says so. The persona's actual experience is different: someone who has held the protocol *well* for 30 days is biochemically more likely to show meaningful movement than someone who set a 12-week retest at composition time and skipped half the habits. There is no surface today that reads the **adherence loop** the product spent a year building and uses it to propose the action — retest — that the whole loop exists to feed. The smallest meaningful unit of value is a single calm Today card that fires ONLY when (a) the user has logged check-ins on ≥ 21 of the past 30 calendar days (a real run, not a few scattered taps), AND (b) the most recent panel is ≥ 30 days old, AND (c) no retest-due card (0028) is already firing for the same draw. It reads: "You've held this for N days. The markers the protocol aimed at would show movement by now — worth a retest?" with a single tap to `#/labs`. It is deterministic, local, zero-network — `recentCheckIns(30)` + the latest panel's `drawnAt` + the existing retest-status check. The card is the **adherence loop made into a feedback loop** — the product naming, on the surface the user opens daily, that the work has earned the next read.

### Stakeholder

This is the cleanest **adherence-loop-deepening** move available: the loop is dense with check-in data on the device, and today that density is read only by the next plan-compose prompt (months away). The retest nudge turns 30 days of held habits into a recurring re-engagement at the exact biochemical moment a retest would be meaningful — and it does it without a server, a notification permission, or a single network call. A chat box has no per-day check-in store, no canonicalized panel timeline to anchor "≥ 30 days since last draw" against, and no shipped retest-cadence concept to dedupe against — so "you've held it; it would have moved by now; retest" is structurally a feature of a product with the adherence loop, the persistent timeline, and the structured plan. It compounds three shipped moats at once: the **adherence loop** (the trigger), the **persistent timeline** (the anchor), and the **structured artifact** (the retest target the plan already wrote, so the card can name the markers truthfully). And it converts retention into the loop's own input: a user who retests at 30 days has *another panel*, which fires the trend rules in `insights.ts`, which composes a smarter plan, which is the compounding the moat depends on.

### User (at 7am on the phone)

Day 33. I have checked in most mornings, hit my walks, taken my magnesium most nights, and the strip below my meals shows a steady run. Above the meals today, a quiet card: "You've held this for 30 days. The markers this protocol aimed at — ferritin and ApoB — would show movement by now if it's working. Worth a retest?" Beneath it, two small actions: "Upload new labs" and "Not yet." No alarm, no oxblood, no exclamation; it does not interrupt the day, it just names something true. I tap "Upload new labs" and I am on `#/labs`, ready when I have the new draw. If I tap "Not yet," the card quietly steps aside and stops asking for a week. It is not nagging me; it is the app reading what I have actually done and proposing the action the protocol implied. It worked offline, instantly, because adherence and the draw date are already on my phone.

### Growth

This is a pure retention ticket aimed at the single highest-leverage conversion in the entire product: the second-and-later draw. (Hypothesis: an adherence-anchored retest nudge raises the rate of second-and-later draws among 30-day-adherent users, materially above what the calendar-anchored 0028 surface achieves on its own — because the nudge fires on a signal the user already trusts (their own held days), not on a date the plan set months ago — and the second draw is the conversion that turns a one-panel tourist into a multi-panel resident, which is the single biggest predictor of long-term retention in precision health; back-of-envelope from how trigger-on-behavior beats trigger-on-calendar in habit and re-engagement loops; treat as untested without remote analytics, which we will never add.) The "show me" frame is the card itself, screenshot-worthy in a quiet way: "the app I am using actually noticed I have been holding this and asked if I want to retest" is exactly the considered, non-pressuring detail the persona cites when explaining why this product is different from the tracker that nagged them. It is the behavior-triggered sibling of the calendar-triggered retest-due card (0028): that fires on the plan's clock, this fires on the user's own held days.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/adherence-retest.ts` (new) exports `computeAdherenceRetest(plan: Plan | undefined, latestPanel: Panel | undefined, checkIns: CheckIn[], now: Date): AdherenceRetestStatus | null`. Returns a struct `{ heldDays: number; daysSinceDraw: number; markers: string[] }` ONLY when ALL of: a composed `plan` exists; `latestPanel` exists; `(now - latestPanel.drawnAt)` ≥ 30 days; ≥ 21 of the past 30 calendar days have at least one habit completion in `checkIns`; AND 0028's `computeRetestStatus(plan, now)` is NOT in `due-soon` or `overdue` (avoid double-nudging on the same draw). `markers` is the plan's `retest.markers` if present, else the empty list (the card phrases generically). Returns `null` when any condition fails. Pure: no DOM, no Dexie, no network. Asserted by seeding combinations and confirming the trigger fires exactly when all four conditions hold.
- [ ] On Today (`src/pages/today.ts`), when `computeAdherenceRetest(...)` is non-null AND the dismissal (below) is not active, a single retest-nudge card renders above the meals and below the streak strip (or at the documented slot — pick one and document it). The card reads, with correct singular/plural and the markers clause present only when `markers.length > 0`: "You've held this for <heldDays> days. The markers the protocol aimed at — <markers joined with ' and '> — would show movement by now if it's working. Worth a retest?" When `markers` is empty, the second sentence reads: "The markers the protocol aimed at would show movement by now if it's working. Worth a retest?" Asserted by seeding the trigger conditions and confirming the card text.
- [ ] The card carries two actions: "Upload new labs" (navigates to `#/labs`, ≥44×44 css px tap target) and "Not yet" (dismisses the card for 7 calendar days, persisted locally — see migration below). Asserted by tapping each and confirming the navigation and the dismissal respectively.
- [ ] The "Not yet" dismissal persists for exactly 7 calendar days from the tap: during the dismissal window the card does NOT render even when the trigger conditions still hold; on day 8 (and after) the card renders again if the trigger conditions still hold. The dismissal is per-draw (anchored to `latestPanel.id`) — a new panel resets the dismissal. Asserted by tapping "Not yet", advancing the clock to day 7 (absent) and day 8 (present), then seeding a new panel (present immediately).
- [ ] The card is ABSENT when ANY trigger condition fails: no plan, no panel, panel younger than 30 days, fewer than 21 held days in the last 30, or 0028's retest card is already firing. The five absence cases each have a dedicated test. Asserted with five seeded variants.
- [ ] The card is ABSENT in tour mode (0014) — the tour fixture's adherence is shaped for demonstration of the streak strip, not this nudge; the card would be misleading — and ABSENT in shared-view mode (0017) — the recipient is reading someone else's protocol, not their own held days. Asserted in both modes.
- [ ] When the card is dismissed and the dismissal expires, the SAME card phrasing renders (no escalation, no "still worth it?" copy variant in v1) — the calm register is preserved across cycles. Asserted by expiring a dismissal and confirming the same text.
- [ ] The existing Today surfaces — the streak strip, today's habit rows, the meal cards, the retest-due card (0028), the pre-draw primer (0051), the quiet-day card (0015), the welcome-back surface (0018), the hundred-day mark (0021), the catch-up card (0058 once shipped) — are byte-for-byte unchanged in behavior; the adherence-retest card is purely additive, with its documented slot above the meals. Asserted by exercising the existing Today flows and confirming each is unchanged.
- [ ] The card is computed with **zero Anthropic calls** and **zero network calls** — `recentCheckIns(30)`, the latest panel, and the plan are all local reads. Asserted by rendering the card across a profile that triggers it and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card, the dismissal record, or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the rendered card or the persisted dismissal row.
- [ ] Renders on both **chromium and mobile-webkit**. The card wraps cleanly at the 390 px viewport; both action buttons are ≥44×44 css px (`box-sizing: border-box; min-height: 45px` per the 0017 sub-pixel lesson); the markers clause respects `min-width: 0`. Asserted on both projects.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is a local read with no inference; no new hostnames.
- [ ] Schema migration: **yes** — Dexie bumps to the next available version with a NEW additive `.version(N).stores({...})` block adding a single optional `Profile.adherenceRetestDismissedFor?: { panelId: string; until: Day }` field (per the AGENTS.md schema rule: never edit existing version blocks). Additive; an existing profile loads with the field `undefined` and the card simply renders if the trigger conditions hold. Migration test asserts a prior-version export imports with the field undefined and the card unchanged.
- [ ] New `tests/e2e/adherence-retest.spec.ts` covers: all four trigger conditions required (five absence variants + the present case); the card text with markers and without markers; "Upload new labs" navigation; "Not yet" dismissal for exactly 7 days; new-panel resetting the dismissal; the dedupe against 0028's `due-soon`/`overdue`; tour and shared-view absence; the existing Today surfaces unchanged; zero Anthropic + zero network; the key never appears (sentinel); the schema migration; mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A push notification, web-push, badge, or service-worker reminder to retest. AGENTS.md forbids the server side and the README's no-pressure posture forbids nag mechanics. The card appears only when the app is opened.
- A "schedule the draw" booking integration or any link to a lab service. The card's tap target is the on-device `#/labs` route; we do not link to an external booking provider, and we do not introduce a backend appointment surface.
- An LLM-generated nudge body or a personalized "your magnesium would have moved your ferritin" claim. The copy is deterministic and modest: it says the markers the *plan* aimed at would show movement; it does not predict the direction or the magnitude. The what-if simulator (0019) and the next-draw projection (0012) are where that lives.
- Re-purposing or weakening 0028 (the calendar retest-due card). 0028 fires on the plan's clock; this fires on adherence. They are siblings, dedupe to avoid double-nudging on the same draw, and otherwise coexist. Do NOT remove or merge 0028.
- A tighter or looser trigger threshold (15 days, 60 days, 90% adherence, etc.) in v1. The trigger is: ≥ 21 of the last 30 calendar days have a habit completion AND the latest panel is ≥ 30 days old. Configurability is a possible follow-up.
- Streak-shaming or loss-framed copy. The card is a quiet "worth a retest?" question; it never reads "don't break your streak" or "you'll lose progress." No consecutive-day pressure.
- Carrying the nudge into the doctor PDF (0010/0016), the share link (0017), the Markdown export (0027), or the coach packet (0048). It is an in-app daily-surface nudge, not an export artifact.
- A "snooze for X" picker (1 day / 7 days / 30 days). v1's dismissal is exactly 7 calendar days. A picker is a possible follow-up.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/adherence-retest.ts` (new) — `computeAdherenceRetest(plan, latestPanel, checkIns, now)`. Build the 30-day window ending at `now` (local `Day` strings, matching the `db.ts` format). Count days with at least one habit completion (`checkIns[i].habitsCompleted.length > 0`); if `< 21`, return null. Compute `daysSinceDraw = floor((now - latestPanel.drawnAt) / 1 day)`; if `< 30`, return null. Import `computeRetestStatus` from `src/today/retest.ts` (0028); if its return is `due-soon` or `overdue`, return null (dedupe). Else return `{ heldDays, daysSinceDraw, markers: plan.retest?.markers ?? [] }`. Pure; no Dexie.
- `src/pages/today.ts` — read the latest plan (existing helper), the latest panel (existing helper), `recentCheckIns(30)` (existing helper), and `profile.adherenceRetestDismissedFor` (new field). Compute the status; if non-null AND the dismissal is not active for the current `latestPanel.id` (the `until` date is past), render the card at the documented slot. Wire "Upload new labs" to navigate to `#/labs` and "Not yet" to write `profile.adherenceRetestDismissedFor = { panelId: latestPanel.id, until: <today + 7 days as Day> }` via the existing profile-save helper.
- `src/types.ts` — add `AdherenceRetestStatus` (internal/render type) and extend `Profile` with optional `adherenceRetestDismissedFor?: { panelId: string; until: Day }`. Additive.
- `src/db.ts` — bump Dexie to the next version with a NEW additive `.version(N).stores({...})` block for the field (per the AGENTS.md schema rule: never edit existing version blocks). Read-side optional; no data migration needed.
- `src/today/retest.ts` (0028) — read-only import of `computeRetestStatus` for the dedupe. Do not modify 0028's module.
- `src/styles.css` — `.adherence-retest` (the card), `.adherence-retest__actions` (the two-button row). Reuse the 0028 retest-card idioms; calm register, no oxblood for "Upload new labs" (that's a navigation, not an alarm). Grid children `min-width: 0`. No new colors; ink and ink-soft.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate the card with `!isTour() && !isSharedView()`.
- `tests/helpers/flows.ts` — reuse the existing check-in-seeding helper (the per-day `checkins` seed used by 0021/0053 specs; respect the `&day` unique index per the documented LESSON). Add a small `seedAdherenceRetestState(page, { plan, panel, checkInsPerDay, now })` helper if not already shared, so the spec can drive each trigger combination without re-creating the seeds inline.
- `tests/e2e/adherence-retest.spec.ts` (new) — every acceptance bullet maps to a `test()`. The five absence-variant tests each set up one missing condition. The dedupe test seeds 0028's `due-soon` and asserts the new card is absent. The dismissal-expiry test sets `now` past the `until` date and asserts the card re-renders unchanged.
- `tests/e2e/privacy.spec.ts` — extend with a Today visit carrying the trigger and a card render/dismissal, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **yes** — Dexie next version, additive `Profile.adherenceRetestDismissedFor?`.
- Voice spec: the card eyebrow may be absent (the card IS the eyebrow line). The body reads "You've held this for <N> days. The markers the protocol aimed at — <markers> — would show movement by now if it's working. Worth a retest?" The actions read "Upload new labs" and "Not yet." Declarative, no exclamation, no streak-shame. Banned: "amazing", "exciting", "journey", "great." Ink and ink-soft; oxblood reserved.

## Implementation log

(Appended by the implementation-dev agent during execution.)

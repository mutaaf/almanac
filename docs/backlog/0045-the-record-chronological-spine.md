---
id: 0045
title: The record — one dated spine of every draw and every plan, paged back through like a journal
status: groomed
priority: P2
area: progress
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user a year into a protocol, I want a single, dated, chronological "record" — one column that lists everything that has happened, newest at the top: every panel I drew (with its lab and a one-line "what moved" if it was a re-draw), every plan I composed (with a one-line summary), the run of days I have kept — so that the whole arc of my health work is one thing I can scroll through like a journal, instead of being scattered across a labs list, a plan page, a progress chart, and a check-in strip that never sit on the same timeline.

## Why now (four lenses)

### Product Owner

Almanac stores a genuinely rich history — every panel (`db.panels`), every plan (`db.plans`), every check-in (`db.checkins`) — but the user can only ever see each kind in its own silo: panels on the labs list, plans on the plan page, trends on Progress, days on the Today strip. There is no surface where the events sit on *one* timeline in the order they happened. The plan-history (0042) browses plans; the draw-compare (0009) diffs two panels; neither is "the whole record, in time order." The smallest meaningful unit of value is a deterministic, zero-network "record" surface (a section on `#/progress`, or a `#/record` route reached from it) that merges three already-stored event streams into one date-sorted list, newest first: a panel event (date, lab, marker count, and — for a re-draw — the one-line movement headline the movement receipt 0032 already computes), a plan event (date, the one-line plan summary the plan-history 0042 already derives), and a quiet check-in-run marker at the milestone thresholds the milestone surface 0041 already computes. It reads the three tables and reuses three existing deterministic summarizers; the only new code is the merge, the sort, and the unified row render. It turns a write-only archive into a readable journal.

### Stakeholder

This is the **persistent timeline** moat made into a single, legible artifact — the asset's name finally matched by a surface. Each prior ticket lit one strand of the timeline (panels, plans, days); this braids them. The compounding-state lock-in the moat depends on is most visceral when the user can *see* it all at once: a year of dated draws and composed plans and kept days, in one column, is a record that exists nowhere else and gets harder to walk away from the longer it grows — which is exactly the property a moat is supposed to have. It is a structural impossibility for a chat box: raw Claude has no panels, no plan archive, and no check-in history, so it cannot render "everything that happened to your health, in order" — it has nothing to order. It compounds, rather than duplicates, the surfaces it draws from: it reuses 0032's movement headline, 0042's plan summary, and 0041's milestone computation as read-only inputs, so the record stays honest with each of them (one source of truth per event kind, rendered in one place). And it answers the long-arc skeptic's question — "does this actually accumulate into anything?" — with the user's own dated spine, entirely on-device.

### User (at 7am on the phone)

A quiet Sunday, a year in, and I want to see how far this has come — not one chart, the whole thing. I open the record. One column, newest at the top: "May 18 — composed a new plan: 5 habits, salmon 3x. May 12 — drew labs at LabCorp, 22 markers; ferritin came up from 32 to 48, now in range. April 21 — thirty days kept. March 2 — drew labs at Quest, 20 markers. December 2 — first plan." I scroll down through a year of my own work, the draws and the plans and the runs of days, all on one line of time. It reads like a journal I did not know I was keeping. I tap a plan entry and it takes me to that plan; I tap a draw and it takes me to that panel. It rendered instantly, offline, because every event is already on my phone — nothing was fetched, nothing was sent.

### Growth

This is a retention-and-moat ticket whose audience is the resident, not the tourist — the user with enough history that the spine is worth scrolling. Retention: a user who can page back through a year of dated draws and plans has the invested time made tangible and ownable, which is the strongest non-coercive reason to keep adding to it (every new draw and plan is another entry in a record they now read). (Hypothesis: a unified chronological record raises long-run retention among users past their second draw, because it converts scattered, siloed history into a single legible artifact the user returns to — the same "on this day / archive" pull that retains long-term journaling-app users; treat as untested without remote analytics, which we will never add.) The "show me" frame is the long-arc evidence the persona cannot get anywhere else: "this is every lab and every plan I've done in a year, on one timeline" is the answer to "is this actually doing anything over time?" — shown on the user's own dated record, which is the one thing the chat box cannot fake or accumulate.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/progress/record.ts` (new) exports `buildRecord(panels: Panel[], plans: Plan[], checkIns: CheckIn[], now: Date): RecordEntry[]` where `RecordEntry` is a discriminated union: `{ kind: "panel"; date: Day; labName?: string; markerCount: number; headline?: string; panelId: number }` | `{ kind: "plan"; date: Day; summary: string; planId: number }` | `{ kind: "milestone"; date: Day; threshold: 7 | 30 | 100; keptDays: number }`. It maps each panel, plan, and reached check-in milestone to an entry, sorts all entries by `date` descending (ties broken deterministically: plan before panel before milestone on the same day, documented in the file), and returns the merged list. Pure: no DOM, no Dexie, no network.
- [ ] A panel entry's `headline` is populated, for a re-draw (a panel with a prior draw of a shared marker), from the SAME movement computation the movement receipt (0032) uses — the single most notable move ("ferritin came up from 32 to 48, now in range"). A first-ever panel has no `headline` (nothing to compare). The plan summary reuses 0042's one-line derivation; the milestone reuses 0041's `computeMilestone` threshold logic. There is NO second implementation of any of the three — `buildRecord` calls the existing functions. Asserted by seeding a re-draw and confirming its headline matches the movement receipt's headline string.
- [ ] The record renders as one date-descending column. Each row shows its date and a single editorial line keyed to its kind: a panel row reads "Drew labs at <lab> — <N> markers" plus the headline when present; a plan row reads "Composed a plan — <summary>"; a milestone row reads "<Seven|Thirty|One hundred> days kept." Asserted by seeding two panels, two plans, and one milestone and confirming the five rows render in correct date order with the expected copy.
- [ ] A panel row taps through to that panel (`#/labs?id=<panelId>`); a plan row taps through to the plan (`#/plan`, or the plan-history 0042 diff if that surface is the right target — pick one and document it); a milestone row is informational (no navigation). Asserted by tapping a panel row and a plan row and confirming the route.
- [ ] With ZERO events (a brand-new user with no panels, no plans, no check-ins), the record renders an empty state ("Your record is empty — draw a panel or compose a plan to begin it.") and is otherwise inert. Asserted on a fresh profile.
- [ ] With only one kind of event present (e.g. a plan from intake alone, ticket 0007, but no panels), the record lists what exists and omits the absent kinds without error. Asserted with a plan-only history (no panels).
- [ ] The record is built and rendered with **zero network calls** — it reads `allPanels()`, `allPlans()`, and the check-ins from IndexedDB and merges in memory. Asserted by rendering the record and confirming the mock recorded zero requests.
- [ ] Marker names in any panel headline resolve to human names via `findMarker()` (inherited from 0032's resolution), including sex-specific and user-defined keys. Asserted by a re-draw headline referencing a sex-specific marker rendering "Ferritin", not the suffixed key.
- [ ] The record is reachable from `#/progress` (a section header + link, or a "See the full record" affordance) under the same gate posture as Progress — consent + profile required, not bypassed; tour and shared-view short-circuit. Asserted by reaching the record from Progress with a profile, and confirming a pre-consent browser cannot reach it.
- [ ] Renders on both **chromium and mobile-webkit**. Rows wrap cleanly at the 390 px viewport; tap targets are ≥44×44 css px; long lab names and headlines respect `min-width: 0` (the documented overflow fix) and do not overflow horizontally.
- [ ] Tour mode (0014) renders the record against the tour fixture's panels/plans (if the fixture carries them) so a prospect can feel the spine; shared-view mode (0017) does NOT render it — the shared payload carries one protocol, not a history. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the record is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the record is computed on render from the existing `panels`, `plans`, and `checkins` tables. Nothing new is persisted; nothing is edited or deleted from this surface.
- [ ] New `tests/e2e/record.spec.ts` covers: merged date-descending ordering across the three event kinds, panel headline matches the 0032 movement string, plan summary matches the 0042 derivation, milestone rows at reached thresholds, tap-through routing for panel and plan rows, empty state, single-kind history, marker-name resolution, zero-network, reachable from Progress and gated, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A second implementation of movement, plan-summary, or milestone logic. The record REUSES 0032's movement headline, 0042's plan summary, and 0041's `computeMilestone` as read-only inputs. If any of those is inlined in its page, the dev extracts the shared function and calls it from both — but writes no parallel logic. (This ticket reads cleanest once 0032, 0041, and 0042 have shipped; if some have not, the record renders the entry kinds that are available — a panel without 0032 simply has no headline, a record without 0042's summary uses a minimal date+lab line — and remains a single shippable unit. Document which inputs are present at build time.)
- Editing, deleting, or annotating any event from the record. The spine is read-only; mutating panels or plans happens on their own surfaces. No "add a note to this day" — that is a separate, larger journaling design.
- Per-day check-in entries (mood/energy/sleep, meals eaten) on the spine. The check-in stream appears only as the milestone markers (7/30/100) the milestone surface already computes; a full per-day log would bury the draws and plans in noise. The day-level detail lives on Today.
- An LLM-generated narrative of the arc. The record is a deterministic merge of stored events; a Claude call would add cost, latency, non-determinism, and an egress to a surface whose value is being instant, local, and provably honest. The hundred-day mark (0021) already carries the editorial arc paragraph; this is the raw, browsable spine.
- Filtering the spine by event kind ("show only draws") or a search box. One chronological column. A filter is a clean follow-up if the record proves long enough to need it, but it adds interaction surface to a reading page.
- A horizontal/visual timeline graphic with nodes and connectors. The record is a typed, editorial column the persona reads like a journal, not an infographic. No SVG timeline, no animated scrub.
- Carrying the record into the doctor PDF (0010/0016), the share link (0017), or the Markdown export. The Markdown export (0027) is the place for a full timeline dump if one is wanted; this is the in-app browsable surface.
- Adding `#/record` to the authenticated masthead nav. It is reached from Progress and by direct URL, keeping the masthead at its current entry count (the restraint the hundred-day route 0021 and plan-history 0042 use).

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/progress/record.ts` (new) — `buildRecord(panels, plans, checkIns, now)` per the acceptance bullets. Build entries from each stream, then merge-sort by `date` desc with the documented same-day tie-break. For panel headlines, call the movement computation 0032 exposes (`computeMovementReceipt` and take its most-notable row) rather than re-deriving; for plan summaries, call 0042's one-line summarizer; for milestones, call 0041's `computeMilestone`/threshold logic. Pure; the page passes the three streams + `now`.
- `src/pages/progress.ts` — render the record as a section on Progress with a "See the full record" affordance, OR register a dedicated `#/record` route (engineering choice; if a route, model the gate posture on `#/progress`). Reuse the existing Progress section/eyebrow idioms. Tap-through wiring routes panel rows to `#/labs?id=N` and plan rows to the plan surface.
- `src/main.ts` — if a dedicated `#/record` route is chosen, register it with the same consent + profile gate as `#/progress` (not bypassed; tour/shared-view short-circuit). If it is a Progress section, no router change.
- `src/db.ts` — read-only. `allPanels()`, `allPlans()`, and the check-in readers already exist (with tour/shared-view shims). No schema change.
- `src/labs/movement-receipt.ts` (0032), `src/pages/plan-history.ts` (0042), `src/today/milestone.ts` (0041) — read-only consumers for the three summarizers. Do not duplicate their logic.
- `src/data/markers.ts` — read-only. `findMarker()` resolves human names in panel headlines.
- `src/types.ts` — add `RecordEntry` (the discriminated union; internal/render type, additive). No persistent schema change.
- `src/styles.css` — `.record` (the column), `.record__entry` (one row, with its date + line + optional headline), kind modifiers for the eyebrow accent (`--panel`/`--plan`/`--milestone`), reusing existing Progress/editorial tokens. No new colors; ink and ink-soft, oxblood reserved. Grid children get `min-width: 0`. Tap targets ≥44×44 css px.
- `src/chrome.ts` — do NOT add `#/record` to the authenticated nav; it is reached from Progress and by direct URL.
- `src/sample/state.ts` / `src/share/shared-state.ts` — tour reads the fixture's panels/plans (already available via `tourAllPanels`/`tourAllPlans`); shared-view short-circuits the record.
- `tests/helpers/flows.ts` — reuse `seedPanel`, `seedPlan`, and the check-in seeding helpers (from the 0032/0042/0041 specs) to seed a mixed, dated history; mind the `&day` UNIQUE index on check-ins (seed unique days, per the 0021 lesson in `docs/LESSONS.md`). Drive `now` via Playwright's clock API for the milestone entries.
- `tests/e2e/record.spec.ts` (new) — every acceptance bullet maps to a `test()`. The ordering test seeds events on known dates and asserts the rendered row order and copy; the headline test asserts the panel row's headline equals the movement receipt's string for the same seeded re-draw.
- `tests/e2e/privacy.spec.ts` — extend with a record visit confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: panel row "Drew labs at <lab> — <N> markers" (+ headline when present); plan row "Composed a plan — <summary>"; milestone row "<Seven|Thirty|One hundred> days kept." Empty state "Your record is empty — draw a panel or compose a plan to begin it." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

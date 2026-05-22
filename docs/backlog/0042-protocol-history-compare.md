---
id: 0042
title: The protocol, over time — browse every plan you have composed and diff any two of them
status: groomed
priority: P2
area: plan
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user a year into a protocol who has recomposed five or six times, I want a `#/plan-history` surface that lists every plan I have ever composed — dated, with a one-line summary of what each one asked of me — and lets me pick any two to see the same structural diff the latest-plan summary shows (foods added/removed/re-frequencied, habits added/retired, insights newly firing or resolved), so that the entire arc of how my protocol evolved — not just the last step — becomes something I can read and reason about, the way I would page back through a journal, instead of being a stack of overwritten plans I can only ever see the top of.

## Why now (four lenses)

### Product Owner

Almanac stores every composed plan (`db.plans`, ordered by `generatedAt`), but the user only ever sees the latest. The plan-delta (0029, groomed) cracked the door — it diffs the two most recent plans at the top of the Plan page — but it explicitly scopes out "a full version history / view-any-past-plan browser," because that is a distinct, larger surface. This ticket is that surface, and it is the natural completion of the plan timeline: a route that lists all plans oldest-to-newest with a dated, one-line summary each, and lets the user select any two to diff using 0029's `computePlanDelta` verbatim. The smallest meaningful unit of value is a deterministic, zero-network history page reading `allPlans()` and reusing the existing delta engine; the only new code is the list, the two-plan picker, and the diff render between an arbitrary pair (0029 diffs a *fixed* pair — the newest two; this lets the user choose). It turns a write-only stack of plans into a readable, comparable timeline.

### Stakeholder

This deepens the **persistent timeline** moat along the one axis that has the most stored data and the least surface: the timeline of *plans*. The plan-delta (0029) made the latest transition legible; the hundred-day mark (0021) made the quarterly arc legible; nothing yet lets the user traverse the *whole* plan history at will. A chat box has no prior plan to compare against, let alone a navigable archive of every protocol it ever proposed — so "show me how my protocol looked in March versus now" is a question only a product with a persistent, structured plan store can answer, and it answers it entirely on-device. It compounds 0029 (reuses its diff engine wholesale — no new diff logic, which keeps the two surfaces honest with each other) and 0034 (the earned-promotion annotation, once shipped, can ride the same diff lines in the history view). The archive is also the kind of asset that gets *harder to leave* the longer the product is used: a user with eight plans of history has a year of structured protocol evolution that exists nowhere else, which is the compounding-state lock-in the moat is built on.

### User (at 7am on the phone)

I have been doing this for a year. I want to see how far the protocol has come. I tap "Plan history" — a clean, dated list, oldest at the bottom: "May 18 — 5 habits, salmon 3x, magnesium nightly. February 26 — 4 habits, salmon 2x, iron-rich greens daily. December 2 — first plan." Each line is the protocol in a glance. I tap the December plan and the May plan to compare them, and the same "since your last plan" diff I already trust renders between them: "Across these two — salmon moved from 2x to 3x, the iron habit retired, two foods left the avoid list, the iron-restricted pattern resolved." I can see the whole arc, not just the last hop. It worked offline, instantly, because every plan is already on my phone — nothing was fetched, nothing was sent.

### Growth

This is a retention-and-moat ticket whose audience is the user deep enough into the product to have a history worth browsing — the resident, not the tourist. Retention: a user who can page back through a year of protocol evolution has a tangible reason to value the time they have invested, and a reason to keep recomposing (each recomposition adds a page to an archive they now read). (Hypothesis: a navigable plan history raises long-run retention among users past their third plan, because it converts the invested time into a legible, ownable artifact — the same way a journaling app's "on this day" archive retains users who would otherwise see only today's entry; treat as untested without remote analytics, which we will never add.) The acquisition tail is specific and credible: "I can see exactly how my protocol changed over the last year, side by side" is the kind of long-arc evidence that distinguishes a serious tool from a one-shot generator, and it is the answer to a skeptic's "does this actually do anything over time?" — shown on the user's own dated history, which is the one thing the chat box cannot fake.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] A new route `#/plan-history` is registered in `src/main.ts` under the same gate posture as `#/plan` and `#/recap` — requires consent and a profile, does NOT bypass either, and tour/shared-view mode short-circuit. Asserted by visiting `#/plan-history` with a profile + 2 plans (renders) and confirming a fresh pre-consent browser does not reach it.
- [ ] `src/pages/plan-history.ts` (new) exports `renderPlanHistory()`. It reads `allPlans()` (newest-first) and renders one row per plan, NEWEST at the top, each row showing the plan's `generatedAt` as a date and a one-line summary derived deterministically from the plan (habit count + the top eat-list food with its frequency, e.g. "May 18 — 5 habits · salmon 3x per week"). Pure render over stored plans: no inference, no network. Asserted by seeding three plans with distinct dates/contents and confirming three dated rows in newest-first order with the expected summaries.
- [ ] With exactly ONE plan, the page lists that single plan and renders no comparison affordance (nothing to diff against); a short line reads "Compose again to compare protocols over time." Asserted by seeding one plan and confirming the single row + the no-comparison line.
- [ ] With ZERO plans, the page renders an empty state ("No protocols composed yet.") and the page is otherwise inert. Asserted by visiting with a profile but no plan.
- [ ] The user can select exactly two plans to compare (e.g. two checkboxes/radio affordances, or "compare to" on each row). When two are selected, the page renders `computePlanDelta(newer, older)` (from 0029's `src/plan/delta.ts`) between them, with the newer plan as `current` and the older as `prior`, under an eyebrow naming the two dates ("From <older date> to <newer date>"). Asserted by selecting a December plan and a May plan and confirming the delta lines (salmon 2x → 3x, a retired habit, a resolved insight) render between them.
- [ ] The diff render reuses 0029's exact line copy and rules — an eat frequency change reads "<food> moved from <was> to <now>.", a retired habit "<habit> retired.", a resolved insight "<insight> — resolved.", and two identical plans "Nothing changed between these plans — the inputs were the same." There is NO second diff implementation; the page calls `computePlanDelta` and renders its `PlanDelta` with the same renderer 0029 uses (extract the shared renderer if 0029 inlined it). Asserted by comparing two identical plans and confirming the "nothing changed" line.
- [ ] Selecting two NON-adjacent plans (e.g. the first and the latest, skipping the middle ones) diffs exactly those two — the diff is between the chosen pair, not the newest pair. Asserted by seeding three plans and comparing #1 and #3, confirming the delta reflects the cumulative difference, not the #2→#3 step.
- [ ] The history is computed and rendered with **zero network calls** — it reads `allPlans()` from IndexedDB and diffs in memory. Asserted by rendering the page, selecting a pair, and confirming the mock recorded zero requests throughout.
- [ ] Marker-tied diff copy resolves human marker names via `findMarker()` (e.g. "omega-3 index," not the raw key), inheriting 0029's resolution. Asserted by a delta whose change reason references a sex-specific or user-defined marker key.
- [ ] The page is reachable from the Plan page via a restrained "See plan history" link near the existing plan actions (rendered only when a plan exists). Asserted by tapping the link from `#/plan` and landing on `#/plan-history`.
- [ ] Renders on both **chromium and mobile-webkit**. The list rows and the diff wrap cleanly at the 390 px viewport; the selection affordances are ≥44×44 css px tap targets; long food/habit names respect `min-width: 0` (the documented overflow fix) and do not overflow horizontally.
- [ ] Tour mode (0014) renders the history against the tour's plan fixture(s): if the tour fixture carries two plans it lists both and offers the comparison; if it carries one it shows the single-plan state. Shared-view mode (0017) does NOT render the route — the shared payload carries one protocol, not a history; the route short-circuits like the plan-delta summary does. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the history is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the history reads the existing `plans` table (every composed plan already stored with `generatedAt`). Nothing new is persisted; no plan is edited, reverted, or deleted from this surface.
- [ ] New `tests/e2e/plan-history.spec.ts` covers: route gated like #/plan, list renders newest-first with dated one-line summaries, one-plan and zero-plan states, selecting two plans renders the 0029 delta between them, identical-plans "nothing changed" line, non-adjacent pair diffs the chosen pair, marker-name resolution, the Plan-page link routes here, zero-network throughout, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A second diff implementation. This ticket REUSES `computePlanDelta` from 0029 and its line renderer. If 0029's renderer is inlined in `plan.ts`, the dev extracts it to a shared function and calls it from both surfaces — but does not write a parallel diff. (This ticket depends on 0029 having shipped; if it has not, this waits — but remains a single shippable unit once 0029 lands.)
- Editing, reverting to, or deleting a past plan from the history. The archive is read-only. Reverting to a prior plan is a sensitive, separate design (it would overwrite the live plan and confuse the adherence loop) and is not in scope.
- Diffing the 7-day meal plans or grocery lists across history. Meals are re-rolled independently and frequently (README); a meal diff would be noisy. Scope this to the Plan (eat/avoid/habits/insights), exactly as 0029 does.
- A three-or-more-way comparison or an "overlay all plans" view. Two plans at a time, the same as 0029. A multi-plan matrix is gold-plating.
- An LLM-generated narrative of the arc. The history rows and the diff are deterministic structural renders; a Claude call would add cost, latency, non-determinism, and an egress to a surface whose value is being instant, local, and provably honest. The hundred-day mark (0021) already carries the editorial arc paragraph (also deterministic); this is the raw, browsable archive.
- Surfacing the full body of each past plan inline (snapshot, insights, lifestyle, supplements). The list shows a one-line summary; the comparison shows the diff. A full read-only render of an arbitrary past plan is a possible follow-up but would duplicate the Plan page's render machinery and is not the minimum value here.
- Carrying the history into the doctor PDF (0010/0016), the share link (0017), or the Markdown export (0027). The Markdown export (0027) is the place for a full timeline dump if one is wanted; this is the in-app browsable surface.
- Adding `#/plan-history` to the authenticated masthead nav. It is reached from the Plan page and by direct URL, keeping the masthead at its current entry count (the same restraint the hundred-day route 0021 used).

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/pages/plan-history.ts` (new) — `renderPlanHistory()`. Read `allPlans()` (already newest-first). Build each row's one-line summary deterministically: `plan.habitStack.habits.length` habits + the first `plan.eatList` item's `food` + `frequency`. Hold the two-selection state in page state; when two are selected, order them by `generatedAt` and call `computePlanDelta(newer, older)`, then render the result with the shared delta renderer. Pure render; no Dexie write, no Anthropic call.
- `src/plan/delta.ts` (from 0029) — read-only consumer. Reuse `computePlanDelta` exactly. If 0029's delta-line rendering lives inside `src/pages/plan.ts`, extract it into a shared `renderPlanDelta(delta: PlanDelta): string` (or a small DOM-returning helper) so both `plan.ts` and `plan-history.ts` render identical copy. Do NOT duplicate the diff logic.
- `src/main.ts` — register `#/plan-history` in `dispatch()` with the same gate behavior as `#/plan` / `#/recap` (consent + profile required, not bypassed; tour and shared-view short-circuit). Routing back to `#/plan` is the path out.
- `src/pages/plan.ts` — add a restrained "See plan history" link near the existing plan-page actions, rendered only when a plan exists. Match the existing action styling.
- `src/db.ts` — read-only. `allPlans()` already returns every plan newest-first (with the tour/shared-view shims). No change to the plans store.
- `src/data/markers.ts` — read-only. `findMarker()` resolves marker names in the diff copy, inherited from 0029's resolution. No change to the marker DB.
- `src/types.ts` — no new persistent types; `PlanDelta` already exists from 0029. Any internal selection-state type lives inside `plan-history.ts`.
- `src/styles.css` — `.plan-history` (the page), `.plan-history__row` (one plan, with its date, summary, and selection affordance ≥44×44 css px), reusing 0029's `.plan-delta` / `.plan-delta__line` tokens for the diff render. No new colors; ink and ink-soft, oxblood reserved. Grid children get `min-width: 0`.
- `src/chrome.ts` — do NOT add `#/plan-history` to the authenticated nav; it is reached from the Plan page and by direct URL, like the hundred-day route.
- `src/share/shared-state.ts` / `src/sample/state.ts` — shared-view short-circuits the route (no plan history in the payload); tour reads `tourAllPlans()` (already exists) so the history lists the tour's plan(s).
- `tests/helpers/flows.ts` — reuse 0029's `seedPlan(page, plan)` helper (controlled `generatedAt`, controlled eat/avoid/habit/insight contents) to seed three distinct plans so the spec can construct exact deltas across chosen pairs.
- `tests/e2e/plan-history.spec.ts` (new) — every acceptance bullet maps to a `test()`. The non-adjacent test seeds plan #1 (salmon 2x), #2 (salmon 2x), #3 (salmon 3x) and compares #1 and #3, asserting "salmon moved from 2x per week to 3x per week."
- `tests/e2e/privacy.spec.ts` — extend with a `#/plan-history` visit + pair comparison confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the row summary reads "<month day> — <N> habits · <food> <frequency>." The comparison eyebrow reads "From <older date> to <newer date>." Diff lines reuse 0029's exact copy. The empty/one-plan lines read "No protocols composed yet." / "Compose again to compare protocols over time." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only; no diff coloring.

## Implementation log

(Appended by the implementation-dev agent during execution.)

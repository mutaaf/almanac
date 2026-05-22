---
id: 0041
title: The days you kept — a quiet milestone the morning a run of consistent check-ins reaches 7, 30, or 100
status: groomed
priority: P2
area: today
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user who has been opening the app most mornings and marking the day, I want Today to acknowledge — once, calmly, the morning I reach it — that I have now kept a real run of consistent check-ins ("Thirty days kept. You have checked in 26 of the last 30 days since April 21"), so that the slow, unglamorous work that the whole protocol depends on — showing up daily — is met by a dated, honest acknowledgment at the milestones that matter, instead of being flattened into a fourteen-dot strip that never says "this is the longest you have held."

## Why now (four lenses)

### Product Owner

Almanac's daily ritual is the check-in, and the check-in is the input every compounding surface reads — adherence into plan composition, days-with-habit into the recap, the hundred-day arc. But the *act of consistency itself* is never acknowledged. The streak strip (README: "a calm visualization, not a Snapchat-style retention loop") deliberately refuses pressure, and that is correct — but it also means the user who has quietly checked in for a month is never told they did. There is a gap between "no dark-pattern streak nag" and "no acknowledgment at all," and the honest middle is a milestone that fires *after the fact*, once, at human-meaningful thresholds. The smallest meaningful unit of value is a deterministic, zero-network milestone card on Today: read the check-in history, compute the count of days checked in within the trailing 7 / 30 / 100-day windows, and when the user crosses a threshold they have not yet been shown, surface one calm editorial card ("Thirty days kept") that they can dismiss. It reads only `checkins`, already on the device; no inference, no new schema (the per-threshold "seen" flag is a localStorage key, exactly as the recap and hundred-day dismissals already are). It turns consistency from an invisible input into a quietly acknowledged act, without becoming a pressure loop.

### Stakeholder

This deepens the **adherence loop** moat on its most-overlooked axis: the loop reads check-ins as *data for the next plan*, but never reflects the *act of checking in* back to the user as something worth continuing. A milestone surfaced from the user's own check-in history is a thing a chat box structurally cannot produce — Claude has no record that you opened anything yesterday, let alone 26 of the last 30 days. It compounds the persistent timeline (the milestone is computed from the same `checkins` table the recap and the hundred-day arc read) without adding any stored state beyond a dismissal flag, and it sits cleanly beneath the existing Today card precedence chain (quarterly > recap > quiet-day, ticket 0021) as the lowest-pressure entry. Crucially it stays inside the README's no-streaks-as-pressure contract by firing *retrospectively at thresholds*, never as a countdown, never as a "don't break your streak" warning — the acknowledgment is for days already kept, not days at risk. This is the rare retention mechanic that strengthens the daily loop without importing the dark pattern the product was built to avoid.

### User (at 7am on the phone)

A Tuesday, day thirty-something of doing this. I open Today, coffee not made. Above the meals, one quiet line in the almanac voice: "Thirty days kept. You have checked in 26 of the last 30 days since April 21." Not a badge, not confetti, not a number that resets and shames me if I miss tomorrow — just an honest note that I have, in fact, kept this up, and the dates to prove it. I read it, I feel it, I tap it away ("Noted"), and it does not come back for this milestone. If I had missed a stretch and my count was low, no card fires at all — it never scolds me for the days I missed, it only acknowledges the days I kept. It rendered instantly, offline, because my check-ins are already on my phone. The next time it speaks is day 100, and only if I actually get there.

### Growth

This is a retention ticket aimed at the quiet majority who do the daily work and get no acknowledgment for it — the cohort most at risk of drifting off not from failure but from the absence of any felt progress. Retention: a milestone that meets the user at day 7, day 30, day 100 gives the daily ritual a small, honest punctuation, which is the gentlest possible reason to keep the ritual going — without the pressure that makes users abandon streak apps in backlash. (Hypothesis: a retrospective, dismissible check-in milestone raises week-4 and week-12 retention among consistent users, because acknowledgment-after-the-fact sustains a habit where streak-pressure-before-the-fact eventually breaks it — back-of-envelope from how non-punitive progress acknowledgment outperforms loss-framed streaks for long-run adherence; treat as untested without remote analytics, which we will never add.) The "show me" frame is the day-100 card specifically: "a hundred days kept" in the editorial type is a screenshot the persona is proud to post, and unlike a generic streak counter it is dated to the user's real run, which is the kind of evidence-shaped artifact a friend asks about ("a hundred days of what?").

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/milestone.ts` (new) exports `computeMilestone(checkIns: CheckIn[], now: Date, seenThresholds: number[]): Milestone | null` where `Milestone` is `{ threshold: 7 | 30 | 100; keptDays: number; windowDays: number; sinceDay: Day }`. It counts, across the supplied check-ins, the number of distinct days with a check-in row inside the trailing `threshold`-day window ending at `now`, for each of 7 / 30 / 100. A threshold is "reached" when `keptDays / threshold` clears a floor (default ≥ 0.66) AND the user's earliest-ever check-in is at least `threshold` days before `now` (so a brand-new user cannot trip the 100-day milestone with a dense first week). It returns the HIGHEST reached threshold not present in `seenThresholds`, or `null` when none qualifies. `sinceDay` is `now − threshold days` as a `Day`. Pure: no DOM, no Dexie, no network.
- [ ] The Today page (`src/pages/today.ts`) renders a single milestone card above the meals row, BENEATH the existing card precedence chain (quarterly 0021 > recap 0008 > quiet-day 0015 > milestone) — milestone is the lowest precedence and renders only when no higher card is active and `computeMilestone(...)` is non-null. Asserted by seeding 26 of the last 30 days of check-ins (with no recap/quiet/quarterly card active) and confirming the "Thirty days kept" card renders.
- [ ] The card's line reads exactly: "<Seven|Thirty|One hundred> days kept. You have checked in <keptDays> of the last <windowDays> days since <month day>." The threshold word is spelled in the editorial register (no digit for the headline number). Asserted across all three thresholds with seeded check-in densities.
- [ ] A user who has NOT cleared the 0.66 floor for any threshold sees NO card — the surface never fires on a sparse history and never references missed days. Asserted by seeding 3 of the last 30 days and confirming no milestone card renders.
- [ ] A user whose earliest check-in is fewer than `threshold` days before `now` cannot reach that threshold — a dense 6-day first week does not trip the 7-day milestone until 7 days have actually elapsed since the first check-in. Asserted by seeding 6 dense check-ins whose earliest day is 5 days ago and confirming no 7-day milestone fires, then advancing the clock and confirming it fires.
- [ ] Dismissing the card writes `localStorage["almanac.milestone.seen.<threshold>"] = "true"` and the card does not reappear for that threshold. A user who dismissed the 7-day card still sees the 30-day card when they reach it. Asserted by dismissing the 7-day card, reloading, confirming it is gone, then crossing 30 days and confirming the 30-day card appears.
- [ ] Only the highest unseen reached threshold renders — a user who blows past day 7 without opening the app (so the 7-day card was never shown) and arrives already past day 30 sees the 30-day card, not the 7-day card, and the 7-day threshold is implicitly marked seen so it never back-fires. Asserted by seeding a history that qualifies for both 7 and 30 with neither marked seen, and confirming only "Thirty days kept" renders.
- [ ] The milestone is computed with **zero network calls** — it reads the check-ins from IndexedDB and the seen flags from localStorage. Asserted by rendering Today and confirming the mock recorded zero requests during the milestone computation/render.
- [ ] The card is dismissible with a single ≥44×44 css px tap target labelled "Noted" and carries no countdown, no "don't lose your streak" copy, no progress bar toward the next threshold — it is a retrospective acknowledgment only. Asserted by confirming the card exposes only the line + the "Noted" dismissal, and that no forward-looking/at-risk string is present.
- [ ] The deterministic count is reproducible under a fixed `now` driven by Playwright's clock API (or relative check-in seeding), so "26 of the last 30 days" is exact. Asserted by seeding exactly 26 of 30 days and confirming the rendered counts.
- [ ] Renders on both **chromium and mobile-webkit**. The card wraps cleanly at the 390 px viewport and does not push the meals row below the fold by more than one card height; it reuses the existing `.recap-card` token family (restraint over novelty) with a `--milestone` modifier for the eyebrow.
- [ ] Tour mode (0014) and shared-view mode (0017) do NOT surface the milestone card — both are session-scoped with no real check-in timeline; the surface short-circuits at the `isTour() || isSharedView()` check, exactly as the hundred-day card does. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the milestone is local-only; no new hostnames; no inference call.
- [ ] Schema migration: **no** — computed on render from the existing `checkins` table; the only persisted state is the per-threshold `localStorage` seen flag (the same mechanism the recap 0008 and hundred-day 0021 dismissals already use). Nothing new in IndexedDB.
- [ ] New `tests/e2e/milestone.spec.ts` covers: card present at each threshold with correct copy, no card on a sparse history, the elapsed-time guard against a dense first week, dismissal sticks per-threshold, only the highest unseen threshold renders, zero-network during render, no forward-looking copy present, exact counts under a fixed clock, tour vs shared-view absence, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A consecutive-day streak counter ("12-day streak"). The README's no-streaks-as-pressure rule is explicit: a consecutive counter that resets on a missed day imports the exact dark pattern the product avoids. The milestone counts *days kept within a window* (26 of 30), which is honest about gaps and never punishes a single miss. Do not build a reset-on-miss streak.
- A countdown to the next milestone ("4 days until thirty"). Forward-looking pressure is the thing being designed out. The card fires retrospectively, once, at the threshold — never before it.
- A push notification or any reminder to check in. No notification API, no backend. The card fires when the user opens Today on or after the milestone; that is the entire mechanism, same as the hundred-day card.
- Badges, points, levels, confetti, or any gamification flourish. One calm editorial line, dismissible. The satisfaction is in the sentence and the dates, not in a reward animation.
- A milestone derived from habit adherence rather than check-in presence. This ticket counts *days the user checked in at all* — the simplest honest signal of the daily ritual. Habit-specific adherence milestones are a separate, richer question (and the earned-promotion ticket 0034 already covers habit-tier acknowledgment).
- Surfacing the milestone anywhere but Today (Progress banner, Plan page, Markdown export 0027). The acknowledgment belongs in the daily ritual, at the moment of the daily open. An echo elsewhere is a clean follow-up if it earns it.
- Custom thresholds or a user-configurable cadence. The 7 / 30 / 100 thresholds are the editorial units; making them configurable dilutes the artifact and adds settings surface for no clear gain.
- Carrying the milestone into the share link (0017) or the doctor PDF (0010/0016). It is a personal, dated acknowledgment of the user's own consistency; it does not belong in a shared protocol or a clinical hand-off.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/milestone.ts` (new) — `computeMilestone(checkIns, now, seenThresholds)` per the acceptance bullets. Pure function; the page passes the check-ins, `now`, and the parsed seen-threshold list in. Count distinct `CheckIn.day` values inside each trailing window; the earliest-ever check-in (the `min` of the supplied days, or a separately-passed earliest day) gates the elapsed-time guard. The 0.66 floor mirrors the earned-promotion threshold (0034) for consistency — note it in the file. Lives under `src/today/` alongside `retest.ts` (0028) and `quiet-card.ts` (0015), the existing Today-surface computations.
- `src/pages/today.ts` — the render already runs the card precedence chain `quarterlyCardActive` (0021) > recap (0008) > quiet-day (0015). Append a fourth, lowest-precedence branch: when none of those rendered AND the milestone is non-null, render the milestone card. Read the check-in history via `recentCheckIns(100)` (or `allCheckInsInWindow(addDays(today(), -100), today())` for an exact window) plus the earliest check-in. Parse the per-threshold seen flags from localStorage. Reuse the `.recap-card` token with a `--milestone` modifier.
- `src/db.ts` — read-only. `recentCheckIns(days)` and `allCheckInsInWindow(startDay, endDay)` already exist. If an explicit earliest-check-in read is cleaner than deriving it from the window, add a thin `firstCheckInDay(): Promise<Day | null>` (a single `db.checkins.orderBy("day").first()` read with the tour/shared-view short-circuits) — a read-only convenience, no schema change. Do NOT alter the checkins store.
- `src/types.ts` — add `Milestone` (internal/render type; additive). No persistent schema change.
- `src/styles.css` — reuse `.recap-card` with a `.recap-card--milestone` modifier for the eyebrow accent (mirrors how 0021 added `.recap-card--quarterly`). The "Noted" dismissal is a ≥44×44 css px tap target. No new colors; ink and ink-soft, oxblood reserved. Grid children get `min-width: 0`.
- `src/sample/state.ts` / `src/share/shared-state.ts` — no fixture needed; the surface short-circuits in tour and shared-view (no real check-in timeline). Confirm the `isTour() || isSharedView()` guard at the top of the milestone branch.
- `tests/helpers/flows.ts` — reuse the check-in seeding helper (the one the recap 0008 / hundred-day 0021 / keepers 0035 specs use) to write N of M distinct days (mind the `&day` UNIQUE index — seed unique days, per the 0021 lesson in `docs/LESSONS.md`). Drive `now` via Playwright's clock API for the elapsed-time-guard and exact-count tests. Add a small helper to set/clear the `almanac.milestone.seen.<threshold>` localStorage keys.
- `tests/e2e/milestone.spec.ts` (new) — every acceptance bullet maps to a `test()`. The thirty-day test seeds 26 of the last 30 days with an earliest check-in ≥ 30 days ago and asserts "Thirty days kept. You have checked in 26 of the last 30 days since <month day>."
- `tests/e2e/privacy.spec.ts` — extend with a Today visit carrying a qualifying check-in history, confirming zero off-allow-list egress during the milestone render.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** (localStorage dismissal flags only).
- Voice spec: the card reads "<Seven|Thirty|One hundred> days kept. You have checked in <N> of the last <M> days since <month day>." The dismissal reads "Noted." Declarative, retrospective, no exclamation, no at-risk framing. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

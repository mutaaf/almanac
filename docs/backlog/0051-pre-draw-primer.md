---
id: 0051
title: The pre-draw primer — Today surfaces a quiet contextual card 48 hours before the retest date, with marker-specific prep advice
status: shipped
priority: P1
area: today
created: 2026-05-22
owner: gtm-innovation
---

## User story

As a user whose plan said to recheck ferritin and a lipid panel in eight weeks — and whose draw is now two days out — I want Today to quietly surface, in the 48 hours before the draw, the specific prep that actually changes those markers' reads ("Ferritin: a 12-hour fast reads truest. Lipid panel: 12-hour fast, and avoid heavy exercise 24h before."), so that the small, real, marker-specific things I would otherwise only learn about as a regret after the needle is out arrive at the moment I can still act on them — and the panel that lands is a clean one the trend can trust.

## Why now (four lenses)

### Product Owner

The retest loop already has a surface on Today: the draw countdown (0028, shipped) brings the user back as the recheck date approaches, surfacing the cadence the plan wrote. What it does NOT do is help the user draw *well*. A retest is only as valuable as its pre-analytical conditions — a ferritin drawn non-fasted, a lipid panel after a hard workout, a fasting insulin after a glass of wine the night before all read meaningfully off, and a fouled draw quietly corrupts the very trend the user is paying cents and weeks to build. The countdown says "it's coming"; nothing says "here's how to make it count." The smallest meaningful unit of value is a 48-hour activation window on Today: when the user's next-draw date (the plan's retest field, already stored) is 48 hours away or less and not yet past, Today's adaptive card stack gains a "Pre-draw prep" card that lists which markers are being retested (from the plan's retest recommendation) and, for each, a brief prep note pulled deterministically from a static lookup of the marker's known pre-analytical requirements. The card disappears once the draw date passes. There is no inference, no network, no new egress — the prep notes are a curated constant keyed by marker, exactly like `RULE_GLOSSES` is keyed by rule. It is the day-before half of the retest loop, where the countdown is the weeks-before half.

### Stakeholder

This deepens the **adherence loop** and the **persistent timeline** at the seam where the timeline's *quality* is determined — the draw itself. The loop's whole value rests on each panel being comparable to the last; a draw taken under different fasting/exercise/timing conditions is not comparable, and the trend silently lies. Surfacing marker-specific prep in the 48-hour window protects the integrity of every insight, movement receipt, and report card built on the resulting panel — it is a small surface defending the largest investment. It is a structural advantage the chat box cannot match: raw Claude has no stored retest date and no scheduled awareness of *your* draw two days out, so it cannot meet you at the moment prep matters; Almanac knows the date (the plan wrote it) and can render the right notes deterministically, offline, with no permission prompt and no server. It compounds the curated functional-range DB the product already maintains — adding a small companion table of pre-analytical prep notes per marker is the same curation discipline (defensible, source-grounded, one-line) applied to a new, high-trust moment. A backend product would email a reminder the night before; we put the right card on the surface the user already opens, computed from a date they own, inside the privacy contract.

### User (at 7am on the phone)

Two mornings before my recheck, I open Today out of habit. Above the meals, a quiet card: "Pre-draw prep — your draw is in 2 days. You're rechecking ferritin and a lipid panel. Ferritin: a 12-hour fast reads truest. Lipid panel: 12-hour fast, and avoid heavy exercise the 24 hours before." It is exactly the stuff I would have gotten wrong — I'd have eaten breakfast, or gone for my Saturday run the morning of. Now I know to schedule the draw for the morning and hold breakfast, and to move the run. The card is calm, specific, and gone the day after my draw date passes, so it never lingers as clutter. It rendered instantly, offline, because the date and the notes are already on my phone — no call, no permission prompt, no alarm. The panel that lands two days later is a clean one, and the trend it joins is honest.

### Growth

This is a low-cost, high-affection retention touch aimed at the moment the loop most often breaks: the hand-off from "the plan said retest" to "a clean panel exists." Retention: a fouled draw is a discouraging result that reads as the app being wrong about the user's own biology, and a discouraged user stops retesting; a draw that goes *well* because the app prepped them is a clean second, third, fourth panel — the data that turns a tourist into a resident. (Hypothesis: a 48-hour pre-draw primer raises the rate of clean repeat panels entering the timeline and the rate at which users complete a scheduled retest at all, because acting on marker-specific prep is only possible if the advice arrives before the draw, not after; and the affection from "the app told me not to work out before my lipid panel" is disproportionate word-of-mouth relative to its build cost; treat as untested without remote analytics, which we will never add.) The "show me" frame is the specificity: "it knew my draw was in two days and told me exactly how to prep each marker" is the caring, attentive detail the persona mentions unprompted — the opposite of a generic SaaS nudge. Affection at the right moment compounds into referral more reliably than features do.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/data/draw-prep.ts` (new) exports `DRAW_PREP: Record<string, string>` — a static lookup keyed by canonical marker key, mapping each covered marker to a one-line pre-analytical prep note (e.g. `ferritin: "A 12-hour fast reads truest."`, `lipid panel keys (total_cholesterol/ldl/hdl/triglycerides): "A 12-hour fast; avoid heavy exercise the 24 hours before."`, `fasting_insulin: "An 8-hour fast; no alcohol the 24 hours before."`, `tsh/free_t3/free_t4: "A morning draw reads truest; take thyroid meds after the draw if applicable."`). The notes are a curated constant with a source comment per group; there is NO Claude call and NO derivation. The keys are confirmed against the canonical marker keys in `src/data/markers.ts` (a marker key in `DRAW_PREP` that does not resolve via `findMarker()` fails a typecheck-or-test guard). Asserted by importing `DRAW_PREP` and confirming each key resolves to a known marker and each value is a non-empty string.
- [ ] `src/today/pre-draw.ts` (new) exports `prepForDraw(nextDrawDate: Date | null, retestMarkerKeys: string[], now: Date): { hoursOut: number; markers: { key: string; name: string; note: string }[] } | null`. It returns non-null ONLY when `nextDrawDate` is set, is in the future or today (not past), AND `now` is within 48 hours of it (i.e. `0 <= nextDrawDate − now <= 48h`). For each retest marker key it resolves the human name via `findMarker()` and the prep note via `DRAW_PREP` (markers with no prep note are listed by name with a neutral "no special prep needed" note rather than omitted — document the choice). Returns `null` when outside the 48-hour window, when the date is past, or when there is no draw date. Pure: no DOM, no Dexie, no network.
- [ ] On the Today page (`src/pages/today.ts`), when `prepForDraw(...)` is non-null, a "Pre-draw prep" card renders in the Today adaptive card stack. The card states the draw is within 48 hours, lists the markers being retested (from the plan's retest field), and shows each marker's prep note. Asserted by seeding a plan whose retest date is 36 hours from `now` covering ferritin + a lipid panel, and confirming the card lists both with their prep notes.
- [ ] The card is ABSENT before the 48-hour window opens — a draw date 5 days out renders no pre-draw card and Today is byte-for-byte unchanged. Asserted by seeding a draw date 5 days from `now` and confirming no pre-draw card.
- [ ] The card is ABSENT after the draw date passes — a draw date that is yesterday (or earlier) renders no pre-draw card. Asserted by seeding a draw date 1 day before `now` and confirming no pre-draw card.
- [ ] The markers listed are exactly those in the plan's retest recommendation (the retest field's marker keys), not all plan markers and not an invented set. Asserted by seeding a retest covering two specific markers and confirming only those two appear, with the correct prep notes from `DRAW_PREP`.
- [ ] The prep notes are deterministic and seeded from the static `DRAW_PREP` lookup — the rendered note for a given marker equals `DRAW_PREP[key]` exactly (no LLM, no variation). Asserted by comparing a rendered note string to `DRAW_PREP` for the seeded markers.
- [ ] The card is ABSENT when there is no plan, or a plan with no retest date / no retest markers — there is nothing to prep for. Asserted on a profile with a plan that has no retest field and on a profile with no plan.
- [ ] The pre-draw card and the draw-countdown card (0028) coexist coherently within the 48-hour window: the countdown's job is "it's coming" and the primer's is "here's how to draw well." Pick and document the precedence/coexistence (e.g. within 48h the primer renders and the countdown either folds into it or sits beside it) so they never present contradictory or duplicated copy. Asserted by seeding a state where both would qualify and confirming the documented, non-duplicative presentation.
- [ ] The card is computed with **zero Anthropic calls** and **zero network calls** — it reads the stored next-draw date, the plan's retest keys, and the static `DRAW_PREP` constant. Asserted by rendering Today inside the 48-hour window and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the pre-draw card.
- [ ] Marker names resolve to human names via `findMarker()`, including sex-specific keys ("Ferritin", not `ferritin_m`) and user-defined markers (0002, if the retest references one). Asserted with a retest covering a sex-specific marker rendering "Ferritin".
- [ ] Renders on both **chromium and mobile-webkit**. The card and its marker list wrap cleanly at the 390 px viewport; long prep notes respect `min-width: 0` (the documented overflow fix); the card does not push the meals row off-screen.
- [ ] The existing Today page and the draw-countdown card (0028) are byte-for-byte unchanged outside the 48-hour window — the pre-draw card is purely additive. Asserted by exercising Today with no qualifying draw and confirming the 0028 countdown and the rest of Today are unchanged.
- [ ] Tour mode (0014) renders the pre-draw card only if the tour fixture sets a draw date within 48 hours and a retest set (otherwise absent — never fabricated). Shared-view mode (0017) does NOT render it — the surface is the owner's Today. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is local-only and deterministic; no new hostnames; no inference call; no notification/permission API is invoked.
- [ ] Schema migration: **no** — the card reads the existing plan retest field (and the draw date plumbing 0028/0031 established) plus the static `DRAW_PREP` constant. Nothing new is persisted.
- [ ] New `tests/e2e/pre-draw.spec.ts` covers: card present within 48h listing the retest markers with their `DRAW_PREP` notes, absent before 48h, absent after the draw date passes, markers exactly the retest set, deterministic notes equal to `DRAW_PREP`, absent with no plan / no retest date, the documented coexistence with the 0028 countdown, zero Anthropic + zero network calls, the key never appears (sentinel), marker-name resolution (sex-specific), the existing Today + 0028 card unchanged outside the window, tour vs shared-view behavior, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-generated prep note. The prep is a deterministic lookup from the curated `DRAW_PREP` constant; a Claude call would add cost, latency, non-determinism, and an egress to a feature whose entire value is being instant, local, and provably consistent. The clinician-grounded note is fixed editorial copy, not generated prose.
- Push notifications, web-push, calendar (.ics) export, or any reminder firing outside the app. The card lives on Today, surfaced when the user opens it inside the 48-hour window, computed locally. No notification permission, no OS calendar write — exactly the constraint the draw-day card (0031) holds.
- Marker-specific medical fasting *prescriptions* beyond the widely-understood pre-analytical notes ("a 12-hour fast reads truest"). We are not a clinician; the notes state common, source-grounded pre-analytical practice with the standing "informational, not medical advice" disclaimer. No "fast for exactly 11.5 hours" instruction, no medication-timing prescription beyond the general "take thyroid meds after the draw if applicable" note.
- Auditing or expanding `DRAW_PREP` to cover every marker in the DB. The card ships with notes for the high-frequency retest markers (lipids, ferritin, fasting insulin/glucose, thyroid, hs-CRP, HbA1c, vitamin D) and lists any uncovered retest marker by name with a neutral "no special prep needed" line; broadening the table is a separate, additive `src/data/draw-prep.ts` ticket.
- Changing the draw-countdown card (0028) or the draw date plumbing (0028/0031). This ticket reads the stored next-draw date and the plan's retest field; it does not alter how the date is set or how the countdown renders outside the 48-hour window.
- A configurable lead-time window (let the user pick 24h or 72h). 48 hours is the editorial unit — long enough to reschedule a workout and plan a fast, short enough to be timely. A settings toggle adds surface for no clear gain.
- Carrying the pre-draw prep into any static artifact (the doctor PDF 0010/0016, the share link 0017, the Markdown export 0027). It is a live, day-before, on-device surface tied to a specific upcoming draw.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/data/draw-prep.ts` (new) — `DRAW_PREP: Record<string, string>`, a curated constant keyed by canonical marker key with a one-line pre-analytical note per marker (grouped: lipid keys share a note; thyroid keys share a note; etc.), each group carrying a source comment. Add a small test/typecheck guard that every key in `DRAW_PREP` resolves via `findMarker()` so a stale key cannot ship. Static bundle data, no DB.
- `src/today/pre-draw.ts` (new) — `prepForDraw(nextDrawDate, retestMarkerKeys, now)` per the acceptance bullets. The 48-hour window is `0 <= (nextDrawDate − now) <= 48*3600*1000` ms, with `nextDrawDate` not past (compare on the instant, since the window is hour-precise, not calendar-day like 0031's `isDrawDay`). Resolve names via `findMarker()` and notes via `DRAW_PREP` (uncovered marker → name + neutral note). Pure; the page passes the date, the plan's retest keys, and `now`.
- `src/pages/today.ts` — the render already runs the adaptive card chain (quarterly 0021 > recap 0008 > quiet-day 0015 > milestone 0041, plus the retest/draw-day surfaces 0028/0031). Add the pre-draw branch in that region, gated on `prepForDraw(...)` non-null, and reconcile its presentation with the 0028 countdown per the documented coexistence rule. Read the next-draw date from wherever 0028 (and 0031, if shipped) stored it; read the retest marker keys from the latest plan's retest field. Reuse the existing adaptive-card idioms.
- `src/today/retest.ts` (0028) — read-only for the next-draw date and the retest field; do not alter the countdown's out-of-window behavior. If 0031 shipped a concrete `drawDate`, prefer that as the precise date; otherwise use 0028's computed due date. Document which source is used.
- `src/data/markers.ts` — read-only. `findMarker()` resolves the human names and validates the `DRAW_PREP` keys.
- `src/types.ts` — add the internal `PreDrawPrep` render type (additive). No persistent schema change.
- `src/styles.css` — `.pre-draw-card` matching the existing Today adaptive cards; ink and ink-soft only, no oxblood (this is calm guidance, not an alert). Grid children get `min-width: 0`.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate with `isSharedView()` (never) / `isTour()` (only if the fixture sets a draw within 48h and a retest set).
- `tests/helpers/flows.ts` — reuse the plan-seeding + retest-date seeding the 0028/0031 specs use; drive `now` via Playwright's clock API so "36 hours out / 5 days out / 1 day past" are deterministic and the 48-hour boundary is exact.
- `tests/e2e/pre-draw.spec.ts` (new) — every acceptance bullet maps to a `test()`. The window test seeds a retest 36h out covering ferritin + lipids and asserts both notes equal `DRAW_PREP`; boundary tests seed 5-days-out (absent) and 1-day-past (absent).
- `tests/e2e/privacy.spec.ts` — extend with a Today visit inside the 48-hour window confirming zero off-allow-list egress and that no notification/permission API is invoked.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the card eyebrow reads "Pre-draw prep"; the lead reads "Your draw is in <N> days — you're rechecking <markers>." Each marker line reads "<marker>: <note>." Declarative, no exclamation, no alarm. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

- 2026-05-22 [implementation-dev] Picked up; branch `feat/0051-pre-draw-primer`. Test-first.
  Interpretations recorded here so they don't block:
  - **Next-draw date source.** 0031 (concrete `drawDate`) has NOT shipped (it is `groomed`),
    so there is no per-plan concrete draw instant in the schema. The primer reads the same
    next-draw date the 0028 retest-due card computes: the soonest cadence's
    `generatedAt + whenWeeks*7days`, hour-precise (no calendar-day rounding, since the 48h
    window is hour-precise). When 0031 ships a concrete `drawDate`, the primer's date source
    should prefer it (documented in `src/today/pre-draw.ts`).
  - **0028 coexistence/precedence.** Within the 48h window the pre-draw primer renders and the
    0028 retest-due countdown is SUPPRESSED — the countdown's job ("it's coming") is subsumed
    by the primer's ("here's how to draw well"), so the two never present duplicated copy.
    Outside the window the 0028 card is byte-for-byte unchanged.
  - **Uncovered retest markers.** Listed by name with a neutral "No special prep needed." note
    rather than omitted, so the user sees the full set being rechecked.
- 2026-05-22 [implementation-dev] Shipped via PR #77. New: `src/data/draw-prep.ts` (`DRAW_PREP`
  + load-time `findMarker()` guard), `src/today/pre-draw.ts` (`prepForDraw()`, hour-precise 48h
  window, sex-qualifier-stripping display name), `PreDrawPrep`/`PreDrawMarker` in `src/types.ts`,
  `.pre-draw-card` styles (ink/ink-soft only, grid lines `min-width: 0`), `soonestCadenceDue()`
  in `src/today/retest.ts`, and the Today wiring that suppresses the 0028 card inside the window.
  Tests: `tests/e2e/pre-draw.spec.ts` (17), a privacy probe in `privacy.spec.ts`, a re-anchored
  0028 singular-day test + a precedence test in `retest-due.spec.ts`, and a `seedPlanWithDrawIn()`
  helper. No deps, no egress change, no schema migration. Marker name fix: the primer strips the
  " (Male)"/" (Female)" qualifier so a sex-specific key renders "Ferritin" per the ticket.

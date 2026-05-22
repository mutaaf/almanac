---
id: 0040
title: Try it with your numbers — a pre-key sandbox that scores a handful of typed markers against the functional optimum
status: in-progress
priority: P1
area: growth
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a skeptical prospect who landed on the welcome screen and is not ready to paste an API key or upload a lab report, I want a signup-free, key-free sandbox where I type in a few marker values I already know off the top of my head — my last ApoB, my fasting insulin, my ferritin — and immediately see them scored against both the lab range and the tighter functional optimum, so that I feel the product's central claim on *my own numbers* in under a minute, before I trust it with anything, instead of having to take "everything looks normal but it isn't" on faith from a sample plan about someone else.

## Why now (four lenses)

### Product Owner

The sample tour (0014) shows a prospect the artifacts the engine produces, and the marker reference (0038) shows the curated knowledge it reasons from — but both are about *someone else's* or *no one's* numbers. The single highest-intent acquisition moment is the one where the prospect uses their own data, and today the only way to do that is to consent, build a profile, paste a key, and upload a lab — a four-step commitment asked of someone who has not yet been convinced. The smallest meaningful unit of value is a read-only, gate-bypassed `#/try` route with a tiny form: pick a marker from the curated list, type a value, and a row resolves instantly — the value, the lab range, the functional optimum, and the same `flag` classification the labs page uses (`flagFor()`), plus the 0036 report-card tally once two or more markers are entered ("2 of 3 sit inside the lab's normal range but below the functional optimum"). It is a pure client-side render over `MARKERS[]` and `flagFor()` — no key, no upload, no Dexie write, no extraction call. It collapses the four-step commitment into one typed number and one resolved row.

### Stakeholder

This makes the **functional-range DB** and the **flag classification** — two moat assets that today only pay off after onboarding — do acquisition work at the top of the funnel, on the prospect's own values, which is where conviction is actually formed. It is the most direct possible answer to "why not just paste my labs into Claude?": the prospect types one number and watches it get scored against a curated optimum, deterministically, offline, with no key — a thing the chat box cannot do without a round-trip and a default to the lab floor. It compounds 0036 (the report card it reuses) and 0038 (the reference it sits beside): 0038 lets the prospect read the curation, 0040 lets them test it against a number they already argue with their doctor about, and 0036's tally gives the verdict. Crucially it reads no IndexedDB and carries nothing personal — the typed values live only in the page's in-memory state and never persist — so it is safe to ship pre-consent and the privacy posture is intact.

### User (at 7am on the phone)

A friend sent the link. I am on the welcome screen, skeptical. There is a "Try it with your numbers" link beside the sample tour. I tap it. A clean form: a marker dropdown and a value field. I pick fasting insulin, type 8 — and instantly a row resolves: my 8 sits inside the lab range (2–25) but above the functional optimum (2–5), flagged suboptimal. There it is, on *my* number, the gap I have felt. I add ApoB and ferritin from memory; a one-line tally appears: "2 of 3 are inside the lab's normal range but below the functional optimum." I did not paste a key, upload anything, or make an account — I just typed three numbers I knew. That is the moment I decide to set up properly. It worked offline, instantly, because the ranges ship in the app and nothing was sent.

### Growth

This is the highest-intent acquisition surface the product can build, because it converts on the prospect's own data with the lowest possible commitment. (Hypothesis: a key-free, signup-free "score your own numbers" sandbox is the highest-converting front door for the "told everything's normal" persona, because it delivers the personalized vindication 0036 promises without asking for a key first — and it is the most forwardable artifact the product has, since the prospect who feels the gap on their own ApoB will send the link to the friend with the same complaint, who can also try it with no commitment. Back-of-envelope from how interactive "check your own X" tools out-convert static demos for skeptical technical audiences; treat as untested without remote analytics, which we will never add.) The "show me" frame is the resolved row itself: "I typed my fasting insulin and it told me it's 'normal but not optimal' — your doctor never said that" is exactly the line the persona repeats to the one friend with the same numbers.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] A new read-only route `#/try` is registered in `src/main.ts` ABOVE the consent + profile gates (the same gate-bypass treatment the sample tour 0014 and the reference 0038 use), so a first-time visitor reaches it without acknowledging consent or having a profile. Asserted by visiting `#/try` on a fresh browser (no consent, no profile) and confirming the sandbox renders.
- [ ] `src/pages/try.ts` (new) exports `renderTry()`. It renders a marker picker populated from the static `MARKERS[]` (built-in seed only — no user markers, since this is pre-gate and reads no IndexedDB) and a numeric value input. Adding a marker+value appends one resolved row showing the marker name, the typed value, the unit, the lab range, the functional optimum, and the `flag` computed via the existing `flagFor()`. Asserted by selecting fasting insulin, entering 8, and confirming the row shows lab range `2–25`, functional range `2–5`, and a `suboptimal` flag.
- [ ] The flag classification matches the labs page exactly: a value below the lab floor flags `low`, above the lab ceiling flags `high`, inside the lab range but outside the functional optimum flags `suboptimal`, and inside the functional optimum flags `optimal`. Asserted across four typed values for one marker, one per flag class.
- [ ] Once two or more rows are present, the 0036 report-card tally renders above the rows, reusing `computeReportCard(...)` over the in-memory rows: "Of <total> markers, <optimal> are optimal. <suboptimal> sit inside the lab's normal range but below the functional optimum. <outOfLabRange> are outside the lab range." (non-zero clauses only). Asserted by entering 1 optimal + 1 suboptimal + 1 out-of-range value and confirming the tally counts.
- [ ] Rows can be removed individually; removing a row updates the tally (or hides it when fewer than two rows remain). Asserted by adding three rows, removing one, and confirming the tally recomputes.
- [ ] The page reads and writes NO IndexedDB — no `getProfile()`, no `allPanels()`, no `addPanel()`, no Dexie call of any kind; the typed values live only in the page's in-memory state and are gone on reload. Asserted by entering values, reloading `#/try`, and confirming the rows are empty (nothing persisted), and that the page renders identically with and without a profile present in IndexedDB.
- [ ] The page carries a single restrained "Start your own" affordance routing to `#/welcome` (which reinstates the gate). There is NO key field, NO upload control, NO compose action, and NO Anthropic call anywhere on the page. Asserted by confirming the page exposes only the marker picker, value input, rows, tally, and the "Start your own" link — and that no key/upload/compose control is present.
- [ ] The sandbox is rendered with **zero network calls** beyond the already-loaded app shell — `MARKERS[]` and `flagFor()` ship in the bundle; no extraction, no inference, no pricing fetch. Asserted by exercising the full type-and-resolve flow and confirming the mock recorded zero requests beyond the shell.
- [ ] Ranges render honestly when one bound is open (open-high marker renders "≤ N", open-low renders "≥ N", closed renders "low–high"), reusing the same range-format helper 0038 introduces or the labs page already uses. Asserted across one open-high, one open-low, and one closed-range marker.
- [ ] Renders on both **chromium and mobile-webkit**. The picker, input, and rows wrap cleanly at the 390 px viewport; the value input and the add control are ≥44×44 css px tap targets; rows respect `min-width: 0` (the documented overflow fix) and do not overflow horizontally.
- [ ] The page carries the standing one-line "informational, not medical advice" disclaimer, consistent with every other page. Asserted by confirming the disclaimer is present.
- [ ] The reference (0038) and the sample tour (0014) entry points still work and are unchanged; the new "Try it with your numbers" link sits beside them on `src/pages/welcome.ts`. Asserted by tapping each of the three welcome links and landing on the correct route.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the sandbox is a static-data render with in-memory state; no new hostnames; no inference call; no IndexedDB read or write.
- [ ] Schema migration: **no** — the sandbox holds typed values in page memory only. Nothing is read from or written to IndexedDB.
- [ ] New `tests/e2e/try.spec.ts` covers: `#/try` reachable pre-consent and pre-profile, a typed marker resolves to the correct ranges + flag, all four flag classes, the report-card tally over 2+ rows, row removal recomputes the tally, nothing persists across reload, identical render with/without a profile (no IndexedDB read), no key/upload/compose control present, zero-network, open/closed range formatting, the welcome link routes to it, the "Start your own" link routes to `#/welcome`, disclaimer present, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Any extraction or inference. The sandbox is typed-value only; there is no upload, no PDF/image parse, no Claude call (and no key to make one with). Uploading a real lab is the gated labs flow; this is the pre-key teaser.
- Persisting the typed values, "saving the sandbox," or seeding a profile from them. The values live in page memory and are gone on reload; carrying them into onboarding is a tempting follow-up but would require IndexedDB writes pre-consent, which this ticket forbids.
- The full insight engine (multi-marker patterns / trend rules) on the sandbox. That requires a panel and a profile and belongs behind the gate; the sandbox shows the per-marker flag and the report-card tally only. Running `computeInsights()` here is a separate, larger design.
- User-defined markers (0002) in the picker. Those are private data behind the gate; the sandbox lists the curated public seed only and reads no IndexedDB.
- A shareable deep-link that encodes the prospect's typed values in the URL. Even though nothing is server-side, putting someone's marker values in a URL is a personal-data leak vector; the sandbox is a local, in-memory tool. A nothing-personal "share the tool" link is just the plain `#/try` URL.
- A composite "health score" number over the typed rows. The report-card tally is a count per class, not a grade — same constraint as 0036. No aggregate score.
- Adding the sandbox to the authenticated nav. Like the tour and the reference, it is reached from welcome and by direct URL only; it is not part of the gated app's masthead.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/pages/try.ts` (new) — `renderTry()`. A marker picker from `MARKERS[]` (`src/data/markers.ts`), a numeric input, an in-memory `rows: { key: string; value: number }[]` state, and a render that resolves each row via `findMarker(key)` + `flagFor(value, marker)` (both in `src/data/markers.ts`) and lays out the value/unit/lab range/functional range/flag. Once `rows.length >= 2`, call `computeReportCard(...)` (from 0036's `src/labs/report-card.ts`) over a synthetic in-memory `Panel`-shaped object (or a results array, whichever signature 0036 settled on) and render the tally. Reuse 0038's `formatRange` helper (or the labs page's) for open/closed bounds. Pure render; do NOT import any Dexie helper.
- `src/labs/report-card.ts` (from 0036) — read-only consumer. Reuse `computeReportCard` rather than re-implementing the count. This ticket depends on 0036 having shipped `computeReportCard` and on the report-card copy/tally. If 0036 has not shipped, this waits — but remains a single shippable unit once 0036 lands.
- `src/data/markers.ts` — read-only. `MARKERS[]`, `findMarker()`, and `flagFor()` already exist. No change to the marker DB or the flag logic.
- `src/main.ts` — register `#/try` as a gate-bypassed route, modeled on the existing tour/reference branch (the branch that renders above the consent + profile gates). It enters no session/tour/shared-view state — it is a stateless page with local component state; routing TO `#/welcome` is the path back to the gate.
- `src/pages/welcome.ts` — add a restrained "Try it with your numbers" link beside the existing sample-tour (0014) and reference (0038) entry points. Match the existing welcome-link styling; no new visual treatment.
- `src/types.ts` — no new persistent types; any internal row/render type lives inside `try.ts`.
- `src/styles.css` — `.try` (the page), `.try__form` (picker + input + add), `.try__row` (a resolved marker), reusing the labs results-row idioms and the existing editorial table styling. Touch targets ≥44×44 css px. Grid children get `min-width: 0` (the documented overflow fix). No new colors; ink and ink-soft, oxblood reserved.
- `src/chrome.ts` — do NOT add `#/try` to the authenticated nav; it is reached from welcome and by direct URL only, like the tour and reference.
- `tests/helpers/flows.ts` — no new helper strictly required (the page reads no DB); the spec visits `#/try` directly and drives the picker/input. For the "identical render with/without profile" test, reuse the existing onboarding flow to create a profile in one branch and assert the sandbox render is unchanged.
- `tests/e2e/try.spec.ts` (new) — every acceptance bullet maps to a `test()`. The flag-class test types four values for one marker (one per class) and asserts each flag. The tally test types 1 optimal + 1 suboptimal + 1 out-of-range and asserts the report-card line. The no-persist test reloads `#/try` after typing and asserts empty rows.
- `tests/e2e/privacy.spec.ts` — extend with a `#/try` visit confirming zero off-allow-list egress and no IndexedDB read/write.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the page eyebrow/title reads "Try it with your numbers" with a one-line subhead like "Type a value you already know and see it scored against the functional optimum — no key, nothing saved." The CTA reads "Start your own." Flag labels reuse the labs page's existing language. Banned: "amazing," "exciting," "journey," "great." Cream + ink, editorial type; oxblood reserved.

## Implementation log

(Appended by the implementation-dev agent during execution.)

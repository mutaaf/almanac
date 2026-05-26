---
id: 0061
title: The functional score before the key — turn the sandbox verdicts into a single "N of M markers below optimum" with a one-tap path to the real protocol
status: proposed
priority: P1
area: growth
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a prospect who typed five lab values into the sandbox, saw a green-yellow-red verdict next to each one, and is now sitting at the bottom of the result list with no obvious next step, I want a single aggregate line — "3 of your 5 markers are below the functional optimum" — and a calm button that says "Save these and see the full protocol — start with your key," so that the sandbox stops being a one-way door and becomes the first sentence of an actual invitation to use the app.

## Why now (four lenses)

### Product Owner

The sandbox path (0040, shipped) lets a prospect type or paste a handful of markers and see, per-marker, whether each lands in the functional optimum (green), the lab-normal-but-functional-borderline band (yellow), or below the functional floor (red). The handoff into onboarding exists (0049, shipped, via `readResolvableSandboxRows()` / `consumeManualPrefill()`), and the paste-text variant exists (0055, shipped). What's missing is the *moment* between "here are five colored chips" and "here is a real protocol": no single line that aggregates the verdicts, no single button that converts the prospect's curiosity into a key-entry decision. Today the user reads the chips and either taps the existing CTA or — far more likely — drifts away without ever resolving the implicit question "okay, so what do I do?" The smallest meaningful unit of value is one summary line on the sandbox result view — "N of your M markers are below the functional optimum" (where N counts the red+yellow markers per the documented rule, or the strict "below optimum" rule the dev confirms against the sandbox classifier) — followed by one button: "Save these and see the full protocol — start with your key." The button reuses the existing 0049 handoff (stages the sandbox rows, navigates to onboarding). One aggregate count and one CTA — both rendered over data the sandbox already computed.

### Stakeholder

This widens the **acquisition funnel** at the exact step that converts curiosity into intent, and it does it by making the **functional-range thesis** legible at a glance. Almanac's whole positioning is "the lab said normal; the functional optimum says otherwise" — and the per-chip verdicts say that one marker at a time. A single aggregate sentence ("3 of your 5 markers are below the functional optimum") says it *as a thesis*, in one line, in the language the marketing also uses. The prospect's mental model jumps from "huh, this one is yellow" to "I have three problems the app already sees." A chat box can score one marker against a number; it cannot honestly tell the prospect "here is your aggregate functional shortfall, and here is the protocol that would target each of them" because it has no curated functional-range table and no plan generator wired to those marker keys. The aggregate framing is the conversion line that maps the sandbox demo onto the rest of the moat — the functional-range DB, the marker canonicalization, the structured plan. And it ships with no new LLM call, no new content, no new egress — just one count and one button.

### User (at 7am on the phone)

I pasted my last lipid panel into the sandbox last night to see what this app does. Five chips came back: two green, one yellow, two red. I sat there for a second, mildly impressed, then closed the tab. This morning I open it again and the result view is the same — except now, above the chips, there's one calm line: "3 of your 5 markers are below the functional optimum." Below the chips, one button: "Save these and see the full protocol — start with your key." Not "sign up." Not "subscribe." Just "save these" — the ones I already typed. I tap. I'm in the key-entry flow with the markers I just scored already carried forward. One line told me what I was looking at; one tap told me what to do about it.

### Growth

This is a pure acquisition ticket. It targets the single step in the funnel where the sandbox underdelivers today: the result view that says, in effect, "here is some information; do whatever you want with it." (Hypothesis: a one-line aggregate score above the per-marker chips, paired with a save-and-continue CTA that reuses the 0049 handoff, raises the rate at which sandbox users start the key-entry onboarding, because the aggregate is a clearer call-to-action than per-marker chips alone and the save framing reduces the friction of "do I have to re-type these?"; back-of-envelope from how aggregate summary screens convert curiosity into commitment in score-style onboarding flows; treat as untested without remote analytics, which we will never add.) The "show me" frame is a single screenshot: the aggregate line plus the chips plus the "Save these and see the full protocol" button on a phone. That is exactly the screenshot the persona forwards to a friend with the message "type your last labs in here, it took 30 seconds and told me three things were off." It is the conversion sibling of the sandbox itself (0040/0055): those built the demo; this turns the demo into a hand-off.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/sandbox/score.ts` (new) exports `summarizeSandbox(rows: SandboxRow[]): { belowOptimum: number; total: number; line: string }`. `belowOptimum` counts the rows whose per-row verdict is NOT "in functional optimum" (i.e. the yellow + red bands the sandbox already classifies — the documented rule the dev confirms against the existing per-row classifier; the count never includes rows that failed to resolve to a marker). `line` is `"${belowOptimum} of your ${total} markers are below the functional optimum"` for total ≥1; for total = 0 the function returns null (and the caller suppresses the surface entirely). Pure: no DOM, no Dexie, no network. Asserted with known row sets across the green / yellow / red / unresolved combinations.
- [ ] The sandbox result view (`src/pages/sandbox.ts` and/or `src/pages/sandbox-paste.ts`, wherever the result rows render today) renders the aggregate summary line ABOVE the per-marker chip list whenever `summarizeSandbox(...)` is non-null. The line text matches the documented copy exactly. Asserted by typing/seeding 5 markers with a known mix and confirming the summary text.
- [ ] The result view renders a single primary CTA button BELOW the chip list with copy "Save these and see the full protocol — start with your key." (one button, one line of copy — no marketing chrome). Asserted by confirming the button's presence and label.
- [ ] Tapping the CTA stages the sandbox rows via the existing 0049 handoff (`stageManualPrefill(rows)` from `src/pages/sandbox-handoff.ts`, or whichever helper 0049 uses for the carry-over) and navigates to `/#/onboarding`. Asserted by tapping the button and confirming both the navigation and the staged rows are readable in the onboarding render path.
- [ ] When a user lands on `/#/onboarding` via the CTA, the existing 0049 handoff banner ("You scored N markers in the sandbox — bring them in?") renders against the staged rows. Asserted end-to-end: sandbox → CTA → onboarding renders the existing handoff surface with the carried rows.
- [ ] The aggregate line and CTA are ABSENT when the user has typed zero resolvable markers (the sandbox shows the empty state). Asserted on an empty sandbox.
- [ ] The aggregate line is ABSENT when every typed marker is in the functional optimum (belowOptimum = 0): the line silently disappears so a clean panel reads as clean — but the CTA still renders so the user can carry an all-green sandbox into the real onboarding if they choose. Asserted on a sandbox where every row is in the optimum.
- [ ] The aggregate line and CTA appear identically on the typed-marker sandbox (0040) AND the paste-text sandbox (0055) — both result surfaces render the same summary line and the same CTA. Asserted on both sandbox entry paths.
- [ ] The CTA path makes **zero Anthropic calls** and **zero network calls** — the aggregate is a pure count, the staging is a `sessionStorage` write, and the navigation is a hash change. Asserted by exercising the CTA and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the aggregate line, the CTA, or any intermediate string. (The key field is on onboarding; the sandbox renders before the key exists.) Asserted by seeding no key, rendering the result view, and confirming no key-shaped string appears.
- [ ] Renders on both **chromium and mobile-webkit**. The aggregate line wraps cleanly at 390 px, the CTA button is a ≥44×44 css px tap target (min-height ≥45 css px per the 0017 sub-pixel lesson), and adjacent chip rows respect `min-width: 0`. Asserted on both projects.
- [ ] The existing sandbox surfaces — the typed-row entry, the paste-text parser, the per-marker chip verdicts, the 0038 marker-reference link, the existing "start with your key" footer link if any — are unchanged in behavior. The aggregate line is purely additive; the CTA does not replace any existing affordance silently. (If an older CTA exists at the bottom of the sandbox result view today, the dev documents whether the new CTA replaces it or sits alongside it, and writes the test against the documented choice.) Asserted by exercising the existing sandbox flows and confirming they are unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the sandbox remains a pure local computation; no new hostnames.
- [ ] Schema migration: **no** — the rows ride on the existing 0049 handoff (`sessionStorage` / in-memory staging). No Dexie change.
- [ ] New `tests/e2e/sandbox-functional-score.spec.ts` covers: `summarizeSandbox` returns the right count and copy across the documented marker mixes, the line renders only when total ≥1, the line is absent on all-green and the CTA still renders, the CTA stages and navigates on both sandbox entry surfaces, the onboarding handoff banner picks up the rows, zero Anthropic + zero network, the key never appears (sentinel), mobile rendering, the existing sandbox flows unchanged.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A letter grade, a percentage, a "you scored 60/100" gamification, or any composite "health score" that aggregates across marker categories. The line counts a single, honest quantity — "below the functional optimum" — and reads back to the prospect what the chips already show.
- An LLM call to interpret the aggregate, to write a per-prospect "your shortfall pattern is X," or to preview the protocol. The aggregate is a count; the protocol preview is what onboarding + the first plan produces.
- A new CTA on the marker-reference page (0038), the share routes, or any surface outside the sandbox result view. The aggregate belongs to the sandbox result moment and nowhere else.
- A persistent "your sandbox score over time" record. The sandbox is by design ephemeral (no IndexedDB write before consent). The aggregate is computed at render time over the in-memory rows.
- A pricing, signup, or any post-key revenue/marketing surface. The CTA's job is "carry these into a real first panel"; the BYOK key entry happens in the existing onboarding flow.
- Changing the per-marker verdict bands, the functional-range data, or the green/yellow/red taxonomy. The aggregate counts what the sandbox already classifies; this ticket does not re-tune the classifier.
- Rewriting the 0049 handoff. The CTA reuses the existing staging primitive verbatim; if 0049's API needs a new entry point, that is a separate refactor ticket.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/sandbox/score.ts` (new) — `summarizeSandbox(rows)`. The function reads each row's per-row verdict produced by the existing sandbox classifier; the dev confirms the exact verdict shape in `src/pages/sandbox.ts` / `src/pages/sandbox-paste.ts` and counts the non-optimum verdicts. Pure; no DOM, no Dexie.
- `src/pages/sandbox.ts` — the typed-row sandbox result view. Render the aggregate line ABOVE the chip list (or wherever the documented slot lands per the existing layout) and the CTA button BELOW. Wire the CTA to `stageManualPrefill(rows)` and `location.hash = "#/onboarding"`.
- `src/pages/sandbox-paste.ts` — the paste-text sandbox result view (0055). Same aggregate line + CTA, same handoff. Reuse the same `summarizeSandbox` helper.
- `src/pages/sandbox-handoff.ts` — read-only reuse of `stageManualPrefill` / `readResolvableSandboxRows` / `consumeManualPrefill`. Do NOT add a new staging primitive.
- `src/pages/onboarding.ts` — read-only. The existing 0049 banner already renders against staged rows; the new CTA flows into it unchanged.
- `src/types.ts` — `SandboxRow` already exists in `src/pages/sandbox-handoff.ts`. The aggregate result type lives in `src/sandbox/score.ts`. No new persistent types.
- `src/styles.css` — `.sandbox-summary` for the aggregate line, reusing the existing sandbox-result typography (ink, ink-soft). The CTA uses the existing primary-button class with a documented `min-height` ≥45 css px. No new colors. Grid children `min-width: 0`. Banned: "amazing," "exciting," "journey," "great."
- `tests/helpers/flows.ts` — reuse the sandbox-seeding helpers used by 0040/0055 specs (typed rows and pasted text). Add a small `expectSandboxSummary(page, expected)` helper if not already shared.
- `tests/e2e/sandbox-functional-score.spec.ts` (new) — every acceptance bullet maps to a `test()`. The aggregate test feeds known rows and asserts the count + copy; the CTA test stubs `location.hash` and reads back the staged rows; the all-green test asserts the summary line's absence and the CTA's presence; the handoff round-trip lands on onboarding and asserts the 0049 banner renders.
- `tests/e2e/privacy.spec.ts` — extend with a sandbox-with-CTA-flow, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — pure render + existing handoff.
- Voice spec: the aggregate line reads literally `"N of your M markers are below the functional optimum"`. The CTA reads `"Save these and see the full protocol — start with your key."` Declarative, no exclamation, no marketing inflection. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the chip bands the sandbox already paints.

## Implementation log

(Appended by the implementation-dev agent during execution.)

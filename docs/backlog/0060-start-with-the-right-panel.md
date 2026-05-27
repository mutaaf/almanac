---
id: 0060
title: Start with the right panel — for the user who has onboarded but has no labs, a goal-tied list of markers worth asking the doctor about
status: proposed
priority: P1
area: onboarding
created: 2026-05-27
owner: gtm-innovation
---

## User story

As a user who just finished onboarding — I typed my name, my goals ("more energy, lower heart-disease risk"), my conditions ("intermittent fatigue, family history of cardiac"), and pasted my key — but I have no recent lab to upload, I want a calm "Start with the right panel" card on Today that names 6–10 specific markers worth asking my doctor for, each tied to one of the goals or conditions I stated, so that I can walk into my next appointment with a printable, defensible list — instead of leaving Almanac empty-handed because every other surface assumes I already have a lab to load.

## Why now (four lenses)

### Product Owner

The intake form already captures `goals` and `conditions` as free-form text. The functional-range DB (`src/data/markers.ts`) already carries ~70 markers with curated content. The first-plan-from-intake feature (0007, shipped) means a user can compose a plan with no labs at all — but that plan is dietary-only; it cannot reason about a marker the user has not measured. The realistic next step the user needs is "get the right blood drawn," and today the app gives them nowhere to start. The coverage-gap card (0052) only fires after a panel exists; the pre-key sandbox (0040/0055) is for prospects, not the post-key user; the marker reference (0038) is a full library, not a prioritized list. The smallest meaningful unit of value is a single card on Today, visible ONLY when the profile has zero panels: titled "Start with the right panel," it shows 6–10 markers from a static `GOAL_MARKER_MAP` keyed off keyword matches against the user's `goals` / `conditions` strings — each row carries the marker name and a one-line reason tied to the matched keyword ("Fasting insulin — rises before glucose; an early read on the metabolic trouble behind low energy."). A "Copy as text" action below copies the list to the clipboard in a plain, doctor-readable format. The card disappears the moment the user uploads or manually enters their first panel. It is a pure local render: lookup table + string match, no inference, no network.

### Stakeholder

This closes the biggest acquisition gap the product has: the first-time user who completes onboarding but has no recent labs. Today that user gets a half-empty Plan and a Progress page with nothing to chart — and the realistic outcome is they close the tab and never come back. A prioritized, goal-tied "go ask for these" card converts the onboarded-but-empty user into one with a concrete next step that *requires* coming back to Almanac (to upload the result). It deepens the **functional-range DB** moat by making it do **goal-to-marker mapping**, not just per-marker scoring — a chat box can paste a goal and get a paragraph back, but it cannot maintain a curated, defensible mapping that survives across sessions and feeds the rest of the product (the plan composer, the report card, the coverage gaps). The mapping is the moat; the card advertises it. It is also strictly local: a static lookup table + the user's already-on-device intake strings — no new egress, no new inference. It is the post-key sibling of 0052 (coverage gaps for users with labs): 0052 names what's missing from your existing panels; 0060 names what you should ask for when you have no panel at all.

### User (at 7am on the phone)

I just finished onboarding last night. I open Today this morning. Below the meal-plan-from-intake card, a calm section: "Start with the right panel." A short list, the markers picked for me because of what I wrote down: "Fasting insulin — rises before glucose; an early read on the metabolic trouble behind your low-energy goal. ApoB — the count of atherogenic particles; a sharper heart-disease read than the LDL on a standard panel, given your family history. Ferritin — iron stores; commonly low in women and a frequent driver of fatigue. Vitamin D, 25-OH — affects mood, immunity, and bone; routinely undertested. hsCRP — a low-grade-inflammation read tied to your fatigue. Omega-3 index — the membrane balance behind heart and brain inflammation." Below, a single action: "Copy as text." I tap it. My next appointment is Thursday; I paste the list into a note and bring it with me. Two weeks later when the results land, I upload them, and the card just goes away — replaced by my actual panel.

### Growth

This is a pure acquisition retention ticket: it answers the "I have nothing to show the app and the app has nothing to show me" failure mode at the exact moment it kills the funnel. (Hypothesis: a goal-tied "what to get tested" card raises the rate at which first-time onboarded-but-empty users return with a panel, because it converts the vague "I should test more" feeling into a specific, named, printable ask their doctor can act on — and because the act of asking and receiving the panel pulls them back to Almanac to upload it; back-of-envelope from how concrete next-step prompts at the empty state retain users in patient-facing tools; treat as untested without remote analytics, which we will never add.) The "show me" frame is the printed list itself, walked into a doctor's office: "this told me exactly what to ask for, tied to what I wrote down as my goals" is the substance-over-pitch artifact the persona forwards to the friend with the same "everything looks normal but I feel awful" complaint. It is the empty-state sibling of 0052: 0052 finds gaps in your existing labs, 0060 starts the first lab from nothing.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/onboarding/start-panel.ts` (new) exports `GOAL_MARKER_MAP: { keyword: string; markerKey: string; reason: string }[]` — a defined, ordered constant of ~30–50 keyword-to-marker mappings covering the founding persona's vocabulary: keywords like "energy", "fatigue", "tired", "sleep", "heart", "cardiac", "cholesterol", "weight", "metabolic", "blood sugar", "inflammation", "mood", "stress", "brain fog", "thyroid", "hair", "skin", "hormone", "perimenopause", "fertility". Each entry resolves to a `markerKey` valid in `MARKERS[]` and carries a static one-line `reason` written for that goal-keyword pairing. The reason strings are curated constants — NOT LLM output. Asserted by importing the constant and confirming each `markerKey` resolves via `findMarker()` and each `reason` is a non-empty static string.
- [ ] `src/onboarding/start-panel.ts` also exports `computeStartPanel(profile: Profile, panels: Panel[]): { markerKey: string; name: string; reason: string }[]`. It returns the top 6–10 unique markers matched from `GOAL_MARKER_MAP` whose `keyword` appears (case-insensitive, word-boundary) in `profile.goals` OR `profile.conditions`. If fewer than 6 markers match, a stable foundation fallback set (ApoB, fasting insulin, ferritin, vitamin D, hsCRP, TSH) fills the gap to 6 — with a generic "a foundational marker most standard panels skip" reason. If `panels.length > 0` (any panel exists), the function returns `[]`. Pure: no DOM, no Dexie, no network, no LLM. Asserted by passing a profile with known goals/conditions and confirming the returned list size, order, and contents; passing a profile with `panels.length > 0` returns empty.
- [ ] The Today page (`src/pages/today.ts`) renders a "Start with the right panel" card ONLY when `computeStartPanel(...)` is non-empty (i.e. the user has zero panels). The card shows the eyebrow "Start with the right panel," a one-line lede ("Markers worth asking your doctor for, picked from what you wrote down."), and the 6–10 marker rows — each row showing the marker's display name and its `reason`. Asserted by seeding a profile with goals "more energy, lower heart risk" and zero panels, and confirming the card renders with the expected markers and reasons.
- [ ] The card is ABSENT when the user has ANY panel (manual or extracted). Asserted by seeding a profile + one panel and confirming the card does not render.
- [ ] The card is ABSENT before onboarding completes (profile is the default empty profile). Asserted by visiting Today with no profile and confirming the card does not render.
- [ ] The card includes a "Copy as text" action that copies a plain-text version of the list to the clipboard — one marker per line in the format `<name> — <reason>`, prefixed with a one-line header ("Markers worth asking my doctor about — from Almanac.") and no trailing footer. The clipboard payload contains NO profile name, NO email, NO API key, and NO URL with a tracking parameter. Asserted by tapping the action, reading clipboard contents via `page.evaluate(() => navigator.clipboard.readText())`, and confirming the structure and absence of personal data.
- [ ] Marker name resolution uses `findMarker()` so sex-specific keys (e.g. `ferritin_m` for a male profile) render the human name, not the suffixed key. Asserted by setting profile sex to male, confirming ferritin appears as "Ferritin" (or the sex-specific display name the rest of the app uses) and the raw key never appears in the rendered card or the copy payload.
- [ ] The card and its copy action make **zero Anthropic calls** and **zero network calls** — it is a pure render over `GOAL_MARKER_MAP`, `MARKERS[]`, and the profile's already-on-device intake strings. Asserted by visiting Today on an onboarded-but-empty profile, tapping copy, and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the card, the copy payload, or any intermediate string. Asserted by seeding a sentinel key on the profile and confirming it appears nowhere in the card render or the clipboard text.
- [ ] Tour mode (0014) renders the card against the tour fixture's profile state when the fixture has no panels; if the tour fixture is shaped with panels (the read-only demo), the card is absent — exactly as for a live user with panels. Shared-view mode (0017) does NOT render the card. Asserted in both modes.
- [ ] Renders on both **chromium and mobile-webkit**. The card wraps cleanly at the 390 px viewport, the "Copy as text" action is a ≥44×44 css px tap target (min-height ≥45 px per the sub-pixel lesson in `docs/LESSONS.md`), and long marker names / reason strings respect `min-width: 0`. Asserted on both projects.
- [ ] The existing Today surfaces — meals, habit stack, streak strip, retest/quiet-day/pre-draw cards — are unchanged in behavior; the start-panel card is purely additive (positioned above the meals, since "what to do next" precedes "what to do today" for a user with no labs). Asserted by exercising the existing Today flow on a profile WITH panels and confirming it is unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is a local render with no inference; no new hostnames.
- [ ] Schema migration: **no** — the card reads the existing `Profile` and `Panel` stores. Nothing new is persisted.
- [ ] New `tests/e2e/start-panel.spec.ts` covers: the constant validates (every key resolves, every reason non-empty), `computeStartPanel` returns 6–10 markers for known goals/conditions, the fallback fills to 6 when no keywords match, the function returns `[]` once a panel exists, the card renders only on an onboarded-empty profile, the card disappears after a panel is added, the copy action emits the documented plain-text format with no personal data, the key never appears (sentinel), zero Anthropic + zero network, sex-specific resolution, tour vs shared-view behavior, the existing Today flow unchanged on a profile-with-panels, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM call to generate the list, the reasons, or the copy payload. The mapping is a static curated constant; the reasons are curated strings; the copy is built from those strings. No inference at render time, no new Anthropic call.
- A new persisted `recommendedPanel` store or per-user customization of the list. The card is a render-time read over `GOAL_MARKER_MAP` and the profile's intake strings. No Dexie schema change.
- A "schedule the appointment" affordance, a `mailto:` to a clinic, or any contact-form interaction. The product hands the user a defensible list; the act of taking it to a doctor is the user's.
- Generating a PDF or .ics from the start panel. The copy-as-text action is the universal handoff; a PDF belongs to the coach packet (0048) and the printable protocol (0010), not to this card.
- Cross-referencing the start-panel list against insurance, lab-vendor pricing, or any third-party service. Pure local recommendation grounded in the curated map.
- Carrying the start panel into the doctor PDF (0010/0016), the share link (0017), the Markdown export (0027), or the coach packet (0048). It is an in-app, empty-state acquisition card, not an export artifact.
- A separate route or sub-page for the recommendation. The card lives on Today; multiplying routes for a one-time-use card adds navigation surface for no gain.
- Surfacing the card to users who already have a panel. That is exactly what the coverage-gaps card (0052) does. This card fires ONLY when `panels.length === 0` and goes away the moment a panel exists.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/onboarding/start-panel.ts` (new) — `GOAL_MARKER_MAP` constant + `computeStartPanel(profile, panels)`. The keyword match uses a case-insensitive word-boundary regex against the concatenation of `profile.goals` and `profile.conditions`. Order preserved from `GOAL_MARKER_MAP`; duplicates removed by `markerKey`. Returns `[]` when `panels.length > 0`. Pure; no Dexie import.
- `src/pages/today.ts` — read the existing profile and panel list (the page already reads both for the streak strip and meals); when `computeStartPanel(...)` returns non-empty, render the card above the meals. Wire the "Copy as text" action through the same on-device clipboard mechanism the shareable-link (0017) surfaces use.
- `src/data/markers.ts` — read-only. `findMarker()` resolves human names (and sex-specific keys) for the card and the copy payload.
- `src/types.ts` — no new persistent types; an internal `StartPanelRow` type lives in `start-panel.ts`.
- `src/styles.css` — `.start-panel` (the card), reusing the existing Today-card idioms. The "Copy as text" action: min-height ≥45 px. No new colors; ink and ink-soft.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate with `!isSharedView()`; in tour mode, follow the fixture's panel state.
- `tests/helpers/flows.ts` — extend `onboard()` to optionally accept `goals` / `conditions` strings for the spec's keyword-match scenarios; default empty preserves all existing callers.
- `tests/e2e/start-panel.spec.ts` (new) — every acceptance bullet maps to a `test()`.
- `tests/e2e/privacy.spec.ts` — extend with an onboarded-empty Today visit + copy, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: eyebrow "Start with the right panel"; lede "Markers worth asking your doctor for, picked from what you wrote down."; each row "<Name> — <reason>." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

---
id: 0060
title: Your first marker explained — a pre-key demo that picks one marker, shows the functional-range gap and a worked sample trend, before any signup
status: proposed
priority: P1
area: growth
created: 2026-05-25
owner: gtm-innovation
---

## User story

As a prospect who landed on the welcome screen from a friend's link and has not decided whether to trust this app yet, I want to tap one marker I actually care about — ferritin, ApoB, fasting insulin — and immediately see a single clean screen that explains it: where the lab says "normal," where the functional optimum sits, the gap between them, and a worked sample trend showing how a number like mine might move over three draws — so that I understand *what this product would do for me* from one tap, before I paste a key, set up a profile, or upload a single lab.

## Why now (four lenses)

### Product Owner

The reference (0038, shipped) lets a prospect *browse* the whole marker library as a table — it proves the curation is serious. The sandbox (0040/0055, shipped) lets a prospect *score their own number* against the optimum. Both are real wins, but neither does the one thing that converts the skimmer: take a single marker and show, end to end, the product's whole thesis on one screen — the normal-versus-optimal gap, the plain-English "what this affects," and crucially a *worked sample trend* that shows the number moving across draws, which is the artifact a prospect cannot get from a static table or a one-shot score. The smallest meaningful unit of value is a pre-consent route (`#/explain` or `#/explain/:key`) reachable from welcome, beside the reference and the tour: the prospect picks (or is handed) one high-traffic marker, and the screen renders its dual ranges with the gap drawn between them, its curated `description`, and a *deterministic, clearly-labeled sample trend* (canned illustrative values, not the user's data and not invented per-load) using the existing sparkline + functional-range band. One marker, one screen, the entire pitch — no key, no profile, no network. It is the demo the reference and the sandbox each only half-deliver.

### Stakeholder

This is the sharpest top-of-funnel expression of the product's three differentiators at once, before the user has risked anything: the **functional-range DB** (the dual ranges and the gap), the **structured artifact** (a real trend chart, not prose), and the **insight framing** (why the optimum is tighter than the lab floor) — composed into the single screen a skeptic decides on. A chat box cannot show you a marker's functional band with a worked trend against it; it gives a paragraph. The screen is the most forwardable artifact the funnel has after the reference, and it is *more* forwardable than the reference because it is one marker, one image, immediately legible — the kind of thing the persona screenshots into a group chat with "this is the gap between 'normal' and 'optimal' for ferritin." It deepens the moat it advertises: every prospect who taps through has now seen, on one screen, the exact thing the wrapper cannot fake — and it carries nothing personal, so it is shareable as a plain URL fragment with no privacy cost.

### User (at 7am on the phone)

A friend texted me a link. I am on the welcome screen, half-deciding whether to bother. Beside "see a sample" and "read the reference" there is "Explain one marker." I tap it and pick ferritin — the one my last panel called "normal" at 30. The screen draws it for me: the lab range stretched out, the tighter functional band marked inside it, the gap between them shaded so I can *see* that 30 sits in the lab's "fine" but below where I would want it. A sentence on what ferritin actually does. And a small worked trend — a sample of how a number can climb 24 → 30 → 48 across three draws — so I get, in one glance, what tracking this would look like. I have pasted nothing, made no account, uploaded nothing. But I now know exactly what this app is for, and *that* is what makes me go set it up. It rendered instantly, offline, because the marker and the sample trend ship in the bundle — nothing fetched, nothing sent.

### Growth

This is a pure top-of-funnel acquisition surface aimed at the moment of decision, and it produces the single most legible "show me" screenshot the product has for the cold prospect. (Hypothesis: a one-tap, one-marker explainer with a worked sample trend converts welcome-screen visitors to onboarding at a higher rate than the reference table or the sandbox alone, because it compresses the entire value proposition — the gap, the meaning, the trend — into one screen the prospect grasps in seconds, rather than asking them to browse a table or type a number; and it is the most forwardable artifact in the funnel because it is one image carrying nothing personal; back-of-envelope from how single-concept "aha" demos outconvert browse-the-catalog demos for cold technical audiences; treat as untested without remote analytics, which we will never add.) The "show me" frame is the screen itself: "look — this is what 'normal but not optimal' looks like for ferritin, with a trend" is exactly the line the persona sends the friend with the same dismissed lab. It is the convert-the-skimmer sibling of the reference (0038): the reference is the whole library for the reader; this is one marker, fully worked, for the deciding prospect.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] A new read-only route `#/explain` (and `#/explain/:key` for a deep link to one marker) is registered in `src/main.ts` and sits ABOVE the consent + profile gates — the same gate-bypass the sample tour (0014) and reference (0038) already use — so a first-time visitor with no consent and no profile reaches it. Asserted by visiting `#/explain` on a fresh browser (no consent, no profile) and confirming the explainer renders.
- [ ] `src/pages/explain.ts` (new) exports `renderExplain(key?: string)`. With no key it shows a small picker of a curated short list of high-traffic markers (e.g. ferritin, ApoB, fasting insulin, vitamin D, hs-CRP, HbA1c — a defined constant); tapping one renders that marker's explainer (and updates the hash to `#/explain/:key`). Pure render of static bundle data: no Dexie, no key, no network. Asserted by visiting `#/explain`, tapping a picker entry, and confirming the explainer for that marker renders and the hash updates.
- [ ] The explainer for a marker shows, distinctly: the display name + unit, the lab range, the tighter functional/optimal range, and a visibly-drawn GAP between them (the normal-versus-optimal thesis), reusing the existing `src/viz.ts` functional-range band/thermometer idiom. Asserted by opening a marker whose ranges differ and confirming both ranges and the gap render distinctly.
- [ ] The explainer renders the marker's curated `description` verbatim from `src/data/markers.ts` (the plain-English "what this affects" line). Asserted by confirming the rendered explainer contains the marker's `description` string.
- [ ] The explainer renders a clearly-LABELED sample trend — a deterministic, canned illustrative series defined as a constant per marker in the explainer module (NOT the user's data, NOT randomized per load), drawn with the existing `src/viz.ts` sparkline against the functional-range band, and captioned as a sample (e.g. "A sample trend, to show what tracking looks like — not your data."). Asserted by confirming the sample trend renders for a marker and the same series renders on reload (deterministic), and that the "sample / not your data" caption is present.
- [ ] `#/explain/:key` deep-links straight to one marker's explainer (skipping the picker), for a forwardable per-marker URL. An unknown/stale `:key` falls back to the picker (no crash). Asserted by visiting `#/explain/ferritin` (renders ferritin) and `#/explain/notamarker` (falls back to the picker).
- [ ] The explainer is reachable from the welcome / consent screen (`src/pages/welcome.ts`) via a restrained "Explain one marker" link beside the existing sample-tour and reference entry points. Asserted by tapping the link from welcome and landing on `#/explain`.
- [ ] The explainer makes **zero Anthropic calls** and **zero network calls** — it is a pure render of `MARKERS[]` and the canned sample series, both shipped in the bundle. Asserted by rendering several markers' explainers and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears on the explainer or in any intermediate string — and because the route is pre-consent there is no key or profile to read; the explainer reads no IndexedDB at all. Asserted by seeding a sentinel key, visiting `#/explain`, and confirming the key appears nowhere (and that the page renders identically whether or not a key/profile exists).
- [ ] Ranges render honestly when one bound is open (open-high "≤ N", open-low "≥ N", closed "low–high"), consistent with the reference (0038) treatment. Asserted across one open-high, one open-low, and one closed-range marker.
- [ ] Renders on both **chromium and mobile-webkit**: the explainer and its trend fit the 390 px viewport; the picker entries and any close/back affordance are ≥44×44 css px tap targets (min-height ≥45 px per the 0017 sub-pixel lesson); long marker names / descriptions respect `min-width: 0`. Asserted on both projects.
- [ ] The existing welcome screen, consent gate, sample tour (0014), and reference (0038) are unchanged in behavior — the explainer link and route are purely additive and the gate is NOT weakened (no new path into the gated app). Asserted by confirming the consent gate still blocks the gated routes and the existing pre-consent surfaces still work.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the explainer is a pre-consent static render; no new hostnames.
- [ ] Schema migration: **no** — the explainer reads no stored data; the marker library and the sample series are code.
- [ ] New `tests/e2e/explain.spec.ts` covers: the route renders pre-consent, the picker → marker flow updates the hash, both ranges + the gap render, the description renders verbatim, the labeled deterministic sample trend renders (and is stable on reload), the `:key` deep link and the unknown-key fallback, the welcome link, zero Anthropic + zero network, the key/profile never read, open-bound range rendering, the gate not weakened, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM call to explain the marker or to generate the trend. The explanation is the curated static `description`; the sample trend is a fixed, canned constant. No inference, no Anthropic call, no per-load randomization. The whole value is being instant, deterministic, and pre-key.
- Scoring the prospect's OWN typed number against the optimum on this surface — that is the sandbox (0040/0055). The explainer shows a *sample* trend to illustrate the product; it does not ask for or persist the user's value. (Linking from the explainer to the sandbox is a fine, small affordance if trivial; building the scoring here is not.)
- Browsing the whole library as a table — that is the reference (0038). The explainer is one marker, fully worked, with a trend; it is the focused complement, not a re-skin of the reference.
- A new charting dependency for the sample trend. Reuse the existing `src/viz.ts` sparkline + functional-range band helpers exactly as Progress and the reference do.
- Persisting which marker the prospect viewed, or any pre-consent state to IndexedDB. The route reads and writes nothing to storage; it is a pure render. (The hash carries the marker key; nothing else.)
- Carrying the explainer into the gated app's Progress/Plan surfaces — the in-app per-marker reference is its own ticket (0059, the marker deep-dive). This is the pre-consent acquisition cousin of that surface, not a replacement for it.
- Authoring rich new prose per marker. Reuse the existing `description`. The curated short picker list is ~6 high-traffic markers, not the whole library.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/main.ts` — register `#/explain` and `#/explain/:key` ABOVE the consent/profile gates, mirroring exactly how 0014 (sample tour) and 0038 (reference) are gate-bypassed. Do NOT add any path into the gated app.
- `src/pages/explain.ts` (new) — `renderExplain(key?)`. Define `EXPLAIN_MARKERS: string[]` (the ~6 high-traffic picker keys, each must resolve via `findMarker()` — add a guard/test) and `SAMPLE_TRENDS: Record<string, number[]>` (a deterministic illustrative series per picker marker, captioned as a sample). Resolve the marker via `findMarker(key)`; render name/unit/lab range/functional range + the gap via the `src/viz.ts` band/thermometer, the `description` verbatim, and the sample trend via the `src/viz.ts` sparkline against the band. No Dexie import, no `claude.ts` import.
- `src/pages/welcome.ts` — add a restrained "Explain one marker" link beside the existing sample-tour and reference links. Match their copy register (declarative, no exclamation).
- `src/data/markers.ts` — read-only. `findMarker()` resolves the picker keys and supplies ranges + `description`. No change to the marker DB.
- `src/viz.ts` — read-only reuse of the existing sparkline + functional-range band/thermometer helpers (the same primitives the reference 0038 and Progress use). Do not add a new viz primitive or a charting dep.
- `src/styles.css` — `.explain` (the page), `.explain__picker`, `.explain__marker`, reusing the reference/editorial section idioms and the existing band/sparkline styles. No new colors; ink, ink-soft, oxblood for the functional band only. Tap targets ≥44×44 (`box-sizing: border-box; min-height: 45px`). Grid children `min-width: 0`.
- `tests/e2e/explain.spec.ts` (new) — every acceptance bullet maps to a `test()`. The pre-consent test visits `#/explain` on a fresh context (no `acknowledgeConsent`) and asserts it renders; the deep-link test visits `#/explain/ferritin`; the deterministic-trend test asserts the sample series is identical across a reload.
- `tests/e2e/privacy.spec.ts` — extend with a pre-consent visit to `#/explain` confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** (reads no stored data).
- Voice spec: the link reads "Explain one marker"; the page headers read plainly — the marker name, "Lab range", "Functional optimum", "A sample trend". The trend caption reads "A sample trend, to show what tracking looks like — not your data." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood for the functional band only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

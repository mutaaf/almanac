---
id: 0062
title: The insight library — a browsable reference of every cross-marker rule the engine checks, with the rules that fired for you highlighted
status: proposed
priority: P2
area: plan
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a privacy-conscious prospect who wants to know what the app actually *does* before I hand it my labs and my key, AND as a current user who wants to read what patterns the engine watches for beyond the one or two that fired for me, I want a static "Insight library" page that lists every cross-marker rule the engine checks — its plain-English description, the markers it watches, and its confidence level — with the rules that fired against my own panels marked, so that the curation that's currently invisible until a rule happens to fire becomes the thing I can scroll through, evaluate, and trust *before* I ever pay for a token.

## Why now (four lenses)

### Product Owner

The programmatic insight engine (`src/insights.ts`) is the moat that a wrapper most obviously cannot reproduce: a curated, versioned set of cross-marker rules — currently 6 pattern rules in `RULES[]` plus 4 trend rules in `TREND_RULES[]`, with room to grow toward the 20+ the curation backlog targets — each carrying an `id`, a `description`, a `markers: string[]` watch-list, a `confidence` level, and the deterministic logic that decides whether the pattern is hit. Today, that curation is *invisible until it fires*: a user sees the rules that triggered on their panels, and nothing more. There is no surface that reads the engine's whole vocabulary back to anyone — not to a prospect deciding whether to trust the app, not to a returning user wondering "what else does this watch for?" The smallest meaningful unit of value is a static "Insight library" route — `#/insights` — that iterates over `RULES[]` and `TREND_RULES[]` (already exported), rendering one card per rule with the `id`, the `description`, the `markers[]` resolved to human names via `findMarker`, the `confidence`, and a one-line plain-English statement of the pattern. Rules that fired against the most recent panel(s) get a small "matched your panel" accent. No LLM call, no new content authored at render time — a pure render over a code-typed rule array that the engine itself already enforces coverage of via the type system. The route is reachable from Settings (a "Reference" / "What the engine watches" link) and from the Plan page's insight section (a "see every pattern" footer link).

### Stakeholder

This is one of the cleanest **moat-deepening** plays available because it makes the curation itself the artifact — and curation is exactly what a general-purpose LLM does not produce on demand. A chat box, asked "what cross-marker patterns are concerning?" will improvise something plausible-sounding and different every session. The insight library is the opposite: a fixed, dated, versioned vocabulary the user can browse and rely on, which is the trust posture the README's anti-wrapper argument already trades on. The growth half of the moat is the *pre-key* read: a prospect can land on `#/insights` (no consent required, the same posture as the 0038 marker reference and the 0014 tour) and read what the engine watches before they trust the app with a draw — turning the engine's intellectual property from an after-the-fact discovery into a pre-conversion proof point. The retention half is the *post-key* read: a returning user who sees only the rules that fired against their own panels can scroll the whole library, see the rules they would WANT to trip (e.g. "great — the inflammation triad didn't fire"), and converge on 0039's "what we ruled out" thesis ahead of when 0039 ships. It deepens the lock-in because the more the user reads their own panels against the engine's whole rule set, the more the app is the place that holds *both halves* of the picture — the user's data AND the curated lens that interprets it.

### User (at 7am on the phone)

I tap "Reference" in Settings and see a list — "Insight library." I scroll. Each card is one rule: "Atherogenic dyslipidemia — high LDL-P with low HDL and elevated triglycerides — confidence: high — watches: LDL-P, HDL, triglycerides." A subtle marker against the cards that fired for me on my last draw. The cards I haven't tripped sit there calmly, no red, no warning — just the engine telling me what it watches for. I scroll past a dozen. Some I recognize from my plan, some I don't. None of it is a chat answer; it's the same rule every time I look. I can read the whole library on the train. No spinner, no key, no spend — it shipped with the app.

### Growth

This is a hybrid acquisition + moat-transparency ticket, with the acquisition half doing more work. The pre-key audience is the privacy-conscious prospect who has read about the app and now wants to *audit* it before installing the key. (Hypothesis: a static, pre-consent insight library raises conversion among prospects who read the README, the marker reference (0038), and the tour (0014) and still want to inspect the engine's actual rules before they trust the app — because "the app watches for these specific patterns" is a stronger trust signal than "the app has an insight engine"; back-of-envelope from how technical-prospect conversion lifts when the differentiated IP is browsable rather than hidden behind a paywall; treat as untested without remote analytics, which we will never add.) The "show me" frame is a single screenshot: a scrolling list of cards, each one rule, each carrying a clear name + the watched markers + a confidence chip. That screenshot is exactly what the persona forwards to the friend who said "another health app, sure" — because the moment the friend reads three rule cards, they know this is not a wrapper. It is the engine-half sibling of the marker reference (0038): that exposes the curated marker DB before the key; this exposes the curated rule set before the key.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/insights/library.ts` (new) exports `buildInsightLibrary(latestPanels: Panel[]): LibraryEntry[]` that iterates the existing exports of `RULES[]` and `TREND_RULES[]` from `src/insights.ts` and returns one entry per rule with: `id`, `category: "pattern" | "trend"`, `description`, `markerKeys: string[]`, `markerNames: string[]` (resolved via `findMarker`), `confidence`, `summary` (a one-line plain-English statement — derived from the rule's existing `description` or `summary` field; the dev confirms which field the rule actually carries). Each entry includes `matched: boolean` set to true when the rule's `id` appears in the insights computed against `latestPanels` via the existing `evaluateInsights(...)` pipeline (or whatever the public eval entry point is named). Pure: no DOM, no Dexie write, no network — the eval IS the same in-process function the Plan page already calls. Asserted by passing known panels and confirming the entry list size, ordering, and the `matched` flags.
- [ ] A new route `#/insights` (registered in `src/main.ts`) renders the Insight library page (`src/pages/insights-library.ts`). Asserted by visiting the route and confirming the page renders.
- [ ] The page is reachable pre-consent and pre-key — it does NOT require the consent gate or the API key, the same posture as the 0038 marker reference and the 0014 tour. Asserted by visiting `#/insights` from a fresh profile (no key, no consent) and confirming the page renders.
- [ ] The page lists EVERY rule in `RULES[]` and `TREND_RULES[]` — one card per rule. The card shows: the rule's human title (derived from `id` or an explicit `title` field — the dev confirms), the `description`, the watched markers as resolved human names, the `category` ("pattern" / "trend"), and the `confidence`. Asserted by counting the rendered cards against `RULES.length + TREND_RULES.length` and spot-checking the field rendering on known rules (`atherogenic_dyslipidemia`, `inflammation_triad`, `trending_up_a1c`).
- [ ] Rules that fired against the user's most recent panel(s) render with a "matched your panel" accent (a small chip or an accent border). Rules that did not fire render in the neutral state. Asserted by seeding panels whose values trip a known rule and confirming the matched card is accented while the unmatched cards are not.
- [ ] When the user has no panels (pre-key prospect), every card renders in the neutral state and the page shows a short header line — "Browsing the library — sign in with a key to see which patterns match your panels." Asserted on a fresh profile.
- [ ] A Plan page footer link reads "See every pattern the engine watches" and navigates to `#/insights`. Asserted by tapping the link from the Plan page and confirming the navigation.
- [ ] A Settings link reads "Insight library" (or "What the engine watches" — the dev picks one and documents it) and navigates to `#/insights`. Asserted by tapping the link from Settings and confirming the navigation.
- [ ] The page makes **zero Anthropic calls** and **zero network calls** — it is a pure render over the code-typed `RULES[]` / `TREND_RULES[]` arrays plus the local panels. Asserted by visiting the page across pre-key and post-key states and confirming the mock recorded zero requests.
- [ ] The Anthropic key NEVER appears in the library page or any intermediate string. Asserted by seeding a sentinel key and confirming the key appears nowhere in the rendered library.
- [ ] Renders on both **chromium and mobile-webkit**. Each card fits the 390 px viewport, the cards stack vertically without horizontal overflow, the matched-accent affordance has sufficient contrast in both ink and oxblood, and long marker name lists wrap with `min-width: 0`. Asserted on both projects.
- [ ] Tour mode (0014) renders the library against the tour fixture panels (matched-state reflects the fixture rules). Shared-view mode (0017) renders the library in the neutral state (the shared view has no real panels). Asserted in both modes.
- [ ] The existing Plan page insight section (0013 "why this fired" provenance) is unchanged in behavior — the library is a sibling reference, not a replacement. Asserted by visiting the Plan page, confirming the insight provenance still renders, and confirming the new "see every pattern" link is purely additive.
- [ ] Adding a new rule to `RULES[]` or `TREND_RULES[]` in code makes it appear automatically on the library page on next render — no second registry to update. (This is enforced structurally by `buildInsightLibrary` iterating the source arrays directly.) Asserted by a unit-level test that the rule count rendered equals `RULES.length + TREND_RULES.length` at all times.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the library is a local render with no inference; no new hostnames.
- [ ] Schema migration: **no** — `RULES[]` and `TREND_RULES[]` are code, not stored. The library does not persist anything.
- [ ] New `tests/e2e/insight-library.spec.ts` covers: `buildInsightLibrary` returns one entry per rule with the documented fields, the route renders pre-consent, the route renders pre-key, the matched accent fires for a seeded panel that trips a known rule, the matched accent does NOT fire for unmatched rules, the Plan footer link navigates, the Settings link navigates, tour/shared-view behavior, zero Anthropic + zero network, the key never appears (sentinel), mobile rendering, the existing Plan insight provenance unchanged.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM call to generate the per-rule plain-English summary, the watched-marker explanation, or the matched-state interpretation. The library renders the existing `description` (and any one-line summary field already on the rule) verbatim. If the rule data needs a one-line `summary` field added in `src/insights.ts`, that is a static code change — NOT an inference call.
- A user-authored rule entry surface on this page. Authoring custom rules is the territory of 0022 (the user-authored insight rules with citations ticket); this page is read-only over the curated `RULES[]` / `TREND_RULES[]`.
- A "pin / snooze / dismiss" affordance per rule. That is the insight-stance ticket (0023). The library is browse-only.
- A search box, filter chips, or category tabs across the rule list. The smallest meaningful unit is a scrolling list; filtering can come later if the list ever grows past the comfortable scroll length.
- Carrying the library into the doctor PDF (0010/0016), the share link (0017), the Markdown export (0027), or the coach packet (0048). The library is an in-app and pre-key web surface, not an export artifact.
- A clinical-disclaimer modal on the page. The existing global disclaimer posture (informational, not medical advice — already encoded in the plan and the marker reference) covers the library.
- Editing or hiding curated rules from the Settings UI. The library is read-only over code. Curation discipline lives in the codebase, not in a user-facing toggle.
- Surfacing the library from Today or Labs. It is a Plan-area reference reachable from Settings and the Plan page's insight section; no other entry point this ticket.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/insights/library.ts` (new) — `buildInsightLibrary(latestPanels)`. Import `RULES` and `TREND_RULES` (already exported by `src/insights.ts`) and the canonical evaluation entry point (the function the Plan page already calls — the dev confirms its name in `src/insights.ts`; today the engine's category strings are `"pattern"` and `"trend"`, so the entry's `category` field mirrors those). Resolve `markers[]` to human names via `findMarker` from `src/data/markers.ts`. Compute `matched` by checking whether each rule's `id` appears in the evaluation output for the supplied panels; treat the empty-panel case as `matched: false` for every rule. Pure; no DOM, no Dexie.
- `src/insights.ts` — read-only for `RULES[]`, `TREND_RULES[]`, and the existing public evaluation function. If a rule lacks an explicit one-line `summary` field and the dev decides to add one, that is an additive change to the rule shape (a new optional field on the rule type) — DOC the choice in the implementation log and do NOT change the runtime logic.
- `src/pages/insights-library.ts` (new) — render the library page. Header line ("Browsing the library — sign in with a key to see which patterns match your panels.") gated on whether the user has any panels. One card per entry; cards rendered as a vertical list. Matched cards get an accent class.
- `src/main.ts` — register the `#/insights` route. The route does NOT pass through the consent gate (same posture as the 0038 marker reference and the 0014 tour entries). Document the chosen guard explicitly in the route registration.
- `src/pages/plan.ts` — append a footer link in the insight section: "See every pattern the engine watches" → `#/insights`. Do NOT alter the existing 0013 provenance rendering.
- `src/pages/settings.ts` — add an "Insight library" (or "What the engine watches") link in the Reference section, alongside the marker reference link if one exists. One link, one navigation.
- `src/types.ts` — `LibraryEntry` (the return type of `buildInsightLibrary`) lives in `src/insights/library.ts`; no new persistent type. If a `summary?: string` field is added to the rule shape in `src/insights.ts`, document the optional-ness.
- `src/styles.css` — `.insight-library`, `.insight-library__card`, `.insight-library__matched`, reusing the 0038 reference-card idioms. Cards are ink/ink-soft; the matched accent uses the existing oxblood accent at low chroma (a chip or a left border, not a full background). Grid children `min-width: 0`. No new colors beyond the existing palette.
- `src/sample/state.ts` / `src/share/shared-state.ts` — tour renders the library against the tour fixture's panels; shared-view renders the library in the neutral (no-panels) state.
- `tests/helpers/flows.ts` — reuse `seedPanel` so a spec can trip a known rule deterministically. Add `expectInsightLibraryMatched(page, ruleId)` if a small helper saves repetition.
- `tests/e2e/insight-library.spec.ts` (new) — every acceptance bullet maps to a `test()`. The build test passes a known panel and asserts the entries + matched flags; the route tests visit `#/insights` from pre-consent and pre-key states and assert render; the matched-accent test seeds a panel that trips `atherogenic_dyslipidemia` (or a comparable rule) and asserts the accent on that card and no accent on a known-unmatched card.
- `tests/e2e/privacy.spec.ts` — extend with a visit to `#/insights`, confirming zero off-allow-list egress and zero Anthropic calls.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** — the library renders code-typed rules and local panels.
- Voice spec: the page header reads "Insight library — what the engine watches for." (or a documented variant). Each card title is the rule's human name; the description renders verbatim from the rule's existing `description`. Matched-card accent reads "matches your panel" as a small chip. Declarative, no exclamation, no marketing inflection. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft; oxblood reserved for the matched accent at low chroma.

## Implementation log

(Appended by the implementation-dev agent during execution.)

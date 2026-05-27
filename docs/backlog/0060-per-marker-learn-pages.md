---
id: 0060
title: The marker learn page — a static, search-anchored landing per marker that becomes the front door for the prospect who Googled their lab value
status: groomed
priority: P1
area: growth
created: 2026-05-27
owner: gtm-innovation
---

## User story

As a precision-health-literate prospect who just typed "what is the functional range for ferritin" into a search engine, I want the top result to be a clean Almanac page at `/learn/ferritin` that gives me the lab range and the tighter functional optimum, a plain-English note on what ferritin affects and what moves it, the kinds of cross-marker patterns Almanac's engine actually checks involving ferritin, and a single restrained way to bring my own number into the app — so that I find Almanac the way the persona already searches for biology, evaluate the curation on its own terms before any account, and convert from "stranger reading a reference" to "user pasting their first value" in one tap, all without me ever consenting to a backend that doesn't exist.

## Why now (four lenses)

### Product Owner

The reference (0038, shipped) made the whole curated marker DB legible pre-consent — but it is one scrollable page reachable from the welcome screen, and its URL is `/#/reference`, which no search engine indexes well. The persona's actual search behaviour is "what is my ferritin level mean" / "ferritin 28 normal" / "ApoB target functional medicine," and the answer should be Almanac. The smallest meaningful unit of value is a per-marker static landing page — one HTML file per curated marker, pre-rendered at build time from `MARKERS[]`, served at `/learn/<key>` with a real `<title>`, a real `<meta name="description">`, a real `<h1>`, and crawlable body content — so a search engine can index the marker by name, the lab range, the functional optimum, and the curated description. The page links into `#/try` (the sandbox) seeded with the marker so the prospect can score their own value in one tap, and links sideways to a handful of related markers so the engine can discover the rest of the reference. Generation is a build-time loop over `MARKERS[]`; runtime is unchanged — every page is the same SPA bundle, hydrated client-side, with the marker-specific HTML used as the initial paint. No new runtime route, no backend, no new egress.

### Stakeholder

This is the **functional-range DB** moat made *findable*. Every curated marker becomes a public, crawlable page, with the same dual-range honesty the in-app reference shows; over time, search ranking accumulates against the canonical marker name, and Almanac becomes the place a literate searcher lands. A chat wrapper structurally cannot do this — it has no curated content body, no per-marker page worth indexing, and no static artifact to publish; the search engine sees nothing. The pages also pull the **insight engine** moat into the open: each marker page lists the cross-marker patterns from `src/insights.ts` that involve this marker by name (e.g. ferritin's iron-restricted erythropoiesis with CBC + iron studies), so a prospect sees the reasoning Almanac actually performs, not just the range. And it deepens the existing free, pre-consent surfaces (0038 reference, 0040/0055 sandbox, 0014 tour) into a top-of-funnel network: the learn page sends to the sandbox, the sandbox sends to the welcome, the welcome sends to the tour, the tour ends at consent. The knowledge keeps doing the marketing.

### User (at 7am on the phone)

A friend sent me a link, or I Googled my own ferritin number. I land on `/learn/ferritin`. The title is "Ferritin — functional range, what it affects, and how to read your number." Above the fold I see two ranges side by side: the lab range (15–200 ng/mL) and the tighter functional optimum (50–150 ng/mL), with one calm line on why the optimum is tighter. Below that, the description I'd find in a careful textbook — what ferritin reflects, why low-normal often masks iron-restricted blood cell formation. Below that, a short list of the cross-marker patterns the app actually checks ("iron-restricted erythropoiesis: ferritin under 50 alongside high-normal RDW and low-normal MCV"). At the bottom, one restrained line: "Score your own ferritin in the sandbox" — one tap, no signup, no key — and a small footer linking sideways to TSAT, transferrin, and hemoglobin so I keep reading. The page renders instantly because it's one static HTML file; nothing called the network for content. I can send it to a friend with the same complaint and they don't have to install anything to read it.

### Growth

This is the highest-leverage acquisition primitive the product can build under its constraints, and the only one that captures intent at the search layer. (Hypothesis: per-marker static landing pages compound rank for canonical marker names over months without any paid acquisition spend; a literate prospect who lands on a clean, dual-range, citation-honest page is more likely to score their own value in the sandbox than a prospect who arrives at a generic landing page, because the page solved their actual question before asking for anything; back-of-envelope from how marker-name searches dominate health-curious query patterns for the Attia/Patrick persona; treat as untested without remote analytics, which we will never add.) The "show me" frame is the page itself: "this is a clean, free, no-signup functional-range explainer for ferritin, with the patterns the app actually checks for" is exactly the link the persona forwards unprompted to the friend who is arguing with their doctor about a single marker. And it lights up the rest of the funnel: every learn page CTAs into the sandbox (0040/0055), the sandbox into onboarding (0049), the share link (0017) into adopt (0020) — the learn pages add the search-anchored entry that the existing funnel currently lacks.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] A build-time pre-render step (`scripts/prerender-learn.mjs` or a tiny Vite plugin) loops over the built-in `MARKERS[]` from `src/data/markers.ts` and emits one `dist/learn/<key>/index.html` per marker (using the marker's `key` field as the URL slug). The file contains the SPA shell, the marker-specific `<title>`, `<meta name="description">` (≤ 160 chars, built from the marker name + ranges + first sentence of `description`), an `<h1>` with the marker display name, an above-the-fold `<section data-prerender="ranges">` with the lab range and the functional optimum (formatted via the existing `formatRange` idiom), a `<section data-prerender="description">` with the verbatim `MarkerDef.description`, and a `<section data-prerender="patterns">` listing the cross-marker insight rules from `src/insights.ts` whose required markers include this marker (rule name + plain-English summary). Asserted by running the build and inspecting one emitted file for the four sections and the title/meta values for ferritin.
- [ ] `vercel.json` is updated so that paths under `/learn/*` are served as static files directly (NOT rewritten to `/index.html`) — preserving the per-marker HTML so crawlers and curl get the prerendered content, while the SPA bundle still hydrates and the in-app router handles all OTHER routes. Asserted by `curl`-style fetching `/learn/ferritin` in a Playwright `request` context and confirming the body contains the ferritin `<h1>` and the four `data-prerender` sections.
- [ ] When a real browser navigates to `/learn/<key>`, the SPA hydrates over the prerendered HTML and `src/pages/learn.ts` (new) renders the same content using `findMarker(key)` + the rule filter, plus a small footer with: (a) a single "Score your own <marker>" link routing to `#/try?marker=<key>` (the sandbox 0040 already accepts a marker preselect via its sandbox session API — wire through whatever seed mechanism it exposes), and (b) a "Related markers" row of ≤ 4 sibling markers from the same category. Asserted by visiting `/learn/ferritin`, confirming the page renders without consent (pre-gate, like 0038), the sandbox link is present and routes correctly, and the related-markers row contains markers from the same category as ferritin.
- [ ] The pre-rendered HTML loads with **zero off-allow-list egress**: no third-party scripts injected, no analytics tag, no social pixel, no remote font outside the existing `fonts.googleapis.com` / `fonts.gstatic.com` allow-list. Asserted by Privacy E2E extending to a learn-page visit and confirming the allow-list is unchanged.
- [ ] The page reads NO user data — no Dexie call, no `getProfile`, no `allPanels`. It is identical for every visitor; user state never appears in the DOM. Asserted by visiting `/learn/ferritin` with and without a profile seeded in IndexedDB and confirming the DOM render is byte-identical.
- [ ] An invalid marker key (e.g. `/learn/not-a-real-marker`) renders a calm 404-shaped page that links back to `#/reference` and to a small list of the most-searched markers (ferritin, ApoB, vitamin D, fasting insulin) — NOT a Vercel default 404. The prerender step does NOT emit a file for unknown keys; the runtime fallback handles them. Asserted by visiting an invalid key and confirming the fallback content.
- [ ] Each learn page carries the standing one-line "informational, not medical advice" disclaimer, the same line every other page carries. Asserted on one rendered page.
- [ ] Sex-specific markers (`ferritin_m` / `ferritin_f`) emit a SINGLE learn page at `/learn/ferritin` that presents both sex variants honestly ("Functional optimum: 50–150 ng/mL (men), 50–150 ng/mL (women)" or whatever the curated values are, side by side) — NOT two separate URLs. The build dedupes on the marker's display name when the underlying entries differ only by sex. Asserted by inspecting the emitted ferritin file and confirming both ranges appear.
- [ ] User-defined markers (0002) are NEVER emitted — only the curated seed in `MARKERS[]` is published. Asserted by confirming the build never emits a file for a key not present in the static seed (a user marker seeded into IndexedDB does not appear in `dist/learn/`).
- [ ] Renders on both **chromium and mobile-webkit**. The page wraps cleanly at the 390 px viewport, the dual-range cards stack on mobile without horizontal overflow, the sandbox CTA is a ≥44×44 css px tap target (min-height ≥ 45 px per the 0017 sub-pixel lesson), and long marker names / descriptions respect `min-width: 0`.
- [ ] Schema migration: **no** — the marker DB is code, the page is build-time output. Nothing is read from or written to IndexedDB.
- [ ] Egress allow-list change: **no** — pages use the existing allow-listed fonts and the same SPA bundle; no new third-party tag.
- [ ] The pre-rendered files are written under `dist/learn/<key>/index.html` and are served as `text/html` with `Content-Type` headers consistent with the rest of the build (Vercel default). Asserted via a Playwright `request.get('/learn/ferritin')` and a `content-type` header check.
- [ ] New `tests/e2e/learn-marker.spec.ts` covers: prerender contains the four sections + correct `<title>` / `<meta>` for ferritin, `curl`-style fetch of the static file (request context) returns the prerendered body, browser visit renders the page pre-consent without reading user data, sandbox CTA routes to `#/try` with the marker preselected, related-markers row pulls from the same category, sex-specific dedup, invalid-key fallback, zero off-allow-list egress, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A new backend, edge function, or server-side rendering process. The pre-render is a static build step; runtime serves files directly. No Vercel Functions, no API route.
- An analytics tag, structured event ping, or referral tracking pixel. Almanac is local-only; no third-party script lands on the learn pages. Search indexability does NOT justify adding GA/Plausible/etc.
- An LLM call to author or expand the marker content at build time. Every word on the page comes from the curated `MarkerDef.description`, the curated ranges, and the existing rule names — verbatim. No Claude inference, no content paraphrase.
- A separate marketing site, a separate build target, or a separate host. The learn pages are sibling output of the existing Vite build, deployed via the existing Vercel project.
- A user-editable / community-curated learn page per marker. The pages are read-only render of the curated seed.
- Per-marker imagery / illustrations. The editorial almanac aesthetic is type-only; no stock photos, no AI imagery, no SVG decorations beyond the existing `viz.ts` thermometer if it's helpful.
- Cross-language / i18n versions. English only at v1.
- A blog, a "latest research" section, or any time-dated content. The pages are stable reference, not dated articles.
- Carrying the learn-page content into the doctor PDF (0010/0016), the share link (0017), or any export. The pages are top-of-funnel acquisition; in-app reading is the job of 0038 (reference) and 0059 (in-app marker deep-dive).

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `scripts/prerender-learn.mjs` (new) — a tiny Node script that (a) reads the built `dist/index.html` produced by Vite, (b) imports the marker seed (compiled JS from the build, NOT TypeScript directly — the build emits a marker module; alternatively load `src/data/markers.ts` via `tsx` if simpler) and the rule list (`src/insights.ts`), (c) for each marker, injects the marker-specific `<title>`, `<meta name="description">`, the four `data-prerender` sections, and the disclaimer into the shell HTML, and (d) writes `dist/learn/<key>/index.html`. Hook into the build via `npm run build` chain (`"build": "vite build && node scripts/prerender-learn.mjs"`). Pure Node; no new npm dep — use built-in `fs`/`path` and the existing TypeScript-to-JS pipeline.
- `vercel.json` — change the catch-all rewrite to EXCLUDE `/learn/*`:
  ```
  "rewrites": [
    { "source": "/((?!learn/).*)", "destination": "/index.html" }
  ]
  ```
  so Vercel serves the prerendered files directly. Test that ALL existing in-app routes still resolve.
- `src/pages/learn.ts` (new) — `renderLearn(key: string)` for the runtime hydration / direct-visit path. Resolves the marker via `findMarker(key)`, renders the same content the prerender emitted (so first-paint server-text matches client-text), adds the sandbox CTA + related-markers footer. Pure render; no Dexie import.
- `src/main.ts` — register `/learn/:key` (path, NOT hash) as a gate-bypassed route modeled on `#/reference`. The route handler is `renderLearn(key)`; if the key is invalid, render the fallback (link back to `#/reference` + popular markers). Treat this as the first non-hash route in the app — document the precedent in the router.
- `src/pages/welcome.ts` — leave the existing "Read the marker reference" link in place; do NOT auto-add a "browse learn pages" link (the learn pages are search-anchored, not navigation-anchored, and the reference is the in-app browse surface).
- `src/data/markers.ts` — read-only. The prerender imports `MARKERS[]` and the related-category lookup; no marker DB change.
- `src/insights.ts` — read-only. The prerender filters `RULES[]` by their `requiredMarkers` (or whatever the existing structural field is) intersecting the page's marker key; reuse the same shape the in-app insight provenance (0013) uses, so the description is consistent.
- `src/styles.css` — `.learn` (the page), `.learn__ranges`, `.learn__patterns`, `.learn__cta`. Reuse the editorial type idioms; oxblood reserved for the functional-optimum band. Grid children `min-width: 0`. CTA min-height ≥ 45 px per the 0017 sub-pixel lesson.
- `src/share/sandbox-seed.ts` (or wherever 0040's sandbox accepts a preselected marker — read the file before wiring) — confirm or extend the entry point so `#/try?marker=<key>` lands on the sandbox with that marker scored row pre-rendered (or, if 0040 has no such entry point, this ticket adds a minimal one: a single optional `marker` query that pre-selects the picker; do NOT change 0040's submit / score logic).
- `tests/e2e/learn-marker.spec.ts` (new) — every acceptance bullet maps to a `test()`. The "prerendered HTML" test uses Playwright's `request` API (no browser context) to `request.get('/learn/ferritin')` and asserts the body contains the four `data-prerender` sections and the `<title>`. The browser test visits `/learn/ferritin` and asserts hydration + CTA routing. The user-data-isolation test seeds a profile + a user marker and confirms the render is byte-identical to the no-profile render.
- `tests/e2e/privacy.spec.ts` — extend with a `/learn/ferritin` visit, asserting zero off-allow-list egress and no user-data read.
- New deps: **no** — `scripts/prerender-learn.mjs` uses built-in Node modules; runtime is unchanged.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: page titles are factual ("Ferritin — functional range, what it affects, and how to read your number"); the CTA reads "Score your own <marker>" (declarative, not breathless). The disclaimer line is the standing one. Banned: "amazing," "exciting," "journey," "great." Cream + ink + editorial type; oxblood reserved for the functional-optimum band.

## Implementation log

(Appended by the implementation-dev agent during execution.)

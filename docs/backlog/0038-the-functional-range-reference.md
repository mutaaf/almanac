---
id: 0038
title: The functional-range reference — let a prospect read the marker library, with both ranges, before they trust the app with a key
status: in-progress
priority: P1
area: growth
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a precision-health-literate prospect deciding whether this app is serious — someone who knows what an ApoB is and has opinions about where ferritin should sit — I want a browsable reference of the marker library before I commit anything: every marker with its lab range, its tighter functional range, the unit, and a one-line note on why the optimum is where it is, so that I can judge the quality of the curated functional-range DB on its own terms — the way I would skim a reference book in a shop before buying it — and decide the app knows what it is talking about before I paste a key or upload a single lab.

## Why now (four lenses)

### Product Owner

The curated functional-range DB — ~70 markers carrying *both* the lab range and the tighter functional optimum, each with a defensible one-line rationale — is the most knowledge-dense moat asset in the product. It is also entirely locked behind onboarding: a prospect cannot see a single functional range until they have consented, set up a profile, and uploaded labs. The sample tour (0014) shows the *artifacts* (a sample plan, sample progress) but not the *reference* — and the reference is exactly what the literate prospect wants to evaluate, because it is the thing they could check against their own reading. The smallest meaningful unit of value is a read-only reference route (`#/reference`) that sits beside the sample tour, above the consent gate: it lists `MARKERS[]` grouped by category, each row showing name, unit, lab range, functional range, and the `description` already on every `MarkerDef`. It is a pure render of static data that ships in the bundle — no key, no labs, no profile, no network. It turns the app's deepest knowledge asset into a thing a skeptic can read before they trust it.

### Stakeholder

This makes the **functional-range DB** legible as a *body of curated knowledge* at the top of the funnel, where the literate prospect's trust is won or lost. It is the strongest possible answer to "is this a serious tool or a Claude wrapper with a nice font?" — a wrapper has no reference DB to show; Almanac has seventy markers with dual ranges and rationales it can lay open for inspection. It compounds the sample tour (0014): the tour demonstrates the *artifacts* the engine produces, the reference demonstrates the *knowledge* the engine reasons from — together they let a prospect evaluate both the output and the foundation before consenting. It also seeds a quiet acquisition surface that needs no backend: a prospect who finds the reference genuinely useful ("finally, functional ranges for free, in one place, no signup") will link it to the precision-health forum the persona lives in — and the reference, being static and pre-consent, is shareable as a plain URL fragment with nothing personal in it. The knowledge is the marketing.

### User (at 7am on the phone)

A friend sent me a link; I am on the welcome screen, deciding whether to bother. There is a "Read the marker reference" link beside the "see a sample" tour. I tap it. It opens a clean, typed reference — markers grouped by category, each with its lab range and a tighter functional range and a sentence on why. I scroll to ferritin and the functional floor is where I would put it; I scroll to fasting insulin and the 2–5 optimum is exactly the number I argue with my doctor about. This is a serious reference, not marketing copy. I have not pasted a key, uploaded anything, or made an account — I am just reading, the way I would flip through a book. By the time I have skimmed a dozen markers I trust the curation, and *that* is what makes me go set up. It works offline because the whole library ships in the app; nothing was fetched, nothing was sent.

### Growth

This is a top-of-funnel acquisition surface aimed precisely at the literate, skeptical persona who converts on substance, not pitch. (Hypothesis: a free, signup-free, well-curated functional-range reference is a higher-converting first impression for the precision-health-literate segment than the sample tour alone, because that segment trusts a reference book over a demo; and it is the most linkable artifact the product has for the forums the persona reads, since it is genuinely useful standalone and carries nothing personal — back-of-envelope from how open, free reference resources outperform gated demos for technical audiences; treat as untested without remote analytics, which we will never add.) The "show me" frame is the reference itself: "here's a clean functional-range table for 70 markers, free, no login" is a thing the persona forwards unprompted, because it solves a real problem for their friends before anyone signs up. The reference is the lowest-pressure, highest-substance front door the product can build, and it deepens the moat it advertises — every prospect who reads it has now seen the one thing the wrapper cannot fake.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] A new read-only route `#/reference` is registered in `src/main.ts` and sits ABOVE the consent + profile gates (the same gate-bypass treatment the sample tour 0014 already uses), so a first-time visitor reaches it without acknowledging consent or having a profile. Asserted by visiting `#/reference` on a fresh browser (no consent, no profile) and confirming the reference renders.
- [ ] `src/pages/reference.ts` (new) exports `renderReference()`. It reads the static `MARKERS[]` from `src/data/markers.ts` (built-in seed only — see out-of-scope on user markers), groups them by `category` in a fixed, editorial category order, and renders one section per category with one row per marker: name (and `shortName` when present), unit, lab range, functional/optimal range, and the marker's `description`. Pure render of static bundle data: no Dexie, no key, no network. Asserted by rendering the page and confirming a known marker (e.g. fasting insulin) shows its unit, lab range `2–25`, functional range `2–5`, and its description.
- [ ] Ranges render honestly when one bound is open: a marker with only a high bound (e.g. HbA1c lab range "≤ 5.6%") renders "≤ 5.6%", a low-only bound renders "≥ N", and a closed range renders "low–high". Asserted across one open-high, one open-low, and one closed-range marker.
- [ ] The reference is reachable from the welcome / consent screen (`src/pages/welcome.ts`) via a restrained "Read the marker reference" link, beside the existing sample-tour entry point. Asserted by tapping the link from welcome and landing on `#/reference`.
- [ ] The reference page carries a single, restrained "Start your own" affordance routing to `#/welcome` (which reinstates the gate) — the reference is a reading surface, not a way around onboarding. There is NO upload, NO key field, NO compose action anywhere on the page. Asserted by confirming the page exposes only the read content + the "Start your own" link, and that no write/compose control is present.
- [ ] The reference is rendered with **zero network calls** — `MARKERS[]` ships in the bundle; fonts are the existing allow-listed Google Fonts already loaded by the app shell. Asserted by rendering the page and confirming the mock recorded zero requests beyond the already-loaded shell.
- [ ] The reference reads NO user data — it never calls `getProfile()`, `allPanels()`, `latestPlan()`, or any Dexie read; it touches only the static marker module. Asserted by confirming the page renders identically with and without a profile present in IndexedDB (the reference is the same for everyone — it is the library, not the user's labs).
- [ ] The reference does NOT include user-defined markers (0002) — those are personal data behind the gate. The reference is the curated public seed only. Asserted by seeding a user marker and confirming it does NOT appear on `#/reference` (which, being pre-gate, should not read the user's IndexedDB at all).
- [ ] Renders on both **chromium and mobile-webkit**. The category sections and range columns wrap cleanly at the 390 px viewport; long marker names and descriptions respect `min-width: 0` (the documented overflow fix); the page is scrollable without horizontal overflow.
- [ ] The reference page carries the standing one-line "informational, not medical advice" disclaimer, consistent with every other page. Asserted by confirming the disclaimer is present.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the reference is a static-data render; no new hostnames; no inference call; no user-data read.
- [ ] Schema migration: **no** — the reference renders the static `MARKERS[]` constant. Nothing is read from or written to IndexedDB.
- [ ] New `tests/e2e/reference.spec.ts` covers: `#/reference` reachable pre-consent and pre-profile, a known marker's name/unit/both-ranges/description render, open-high/open-low/closed range formatting, the welcome-screen link routes to it, the "Start your own" link routes to `#/welcome`, no write/compose control present, identical render with and without a profile (no user-data read), user-defined markers absent, zero-network, disclaimer present, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A search/filter box over the markers in v1. The reference is a readable, grouped library a prospect skims; a search box is a clean follow-up if the list proves long enough to need it, but it is not the minimum value and adds interaction surface to a pure reading page.
- A per-marker detail page or deep-link per marker. One scrollable reference, grouped by category. A marker-detail route is a separate ticket if real demand emerges.
- Showing the user's own value beside the reference range. That is the labs/progress surfaces' job, which require the gate, a profile, and labs. The reference is deliberately user-data-free so it can live pre-consent and be linkable with nothing personal in it.
- Including user-defined markers (0002) in the reference. Those are private data behind the gate. The reference is the curated public seed only, and the page must not read IndexedDB at all.
- A way to add/edit a marker from the reference. Authoring user markers is the gated Settings/labs flow (0002); the reference is read-only.
- An LLM-generated explanation of any marker. Every row's rationale is the curated `description` already on the `MarkerDef`; no Claude call belongs on a pre-consent, key-free, offline page (and there is no key to make one with).
- Carrying the reference into the doctor PDF (0010/0016), the share link (0017), or any export. It is a static, public, in-app reading surface; the marker ranges already appear per-result in those artifacts.
- A separate marketing/landing page distinct from the app. The reference is a route inside the SPA, gate-bypassed like the tour — not a new site, not a new build target, not a new host.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/pages/reference.ts` (new) — `renderReference()`. Read `MARKERS[]` from `src/data/markers.ts` directly (the static seed array), group by `category` in a fixed editorial order (reuse the `MarkerCategory` union from `src/types.ts`), and render section-per-category, row-per-marker with name/shortName, unit, lab range, functional range, and `description`. Format ranges with a small pure helper (`formatRange(r: Range): string` → "low–high" / "≥ N" / "≤ N" / "—"); factor it locally or reuse one if the progress/labs pages already have it. Pure render of static data — do NOT import any Dexie read helper.
- `src/main.ts` — register `#/reference` as a gate-bypassed route, modeled on the existing tour branch (the branch that renders above the consent + profile gates). Like the tour, routing TO `#/welcome` from the reference is the path back to the gate. The reference does not enter any session/tour/shared-view state — it is a stateless static page; just render it.
- `src/pages/welcome.ts` — add a restrained "Read the marker reference" link beside the existing sample-tour entry point. Match the existing welcome-link styling; no new visual treatment.
- `src/data/markers.ts` — read-only. `MARKERS[]` is the source. No change to the marker DB.
- `src/types.ts` — no new persistent types; `MarkerCategory`, `MarkerDef`, `Range` already exist. Any internal render type lives inside `reference.ts`.
- `src/styles.css` — `.reference` (the page), `.reference__section` (per category), `.reference__row` (per marker), reusing the existing editorial table/section idioms (cream + ink, Cormorant display headings + Inter Tight body). No new colors. Grid children get `min-width: 0` for long names/descriptions (the documented overflow fix).
- `src/chrome.ts` — the reference is a pre-consent reading surface; do NOT add it to the authenticated nav (the masthead nav is for the gated app). It is reached from welcome and by direct URL only, like the tour.
- `tests/helpers/flows.ts` — no new helper strictly required (the page reads no DB); the spec visits `#/reference` directly. For the "identical render with/without profile" test, reuse the existing onboarding flow to create a profile in one branch and assert the reference render is unchanged.
- `tests/e2e/reference.spec.ts` (new) — every acceptance bullet maps to a `test()`. The pre-consent test asserts `#/reference` renders without acknowledging consent (mirroring how `sample-tour.spec.ts` from 0014 reaches the tour pre-gate). The "no user-data read" test seeds a user marker + profile and confirms the page render is byte-identical to the no-profile render and that the user marker is absent.
- `tests/e2e/privacy.spec.ts` — extend with a `#/reference` visit confirming zero off-allow-list egress and no user-data read.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the page eyebrow/title reads "The marker reference" with a one-line subhead like "Every marker we curate, with both the lab range and the functional optimum." Category headings are plain (the category names). Range cells use "low–high" / "≥ N" / "≤ N". The CTA reads "Start your own." Banned: "amazing," "exciting," "journey," "great." Cream + ink, editorial type; oxblood reserved.

## Implementation log

- 2026-05-22 [implementation-dev] Picked up. Branch `feat/0038-the-functional-range-reference` off `origin/main`. Modeled the gate-bypass on the `#/try` sandbox (0040) — a pre-consent static page that reads `MARKERS[]` only, no Dexie, no key, no network. New `src/pages/reference.ts` (`renderReference()`) groups the built-in seed by category in a fixed editorial order, one section per category, one row per marker (name/shortName, unit, lab range, functional range, description). A local pure `formatRange(r: Range)` helper renders "low–high" / "≥ N" / "≤ N" / "—" (mirroring `try.ts` / labs `rangeStr`, no import of any gated module). Registered `#/reference` in `src/main.ts` next to the `#/try` branch; added a "Read the marker reference" link to `src/pages/welcome.ts` beside the tour + try entry points; a single "Start your own" link routes back to `#/welcome`. No upload/key/compose control on the page.

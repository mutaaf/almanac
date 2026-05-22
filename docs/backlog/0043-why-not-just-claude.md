---
id: 0043
title: Why this isn't a chat box — put the anti-wrapper argument in front of the prospect, before the key
status: groomed
priority: P2
area: growth
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a precision-health-literate prospect on the welcome screen who is silently asking "why wouldn't I just paste my labs into Claude and ask for a plan?", I want a short, honest, pre-consent panel that answers exactly that question — naming the specific things this app does that a chat box structurally cannot (a persistent timeline of every draw, a curated functional-range DB, marker canonicalization across labs, a deterministic insight engine, an adherence loop, local-first privacy) — so that the one objection most likely to stop a knowledgeable skeptic from setting up is met head-on, in the product's own voice, before I am asked to trust it with a key or a lab.

## Why now (four lenses)

### Product Owner

The single most persuasive piece of writing the product owns is the README's "Why this isn't a Claude wrapper" table — a point-by-point account of what raw Claude cannot do and what Almanac does instead. It is the honest test the product was designed to pass, and it lives entirely in a file a prospect on the deployed site never opens. The welcome screen already carries the three privacy/consent points; what it does NOT carry is the *value* argument — the reason to bother at all. The existing pre-key surfaces show the prospect different things: the sample tour (0014) shows the artifacts, the reference (0038) shows the curated knowledge, the sandbox (0040) shows the prospect's own numbers scored. None of them make the *argument* — the structural case for why this is a different product than the chat box. The smallest meaningful unit of value is a collapsible "Why not just ask Claude?" panel on the welcome screen (pre-consent, no key, no IndexedDB): a handful of editorial rows, each naming one thing the chat box cannot do and the moat asset that does it, drawn from the README's table and rendered in the house type. It is a pure static render of bundled copy. It puts the product's best argument where the trust decision is actually made.

### Stakeholder

This makes the **entire moat** legible as an argument at the top of the funnel — not one asset at a time (the way the tour, reference, and sandbox each surface one), but the whole structural case in one place: timeline, functional-range DB, canonicalization, insight engine, adherence loop, privacy. It is the most direct possible answer to the existential question "is this just a wrapper?", delivered by the product to the exact person most likely to ask it. A wrapper has nothing to put in this panel — it cannot honestly claim a persistent timeline or a deterministic engine it does not have. Almanac can, and listing them out loud, pre-consent, is both an acquisition move and a credibility move: it signals that the product is confident enough in its substance to name the alternative and explain why it loses. It compounds the three sibling pre-key surfaces by giving the prospect a reason to *use* them — the panel makes the claim, and the tour/reference/sandbox let the prospect verify it on artifacts, knowledge, and their own numbers respectively. The argument is the frame; the other three are the proof.

### User (at 7am on the phone)

A friend sent the link. I am on the welcome screen, and my first thought is the cynical one: I could just paste this into Claude. Below the consent points there is a quiet, collapsed line: "Why not just ask Claude?" I tap it. It opens into a short, honest list, in the same editorial type as the rest: "Claude starts every chat blank — Almanac keeps every draw you have ever uploaded, indexed by date and marker. Claude defaults to the lab's 'normal' — Almanac reasons against a curated functional optimum. Claude reads what it happens to read — Almanac runs a fixed battery of multi-marker patterns before it ever calls the model." It is not a sales pitch; it is an argument, and it is the argument I was already making to myself, answered. I have not pasted a key or uploaded anything — I am just reading. By the time I have read six of these, the cynical thought is gone, and I tap the sample tour to see for myself. It rendered instantly, offline, because the whole panel ships in the app — nothing was fetched, nothing was sent.

### Growth

This is a top-of-funnel acquisition surface aimed precisely at the highest-value, hardest-to-convince segment: the literate skeptic who can build their own Claude prompt and needs a reason not to. (Hypothesis: surfacing the anti-wrapper argument pre-consent raises the rate at which literate prospects proceed past the welcome screen, because it pre-empts the dominant unspoken objection at the moment it bites — and it raises engagement with the sample tour / reference / sandbox, because the panel gives the prospect a specific claim to go verify; back-of-envelope from how explicit "why us vs the obvious alternative" framing reduces bounce for technical, comparison-shopping audiences; treat as untested without remote analytics, which we will never add.) The "show me" frame is the panel itself: "this app actually explains why it's not just a GPT wrapper, point by point" is a credibility signal the persona repeats, because naming the alternative honestly is the opposite of the hand-wavy marketing they distrust. It is the lowest-cost, highest-substance way to make the product's best argument do acquisition work at the moment of the trust decision.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The welcome screen (`src/pages/welcome.ts`) renders a collapsible "Why not just ask Claude?" panel BELOW the existing three consent points and ABOVE (or beside) the existing tour/continue actions, reachable PRE-consent (no checkbox required to open it). Asserted by visiting `#/welcome` on a fresh browser, confirming the panel trigger is present, and that it does not require consent to expand.
- [ ] The panel is collapsed by default and expands on tap to reveal a list of contrast rows. Each row names one thing a chat box cannot do and the Almanac capability that addresses it (e.g. "Every chat starts blank → a persistent timeline of every draw"). The rows are sourced from a single static array (e.g. `WRAPPER_CONTRASTS` in `src/pages/welcome.ts` or a small `src/data/` const) so the copy lives in one place. Asserted by expanding the panel and confirming at least six contrast rows render with both halves.
- [ ] The rows cover, at minimum, these moat assets in the editorial register: persistent timeline, functional-range DB, marker canonicalization, the deterministic insight engine, the adherence loop, and local-first privacy. Asserted by confirming the rendered panel text references each of the six (substring assertions on the capability half of each row).
- [ ] Expanding and collapsing the panel toggles its visibility with a single ≥44×44 css px tap target; the panel state is page-local (no persistence) and resets to collapsed on reload. Asserted by expanding, collapsing, reloading, and confirming it is collapsed again.
- [ ] The panel introduces NO new interactive surface beyond expand/collapse — no key field, no upload, no compose, no link that requires consent. The existing consent checkbox, "Continue to onboarding", and "Take a tour with sample data" controls are unchanged and still gate exactly as today (continue disabled until the checkbox is checked). Asserted by confirming the continue button remains disabled with the panel expanded and unchecked consent, and enables only on checking consent.
- [ ] The panel reads NO IndexedDB and writes none — it is a static render of bundled copy. Asserted by confirming the welcome screen renders the panel identically with and without a profile present in IndexedDB (the panel is the same for everyone).
- [ ] The panel is rendered with **zero network calls** beyond the already-loaded app shell — the copy ships in the bundle; no content is fetched. Asserted by visiting `#/welcome`, expanding the panel, and confirming the mock recorded zero requests beyond the shell.
- [ ] The copy honors the voice spec: no banned words ("amazing," "exciting," "journey," "great"), no emoji, no exclamation marks; the contrast is stated as an honest argument, not a boast. Asserted by a content assertion that the rendered panel text contains none of the banned tokens.
- [ ] Renders on both **chromium and mobile-webkit**. The collapsed trigger and the expanded rows wrap cleanly at the 390 px viewport; the two halves of each contrast row stack rather than overflow; rows respect `min-width: 0` (the documented overflow fix). The panel does not push the consent checkbox or the continue action off-screen in a way that breaks the existing welcome flow.
- [ ] The existing welcome behaviors are byte-for-byte unchanged when the panel is collapsed (the default) — the shared-link decode-error notice (0017), the adopt notice (0020), the three consent points, and the action buttons all render exactly as today. Asserted by running the existing welcome/consent completion flow and confirming it still acknowledges consent and routes to `#/onboarding`.
- [ ] Tour mode (0014), shared-view mode (0017), and a returning user with consent already acknowledged do not change the panel's behavior on the welcome screen specifically; the panel is a property of the welcome render, which a consented user does not normally see (the router skips welcome). No new behavior is introduced in tour or shared-view. Asserted by confirming the panel appears only on the welcome render and not after consent is acknowledged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the panel is a static-copy render; no new hostnames; no inference call; no user-data read.
- [ ] Schema migration: **no** — the panel renders bundled copy. Nothing is read from or written to IndexedDB; no localStorage state.
- [ ] New `tests/e2e/why-not-claude.spec.ts` covers: panel present and expandable pre-consent, at least six contrast rows with both halves, the six named moat assets present, expand/collapse toggle and reset-on-reload, no new interactive/consent-requiring control, identical render with/without a profile, zero-network, banned-word-free copy, existing welcome flow unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A separate route for the argument. This is a panel on the existing welcome screen, where the trust decision is already made — not a new `#/why` route. The reference (0038) and sandbox (0040) already added pre-key routes; this is deliberately inline so the prospect reads it without leaving the consent screen.
- An LLM-generated or dynamically-personalized version of the argument. The copy is curated, static, and ships in the bundle; a Claude call on a pre-consent, key-free page is impossible (no key) and unwanted (the argument is fixed editorial copy, not generated prose).
- A live, head-to-head "paste a prompt and see Claude's answer next to Almanac's" demo. That would require a key, an inference call, and a comparison harness — far beyond the minimum, and it undercuts the privacy posture of a pre-consent surface. The argument stands on its own; the sample tour (0014) and sandbox (0040) are the verification paths.
- Marketing superlatives or competitor-bashing. The panel states honest structural contrasts ("a chat box starts blank; we keep your timeline"), not "Claude is bad." The persona converts on substance and is repelled by hype; the voice spec's banned words are the floor, not the ceiling.
- Duplicating the README table verbatim with all its rows and prose. The panel is a tight, scannable subset (the six core moat assets), in the editorial register, sized for a phone — not a wall of text. The README remains the long-form source.
- Persisting whether the panel was expanded, or A/B-testing copy variants. No analytics, no remote config (AGENTS.md). The panel state is page-local and resets on reload; there is one version of the copy.
- Adding the argument anywhere but the welcome screen (onboarding, Settings, the share link). The welcome screen is where the "why bother" decision is made; an echo elsewhere is a possible follow-up but is not the value here.
- A QR code, external link, or any egress from the panel. We have no backend; the panel is self-contained bundled copy with no outbound link.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/pages/welcome.ts` — add the collapsible panel to the `renderWelcome()` template, below the `.welcome__points` block and above (or beside) the action-button row. Define the contrast rows as a single static array (`WRAPPER_CONTRASTS: { cannot: string; does: string }[]`) at the top of the module (or in a small `src/data/` const if cleaner) so the copy lives in one place. Wire a single expand/collapse handler in the existing post-`mount()` event-wiring section (where the consent checkbox and tour button handlers already live). Do NOT touch the consent gating logic, the tour entry, the decode-error notice, or the adopt notice — the panel is purely additive.
- `src/data/` (optional) — if the contrast copy is cleaner as a shared const than inline in `welcome.ts`, a tiny `src/data/wrapper-contrasts.ts` is acceptable; it is static bundle data, not a DB. No new dependency, no IndexedDB.
- `src/styles.css` — `.why-claude` (the panel), `.why-claude__trigger` (the collapsed ≥44×44 css px tap target), `.why-claude__row` (one contrast, two halves that stack on mobile), reusing the existing welcome/editorial idioms (cream + ink, Cormorant display + Inter Tight body). Grid children get `min-width: 0` for the two-half rows (the documented overflow fix). No new colors; ink and ink-soft, oxblood reserved.
- `src/main.ts` — no change; the welcome route already exists and is gate-bypassed for the unconsented visitor. The panel rides the existing render.
- `src/chrome.ts` — no change; the welcome screen has its own masthead and is not part of the authenticated nav.
- `tests/helpers/flows.ts` — no new helper required; the spec visits `#/welcome` directly (no consent, no profile) and drives the expand/collapse. For the "identical render with/without profile" test, reuse the existing onboarding flow to create a profile in one branch and assert the panel render is unchanged (though a consented user normally skips welcome, the panel render itself must be profile-independent).
- `tests/e2e/why-not-claude.spec.ts` (new) — every acceptance bullet maps to a `test()`. The named-assets test asserts the rendered panel text references "timeline", "functional", "canonical"/"recogniz", "engine"/"pattern", "adherence", and "device"/"privacy" (the six moat assets), and the banned-word test asserts the copy contains none of "amazing", "exciting", "journey", "great".
- `tests/e2e/welcome.spec.ts` (if it exists) / `tests/e2e/privacy.spec.ts` — extend the welcome and privacy sweeps with a panel-expand visit confirming the existing consent flow is unchanged and zero off-allow-list egress occurs.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no** (no IndexedDB, no localStorage).
- Voice spec: the trigger reads "Why not just ask Claude?" Each row states the contrast as "<what a chat box cannot do> → <what Almanac does>", declarative, no boast, no exclamation. Banned: "amazing," "exciting," "journey," "great." Cream + ink, editorial type; oxblood reserved.

## Implementation log

(Appended by the implementation-dev agent during execution.)

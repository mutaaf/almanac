---
id: 0046
title: Paste your results as text — the lowest-friction first panel, straight from the patient portal
status: groomed
priority: P1
area: labs
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a new user whose lab results live as selectable text in a patient portal (MyChart, LabCorp, Quest) — not as a PDF I have to hunt down and download — I want to paste that text straight into Almanac and have it extracted into a structured, dated panel, so that getting my first panel in takes one copy-and-paste from the tab already open on my phone, instead of forcing me to find, download, and locate a PDF or photograph a screen — the friction that stops me before I have seen the product do anything at all.

## Why now (four lenses)

### Product Owner

The single highest acquisition cliff in Almanac is getting the first panel in. Today the labs flow accepts PDFs and images (Claude Vision extraction) or one-marker-at-a-time manual entry. But the most common place a prospect's results actually live is a patient portal, as *selectable text* — and the current paste handler reads only `clipboardData.items` for image/file content, so pasting the text of a results page does nothing. The result is that a motivated prospect with their results open in another tab has to: find the PDF download, save it, switch back, and upload — or photograph their own screen — or hand-type markers one at a time. Each step sheds prospects. The smallest meaningful unit of value is a text-paste path on the labs surface: a "paste your results" affordance (and a text-aware branch in the existing paste handler) that takes a blob of portal text, sends it to a text-only extraction call (`extractFromText`, a sibling of the existing `extractFromFiles`), and produces the same structured, dated `Panel` the file path produces — flowing into the exact same review screen, canonicalization, flagging, and date-splitting (0001) the rest of labs already does. It is cheaper than vision (text tokens, no image), faster for the user, and reuses every downstream surface. It removes the largest first-run friction with the smallest new surface.

### Stakeholder

This widens the funnel into every moat asset at once without touching the privacy contract. The extraction call is the same BYOK, browser-direct, `api.anthropic.com`-only egress the file path already uses — no new host, no backend, no proxy; the pasted text is on the device until that one call, exactly like a pasted image. It strengthens the **persistent timeline** by making the first (and every subsequent) panel dramatically easier to add, which is the precondition for every compounding surface — trends, movement receipts, the record (0045), the adherence loop. It is also a quiet anti-wrapper point: a chat box would take the pasted text and hand back prose; Almanac takes the same text, structures it into canonicalized, dual-range-flagged, dated results that join a timeline — the same text, a different product. And it lowers cost honestly (text extraction is cheaper than vision), which compounds the cost-transparency posture (0037): the cheapest path to a first panel is also the lowest-friction one.

### User (at 7am on the phone)

My results just posted to the portal. I have the tab open on my phone. I select the results block, copy it, switch to Almanac, and paste — and there is a clear place for it: "paste your results." It thinks for a moment (the one extraction call, on my key), and the review screen comes up with my markers parsed, dated, and flagged against both ranges, exactly as if I had uploaded a PDF. I did not have to download anything, find anything in my files, or photograph my own screen. It was one copy and one paste from a tab I already had open. If the paste was messy — a wall of portal navigation chrome around the actual values — the review screen lets me see and fix what it parsed before I commit, same as always. The only thing that touched the network was the extraction call to Anthropic on my own key, the same single call a PDF would have made.

### Growth

This is a top-of-funnel acquisition ticket aimed at the exact step where motivated prospects drop: first-panel entry. (Hypothesis: a text-paste path raises the rate at which new users complete a first panel, because copy-from-portal-and-paste is the lowest-friction input the product can offer to the most common place results actually live — strictly fewer steps than find-the-PDF or photograph-the-screen, and the friction at this step is the dominant first-session drop-off; back-of-envelope from how reducing input steps at the activation moment is the highest-leverage funnel fix in onboarding-heavy products; treat as untested without remote analytics, which we will never add.) The "show me" frame is the speed of it: "I just pasted the text from my portal and it parsed all my markers" is the casual demonstration a prospect gives the friend standing next to them, because it is fast enough to show in the moment — no file-finding, no setup, just paste and watch it structure. It also makes the product easier to recommend to the less-technical friend the persona refers, because "paste your results" is a lower bar than "find and upload the PDF."

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/extractor.ts` gains `extractFromText(text: string, profile: Profile): Promise<ExtractionResult>` — a sibling of `extractFromFiles` that sends the pasted text as a text content block (not a base64 image/document) to `api.anthropic.com` with the same extraction system prompt, the same `cache_control: ephemeral` voice/profile/reference blocks, and the same structured-Result output shape. It returns the identical `ExtractionResult` the file path returns. Asserted (via the Anthropic mock) by passing a known portal-text fixture and confirming the parsed Results match the seeded extraction fixture.
- [ ] The labs surface (`src/pages/labs.ts`) exposes a "Paste your results as text" affordance (a textarea or a paste-into-text region distinct from the image dropzone), and the existing window paste handler gains a text branch: when the clipboard carries `text/plain` and no image/file item, the pasted text is routed to the text-extraction path rather than being ignored. The image/PDF paste behavior (reading `clipboardData.items` for files) is unchanged. Asserted by pasting a results-text string and confirming it stages for text extraction; and by pasting an image and confirming the existing file path still fires.
- [ ] Triggering text extraction produces the SAME post-extraction review screen as the file path — parsed results in the staged/review layout, editable before commit, with canonicalization (0026), unit reconciliation (0044 if shipped), flagging via `flagFor()`, and the report card (0036 if shipped) all applying identically because the produced `Panel` is structurally identical. Asserted by extracting from text and confirming the review screen renders the parsed results with flags.
- [ ] The date-splitting behavior (0001) applies to pasted text exactly as to files: text that contains results from multiple draw dates resolves to multiple dated panels; text from a single draw resolves to one panel. Asserted with a portal-text fixture spanning two dates producing two panels.
- [ ] Text extraction makes exactly ONE `api.anthropic.com` call (the extraction), on the user's BYOK key, with NO new hostname and NO non-Anthropic egress. Asserted by extracting from text and confirming the mock recorded exactly one request, to the allow-listed Anthropic host.
- [ ] The pasted text and the parsed results never leave the device except via that single extraction call — the text is held in page state, sent once, and not persisted anywhere except as the resulting `Panel` (and the existing extraction-cache, keyed by a hash of the input, so re-pasting the same text replays at zero cost exactly as re-pasting the same files does). Asserted by re-pasting identical text and confirming the second extraction is served from cache with zero additional requests.
- [ ] The Anthropic key is NEVER rendered, logged, or included in the pasted-text UI or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the labs text surface or the extraction request body beyond the standard Authorization header the SDK sets.
- [ ] An empty or whitespace-only paste does nothing (no call, no staged panel) and the labs surface is unchanged. A paste that the extractor returns zero results for surfaces the existing "no markers found — try a clearer source or enter manually" path (reuse whatever the file path shows on an empty extraction). Asserted with an empty paste (no call) and a no-marker paste (graceful empty-result handling).
- [ ] The consent gate is unaffected — text paste lives behind the same gate as the rest of labs; a pre-consent browser cannot reach the labs surface or the text path. Asserted by confirming text paste is unreachable pre-consent.
- [ ] Renders on both **chromium and mobile-webkit**. The text affordance is usable at the 390 px viewport (the textarea is reachable and the paste handler fires on mobile-webkit); touch targets ≥44×44 css px; the affordance wraps cleanly and does not break the existing dropzone layout. Note in the spec which paste mechanism is asserted per project.
- [ ] The existing file/image upload, the manual-entry form, and their behaviors are byte-for-byte unchanged — text paste is purely additive. Asserted by running the existing file-upload and manual-entry flows and confirming they are unchanged.
- [ ] Tour mode (0014) and shared-view mode (0017): text paste is an owner-side ingestion action; it does not appear in shared-view (the recipient is not uploading), and in tour mode it either is absent or operates against the mock exactly as the file path does in tour (pick the consistent treatment the tour already uses for upload). Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the only egress is the single existing `api.anthropic.com` extraction call; no new hostnames; the key never appears.
- [ ] Schema migration: **no** — text extraction produces the existing `Panel`/`Result` shapes and stores via the existing `addPanel` path; the extraction cache uses the existing mechanism keyed by an input hash. Nothing new is persisted.
- [ ] New `tests/e2e/labs-paste-text.spec.ts` covers: text extraction produces a structured dated panel via one Anthropic call, the same review screen as the file path, multi-date splitting on pasted text, image paste still works (regression), exactly-one-Anthropic-call egress, extraction-cache replay on identical re-paste, empty/no-marker paste handling, the key never appears (sentinel), consent gate intact, file-upload + manual-entry unchanged, tour vs shared-view behavior, mobile rendering/path note.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A deterministic, no-LLM text parser. Portal text is wildly inconsistent across providers; a regex/heuristic parser would be brittle and would fork the extraction logic. Text extraction uses the same Claude extraction call the file path uses, just with a text content block instead of an image — one extraction code path, two input types. (The honest cost story is in 0037; text is cheaper than vision, which the cost copy can note, but this ticket does not build a separate parser to avoid the call.)
- A backend OCR or a server-side text cleaner. There is no backend. The pasted text goes directly from the browser to Anthropic on the user's key, exactly like a pasted image.
- Importing by URL or by logging into a patient portal on the user's behalf. We do not authenticate to third-party portals, scrape them, or take the user's portal credentials. The user copies their own results and pastes them; that is the entire mechanism.
- Widening the egress allow-list. Text extraction calls the same `api.anthropic.com` host the file path already calls. No new hostname; the privacy test must continue to pass unchanged.
- A rich paste-cleanup editor (strip navigation chrome, re-order columns) before extraction. The extractor handles messy input; the existing review screen is where the user fixes mis-parses. Building a pre-extraction text editor is gold-plating.
- Changing the file/image upload path or the manual-entry form. Those are unchanged; text paste is a third, additive input that converges on the same review screen.
- Carrying the raw pasted text into any export, the share link (0017), or any artifact. The pasted text is ingestion input; only the structured `Panel` it produces persists, exactly as for files (which are stored as blobs only by the existing file path, not re-exported).

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/extractor.ts` — add `extractFromText(text, profile)`. Mirror `extractFromFiles`: same `EXTRACTION_PROMPT`, same `cache_control: ephemeral` blocks (voice/profile/reference), same response parsing into `ExtractionResult`. The user-message content is a single `{ type: "text", text }` block instead of the base64 `image`/`document` blocks. Reuse the same JSON-parse + truncation-guard handling the file path uses (see the `max_tokens` note in AGENTS.md "When things go wrong"). The downstream `extractFromFiles` → panel-build step (the post-parse normalization that runs date-splitting 0001, canonicalization, flagging, and — if shipped — unit reconciliation 0044) must be shared so text and files produce identical panels; factor the post-parse step into a shared helper if it is currently inline in the file path.
- `src/pages/labs.ts` — add the "Paste your results as text" affordance (a textarea region) near the existing dropzone, and extend the single window-level paste handler (the idempotent `__almanacPasteListener__` at `PASTE_KEY`): when `clipboardData` has `text/plain` and NO image/file item, route the text to a text-staging path that calls `extractFromText`. Keep the existing "read EXACTLY ONE source — clipboardData.items" rule for the image path (the documented paste-dedupe lesson); the text branch is a separate, mutually-exclusive check (text only when there is no file item). Both converge on the same review screen.
- `src/claude.ts` / `src/extractor.ts` — the extraction call already exists; text extraction reuses it with a text block. Bump `tests/fixtures/extraction.json` only if the response shape changes (it should not — same `ExtractionResult`).
- `src/db.ts` — read-only for schema; the produced panel stores via the existing `addPanel`. The extraction cache (SHA-256 of staged input) extends to hash the pasted text so identical re-pastes replay at zero cost (reuse the existing cache mechanism; key it on the text instead of the file bytes). No new store.
- `src/types.ts` — no new persistent types; `ExtractionResult`, `Panel`, `Result` already exist. Any internal text-staging type lives in `labs.ts`.
- `src/styles.css` — `.labs-paste-text` (the textarea/affordance) styled to match the existing dropzone idioms; ink and ink-soft; ≥44×44 css px controls; do not disturb the dropzone layout. No new colors.
- `src/sample/state.ts` / `src/share/shared-state.ts` — gate the text affordance with the same `isSharedView()` (absent — recipient does not upload) treatment the upload path uses; match the tour's existing upload treatment.
- `tests/helpers/flows.ts` — add an `addPanelFromText(page, text)` flow (or extend the existing `addPanel`/upload helper) that pastes/sets the results text and triggers extraction against the mock. Reuse the existing extraction mock (`tests/helpers/mocks.ts`) — it sniffs the system prompt to serve the extraction fixture, which is unchanged.
- `tests/e2e/labs-paste-text.spec.ts` (new) — every acceptance bullet maps to a `test()`. The core test pastes a portal-text fixture and asserts a structured dated panel via exactly one Anthropic request; the cache test re-pastes identical text and asserts zero additional requests; the regression test pastes an image and asserts the file path still fires.
- `tests/e2e/privacy.spec.ts` — extend with a text-extraction invocation confirming exactly one `api.anthropic.com` call, no new hostnames, and that the key never appears.
- New deps: **no**.
- Egress allow-list change: **no** — same `api.anthropic.com` host as the file path.
- Schema migration: **no**.
- Voice spec: the affordance reads "Paste your results as text" with a one-line subhead like "Copy the values from your portal and paste them here — we parse them into a dated panel." The empty/no-marker fallback reuses the file path's existing copy. Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

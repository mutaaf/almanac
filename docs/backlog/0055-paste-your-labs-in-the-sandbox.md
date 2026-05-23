---
id: 0055
title: Paste your labs into the sandbox — score a snippet of raw report text against the functional optimum, no key, nothing saved
status: groomed
priority: P1
area: growth
created: 2026-05-22
owner: gtm-innovation
---

## User story

As a skeptical prospect on the welcome screen who has my last lab report open in another tab — the patient-portal blob with twenty lines of "ApoB 110 mg/dL", "Ferritin 32 ng/mL", "Fasting insulin 8 uIU/mL" — I want to paste that text straight into the pre-key sandbox and have it pull out the markers it recognizes and score each one against both the lab range and the tighter functional optimum, so that I feel the product's central claim on my actual report in one paste, with no typing, no account, and no key, instead of hand-entering each value into a picker before I am convinced.

## Why now (four lenses)

### Product Owner

The typed-marker sandbox (0040, shipped) is the highest-intent pre-key acquisition surface — but it asks the prospect to pick a marker from a dropdown and type a value, once per marker. The prospect who is actually motivated has their report *right there*, as text, and the lowest-friction path is to paste the whole blob and let the app find what it recognizes. The shipped paste-as-text panel (0046) already proved a deterministic, no-LLM parse of patient-portal text into recognized markers — but it lives behind the gate, on the labs page, after consent and a key. The smallest meaningful unit of value is a "Or paste your report" affordance on the existing `#/try` sandbox: a textarea, a parse that reuses the same deterministic marker-line recognizer 0046 built (alias match on `MARKERS[]`, value + unit on the same line), and each recognized line dropping into the sandbox's existing resolved-row + report-card-tally render (0040's `flagFor()` + `computeReportCard()`). Unrecognized lines are silently skipped — the prospect sees only the markers we can score. It is a pure client-side parse over static data: no key, no upload, no extraction call, no Dexie write. It collapses 0040's pick-and-type-per-marker into one paste.

### Stakeholder

This makes the **deterministic marker recognizer** (the canonicalization + alias layer behind 0046) and the **functional-range DB** do acquisition work at the very top of the funnel, on the prospect's own report, before any commitment — which is precisely the moment the chat-box comparison is won or lost. "Paste your raw lab text and watch it get parsed and scored against a curated optimum, offline, with no key" is structurally a product feature: a chat box can do the parse only via a round-trip that costs a token and defaults to the lab floor, and it has no curated functional optimum to score against. It compounds the pre-key stack: 0038 (reference) lets the prospect read the curation, 0040 (typed sandbox) lets them test it on one number, and this lets them test it on their whole report at once — and 0049 (sandbox-to-first-panel handoff) already carries those scored rows into a real first panel, so the paste feeds directly into the conversion close that is already groomed. It reads no IndexedDB and persists nothing (the pasted text lives only in page memory, gone on reload), so it is safe pre-consent and the privacy posture is untouched. The recognizer is the moat; the paste advertises it on the prospect's own data.

### User (at 7am on the phone)

A friend sent the link; my last lab report is open in the patient-portal tab on my phone. On the sandbox, beside the marker picker, a quieter line: "Or paste your report." I long-press, paste the whole twenty-line blob — the messy portal text, units and all. Instantly the rows resolve: my ApoB 110 above the optimum, my fasting insulin 8 inside the lab range but above the functional 2–5, my ferritin 32 below the floor I have read it should sit at. The lines it did not recognize — the CBC noise, the lab's address — just are not there; it only shows me what it can actually score. A one-line tally underneath: "3 of 4 are inside the lab's normal range but below the functional optimum." I did not type a single value or paste a key — I pasted the report I already had. That is the moment I set up. It worked offline, instantly, with one paste, hands still half-asleep — nothing was sent.

### Growth

This is the lowest-friction version of the highest-converting front door the product has. (Hypothesis: a paste-your-raw-report path converts the motivated prospect faster than the pick-and-type sandbox, because the prospect with their report open will paste twenty lines in one gesture but will not hand-enter eight markers one at a time — and a one-paste vindication on their own report is more forwardable than a typed one, since the friend with the same "everything's normal" complaint can paste their report too with zero effort; back-of-envelope from how paste/import paths out-activate manual-entry paths in data-onboarding flows; treat as untested without remote analytics, which we will never add.) The "show me" frame is the resolved rows themselves: "I pasted my whole lab report and it found the four numbers that matter and told me three are 'normal but not optimal' — no signup, no key" is exactly the line the persona repeats to the one friend with the same report sitting in a portal tab. It is the paste sibling of 0040: 0040 scores a number you know by heart, this scores the report you have open.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The sandbox (`src/pages/try.ts`, from 0040, on the gate-bypassed `#/try` route) gains a restrained "Or paste your report" affordance beside the existing marker picker: a textarea and a "Score it" action. The existing pick-a-marker-and-type-a-value path is byte-for-byte unchanged. Asserted by visiting `#/try` pre-consent and confirming both the picker and the paste affordance render.
- [ ] `src/sandbox/parse-pasted.ts` (new) exports `parsePastedLabText(text: string): { key: string; value: number }[]` — a pure, deterministic parse that reuses the same marker-line recognizer 0046 built (alias match against `MARKERS[]`, value + unit on the same line). It returns one `{ key, value }` per recognized line, in the order encountered; unrecognized lines are skipped. NO LLM, NO Dexie, NO network. Asserted by passing a multi-line patient-portal-style blob and confirming exactly the recognized markers parse with their values.
- [ ] Pasting a recognized blob and tapping "Score it" appends the parsed markers to the sandbox's existing resolved rows — each row showing the marker name, value, unit, lab range, functional optimum, and the `flag` via the existing `flagFor()` — identical in render to a row the prospect typed. Asserted by pasting a 4-marker blob and confirming 4 resolved rows render with correct flags.
- [ ] Lines the recognizer does not match (CBC noise, the lab's address, free prose) are silently skipped — they never produce a row and never error. Asserted by pasting a blob mixing 3 recognized markers with 10 unrecognized lines and confirming exactly 3 rows render.
- [ ] When the pasted markers bring the row count to two or more, the existing 0036 report-card tally renders over the in-memory rows exactly as it does for typed rows ("Of <total> markers, <n> sit inside the lab's normal range but below the functional optimum…"). Asserted by pasting a blob yielding 1 optimal + 1 suboptimal + 1 out-of-range and confirming the tally counts.
- [ ] A duplicate marker — the same marker key appearing twice in the paste, or a pasted marker already present as a typed row — is reconciled to a single row (last value wins, or the documented rule), never two rows for one marker. Document the chosen rule. Asserted by pasting a blob with two ApoB lines and confirming one ApoB row.
- [ ] Pasting text with NO recognized markers shows a calm, declarative empty note ("No markers we recognize yet — try the picker above, or add a value by hand") and adds no rows. Asserted by pasting pure prose and confirming the note and zero rows.
- [ ] The page reads and writes NO IndexedDB — no `getProfile()`, no `allPanels()`, no `addPanel()`, no Dexie call; the pasted text and parsed rows live only in page memory and are gone on reload. Asserted by pasting, reloading `#/try`, and confirming empty rows, and that the page renders identically with and without a profile present in IndexedDB.
- [ ] The page makes **zero Anthropic calls** and **zero network calls** beyond the already-loaded shell — `MARKERS[]`, the recognizer, `flagFor()`, and `computeReportCard()` ship in the bundle; there is no extraction, no inference, no upload. Asserted by exercising the full paste-and-score flow and confirming the mock recorded zero requests beyond the shell.
- [ ] There is NO key field, NO file upload, NO compose action, and NO Anthropic call anywhere on the page (the paste path is text-only and deterministic — it is not the gated PDF/image extraction). The page still carries only the picker, the paste affordance, the rows, the tally, and the existing "Start your own" link. Asserted by confirming no key/upload/compose control is present.
- [ ] The pasted raw text is NOT persisted anywhere and the Anthropic key never appears in any row, the tally, or any intermediate string. Asserted by seeding a sentinel key (and including the sentinel in the pasted text) and confirming it appears in no resolved row, tally, or stored state.
- [ ] Renders on both **chromium and mobile-webkit**. The textarea, "Score it" action (≥44×44 css px, min-height ≥45 px per the 0017 sub-pixel lesson), and resolved rows wrap cleanly at the 390 px viewport; long marker names respect `min-width: 0` (the documented overflow fix); the paste affordance does not push the existing picker off-screen.
- [ ] The page carries the standing one-line "informational, not medical advice" disclaimer, consistent with 0040 and every other page. Asserted by confirming the disclaimer is present.
- [ ] The existing typed-marker sandbox (0040) — its picker, its flag logic, its report-card tally, its no-persist-on-reload behavior, its "Start your own" route — is byte-for-byte unchanged in behavior; the paste path is purely additive and the parsed rows feed the same row/tally render. Asserted by running 0040's sandbox flow and confirming it is unchanged.
- [ ] If 0049 (sandbox-to-first-panel handoff) has shipped, pasted rows participate in the session carry-over exactly as typed rows do (the sessionStorage seed contains pasted markers too) — the paste does not bypass or break the handoff. Asserted (or noted as N/A with a one-line reason if 0049 has not shipped) by pasting, proceeding to onboarding, and confirming the pasted markers appear in the handoff offer.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the paste is a static-data parse with in-memory state; no new hostnames; no inference call; no IndexedDB read or write.
- [ ] Schema migration: **no** — the parsed rows hold in page memory only (plus the existing 0049 sessionStorage seed if present). Nothing is read from or written to IndexedDB.
- [ ] New `tests/e2e/sandbox-paste.spec.ts` covers: the paste affordance renders on `#/try` pre-consent, a portal-style blob parses to the recognized markers with correct flags, unrecognized lines skipped, the report-card tally over 2+ rows, duplicate reconciliation, the no-markers empty note, nothing persists across reload, identical render with/without a profile (no IndexedDB read), no key/upload/compose control, zero Anthropic + zero network, the key/sentinel never appears, the typed sandbox unchanged, the 0049 carry-over (or N/A note), disclaimer present, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Any extraction or inference on the pasted text. The parse is the same deterministic, no-LLM recognizer 0046 built — alias + value-on-line matching over `MARKERS[]`. There is no key on this pre-consent page and no Claude call; uploading a PDF/image for real extraction is the gated labs flow, not the sandbox.
- A PDF or image paste/drop on the sandbox. The pre-key sandbox is plain text only — a PDF/image needs the gated extraction call. Pasting a screenshot belongs to the gated labs page (0046's siblings), not here.
- Persisting the pasted raw text to IndexedDB or localStorage pre-consent. The text and parsed rows live in page memory; the only session write is the existing 0049 carry-over seed (if shipped), which already holds `{ key, value }` rows, not raw text.
- Improving or extending the marker recognizer itself. This ticket reuses 0046's recognizer as-is; adding aliases or new parse heuristics is 0046's / 0002's territory. If the recognizer misses a common portal format, file it against the recognizer, not here.
- A "match this unrecognized line to a marker" UI (the gated labs page's match-unrecognized flow). The sandbox silently skips what it cannot recognize — the prospect is evaluating, not curating. Manual matching is the gated experience.
- Showing the user's value beside a trend, a prior draw, or any timeline. The sandbox has no timeline (it reads no IndexedDB). It scores the pasted snapshot against the curated ranges only.
- A composite "health score" over the parsed rows. Same constraint as 0040/0036: the report-card tally is a count per class, not a grade. No aggregate score.
- A shareable deep-link that encodes the parsed values or the raw text in the URL. Putting marker values (or worse, raw report text) in a URL is a personal-data leak vector, forbidden by 0040's out-of-scope. The only "share the tool" link is the plain `#/try` URL.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/sandbox/parse-pasted.ts` (new) — `parsePastedLabText(text)`. FIRST read 0046's paste-as-text recognizer (the deterministic marker-line parser the gated labs page uses for `addPanelFromText`) and reuse its alias-match-and-value-extraction logic verbatim — this ticket is the same parse on a pre-gate surface, not a new parser. Return `{ key, value }[]` for recognized lines in order; skip the rest. Reconcile duplicates to one entry per key (document last-wins or first-wins). Pure; do NOT import any Dexie helper.
- `src/pages/try.ts` (0040) — add the "Or paste your report" affordance (textarea + "Score it") beside the existing picker. On "Score it", run `parsePastedLabText(textarea.value)`, merge the results into the existing in-memory `rows: { key, value }[]` state (dedupe by key per the documented rule), and re-render — the rows and the 0036 tally render path is already there. Clear the textarea after a successful parse. If 0049 has shipped, the existing sessionStorage write of `rows` already carries the pasted markers — confirm, do not add a second mechanism.
- `src/data/markers.ts` — read-only. `MARKERS[]`, `findMarker()`, and `flagFor()` already exist and back both the recognizer and the row render. No change to the marker DB or flag logic.
- `src/labs.ts` / wherever 0046's recognizer lives — read-only reuse. If the recognizer is currently coupled to the labs page or to a Dexie write, factor the pure parse into a shared helper `parse-pasted.ts` can import (or import the existing pure function directly). Do not duplicate the alias logic.
- `src/main.ts` — no new route; the paste affordance lives inside the existing gate-bypassed `#/try` page from 0040. The page still enters no session/tour/shared-view state.
- `src/types.ts` — no new persistent types; the parsed payload is the same `{ key: string; value: number }[]` shape 0040's rows use. Any internal parse type lives in `parse-pasted.ts`.
- `src/styles.css` — `.try__paste` (the textarea + action region), reusing the existing `.try` form idioms and the labs paste-textarea styling. Action tap target ≥44×44 css px (`box-sizing: border-box; min-height: 45px` per the 0017 LESSON). Grid children `min-width: 0`. No new colors; ink and ink-soft, oxblood reserved for "Score it".
- `src/chrome.ts` — read-only; `#/try` is not in the authenticated nav (0040's discipline holds).
- `tests/helpers/flows.ts` — no new gated helper required (the page reads no DB); the spec visits `#/try` directly and fills the textarea. Reuse any portal-blob fixture string 0046's spec already has for a recognizable paste.
- `tests/e2e/sandbox-paste.spec.ts` (new) — every acceptance bullet maps to a `test()`. The parse test pastes a known portal blob (recognized + noise lines) and asserts exactly the recognized rows; the no-persist test reloads `#/try` after pasting and asserts empty rows; the sentinel test includes the key in the pasted text and asserts it surfaces nowhere.
- `tests/e2e/privacy.spec.ts` — extend with a `#/try` paste-and-score visit confirming zero off-allow-list egress and no IndexedDB read/write.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the affordance reads "Or paste your report" with a one-line hint like "Paste the text from your lab portal — we score what we recognize, nothing is saved." The action reads "Score it". The no-markers note reads "No markers we recognize yet — try the picker above, or add a value by hand." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Cream + ink, editorial type; oxblood reserved.

## Implementation log

(Appended by the implementation-dev agent during execution.)

---
id: 0027
title: Your almanac, in plain text — a readable Markdown export of the whole timeline
status: proposed
priority: P2
area: settings
created: 2026-05-20
owner: gtm-innovation
---

## User story

As a user who believes the privacy promise but wants to feel it — and who may one day stop using the app — I want a "Download as readable text" option in Settings that writes my entire almanac (profile summary, every panel's results with both ranges, every plan's snapshot + insights + eat/avoid/habits/retest, my marker trends, and my adherence over time) to a single, human-readable `.md` file in the editorial voice, so that I own a copy I can actually read in any text editor without this app, hand to a friend who does not run Almanac, or keep as the durable record of what my biology was doing — instead of an opaque `.almanac.json` blob that only the app can open.

## Why now (four lenses)

### Product Owner

Export today produces `your.almanac.json` — a faithful, importable backup that is also completely unreadable to a human. It satisfies the "own your data" promise on a technicality (the bytes are yours) but fails it in spirit (you cannot read the bytes). The printable one-pager (0010) is a single-plan PDF for a doctor; the share link (0017) is an ephemeral protocol view. Neither is "the whole timeline, in a form a human reads, that survives the app." The smallest meaningful unit of value is a second export button in Settings — "Download as readable text" — that runs a deterministic, zero-network transform over the same data `exportAll()` already gathers and emits one Markdown file in the editorial voice: a dateline header, a profile summary, a section per panel (each result with value, unit, lab range, functional range, and flag), a section per plan (snapshot, prioritized insights, eat list with frequency+portion, avoid list with swaps, habit stack, retest cadence), a marker-trend appendix (one line per marker with ≥2 draws showing the series), and an adherence summary. It reuses the JSON export's data-gathering wholesale; the only new code is the Markdown rendering. Nothing about the existing JSON export/import changes.

### Stakeholder

This deepens the **local-first privacy** moat by making data ownership *legible and portable* — the difference between "your data is technically exportable" and "your data is yours in a form you can read and keep forever." It compounds the **structured artifact** moat: the same structured plan/panel/insight data that makes Almanac not-a-chat-wrapper is exactly what makes a rich, readable Markdown document possible — a chat-box product has only prose to export. It is the strongest possible answer to the lock-in objection a privacy-literate user always raises ("what happens to my data if I leave?"): the answer is "you walk away with a complete, readable record, and we keep nothing because there is nothing to keep." Counter-intuitively, a frictionless, generous exit is a retention asset — users who know they can leave cleanly are the users who stay, because the relationship is not coercive. A backend-shaped competitor can offer a data export too, but theirs is a download from their server (your data was there all along); ours is a transform of data that never left your device — and the editorial voice of the Markdown is a thing their CSV dump structurally cannot be.

### User (at 7am on the phone)

It is the end of a quarter and I want a record I can keep — not a JSON file I will never open, an actual document. Settings → "Download as readable text." A `.md` file lands in my downloads. I open it in any editor. It reads like a private-press chapter: "Almanac — Mira Chen — drawn record through May 2026." Then my panels, each result with both ranges so I can see how the lab's "normal" compared to the optimum. Then each plan's snapshot in the voice I have come to trust, the eat list with frequency and portion, the habits, the retest schedule. Then a small marker-trend appendix: "Ferritin: 32 (Mar) → 48 (May) ng/mL." I AirDrop it to my partner who does not use the app; they can read every word without installing anything. It is the durable artifact the JSON never was. It worked offline, instantly, because the whole thing is built from data already on my phone — no call, no wait, no key.

### Growth

This is a retention + acquisition artifact at once. Retention: the generous exit (you can always walk away with a complete readable record) is the trust move that makes a privacy-cautious user commit long-term — and the Markdown export is also a quarterly ritual that brings the user back to Settings to take their record. Acquisition: a readable Markdown file is shareable in a way the JSON and the ephemeral link are not — a friend who receives "here is my actual almanac, read it" gets the full editorial artifact in a file they can open anywhere, and the dateline + voice are the "show me" frame. (Hypothesis: a readable Markdown export is shared friend-to-friend at a meaningfully higher rate than the JSON export, which is essentially never shared because it is unreadable; and a received Markdown file converts at a rate between the share link 0017 and a cold visit, because it carries the full artifact but lacks the live tappable surface — back-of-envelope, treat as untested.) It also seeds the precision-health forums with a high-quality artifact: a user posting "this is what 6 months of my labs and protocol looks like, exported as text" is editorial proof of the whole product in one file.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/export/markdown.ts` (new) exports `renderAlmanacMarkdown(data: AlmanacExport): string`. Pure: takes the exact shape `exportAll()` returns and emits a single Markdown string. No DOM, no Dexie, no network. Asserted by importing the function and snapshotting its output against a known `AlmanacExport` fixture.
- [ ] Settings (`src/pages/settings.ts`) gains a "Download as readable text" action next to the existing "Export" (JSON) action. Tapping it calls `exportAll()`, runs `renderAlmanacMarkdown()`, and triggers a download of `<name>.almanac.md` (slugified owner name; falls back to `almanac.md` when no name). Asserted by tapping the action and confirming a `.md` download with the expected filename.
- [ ] The Markdown opens with a dateline header in the editorial register: "# Almanac — <ownerName>" and a subline "A drawn record through <most-recent panel month + year, or export month when no panels>." Asserted against a seeded profile + panel.
- [ ] A "Profile" section renders the human-readable profile summary: name, age (computed from birthDate when present), sex, goals, conditions, dietary pattern. The Anthropic key is NEVER rendered — not the value, not a masked version, not a "key present" note. Asserted by seeding a profile with a sentinel key value and confirming the sentinel appears nowhere in the output string.
- [ ] A "Panels" section renders one subsection per panel, newest first, headed by the draw date + lab name. Each result renders as a line: "<marker name> — <value> <unit> · lab range <low>–<high> · functional <low>–<high> · <flag>". Missing ranges render gracefully ("lab range —"). Asserted against a panel with a mix of complete and partial ranges.
- [ ] A "Plans" section renders one subsection per plan, newest first, headed by the generated date. Each plan renders: the snapshot prose, the prioritized insights (title + detail, in priority order), the eat list (food · frequency · portion · why), the avoid list (food · swap · why), the habit stack (title + cue), and the retest cadence (markers + weeks + reason). Asserted against the plan fixture.
- [ ] A "Marker trends" appendix renders one line per marker that has ≥ 2 draws across the timeline: "<marker name>: <oldest value> (<oldest month>) → <newest value> (<newest month>) <unit>." Markers with a single draw are omitted from the appendix (no trend to show). Asserted with two panels sharing a marker.
- [ ] An "Adherence" summary renders a compact account of check-ins: total days logged, and per-habit hit counts over the logged span ("Magnesium glycinate — 73 of 100 logged days"). When no check-ins exist, the section reads "No check-ins logged yet." Asserted with and without check-ins.
- [ ] The Markdown is generated with **zero network calls** and **zero Anthropic calls** — it is a pure transform of local data. Asserted by triggering the export and confirming the mock recorded zero requests.
- [ ] The output contains NO banned editorial words ("journey", "amazing", "exciting", "great") introduced by the rendering layer (user free-form fields like `goals` are passed through verbatim and are the user's own words — the assertion targets the template's own copy, not the pass-through fields). Asserted by scanning the template's static strings.
- [ ] The existing JSON "Export" action is byte-for-byte unchanged in behavior and output. The Markdown export is purely additive. Asserted by exercising the JSON export and confirming its output matches today's shape.
- [ ] Renders the action on both **chromium and mobile-webkit**; the download triggers on mobile-webkit (or, where WebKit blocks programmatic download, the file content is verified via the same mechanism the existing JSON export test uses). Touch target ≥44×44 css px.
- [ ] Tour mode (0014) and shared-view mode (0017) do NOT offer the Markdown export — Settings is gated behind a real profile and consent, exactly as today; neither mode reaches Settings. Asserted by confirming the action is absent in those modes (consistent with current Settings gating).
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the export is local-only; no new hostnames; the key never appears in the output.
- [ ] Schema migration: **no** — the export reads existing tables via the existing `exportAll()` gather.
- [ ] New `tests/e2e/markdown-export.spec.ts` covers: the action triggers a `.md` download with the right filename, the dateline + profile + panels + plans + trends + adherence sections all render against a seeded timeline, the API key never appears in the output (sentinel test), partial ranges render gracefully, single-draw markers are omitted from the trend appendix, empty-check-in adherence copy, zero-network during export, the JSON export is unchanged.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A Markdown *import* path. Markdown is a one-way readable artifact; round-trip fidelity belongs to the JSON export/import, which already works. Parsing Markdown back into structured data would be lossy and pointless when JSON exists.
- A PDF or HTML export. PDF is the printable one-pager's job (0010); this ticket is plain `.md` specifically because Markdown is the maximally-portable, app-agnostic, human-readable text format. No styling engine, no print sheet.
- Embedding the original lab PDF/image blobs in the export. The JSON export already strips blobs by default (they balloon the file); the Markdown carries the extracted *results*, which is the readable record. Originals stay on-device as today.
- A "publish to a URL" or "share to web" path. That requires a backend. The Markdown is a downloaded file; the user shares it however they share any file.
- Per-section export toggles ("export only my plans"). One file, the whole timeline. A user who wants a single plan uses the printable one-pager (0010).
- An LLM-generated narrative summary of the timeline. The Markdown is a deterministic transform of the structured data in the editorial *template* voice; introducing a Claude call would add cost, latency, non-determinism, and a privacy egress to a feature whose entire point is a zero-egress, instant, local artifact.
- Carrying insight stances (0023) or user-authored rules (0022) into the Markdown in this ticket. If those ship, a follow-up can add their sections; scoping this to the core timeline keeps it shippable now regardless of their status.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/export/markdown.ts` (new) — `renderAlmanacMarkdown(data: AlmanacExport): string`. Consumes the exact `AlmanacExport` shape from `src/db.ts` (`exportAll()`). Resolves marker display names via `findMarker()` / `getAllMarkers` (so user-defined and sex-specific keys render human names). Pure, deterministic, no I/O. The trend appendix re-uses the same series logic the Progress page uses (oldest → newest per markerKey); factor a tiny shared helper if it reduces duplication, but do not over-couple to the viz layer.
- `src/pages/settings.ts` — add the "Download as readable text" action beside the existing Export action. Wire it to `exportAll()` → `renderAlmanacMarkdown()` → a Blob download (`text/markdown`), filename `<slug(ownerName)>.almanac.md`. Re-use whatever download helper the JSON export already uses (likely an anchor + object URL); do not invent a second download mechanism.
- `src/db.ts` — no changes; `exportAll()` already gathers profile, panels, plans, mealPlans, checkins, userMarkers. The Markdown renderer reads from that result. (Note: `exportAll()` strips blobs, which is exactly what the Markdown wants.)
- `src/data/markers.ts` / `src/data/userMarkers.ts` — read-only, for canonical display names.
- `src/types.ts` — no new persistent types needed; `AlmanacExport` already exists in `src/db.ts`. Add any small internal render types inside `markdown.ts` itself.
- `src/styles.css` — minimal; one new action button styled like the existing Export action. No new visual surface (the artifact is a downloaded file, not an on-screen page).
- `tests/helpers/flows.ts` — re-use existing onboarding + addManualPanel + composePlan flows to seed a small timeline (profile, two panels sharing a marker, one composed plan, a few check-ins) for the export spec.
- `tests/e2e/markdown-export.spec.ts` (new) — every acceptance bullet maps to a `test()`. Verify the downloaded content via the same approach `tests/e2e/settings.spec.ts` uses for the JSON export (intercept the download or read the generated Blob text). The "key never appears" test seeds a sentinel key and asserts it is absent from the generated Markdown string.
- `tests/e2e/privacy.spec.ts` — extend with a Markdown-export invocation confirming zero off-allow-list egress.
- New deps: **no** — Markdown is generated by string templating; no Markdown library needed (we are emitting, not parsing).
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the dateline reads "# Almanac — <name>" / "A drawn record through <month year>." Section headings are plain ("Profile", "Panels", "Plans", "Marker trends", "Adherence"). Result lines are " · "-delimited. The empty-adherence line is "No check-ins logged yet." Banned in the template's own copy: "amazing," "exciting," "journey," "great." The user's free-form fields pass through verbatim.

## Implementation log

(Appended by the implementation-dev agent during execution.)

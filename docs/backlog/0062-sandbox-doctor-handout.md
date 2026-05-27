---
id: 0062
title: The doctor handout from the sandbox — a printable one-pager naming the markers worth asking for, with the prospect's own numbers when they pasted any
status: proposed
priority: P2
area: growth
created: 2026-05-27
owner: gtm-innovation
---

## User story

As a skeptical prospect who just pasted my lab report into the sandbox and watched the rows resolve against the functional optimum (0055), I want a "Print this for your doctor" action that builds a one-page, printable handout listing the markers I should ask my doctor about — including the ones I already pasted (with my values + functional gap) and the high-impact ones I have NOT tested (with a one-line "why it matters") — so that I can walk into my next appointment with a defensible, on-paper list that I built without paying, signing up, or pasting a key, instead of trying to remember the four numbers I just saw on a phone screen.

## Why now (four lenses)

### Product Owner

The pre-key sandbox stack (0040 typed entry, 0055 paste-your-report, 0049 carry-into-first-panel) wins the prospect at the moment they see their own numbers scored against the functional optimum. But it converts ONLY the prospect ready to commit to a key right then. The slower-moving prospect — the one who is interested but wants to talk to their doctor first, or get more markers drawn, or sit with the result for a week — leaves the sandbox empty-handed: the resolved rows live in page memory, gone the moment the tab closes. The smallest meaningful unit of value is a "Print this for your doctor" action on the sandbox: it generates a one-page printable handout carrying (a) the markers the prospect already pasted, with each value, its lab range, the functional optimum, and the flag from `flagFor()`; (b) the high-impact markers the prospect did NOT paste — pulled from the `HIGH_IMPACT_MARKERS` constant the coverage-gaps card (0052) introduced — with each marker's one-line "why it matters" note; and (c) a footer line naming Almanac and the privacy promise ("Built on-device. Nothing about you was sent to a server."). It is a pure client-side render: the same `MARKERS[]` and `flagFor()` the sandbox already uses, plus the `HIGH_IMPACT_MARKERS` curated constant. No key, no upload, no Dexie write, no extraction call. It turns the sandbox session from a fleeting on-screen moment into a paper artifact the prospect physically carries to a doctor's office.

### Stakeholder

This extends the pre-key acquisition funnel's reach to the prospect who is not yet ready to commit but IS motivated enough to prepare for a doctor visit. The sandbox already provides the "aha" moment (your fasting insulin at 18 is above the functional optimum of 6–10 even though the lab called it normal). The handout captures that moment in a form the prospect can act on without a key. It deepens the **functional-range DB moat** by exporting it as curated, doctor-legible content: the handout is explicitly grounded in functional ranges, not lab ranges, and names Almanac as the source of the distinction — a tiny brand impression in a clinical context that is far more credible than a social ad. It is privacy-clean: the handout is generated from in-memory sandbox data and printed locally; nothing leaves the device. And it is acquisition infrastructure: a prospect who brings the handout to a doctor, gets the markers drawn, and comes back to paste the results into the sandbox has already completed the onboarding-without-a-key path — the next step is pasting the key.

### User (at 7am on the phone, but make it 9am in the waiting room)

I'm in the waiting room for my annual. I pasted my last panel into that sandbox last night and saw my ApoB was flagged even though the lab report said "normal." I want to show the doctor and ask about it. I tap "Print this for your doctor" on the sandbox, the browser's print dialog opens, and I print a clean one-pager: "Your markers vs the functional optimum — built with Almanac." The top half shows the three markers I pasted, each with my value, the lab range, and the functional range — a clear visual of the gap. The bottom half shows four more markers the tool says I should ask about: fasting insulin, HOMA-IR, Lp(a), omega-3 index — each with a one-liner. The footer says "Nothing about you was sent to a server." I hand it to the doctor. She's curious about the functional range for ApoB. We order a full metabolic panel. Three weeks later I paste the results into the sandbox, see the five new markers, and tap "bring these into your first panel." That's the whole funnel, and it started from a printout.

### Growth

This is the "print as acquisition" mechanic: turn a session artifact into an offline ambassador that returns when the user comes back for more. (Hypothesis: a prospect who prints the sandbox handout, brings it to a doctor, gets the additional markers drawn, and returns to upload them has a substantially higher onboarding-to-first-panel completion rate than a prospect who saw the sandbox and closed the tab — because the print action creates a physical commitment and a pending appointment that closes the loop back to the app; back-of-envelope from how call-to-action mechanics with offline follow-through (print, save, share) retain users through longer consideration cycles in patient-facing tools; treat as untested without remote analytics.) The "show me" frame is the handout itself: a clean, printed page a friend notices in the doctor's waiting room and asks about is exactly the right kind of ambient brand impression for the privacy-first, clinically-serious product. It is the pre-key sibling of 0048 (the coach packet export for paying users): 0048 gives the long-term user a clinical handoff artifact, 0062 gives the prospect a first-visit artifact before they have even signed up.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The sandbox page (`src/pages/sandbox.ts` or equivalent, where 0055's paste-and-score UI lives) shows a "Print this for your doctor" action when the sandbox session has at least one resolved row. The action is absent when the sandbox is empty. Asserted by seeding a sandbox session with one resolved row and confirming the action renders; and by visiting the empty sandbox and confirming the action is absent.
- [ ] `src/sandbox/doctor-handout.ts` (new) exports `buildDoctorHandout(rows: SandboxRow[], markers: MarkerDef[]): DoctorHandout`. It returns a structured object with two sections: `scored` (the sandbox rows, each with value + lab range + functional range + flag from `flagFor()`) and `suggested` (the high-impact markers NOT present in the sandbox rows, pulled from the `HIGH_IMPACT_MARKERS` constant, each with a one-line `reason` string). The `reason` strings are curated static constants, NOT LLM output. Pure: no DOM, no Dexie, no network. Asserted by passing known sandbox rows and confirming the `scored` section matches the rows and the `suggested` section excludes the already-scored markers.
- [ ] The printed handout renders the `scored` section with, for each row: the marker display name, the user's value + unit, the lab range (labeled "Lab range"), the functional optimum (labeled "Functional optimum"), and the flag string (e.g., "Sub-optimal — 12 points below the functional floor"). Asserted by opening the print preview (via `page.evaluate(() => window.print())` or by triggering the action and reading the hidden print-target element) and confirming each field renders for a known scored marker.
- [ ] The printed handout renders the `suggested` section with, for each marker: the display name, the one-line `reason` string, and the functional optimum (from `MARKERS[]`). No user value is shown (the prospect hasn't tested these). Asserted for at least two known `HIGH_IMPACT_MARKERS` that are not in the test sandbox session.
- [ ] The footer reads: "Built with Almanac — on your device. Nothing about you was sent to a server." It is present on the print handout and absent from the on-screen sandbox view. Asserted by confirming the footer text in the print-target element and its absence in the normal page DOM.
- [ ] The `buildDoctorHandout` function and the print action make **zero Anthropic calls** and **zero network calls** — it is a pure local render. Asserted by triggering the action and confirming the mock recorded zero requests.
- [ ] The Anthropic key (if seeded into the page for other reasons) NEVER appears in the handout content, the print-target element, or any intermediate string. Asserted by seeding a sentinel key and confirming it appears nowhere in the handout.
- [ ] The handout contains NO personal identifiers — no profile name, no email, no API key, no device fingerprint. The only "personal" data is the marker values the prospect typed or pasted into the sandbox. Asserted by inspecting the print-target element for the documented absent fields.
- [ ] Renders on both **chromium and mobile-webkit**. The on-screen action button is a ≥44×44 css px tap target (min-height ≥45 px per the sub-pixel lesson in `docs/LESSONS.md`). The print layout uses `@media print` CSS to hide the sandbox UI and show only the handout. Asserted on both projects (the action renders and is tappable; the print-target element exists and contains the expected sections).
- [ ] The existing sandbox flows — typed-entry (0040), paste-your-report (0055), carry-into-first-panel (0049) — are unchanged in behavior; the print action is purely additive. Asserted by exercising each sandbox flow and confirming it is unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the handout is a local render with no inference; no new hostnames.
- [ ] Schema migration: **no** — the handout is generated from in-session sandbox data and `MARKERS[]`. Nothing new is persisted to Dexie.
- [ ] New `tests/e2e/sandbox-doctor-handout.spec.ts` covers: the action renders when the sandbox has rows and is absent when empty, `buildDoctorHandout` produces the correct scored + suggested structure, the print-target renders all required fields for scored markers, the suggested section excludes scored markers, the footer text is present, zero Anthropic + zero network, the key never appears (sentinel), no personal identifiers, the existing sandbox flows unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM call to generate the handout copy, the `reason` strings, or the marker explanations. All strings are static curated constants from the marker DB and the `HIGH_IMPACT_MARKERS` list. No inference at render time, no new Anthropic call.
- Persisting the handout to Dexie or saving a PDF to the device. The handout uses the browser's native print dialog; the user prints to PDF or paper via the OS. No new file-download mechanism, no Dexie write.
- Requiring a key or an account to access the print action. The entire point is that this is a pre-key, pre-sign-up artifact. If the print action only appears on a page that requires authentication, it loses its acquisition value.
- Carrying the prospect's sandbox session into a persisted profile when they print. Printing is a one-way export from the session; the carry-into-first-panel path (0049) is the explicit onboarding step. Do not implicitly promote a session to a profile on print.
- A "share" or "email" action on the handout. The print affordance is the universal handoff for a pre-key, privacy-first tool. Social/email sharing implies a backend; print is local. (A copy-as-text variant, if added, should follow the same no-network, no-key pattern as the 0060 start-panel copy action.)
- Annotating the handout with the user's name, clinic, or doctor's name. The handout is anonymous by design — only the marker values, ranges, and suggestions. Personalization beyond what the user typed into the sandbox is out of scope.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/sandbox/doctor-handout.ts` (new) — `buildDoctorHandout(rows, markers)`. The `scored` section maps `SandboxRow[]` through `flagFor()` and `findMarker()` to assemble value + lab range + functional range + flag. The `suggested` section filters `HIGH_IMPACT_MARKERS` (the curated constant from 0052's `src/labs/coverage-gaps.ts` or wherever it lives after 0052 ships) against the scored rows' `markerKey`s. Each suggested entry carries a static `reason` from a `HANDOUT_REASON_MAP` constant in this file. Pure; no Dexie import.
- `src/pages/sandbox.ts` (or the equivalent file where 0055's paste-UI lives) — add the "Print this for your doctor" action button when `rows.length > 0`. On tap, call `buildDoctorHandout(rows, MARKERS)`, render the `DoctorHandout` into a hidden `.doctor-handout` DOM element (or a dedicated print-only section), then call `window.print()`. The hidden section is styled with `@media print { .sandbox-ui { display: none } .doctor-handout { display: block } }` so the print dialog shows only the handout.
- `src/styles.css` — `.doctor-handout` (print-only), `.doctor-handout__scored`, `.doctor-handout__suggested`, `.doctor-handout__footer`. Use `@media print` to hide everything except `.doctor-handout` and to apply print-safe typography (black on white, no color washes). No new colors in the on-screen view; ink and ink-soft.
- `src/data/markers.ts` — read-only; `findMarker()` and `flagFor()` are the resolution helpers. The `HIGH_IMPACT_MARKERS` constant lives in the coverage-gaps module (0052); import it from there, or if 0052 has not shipped yet, define a local `HIGH_IMPACT_MARKERS` constant in `doctor-handout.ts` (a small, curated list of ~10 markers) and note the N/A.
- `src/types.ts` — add a `DoctorHandout` interface (internal or exported); `SandboxRow` is the existing sandbox row type.
- `tests/helpers/flows.ts` — reuse the sandbox-session seeding helper (`seedSandboxSession` from 0049/0055 specs) to seed a session with known rows.
- `tests/e2e/sandbox-doctor-handout.spec.ts` (new) — every acceptance bullet maps to a `test()`. The print-target test reads the hidden `.doctor-handout` element after triggering the action (not via `window.print()` itself, which opens a real OS dialog) and asserts its contents.
- `tests/e2e/privacy.spec.ts` — extend with a sandbox-with-rows visit + print action trigger, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the action label reads "Print this for your doctor"; the handout heading reads "Your markers vs the functional optimum — built with Almanac"; the footer reads "Built with Almanac — on your device. Nothing about you was sent to a server." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Print layout: black on white, Cormorant Garamond for display, Inter Tight for body — matching the almanac aesthetic even on paper.

## Implementation log

(Appended by the implementation-dev agent during execution.)

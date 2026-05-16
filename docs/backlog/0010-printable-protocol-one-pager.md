---
id: 0010
title: Printable one-page protocol (on-device, share with doctor or friend)
status: in-progress
priority: P2
area: plan
created: 2026-05-15
owner: gtm-innovation
---

## User story

As a user about to walk into a doctor's appointment (or send a friend "this is what I'm doing"), I want to generate a one-page printable PDF of my current protocol — snapshot, eat list, avoid list, habit stack, retest plan, and the markers behind each — that I can hand over without having to install the app on the other person's device, and without exposing my API key or anything I haven't chosen to share.

## Why now (four lenses)

### Product Owner
The plan exists as a tappable in-app artifact today. Outside the app, it doesn't exist at all — a user can screenshot fragments, but there's no consolidated, sharable page. The smallest meaningful unit of value is a single button on the plan that produces a single PDF, with a single "what to include" toggle for the doctor view vs the friend view. This is a 1-day ticket that compounds with every future plan compose — every plan becomes a portable artifact.

### Stakeholder
This is the **structured artifact** moat made physical. `Plan` is already typed, durable, and reasoned-over. The PDF is the on-paper expression of it, in the same editorial almanac voice. It travels in two channels we can't compete with otherwise: the clinical channel (the doctor reads it before the appointment) and the social channel (a friend reads it on their phone after the user texts it to them). Neither requires Almanac to be installed. Neither violates the privacy contract — generation is fully on-device. Both produce the show-me moment in environments where the user isn't holding their phone.

### User (at 7am on the phone)
On the plan page, a small "Print or share" link below the snapshot. Tap it. Choose "For my doctor" (includes panel summary, plan, retest schedule, redacts goals and personal narrative) or "For a friend" (includes snapshot, eat list, habit stack, hides labs and conditions). Tap "Generate." Five seconds later the OS share sheet appears with a PDF named `almanac-plan-2026-05-15.pdf`. I share it. It looks like it was set in a real editorial template — Cormorant Garamond display, Inter Tight body, oxblood accents — not a wellness app screenshot.

### Growth
Word-of-mouth in this category is bottlenecked on "what do I actually show my friend." The PDF removes that bottleneck. It's the artifact a friend can read end-to-end in 90 seconds and ask "wait, what app is this?" The doctor variant is the highest-trust acquisition vector we have access to — physicians who see a clean, structured protocol with functional ranges noted will ask the patient where it came from. (Hypothesis: clinician-driven referrals are the highest-LTV channel for this category.)

## Acceptance criteria

- [ ] On the `#/plan` page (both Read and Dashboard modes), a **"Print or share"** action appears in the page header next to the mode toggle.
- [ ] Tapping it opens a small inline panel (no slideover, no route change) with two options: **"For my doctor"** (default) and **"For a friend"**, plus a single **"Generate PDF"** button.
- [ ] **For my doctor** PDF includes: the user's display name (from profile), today's date, snapshot, all insights, the eat list and avoid list with their `why` and `markerKeys`, the habit stack, the retest schedule, a panels summary (most recent draw date + out-of-range markers with values and functional ranges). It excludes: goals free-text, conditions free-text, household size, anthropic key, any meal plan.
- [ ] **For a friend** PDF includes: display name (or "A user" if the user toggles "hide name"), snapshot, eat list (titles + portions only — no markerKeys), avoid list (titles + swap only), habit stack, the eyebrow date. It excludes: panel data, marker values, retest, insights with marker references.
- [ ] Generation runs entirely on-device — no network calls. Assert via the mock's request count (zero new requests during generate).
- [ ] The Anthropic API key is NEVER present in the PDF bytes. Assert by reading the PDF buffer back from the download and grep'ing for the key (it won't be there).
- [ ] The PDF is set in Cormorant Garamond for headlines and Inter Tight for body. (If embedding fonts blows the budget, fall back to a CSS-print stylesheet with the fonts referenced by name; the user's local installation will use them, otherwise the browser PDF engine substitutes.)
- [ ] The file is named `almanac-plan-YYYY-MM-DD.pdf` and is delivered via a download (desktop) or the OS share sheet via `navigator.share({ files: [...] })` when available (mobile).
- [ ] Privacy E2E still passes (no new hostnames; egress allow-list unchanged).
- [ ] Page works on both chromium and mobile-webkit. The PDF generation path is asserted on chromium only (Playwright's mobile-webkit PDF download support is flaky and not our test target); mobile asserts the UI renders + the share button is wired.
- [ ] New `tests/e2e/print.spec.ts` covers: option toggle, generate flow, file naming, key-redaction assertion, doctor-vs-friend content differences.

## Out of scope

- A multi-page PDF (whole week of meals, full grocery list, full lab history). One page is the constraint and the discipline. If users ask for more, add a separate "Full export PDF" ticket.
- Server-side PDF rendering. Use the browser's built-in print stack (`window.print()` to a hidden iframe, or generate via a small client-side library like `pdf-lib` ~150kb if `window.print()` quality is unacceptable — justify the dep in the ticket implementation log if pulled in).
- A "share to social" button. Sharing happens via the OS share sheet, not via any social-platform API.
- Editing the PDF before generation. The toggle is "for doctor" or "for friend"; that's the only customization.
- Including the meal plan in the PDF. That deserves its own ticket (a printable meal-plan + grocery card).

## Engineering notes

- `src/pages/plan.ts` — add the "Print or share" panel in the header region. The panel and the underlying generator are mounted via `src/print/protocol.ts` (new module).
- `src/print/protocol.ts` — exports `generateProtocolPdf(plan, profile, panels, audience: "doctor" | "friend"): Promise<Blob>`. Two implementation choices, in order of preference:
  1. Render the protocol as a styled, print-only `<div class="print-sheet">` and trigger `window.print()` against it. Use a `@media print` stylesheet that hides everything else. Zero new deps. The user sees the OS print dialog with "Save as PDF" as an option.
  2. If (1) doesn't give us programmatic Blob access for the share-sheet path, pull in `pdf-lib` (~150kb min+gz). Justify in commit body; only add if (1) fails the share-sheet criterion.
- `src/print/template.ts` — pure function that returns the audience-specific HTML string. Two render paths: `renderForDoctor()` and `renderForFriend()`. Re-use `esc()` for safety.
- `src/styles.css` — add a `@media print` block that hides `.masthead`, `.foot`, and nav, and styles `.print-sheet` for a single A4/Letter page.
- Web Share API: `navigator.share({ files: [new File([blob], name, { type: "application/pdf" })] })` when `navigator.canShare` reports true; fallback to `<a download>` link click.
- Schema migration: **no**.
- Egress allow-list change: **no**.
- New deps: prefer **no**. If `pdf-lib` is required, justify in the implementation log per AGENTS.md.

## Implementation log

### 2026-05-16 — picked up by implementation-dev

Branch: `feat/0010-printable-protocol`. Approach: Option 1 from the engineering
notes — render a `.print-sheet` into the live DOM and trigger `window.print()`.
No new dependencies. The browser's "Save as PDF" / "Share" flow off the print
dialog covers the share-sheet criterion on every modern OS the user is on, and
keeps every byte on-device. `navigator.share({ files })` is wired as an
opportunistic enhancement when `navigator.canShare({ files })` reports true and
the print path falls through; otherwise it's a plain `<a download>` link.

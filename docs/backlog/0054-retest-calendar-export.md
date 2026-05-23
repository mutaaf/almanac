---
id: 0054
title: Put the draw on your calendar — a one-tap .ics export of the retest date the plan already wrote
status: groomed
priority: P1
area: today
created: 2026-05-22
owner: gtm-innovation
---

## User story

As a user three months into a protocol whose plan told me to "recheck ferritin and ApoB in 12 weeks," I want a one-tap "Add to calendar" on the retest surface that downloads a standard `.ics` event for that due date — titled with the markers to draw and a note to bring the results back to Almanac — so that the single most consequential action in precision health, actually going back to get the blood drawn, lands in the calendar app I already check every day, instead of living only inside a health app I might forget to reopen for three months.

## Why now (four lenses)

### Product Owner

The retest surface (0028, shipped) already computes the due date from the plan's `retest` cadence and surfaces it on Today as a calm in-app countdown. That nudge only works if the user opens Almanac on or near the due day — but the whole problem 0028 names is that twelve weeks is exactly the window in which a user drifts off and stops opening the app at all. The plan knows the date; the app cannot reach the user when they are not in it; and AGENTS.md correctly forbids the obvious server-side answer (push notifications, a backend reminder). The honest, zero-backend bridge is the device's own calendar: an `.ics` file is a plain-text artifact the browser can generate locally and hand to the OS, which then owns the reminder. The smallest meaningful unit of value is an "Add to calendar" action beside the retest card that builds a single `VEVENT` from the existing `computeRetestStatus(...)` output — the due date as an all-day event, the markers in the title, the plan's reason and a "bring your results to Almanac" line in the description — and triggers a download of `retest.ics`. No new data, no inference, no permission prompt, no server. It moves the plan's own retest cadence out of an app the user might not reopen and into the calendar they check daily.

### Stakeholder

This is the keystone retention move that lets the **adherence loop** and the **persistent timeline** survive the twelve-week gap they are most likely to die in. The timeline is only a moat if it keeps growing; it grows only when a second draw lands; the second draw happens only if the user remembers to get it — and the in-app nudge (0028) cannot fire if the user has stopped opening the app. A locally-generated calendar event is the one re-engagement channel a no-backend product can own: it puts a dated reminder on a surface outside the app, owned by the OS, with zero egress and nothing personal leaving the device (the `.ics` is built and downloaded entirely on-device). A chat box has no retest cadence to export — it has no record that you composed a plan, no structured `retest` field, no due date to write into a `VEVENT`. The export is structurally a product feature, and it converts capacity the product already paid to build (the plan's retest cadence) into the recurring return that keeps the whole loop alive. It widens the moat precisely where the moat is thinnest: the long quiet between draws.

### User (at 7am on the phone)

A Tuesday, two weeks before my recheck is due. On Today, below the meals, the calm line I already trust: "Ferritin and ApoB are due for a recheck in 14 days." Beside it now, one quiet action: "Add to calendar." I tap it. My phone asks if I want to add an event; I say yes. There it is, an all-day event on the right Saturday — "Almanac: draw ferritin and ApoB" — with a note reminding me to bring the results back. Now it does not matter whether I open this app again before then; my calendar will tell me, the way it tells me about everything else that matters. One tap, done, hands wet from the sink, no typing, no account, no waiting. It worked offline, instantly, because the date was already computed on my phone from a plan I already own — nothing was fetched, nothing was sent.

### Growth

This is a pure retention ticket aimed at the loop's central conversion: the second-and-later draw that turns a one-panel tourist into a multi-panel resident. (Hypothesis: a one-tap calendar export of the retest date lifts the rate of second-and-later draws above what the in-app-only nudge of 0028 achieves, because the calendar reaches the user during the long window when they have stopped opening the app — the exact failure mode 0028's in-app surface cannot cover; back-of-envelope from how exported-to-calendar reminders outperform in-app-only reminders for actions due weeks out, since the calendar is a daily-checked surface the app is not; treat as untested without remote analytics, which we will never add.) Its acquisition tail is the same as 0028's: a user who actually retests and watches a marker move is the user who saves the improvement card (0047) and tells a friend — and the calendar export is what makes the retest more likely to happen at all, which is the precondition for every over-time share artifact the product has. The "show me" frame is quieter than a screenshot but real: "it even put my retest on my calendar so I wouldn't forget" is the kind of considered, anti-nag detail the persona repeats to the friend they are recommending it to.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/today/retest-ics.ts` (new) exports `buildRetestIcs(status: RetestStatus): string` returning a valid iCalendar document: `BEGIN:VCALENDAR` / `VERSION:2.0` / `PRODID` / a single `BEGIN:VEVENT`...`END:VEVENT` / `END:VCALENDAR`, CRLF-terminated lines per RFC 5545. The `VEVENT` carries a `DTSTART;VALUE=DATE` all-day date equal to `status.dueDate`, a `SUMMARY` naming the markers to draw, a `DESCRIPTION` carrying the plan's retest reason plus the line "Bring your results back to Almanac.", a stable `UID`, and a `DTSTAMP`. Pure: no DOM, no Dexie, no network. Asserted by passing a known `RetestStatus` and confirming the structural lines, the all-day `DTSTART` date, and the marker names in the `SUMMARY`.
- [ ] The Today retest card (`src/pages/today.ts`, from 0028) renders an "Add to calendar" action whenever the retest card itself renders (i.e. status `due-soon` or `overdue`). Tapping it builds the `.ics` via `buildRetestIcs(...)` and triggers a download named `retest.ics` (reuse the existing on-device download mechanism the share/export surfaces use). Asserted by seeding a due-soon plan, tapping the action, and confirming a `retest.ics` download.
- [ ] The exported event's `DTSTART` date equals the due date the retest card displays — the calendar event and the in-app countdown agree to the day. Asserted by seeding a cadence due 9 days out, reading the card's displayed due date, and confirming the `.ics` `DTSTART` matches it.
- [ ] The `SUMMARY` lists the same markers (human names, joined the same way) the retest card shows — a two-marker cadence reads "Almanac: draw Ferritin and ApoB", a one-marker cadence reads "Almanac: draw ApoB". Marker names resolve via `findMarker()` (sex-specific keys render "Ferritin", not `ferritin_m`). Asserted with a two-marker and a one-marker cadence, and with a sex-specific marker.
- [ ] When no retest card renders (no plan, empty `retest` cadence, or status `upcoming` > 14 days out), the "Add to calendar" action is ABSENT — the export rides the existing card's visibility exactly. Asserted on a plan with empty `retest` (no card, no action) and a cadence 60 days out (no card, no action).
- [ ] The `.ics` is generated with **zero network calls** and **zero Anthropic calls** — it is a pure string built from the already-computed `RetestStatus` and downloaded on-device. Asserted by tapping the action and confirming the mock recorded zero requests during the build/download.
- [ ] The Anthropic key NEVER appears in the `.ics` text or any intermediate string. Asserted by seeding a sentinel key on the profile and confirming it appears nowhere in the generated calendar document.
- [ ] The `.ics` contains nothing personal beyond the markers, the date, and the plan's retest reason — no name, no email, no profile field, no other marker values, no URL with a tracking parameter. Asserted by confirming the document contains none of the profile's owner name/email and no `http`/`https`/`?`-bearing tracking string (a bare "Almanac" wordmark in text is allowed; an attendee/organizer line is not emitted).
- [ ] Renders the action on both **chromium and mobile-webkit**. The action is a ≥44×44 css px tap target (min-height ≥45 px per the 0017 sub-pixel lesson in `docs/LESSONS.md`); it sits with the retest card without pushing the meals above the fold; on mobile-webkit, where programmatic download may be blocked, the `.ics` content is verified via the same path 0047/0011's spec uses for the download-blocked project (note in the spec which path is asserted per project).
- [ ] Tour mode (0014) offers the export against the tour fixture's plan only when the fixture's retest card itself renders (otherwise absent — never fabricated). Shared-view mode (0017) does NOT render the action — the retest card is the owner's Today, not a shared protocol. Asserted in both modes.
- [ ] The existing retest card (0028) — its copy, its tap-to-`#/labs` navigation, its due-soon/overdue states, its covering-draw suppression — is byte-for-byte unchanged in behavior; the calendar action is purely additive on the card. Asserted by exercising the existing retest-card flow and confirming it is unchanged.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the export is local-only and deterministic; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the `.ics` is built from the existing plan's retest cadence (the same `computeRetestStatus(...)` output 0028 already produces). Nothing new is persisted.
- [ ] New `tests/e2e/retest-calendar-export.spec.ts` covers: a valid CRLF iCalendar document with a single all-day `VEVENT`, the `DTSTART` matching the card's due date, the `SUMMARY` markers matching the card (one-marker, two-marker, sex-specific), the action absent when no card renders, zero network + zero Anthropic, the key never appears (sentinel), no personal data beyond markers/date/reason, the existing retest card unchanged, tour vs shared-view behavior, mobile rendering/download-path note.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A calendar-provider integration (Google Calendar API, CalDAV, Apple Calendar OAuth). Those are accounts and egress to a server we do not operate. The `.ics` file is the universal, zero-backend, privacy-clean handoff — the OS owns the import. Do not add a provider sync.
- A recurring event or a multi-event series for every future retest. One `VEVENT` for the current plan's nearest-due retest, matching the single-card discipline of 0028. A recurring series is a separate, larger design and risks stale events when the plan recomposes.
- An alarm/`VALARM` reminder block tuned to a specific time. The all-day event lets the user's own calendar reminder defaults apply; baking in a fixed alarm time is presumptuous and adds RFC surface for no clear gain. (A simple default `VALARM` is a possible follow-up if users ask, not v1.)
- Editing or overriding the retest date from the export. The date is the plan's, exactly as the card shows it; a different date belongs to a future plan-edit surface, not a one-off override here. The export is a faithful copy of the computed due date.
- A push notification, web-push, or service-worker reminder. AGENTS.md forbids the server side, and 0028 already established the no-notification posture. The calendar is the device-owned channel; the app does not request notification permission.
- Putting any marker value, profile field, name, or email into the `.ics`. The event carries only the markers to draw, the due date, and the plan's retest reason. A retest is a future draw, not a past result — there are no values to leak, and none must be added.
- Carrying the calendar export into the doctor PDF (0010/0016), the share link (0017), or the Markdown export (0027). It is a live, on-device handoff to the user's own calendar, not a static artifact for sharing.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/today/retest-ics.ts` (new) — `buildRetestIcs(status: RetestStatus): string`. `RetestStatus` already exists in `src/types.ts` from 0028 (`{ markers: string[]; dueDate: Date; daysUntil: number; state; setOn: Date }`); read its shape there before coding. Build the iCalendar string by hand (no dependency): CRLF line endings, `DTSTART;VALUE=DATE:YYYYMMDD` for the all-day event, a deterministic `UID` (e.g. derived from the due date + markers, suffixed `@almanac.local`), a `DTSTAMP` in UTC basic format, a `SUMMARY` of "Almanac: draw <markers>", a `DESCRIPTION` of the plan's retest reason + "Bring your results back to Almanac." Escape `DESCRIPTION`/`SUMMARY` per RFC 5545 (commas, semicolons, newlines). Pure; the page passes the already-computed status.
- `src/pages/today.ts` — the retest card from 0028 renders below the meals when `computeRetestStatus(...)` returns `due-soon`/`overdue`. Add the "Add to calendar" action inside that same card block, gated on the same condition (the action exists iff the card exists). Wire it to `buildRetestIcs(status)` → a Blob (`text/calendar`) → the existing on-device download helper (the one 0047/0011/0027 use for local file downloads — reuse it, do not invent a second mechanism).
- `src/today/retest.ts` — read-only. `computeRetestStatus(...)` already produces the `RetestStatus` the export consumes; do not change it.
- `src/data/markers.ts` — read-only. `findMarker()` resolves the marker human names (and sex-specific keys) for the `SUMMARY`, consistent with how 0028's card renders them.
- `src/types.ts` — no new persistent types; `RetestStatus` already exists. Any internal helper type lives in `retest-ics.ts`.
- `src/styles.css` — one new action styled like the existing Today card actions (min-height ≥45 px for the ≥44 px tap target per the 0017 lesson). No new colors; ink and ink-soft, oxblood reserved.
- `src/sample/state.ts` / `src/share/shared-state.ts` — the action rides the existing retest card's `isTour()` / `isSharedView()` gating from 0028: present in tour only when the fixture card renders, absent in shared-view.
- `tests/helpers/flows.ts` — reuse `seedPlanWithRetest(page, { markers, weeks, createdAt })` (added in 0028's spec) to place the due date precisely relative to a controlled `now`; drive `now` via Playwright's clock API for a deterministic `DTSTART`.
- `tests/e2e/retest-calendar-export.spec.ts` (new) — every acceptance bullet maps to a `test()`. The structural test parses the downloaded `.ics` text and asserts the `VCALENDAR`/`VEVENT` envelope, the all-day `DTSTART`, and the `SUMMARY` markers; the date-agreement test reads the card's displayed due date and confirms the `DTSTART` matches.
- `tests/e2e/privacy.spec.ts` — extend with a Today visit carrying a due cadence, tapping the export, confirming zero off-allow-list egress and no key/personal-data in the `.ics`.
- New deps: **no** — the iCalendar string is built by hand; do not add `ics`/`ical-generator`.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the action reads "Add to calendar"; the event `SUMMARY` reads "Almanac: draw <markers>"; the `DESCRIPTION` carries the plan's retest reason and "Bring your results back to Almanac." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

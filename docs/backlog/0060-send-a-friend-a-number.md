---
id: 0060
title: Send a friend a number — a pre-filled sandbox link that opens with the one marker your friend mentioned, already scored
status: proposed
priority: P1
area: growth
created: 2026-05-26
owner: gtm-innovation
---

## User story

As a user who just heard a friend say "my LDL came back at 180 and my doctor said it's fine" at brunch, I want to drop them a one-tap link that opens the pre-key sandbox with their marker, their value, and the right sex/age preset already filled in — the row scored, the report card rendered, no signup, no key, no install — so that the friend opens the link on their phone in the next minute and sees their own number land outside the functional optimum, instead of me trying to explain the gap in a text and losing them to "I'll look at the app later."

## Why now (four lenses)

### Product Owner

The pre-key sandbox stack — 0040 (typed-marker sandbox), 0055 (paste-your-report), 0038 (functional-range reference) — already does the hard work: a prospect can score their own numbers against the functional optimum in seconds with no key. But the friction that still gates conversion is the *first marker*. A skeptic who lands on `#/try` has to pick from a long dropdown and remember a value before anything happens — and the friend you just talked to about their LDL has to do all of that themselves before they see the row that proves the point. The smallest meaningful unit of value is a one-tap "send this to a friend" affordance on the sandbox (and on the Plan page's existing tell-a-friend surface, 0050) that composes a link of the form `#/try?marker=ldl&value=180&sex=m&age=42` — and a corresponding sandbox boot that reads the params, validates them against `MARKERS[]` + `flagFor()`, and renders the resolved row + report-card-tally on first paint. The recipient lands on a sandbox that already shows their number scored; the typing step is gone. It is the lowest-friction conversion of a real conversation into an app session the product can build, and it reuses every primitive 0040/0055/0036 already shipped.

### Stakeholder

This widens the **acquisition** edge of the funnel at the exact seam where the chat-box comparison loses the prospect: a link a friend can tap that scores their own number, instantly, with no commitment, is structurally a product feature of a sandbox that ships the functional-range DB and the flag classification on-device. It compounds the moat by turning every existing user into a low-overhead distribution channel without a backend, without analytics, without a referral program — the link is a pure URL, the parsing is deterministic, the rendering is offline, and the recipient never trusts the app with anything until they choose to. It is the asymmetric viral primitive the product has been missing: the share artifacts shipped so far (0011 marker hero, 0017 share link, 0033 fridge card, 0047 improvement card, 0050 tell-a-friend) all carry *the sender's* numbers and impose a "now read this about me" cognitive load on the recipient; this carries *the recipient's* number forward and asks them only "is this fine?" — a question they already wanted answered. The recipient who feels the vindication is the natural seed of 0049 (sandbox-into-first-panel), which is already groomed and closes the conversion.

### User (at 7am on the phone)

I'm at brunch and my friend just told me about their LDL of 180. I open the app on my phone — Plan or the sandbox, either works — and tap a small "Send a friend a marker" action. A tiny form: marker (LDL), value (180), sex (male), age (42). I tap "Compose link." My phone's share sheet opens with a plain-text message already written ("I think you'll find this interesting — your number, scored against both ranges, no signup needed:") and a short link. I send it. Two minutes later my friend taps the link on their own phone; the sandbox opens, the row resolves on first paint — LDL 180 against a functional optimum that ends around 100, the report card naming the gap — and they have not typed a single thing, not pasted a key, not signed anything. That is the conversation continuing in the place it was supposed to. It worked offline, the link was deterministic, and nothing about my friend ever traveled through a server.

### Growth

This is the most asymmetric acquisition wedge the product can ship inside its constraints: it converts a real one-to-one conversation — the warmest possible referral — into a tappable artifact that delivers the prospect's vindication on the prospect's own data with zero friction. (Hypothesis: pre-filled, recipient-centered sandbox links convert above sender-centered share artifacts among the "told everything's normal" persona, because the link asks the recipient a question they already wanted answered — "is my number actually fine?" — instead of asking them to read about someone else's protocol first; the act of composing the link also gives the sender a concrete reason to bring up the app in a conversation they were going to have anyway; back-of-envelope from how recipient-personalized links out-convert generic-share links in referral mechanics; treat as untested without remote analytics, which we will never add.) The "show me" frame is the recipient's first paint: a single resolved row showing *their* number against the functional optimum the lab did not name, with no signup screen in between. It is the recipient-centered sibling of 0050 (tell-a-friend) and 0049 (sandbox-into-first-panel): 0050 advertises your protocol, this advertises *their* gap; 0049 closes the conversion when the friend is ready, this opens it the moment the conversation happens.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/sandbox/share-link.ts` (new) exports `encodeFriendMarkerLink({ markerKey, value, sex?, ageYears? }): string` and `parseFriendMarkerParams(hash: string): { markerKey, value, sex?, ageYears? } | null`. The encoder produces a URL of the form `#/try?marker=<key>&value=<n>[&sex=m|f][&age=<years>]`; the parser returns null for any invalid marker key (must resolve via `findMarker()`), any non-finite value, or any out-of-range age. Pure: no DOM, no Dexie, no network. Asserted by round-tripping known params and by passing malformed inputs and confirming null.
- [ ] The sandbox (`src/pages/try.ts`) reads `parseFriendMarkerParams(...)` on first render and, when valid params are present, appends ONE resolved row for the carried marker + value (using `flagFor()` with the sex/age preset where applicable), and renders the 0036 report-card tally over that single row (the existing tally already handles the single-row case, or the spec documents the chosen single-row copy). The user can then add more markers as before. Asserted by visiting `#/try?marker=ldl&value=180&sex=m&age=42` pre-consent on a fresh browser and confirming the LDL row resolves on first paint with the expected flag.
- [ ] Invalid params (unknown marker key, non-numeric value, value outside any sane sentinel bounds, missing required field) produce NO row and NO error — the sandbox renders exactly as it does for a bare `#/try` visit. Asserted by visiting `#/try?marker=not-a-marker&value=180` and `#/try?marker=ldl&value=abc` and confirming the sandbox renders empty.
- [ ] A "Send a friend a marker" action is added in TWO places: (a) on the sandbox itself, beside the existing picker/paste affordances, so an existing user already in the sandbox can compose one; (b) on the Plan page, alongside the existing 0050 tell-a-friend action, so the existing user has a one-tap path from their own protocol to seeding a friend. Asserted by visiting the sandbox and the Plan page and confirming the action renders in both.
- [ ] Tapping the action opens a compact composer (modal or inline panel): a marker picker (over the curated `MARKERS[]` only — no user markers, per the gate-bypass constraint that the sandbox reads no IndexedDB), a numeric value field, optional sex (male/female/skip), optional age. Tapping "Compose link" builds the URL via `encodeFriendMarkerLink(...)` and invokes the existing 0050 native-share path (with its documented clipboard fallback). Asserted by composing a link from the action and confirming the share payload contains the encoded URL.
- [ ] The composed share message is plain and recipient-centered: "I think you'll find this interesting — your number, scored against both ranges, no signup needed:" followed by the link. NO sender name, NO sender labs, NO sender protocol content. Asserted by composing the message and confirming the body matches and contains no profile/lab/insight strings.
- [ ] The pre-filled sandbox renders **pre-consent** and **pre-profile** (the gate-bypass treatment 0040/0055 already use). The recipient lands on the sandbox with the row resolved without acknowledging consent or having a profile. Asserted by visiting the pre-filled link on a fresh browser and confirming the sandbox renders and the row appears.
- [ ] The pre-filled sandbox makes **zero Anthropic calls** and **zero network calls** — the row resolves over `MARKERS[]` + `flagFor()` + the static functional-range curation, exactly as 0040 does. Asserted by visiting the pre-filled link and confirming the mock recorded zero requests.
- [ ] The pre-filled sandbox writes NOTHING to Dexie — the carried marker/value lives only in the page's in-memory state (the same in-memory model 0040 uses) and is gone on reload of `#/try` without params. Asserted by visiting the pre-filled link, reloading `#/try` without params, and confirming no rows persist.
- [ ] The Anthropic key NEVER appears in the composed link, the share message, the sandbox URL, or any intermediate string. Asserted by composing a link with a sentinel key seeded in the sender's profile and confirming the key appears nowhere.
- [ ] The carried marker handoff into 0049 (sandbox-into-first-panel) still works: the recipient who, after seeing the row, taps "Bring these numbers in" carries the pre-filled marker into the first-panel flow just as a typed/pasted marker does. Asserted by visiting the pre-filled link, tapping the 0049 handoff, and confirming the first-panel flow carries the marker forward.
- [ ] Renders on both **chromium and mobile-webkit**. The composer fits the 390 px viewport, action targets are ≥44×44 css px (min-height ≥45 px per the 0017 sub-pixel lesson), long marker names respect `min-width: 0`. Asserted on both projects.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the share link is a pure URL, the parse is deterministic, the render is offline; no new hostnames; no inference call.
- [ ] Schema migration: **no** — the link carries no persistent state and the sandbox writes nothing.
- [ ] New `tests/e2e/send-a-friend-a-number.spec.ts` covers: encoder/parser round-trip, the pre-filled row renders on first paint, invalid params render empty cleanly, the composer renders on the sandbox and on Plan, the share message is recipient-centered and carries no sender data, pre-consent gate bypass, zero Anthropic + zero network on the recipient side, no Dexie writes, the key never appears (sentinel), the 0049 handoff still works, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- An LLM-composed share message. The message is a fixed editorial string + the deterministic link; no inference at compose time.
- Multi-marker pre-fill in the link. The link carries exactly one marker (the marker the friend just mentioned). A multi-marker pre-fill is a plausible future ticket; collapsing into one marker keeps the link short, the URL safe to text, and the recipient's first paint instant. The recipient can add more markers in the sandbox as 0040 already permits.
- A sender-side "who did you send this to" log, a follow-up reminder, or any inbound channel. There is no backend; the sender's involvement ends at the share-sheet tap. No "your friend opened the link" surface — that would require a server.
- A QR code, a deep-link app handoff, or a printable shareable. The link is a plain URL invoked through the OS share sheet (and clipboard fallback). Other channels are future tickets.
- Carrying the friend's name, contact, or any PII through the link. The sender composes a marker + value + optional sex/age preset; nothing about the friend persists anywhere except the URL the sender just texted them.
- Reading user-defined markers (from 0002's extensible-markers flow) into the pre-fill picker. The picker uses the curated `MARKERS[]` only — the sandbox is pre-gate and reads no IndexedDB, so user-defined markers cannot resolve there. Document this gracefully on the composer.
- Showing the recipient any sender content — sender's profile, sender's labs, sender's protocol. The link carries only the recipient's marker + value (+ optional sex/age preset). The sender's identity is intentionally absent.
- An image/card render of the pre-filled row. The artifact is the resolved row itself, on the recipient's screen. An image variant is the territory of 0011 (marker hero) / 0033 (fridge) / 0047 (improvement) — not this ticket.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/sandbox/share-link.ts` (new) — `encodeFriendMarkerLink({ markerKey, value, sex?, ageYears? })` and `parseFriendMarkerParams(hash)`. Validate `markerKey` via `findMarker()`, `value` via `Number.isFinite` + sane sentinel bounds, `sex` against `'m' | 'f'`, `ageYears` against `0 < age < 130`. Encode via `URLSearchParams` against the `#/try` hash route. Pure; no Dexie, no LLM.
- `src/pages/try.ts` — on first render, read the hash params via `parseFriendMarkerParams(window.location.hash)`. If valid, append one in-memory row (the same in-memory shape 0040 uses) and trigger the existing `flagFor()` + `computeReportCard()` render path. Do NOT persist; the in-memory state is the only state.
- `src/main.ts` — read-only confirm: the existing `#/try` gate-bypass already lets the route render pre-consent and pre-profile. No new route, no new gate-bypass.
- `src/pages/plan.ts` — add the "Send a friend a marker" action beside the existing 0050 tell-a-friend action (reuse the same affordance idiom; do NOT replace 0050). Open the composer via the new shared composer module.
- `src/sandbox/friend-composer.ts` (new) — small render function that exposes a marker picker (over the static `MARKERS[]`), a value field, optional sex/age, and a "Compose link" button. On submit, build the URL via `encodeFriendMarkerLink(...)` and invoke the existing 0050 native-share path (`src/share/...` — the existing native-share invocation 0050 ships).
- `src/share/share-protocol.ts` (or wherever 0050's native-share lives) — read-only reuse. Do NOT add a second native-share path or a second clipboard fallback; reuse the one 0050 cleared through the privacy review.
- `src/styles.css` — `.friend-link` (the composer), `.friend-link__action` (the share button), reusing the existing modal/inline-panel idioms. Action ≥44×44 css px (`box-sizing: border-box; min-height: 45px`). Grid children `min-width: 0`. No new colors; ink, ink-soft, oxblood reserved for the share action.
- `src/sample/state.ts` / `src/share/shared-state.ts` — tour mode (0014) and shared-view mode (0017) may render the composer action only if they have a sensible state to compose from; document the chosen behavior (the simplest is: tour renders the action and composes against the tour's curated marker set; shared-view does not render the action, since the viewer has no profile to compose from).
- `tests/helpers/flows.ts` — add `composeFriendLink(page, { markerKey, value, sex?, ageYears? })` to drive the composer without re-creating the picker clicks. Reuse 0050's native-share assertion helper for the share payload.
- `tests/e2e/send-a-friend-a-number.spec.ts` (new) — every acceptance bullet maps to a `test()`. The pre-filled-render test visits `#/try?marker=ldl&value=180&sex=m&age=42` on a fresh browser and asserts the row resolves on first paint; the invalid-params test visits malformed URLs and asserts the sandbox renders empty cleanly.
- `tests/e2e/privacy.spec.ts` — extend with the pre-filled sandbox visit and a compose-from-Plan, confirming zero off-allow-list egress and no sender labs/insights/key in the link or share message.
- New deps: **no** — `URLSearchParams` is built-in; the native-share path is the existing 0050 module.
- Egress allow-list change: **no**.
- Schema migration: **no** — the link carries no persistent state and the sandbox writes nothing.
- Voice spec: the composer eyebrow reads "Send a friend a marker"; the share message reads "I think you'll find this interesting — your number, scored against both ranges, no signup needed:". Declarative, no exclamation, no sender naming. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft, oxblood reserved for the share action.

## Implementation log

(Appended by the implementation-dev agent during execution.)

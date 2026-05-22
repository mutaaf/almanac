---
id: 0049
title: Bring your sandbox numbers in — let the prospect who just scored their own markers carry them into a real first panel
status: proposed
priority: P2
area: onboarding
created: 2026-05-22
owner: gtm-innovation
---

## User story

As a prospect who just typed three or four markers I knew off the top of my head into the pre-key sandbox (0040), felt the gap on my own ApoB and fasting insulin, and decided to set up — I want the numbers I already entered to come with me through consent and onboarding, offered as the seed of a real first manual panel ("You scored these in the sandbox — add them as your first panel?"), so that I don't have to re-type the same values I just typed thirty seconds ago, and the moment of conviction the sandbox created flows straight into a real timeline instead of being thrown away at the door.

## Why now (four lenses)

### Product Owner

The sandbox (0040, groomed) is the highest-intent acquisition surface the product has — the prospect scores their own numbers against the functional optimum, feels the gap, and decides to set up. But 0040 explicitly throws those numbers away the moment the prospect proceeds: it persists nothing (correctly — it is pre-consent and reads/writes no IndexedDB), and its out-of-scope names "carrying them into onboarding" as a deliberate follow-up because it "would require IndexedDB writes pre-consent, which this ticket forbids." The result is a seam: a prospect who just typed four markers and felt convinced is, immediately after consenting, handed an empty labs page and asked to type the exact same four markers again. That re-type tax at the moment of peak motivation is precisely where a converted prospect can stall. The smallest meaningful unit of value is a handoff that respects the gate: the sandbox holds its typed values in **session memory** (sessionStorage, nothing personal persisted to disk pre-consent); when the prospect proceeds from the sandbox to `#/welcome` and acknowledges consent, onboarding offers — once — to seed a first manual panel from those session values ("You scored these in the sandbox — add them as your first panel?"). On accept, the values become a real `Panel` via the existing `addManualPanel` path, dated today, fully editable in the standard review screen before commit. On decline (or with no session values), onboarding is exactly as it is today. It writes IndexedDB only after consent, reuses the manual-entry path wholesale, and turns the sandbox's conviction moment into the first entry in a real timeline.

### Stakeholder

This completes the **acquisition funnel into the persistent timeline** — the moat asset that every compounding surface depends on — by removing the single highest-motivation drop-off the product has: the re-type wall right after the prospect decides to commit. It compounds the sandbox (0040): 0040 creates conviction on the prospect's own numbers; this ticket converts that conviction into a stored panel, which is the precondition for trends, movement receipts, the report card, and the whole adherence loop. It does it without touching the privacy contract: the sandbox stays a read-no-write, persist-nothing surface pre-consent (session memory is in-tab, cleared on tab close, and never written to IndexedDB before the gate); the first IndexedDB write happens only after consent, through the existing manual-panel path, exactly as a normal first panel would. It is a structural advantage a chat box cannot match: the prospect's typed numbers, scored against a curated optimum and then carried into a dated, canonicalized, dual-range timeline, is a continuity of state the chat box has nowhere to keep. The faster a prospect's first real panel lands, the sooner the timeline starts compounding — and the timeline's value is the whole moat.

### User (at 7am on the phone)

A friend sent the link. I tried the sandbox, typed my ApoB, my fasting insulin, my ferritin from memory, saw the gap, and decided this is worth it. I tap "Start your own," I read and acknowledge the consent points, and as I set up my profile, onboarding meets me where I left off: "You scored ApoB 110, fasting insulin 8, ferritin 32 in the sandbox — add them as your first panel?" Yes. They drop into the standard review screen, dated today, and I can fix or add to them before I commit — but the typing is already done. I did not re-enter a single number I had just entered. The moment I felt convinced flowed straight into a real record I now own. If I had declined, or come in cold without the sandbox, setup would be exactly as it always is. It worked offline up to the point of any extraction — these were typed values, so there was no call at all; my first real panel just exists now.

### Growth

This is a pure conversion-rate ticket at the exact seam where the funnel's most-motivated prospects sit. (Hypothesis: carrying the sandbox values into a real first panel raises the rate at which a prospect who used the sandbox completes a first stored panel, because it removes a re-type tax imposed at the moment of peak motivation — the highest-leverage place to remove friction in any funnel is immediately after the commit decision, and the sandbox is the surface that creates that decision; back-of-envelope from how pre-filling the first real action from a just-completed teaser lifts activation in trial-to-paid flows; treat as untested without remote analytics, which we will never add.) It compounds the shipped/groomed acquisition stack: the improvement card (0047) and share link (0017) bring a friend to the tour/sandbox; the sandbox (0040) converts them on their own numbers; this ticket closes the loop by making their first real panel one tap instead of a re-type. The "show me" frame is the continuity itself — "I typed my numbers to test it, decided to set up, and it already had them waiting" is the frictionless on-ramp the persona describes to the friend they are recommending it to, and frictionlessness at the first step is what makes a recommendation stick.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The sandbox (`src/pages/try.ts`, from 0040) writes its current typed rows to **sessionStorage** (key `almanac.sandbox.rows`) on each change, as `{ key: string; value: number }[]` — NOT to IndexedDB and NOT to localStorage. The sandbox's existing behavior is otherwise unchanged (it still persists nothing to disk and is still empty on a hard reload of `#/try`, since sessionStorage is per-tab session, not the IndexedDB the no-persist criterion forbids — confirm 0040's "empty on reload" test still passes given session-scoped values, and reconcile: the sandbox rows clear on a fresh navigation to `#/try` so the page reads empty, while the handoff seed is consumed once on the onboarding side). Asserted by entering sandbox values and confirming they are present in sessionStorage and absent from IndexedDB.
- [ ] After consent is acknowledged, onboarding (`src/pages/onboarding.ts`) reads the session sandbox values and, when ≥ 1 is present, renders ONCE a "Bring your sandbox numbers in" affordance: "You scored <N> markers in the sandbox — add them as your first panel?" with an accept and a decline. With zero session values, the affordance is absent and onboarding is byte-for-byte unchanged from today. Asserted by seeding session values then completing consent (affordance present) versus none (absent).
- [ ] Accepting builds a first manual `Panel` dated today from the session values via the existing `addManualPanel` path, resolving each session `key` to its `MarkerDef` and value, and routes to the standard manual-entry review screen where the prospect can edit, add, or remove markers before committing. The panel is NOT silently committed — it lands in the same editable review the manual-entry flow already shows. Asserted by accepting and confirming the review screen pre-populates with the session markers, editable.
- [ ] Declining proceeds with onboarding unchanged and does NOT seed a panel; the session sandbox values are cleared so the affordance does not re-offer on a later step or reload. Asserted by declining and confirming no panel is seeded and the affordance does not reappear.
- [ ] The session sandbox values are consumed exactly ONCE: after a successful seed (accept) OR an explicit decline, the `almanac.sandbox.rows` session key is cleared, so the prospect is never re-prompted for the same numbers within the session. Asserted by accepting, then revisiting onboarding, and confirming the affordance is gone.
- [ ] No IndexedDB write occurs before consent is acknowledged — the sandbox values live only in sessionStorage until the post-consent accept, at which point the existing `addManualPanel` path performs the first write. Asserted by exercising the sandbox pre-consent and confirming zero IndexedDB writes until accept.
- [ ] Session values whose marker `key` no longer resolves via `findMarker()` (e.g. a stale key) are skipped on seed without error; the resolvable ones still seed. Asserted by seeding a session set with one unresolvable key and confirming only the valid markers populate the review.
- [ ] The handoff makes **zero network calls** — typed values seed a manual panel with no extraction call (manual entry never calls Claude). The first Anthropic call, if any, is a later compose/extraction the user initiates. Asserted by completing the seed and confirming the mock recorded zero requests during the handoff.
- [ ] The Anthropic key is never involved in the handoff (manual panel entry needs no key) and never appears in the affordance copy or any intermediate string. Asserted by confirming the affordance and seed path reference no key.
- [ ] The consent gate is intact — the affordance renders only AFTER consent is acknowledged (it is part of onboarding, which is gated); a pre-consent browser never sees it, and the sandbox-to-onboarding route still passes through `#/welcome` and the consent acknowledgment exactly as 0040 routes it. Asserted by confirming the affordance is unreachable until consent is acknowledged.
- [ ] Renders on both **chromium and mobile-webkit**. The affordance and its accept/decline are ≥44×44 css px touch targets; the copy wraps cleanly at the 390 px viewport; the seeded review screen is the existing manual-entry review (already mobile-tested) and is unchanged in layout.
- [ ] The sandbox (0040) and the manual-entry path are otherwise byte-for-byte unchanged — the handoff is purely additive: the sandbox gains a session write, onboarding gains one conditional affordance, and the seed reuses `addManualPanel`. Asserted by running 0040's sandbox flow and the existing manual-entry flow and confirming they are unchanged.
- [ ] Tour mode (0014) and shared-view mode (0017) are unaffected — neither carries sandbox session values into a real onboarding, and the affordance does not appear in those session-scoped modes. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the handoff is local-only (sessionStorage + the existing manual-panel write); no new hostnames; no inference call; the pre-consent surface still writes no IndexedDB.
- [ ] Schema migration: **no** — the seeded panel uses the existing `Panel`/`Result` shapes and the existing `addManualPanel` write path; sessionStorage is not a schema.
- [ ] New `tests/e2e/sandbox-handoff.spec.ts` covers: sandbox writes to sessionStorage not IndexedDB, the affordance appears post-consent only when session values exist, accept seeds an editable first panel via the manual path, decline seeds nothing and clears the values, single-consume (no re-prompt), no IndexedDB write before consent, stale-key skip, zero-network, consent gate intact, sandbox + manual-entry unchanged, tour vs shared-view unaffected, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Persisting the sandbox values to IndexedDB or localStorage pre-consent. The whole privacy posture of 0040 is that the sandbox writes no disk state before the gate. This ticket uses sessionStorage (per-tab, in-session, cleared on tab close) strictly as the carry mechanism, and the first IndexedDB write happens only after consent through the existing manual path. Do not relax 0040's pre-consent no-persist rule.
- Auto-committing the seeded panel without review. The values land in the standard editable manual-entry review screen; the user confirms (and can edit) before commit. Silent commit removes agency and risks committing a value the prospect mistyped in the sandbox.
- Composing a plan automatically from the seeded panel. That is the existing post-onboarding compose flow (and 0007's intake-only first plan already gives a first artifact). This ticket scopes strictly to seeding the first panel; composing is the user's next, separate action.
- An extraction call on the seeded values. They are typed numbers entering via the manual path, which never calls Claude. No inference, no cost, no key needed for the handoff.
- Encoding the sandbox values in a URL or any shareable link. 0040's out-of-scope already forbids putting marker values in a URL (a personal-data leak vector); this ticket uses in-tab session memory only, never a URL.
- Carrying sandbox values across browser tabs, devices, or sessions. SessionStorage is per-tab and per-session by design — that is the privacy-respecting bound. No cross-tab sync, no cross-session restore.
- Re-prompting the prospect about the sandbox values on later visits. The values are consumed once (accept or decline) and cleared; there is no standing "you have unsaved sandbox numbers" nag.
- Changing the sandbox's scoring, flag logic, or report-card tally. 0040 owns those; this ticket only carries the typed values forward into a real panel.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/pages/try.ts` (0040) — on each row change, write the in-memory `rows` to `sessionStorage["almanac.sandbox.rows"]` as JSON `{ key, value }[]`. This is the ONLY new write the sandbox gains; it remains IndexedDB-free pre-consent. Reconcile with 0040's "empty on reload of `#/try`" criterion: clear (or ignore) the session rows when `#/try` is freshly navigated to so the sandbox page itself still reads empty on reload, while the onboarding side consumes the value once. Document the chosen reconciliation in the file.
- `src/pages/onboarding.ts` — after consent is acknowledged (the existing gated onboarding entry), read `sessionStorage["almanac.sandbox.rows"]`; when non-empty, render the "Bring your sandbox numbers in" affordance with accept/decline. On accept, map each session `{ key, value }` through `findMarker(key)` (skip unresolvable keys), build a `Result[]`, and route into the existing manual-entry review with those results pre-populated (reuse the manual-panel staging the labs page already uses, or call the same staging helper). On accept-commit or decline, clear the session key. Do not alter the existing onboarding profile-save flow.
- `src/pages/labs.ts` — read-only reuse of the manual-entry review/staging path (`addManualPanel` and its review screen). If the manual-entry review is only reachable from `#/labs`, factor a small shared "stage manual results for review" entry the onboarding affordance can call, or route to `#/labs` with the staged results in session — pick the cleaner path and document it. Reuse, do not duplicate, the review UI.
- `src/data/markers.ts` — read-only. `findMarker()` resolves each session key to its `MarkerDef`; unresolvable keys are skipped.
- `src/main.ts` — no new route; the affordance lives inside the existing gated onboarding. The sandbox-to-welcome route (0040) is unchanged.
- `src/types.ts` — no new persistent types; the session payload is `{ key: string; value: number }[]` (the same shape 0040's rows use). Any internal staging type lives in the page.
- `src/styles.css` — `.sandbox-handoff` (the affordance), accept/decline as ≥44×44 css px controls, reusing the onboarding form idioms. No new colors; ink and ink-soft, oxblood reserved.
- `src/sample/state.ts` / `src/share/shared-state.ts` — the affordance is part of real gated onboarding; tour and shared-view do not reach it. No fixture needed; confirm it does not fire in those modes.
- `tests/helpers/flows.ts` — add a `seedSandboxSession(page, rows)` helper that sets `sessionStorage["almanac.sandbox.rows"]` via `page.addInitScript`/`page.evaluate`, and reuse the existing `acknowledgeConsent` + `onboard` flows. Reuse `addManualPanel`'s review assertions for the seeded-panel test.
- `tests/e2e/sandbox-handoff.spec.ts` (new) — every acceptance bullet maps to a `test()`. The core test seeds session rows, acknowledges consent, asserts the affordance, accepts, and confirms the manual review pre-populates the seeded markers editable; the no-IndexedDB-pre-consent test exercises the sandbox and asserts no IndexedDB write until accept.
- `tests/e2e/privacy.spec.ts` — extend with a sandbox-to-onboarding handoff confirming zero off-allow-list egress and no pre-consent IndexedDB write.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the affordance reads "You scored <N> markers in the sandbox — add them as your first panel?" with accept "Add them" and decline "Start fresh." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

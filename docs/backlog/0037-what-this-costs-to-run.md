---
id: 0037
title: What this costs to run — an honest pennies-per-action estimate before the user trusts a key, and a running tally after
status: proposed
priority: P2
area: onboarding
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a prospect deciding whether to paste my Anthropic key into a bring-your-own-key app, I want the onboarding key step to tell me — before I commit — roughly what the real work will cost me ("a lab extraction runs about a cent; composing a plan, two to four cents; a week of meals, a few cents — most people spend well under a dollar a month"), and I want Settings to show what I have actually spent so far in the same plain terms, so that the single unanswered question that stops me from trusting BYOK — "is this going to quietly run up a bill?" — is answered honestly, from the token math the app already records, before I am in and after I have used it.

## Why now (four lenses)

### Product Owner

BYOK is the privacy contract's load-bearing choice — the call goes directly from the user's browser on their own key, so we never see the data or the bill. But it imports one objection that the verify-key (0024) and egress-receipt (0025) steps do not answer: *how much will this cost me?* A health-curious-but-cost-cautious prospect has been burned by "just add your card" SaaS and has no intuition for what a few Claude calls cost. Today the answer lives only in `telemetry.ts` (Settings → AI calls shows a cache hit rate and token totals) — visible *after* the fact, expressed in tokens, to a user who does not think in tokens. The smallest meaningful unit of value is two surfaces driven by the token math already in `telemetry.ts`: (1) a short, honest cost expectation on the onboarding key step — a few editorial lines mapping each kind of call to an approximate cents range, derived from representative token counts and a single, stated price constant — and (2) a "what you have spent" line in Settings → AI calls that turns the existing `aggregate()` effective-token total into the same plain-money estimate over the recorded window. No new call, no new storage; it is the cost lens on data the app already has.

### Stakeholder

This does not widen a moat asset — it removes the last friction on the **privacy / BYOK** moat at the point of conversion. The whole architecture (no backend, no proxy, direct BYOK) is what makes the privacy promise real, but BYOK's cost opacity is the friction that the promise's beneficiary feels most. Answering it honestly — with a *range*, from the app's own recorded tokens, naming the price assumption out loud and inviting the user to check it against Anthropic's current pricing — is exactly the editorial-honesty posture that distinguishes the product from "free" apps whose real cost is the data. It also quietly strengthens the anti-wrapper argument: the cost line can show the cache hit rate's *dollar* effect ("prompt caching saved you an estimated $X this month"), making the aggressive-prompt-caching moat (already real in the code) legible as money, not just a percentage. A backend product hides its margin; Almanac shows the user their actual marginal cost, because there is no margin to hide.

### User (at 7am on the phone)

I am setting up. I have pasted my key and verified it (0024) and read what leaves the device (0025). Right there on the key step is the thing I actually wanted to know: "Each lab upload costs about a cent to read. Composing your plan runs two to four cents. A week of meals, a few cents. Most people spend well under a dollar a month. This is billed by Anthropic, on your key — we never see it. Prices change; check Anthropic's pricing for today's rates." That is the reassurance that lets me proceed without a knot in my stomach. Weeks later I am curious, so I open Settings → AI calls, and beneath the cache hit rate I have always seen there is now a line in plain money: "Estimated spend across your last 50 calls: about $0.40. Prompt caching saved you roughly $0.90." I trust the number because it is hedged honestly and because I can see the calls it came from. It all rendered offline, instantly — it is arithmetic over a log already on my device.

### Growth

This is an acquisition-unblocker first and a retention/affection touch second. Acquisition: the cost question is a silent drop-off point at the key step — a cost-cautious prospect who cannot estimate the bill closes the tab. An honest, hedged, pennies-scale estimate converts that hesitation into "oh, that's nothing," at the exact step where the decision is made. (Hypothesis: surfacing a plain-money cost expectation on the key step raises the rate at which prospects complete onboarding past the key, because it answers the dominant unspoken BYOK objection at the moment it bites; and the "caching saved you $X" line is a quietly shareable affection moment for the technically-literate user — back-of-envelope from how transparent per-action pricing reduces signup abandonment in usage-based developer tools; treat as untested without remote analytics, which we will never add.) The "show me" frame is unusual for a health app: "it told me upfront it would cost me cents, and showed me exactly what I'd spent" is the kind of radical-honesty detail the privacy-literate persona repeats to the friend who asked "isn't BYOK a hassle?"

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/cost/estimate.ts` (new) exports `PER_CALL_TOKENS` (a small, commented table of representative input/cache/output token counts per call kind: `extract`, `plan`, `meals`, `swap`, `verify`), `PRICE` (a single stated price constant: per-million-token input / cache-read / cache-write / output dollar rates, with a source comment and an "as of <date>" note), `estimateCallCost(kind: CallRecord["kind"]): { lowCents: number; highCents: number }` (a per-kind cents range), and `estimateSpend(records: CallRecord[]): { spentCents: number; savedCents: number }` (the actual recorded effective-token spend and the caching saving, both derived from `aggregate(records)` and `PRICE`). All functions are pure: no DOM, no Dexie, no network. Asserted by importing them and checking known token tables produce the documented cents.
- [ ] The onboarding key step (`src/pages/onboarding.ts`) renders a short cost-expectation block beneath the key field (adjacent to the existing verify-key 0024 and egress-receipt 0025 affordances). It lists, in the editorial register, the approximate cents range for an extraction, a plan compose, and a week of meals from `estimateCallCost(...)`, a "most people spend well under a dollar a month" line, an explicit "billed by Anthropic on your key — we never see it" line, and a "prices change; check Anthropic's current pricing" hedge. Asserted by rendering onboarding and confirming the block's copy and the cents ranges match `estimateCallCost(...)`.
- [ ] Settings → AI calls (`src/pages/settings.ts`) renders, beneath the existing token totals and cache-hit-rate line, an "Estimated spend across your last <N> calls: about $<X>" line and a "Prompt caching saved you roughly $<Y>" line, both from `estimateSpend(list())`. With zero recorded calls, the spend line reads "No AI calls recorded yet." and no dollar figure is shown. Asserted with a seeded telemetry log (non-zero) and an empty log.
- [ ] The cost figures are always presented as **estimates with a stated price assumption**, never as a guaranteed bill. The Settings line carries a one-clause hedge ("estimated at the rates noted in onboarding; Anthropic bills the real amount on your key"). Asserted by confirming the hedge string is present wherever a dollar figure is shown.
- [ ] The `PRICE` constant and `PER_CALL_TOKENS` table live in ONE module (`src/cost/estimate.ts`) so the onboarding estimate and the Settings tally can never disagree, and a future price update is a one-file change. Asserted by confirming both surfaces import the same module (no duplicated constants — a grep-style assertion in the spec that the cents shown in onboarding equal `estimateCallCost(...)` and the Settings dollars equal `estimateSpend(...)`).
- [ ] The cost surfaces are computed with **zero network calls** — they read the local `telemetry.ts` log and the static price/token constants. No pricing is fetched from any host. Asserted by rendering both surfaces and confirming the mock recorded zero requests.
- [ ] The Anthropic key is NEVER included in the cost copy, the telemetry display, or any intermediate string the cost module produces. Asserted by seeding a sentinel key and confirming it appears nowhere in the onboarding cost block or the Settings spend line.
- [ ] Renders on both **chromium and mobile-webkit**. The cost block wraps cleanly at the 390 px viewport; it does not push the key field or the onboarding submit below the fold in a way that breaks the existing onboarding flow. Asserted by confirming the onboarding submit remains reachable with the block present.
- [ ] The existing onboarding behavior (key entry, verify-before-commit 0024, egress receipt 0025, profile save) is unchanged — the cost block is purely additive copy. Asserted by running the existing onboarding completion flow and confirming it still saves the profile and routes onward.
- [ ] Tour mode (0014) and shared-view mode (0017) do not reach onboarding or Settings (both gated), so neither cost surface appears there; no new behavior is introduced in those modes. Asserted by confirming the cost surfaces are absent in tour and shared-view.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the cost surfaces are local-only; no pricing host is added to the allow-list; the key never appears.
- [ ] Schema migration: **no** — cost is computed on render from the existing `telemetry.ts` localStorage log and static constants. Nothing new is persisted.
- [ ] New `tests/e2e/cost-estimate.spec.ts` covers: onboarding cost block copy + cents ranges match the module, Settings spend + savings lines from a seeded log, empty-log Settings copy, the hedge present wherever dollars appear, single-source-of-truth (onboarding cents == module, Settings dollars == module), zero-network, the key never appears (sentinel), onboarding completion unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- Fetching live Anthropic pricing from any URL. That would add a network egress (and a host to the allow-list) to a feature whose whole point is an honest, local, offline estimate. The price is a single stated constant with an "as of" date; updating it is a one-line code change in a future ticket. The copy explicitly tells the user to check Anthropic's current rates.
- A precise, billed-to-the-cent guarantee. Token counts per call vary with panel size, plan length, and meal complexity; the estimate is a *range* derived from representative counts, hedged in the copy. Presenting it as an exact bill would be dishonest. The user's real bill is Anthropic's, on their key.
- A budget cap, spend limit, or "stop after $X" control. We do not proxy or gate the call; capping spend would require intercepting the user's own direct call, which we do not do. The user manages their own Anthropic limits in their Anthropic account.
- A model picker driven by cost ("switch to a cheaper model to save"). Model selection already exists in Settings; tying it to a cost slider is a separate, larger design and risks nudging the user off the model the plan voice is tuned for.
- A per-call dollar figure stamped on each row of the telemetry log. The aggregate spend line is the value; per-row dollars add clutter and false precision to a log that is already token-detailed for the user who wants it.
- Any transmission of cost data anywhere. Cost is computed and shown locally; it is never sent, never logged off-device, never part of any export beyond what the telemetry log already is (it is not in the JSON export today and stays out).
- Changing how `telemetry.ts` records calls or what `aggregate()` computes. This ticket consumes the existing log and aggregates; it does not alter the recording path.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/cost/estimate.ts` (new) — `PER_CALL_TOKENS`, `PRICE`, `estimateCallCost(kind)`, `estimateSpend(records)`. `estimateSpend` reuses `aggregate()` from `src/telemetry.ts` (which already computes `effectiveInput` from input + cache-create×1.25 + cache-read×0.1, and `hypotheticalInput` for the no-cache baseline) and multiplies by `PRICE` to produce spent vs hypothetical, where `savedCents = hypothetical$ − spent$`. The `PER_CALL_TOKENS` table carries a comment per kind explaining where the representative counts came from (a typical extraction / plan / meals call). `PRICE` carries a source comment + "as of 2026-05" note. Pure module, no I/O.
- `src/telemetry.ts` — read-only consumer. `list()` and `aggregate()` already exist; do not change them. The cost module imports both.
- `src/pages/onboarding.ts` — the key step already hosts the verify-key (0024) and egress-receipt (0025) affordances. Add the cost-expectation block beneath the key field, built from `estimateCallCost("extract" | "plan" | "meals")`. Restrained copy, no exclamation. Do not alter the existing verify / receipt / save flow.
- `src/pages/settings.ts` — the AI-calls section already renders token totals and the cache hit rate from `aggregate(list())`. Add the spend + savings lines from `estimateSpend(list())` beneath the existing lines, with the empty-log fallback copy. Reuse the existing section layout.
- `src/types.ts` — no new persistent types; any internal estimate type lives inside `src/cost/estimate.ts`.
- `src/styles.css` — `.cost-estimate` (the onboarding block) and a reuse of the existing settings stat-line styling for the spend lines. No new colors; ink and ink-soft. Touch targets where any control exists (there are none new here — it is copy).
- `tests/helpers/flows.ts` — add a `seedTelemetry(page, records: CallRecord[])` helper that writes a known telemetry log to localStorage via `page.evaluate` so the Settings spend test is deterministic. Reuse the existing onboarding flow for the onboarding-block test.
- `tests/e2e/cost-estimate.spec.ts` (new) — every acceptance bullet maps to a `test()`. The single-source test asserts the onboarding cents equal `estimateCallCost(...)`'s output and the Settings dollars equal `estimateSpend(seededLog)`'s output, proving no duplicated constants. The sentinel-key test seeds a profile key and confirms it is absent from both surfaces.
- `tests/e2e/privacy.spec.ts` — extend with an onboarding + Settings visit confirming zero off-allow-list egress and no pricing host fetch.
- New deps: **no**.
- Egress allow-list change: **no** — the price is a local constant, never fetched.
- Schema migration: **no**.
- Voice spec: onboarding reads "Each lab upload costs about a cent to read. Composing your plan runs two to four cents. A week of meals, a few cents. Most people spend well under a dollar a month. Billed by Anthropic on your key — we never see it. Prices change; check Anthropic's current pricing." Settings reads "Estimated spend across your last <N> calls: about $<X>." and "Prompt caching saved you roughly $<Y>." with the hedge clause. Empty: "No AI calls recorded yet." Declarative, hedged, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

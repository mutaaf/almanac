---
id: 0024
title: Verify-before-commit — prove the BYOK key works before the user trusts it with their labs
status: groomed
priority: P1
area: onboarding
created: 2026-05-20
owner: gtm-innovation
---

## User story

As a referred prospect who just read a friend's shared protocol, tapped through consent, and reached the onboarding form's "Anthropic API key" field with no idea whether the key I pasted is even valid, I want a small "Check this key" affordance next to the field that runs one tiny, free-shaped probe call to `api.anthropic.com` and tells me — in the editorial voice — whether the key authenticated, whether the chosen model is reachable, and (if it failed) the one specific reason (bad key / no credit / wrong model), so that I learn my key works *before* I paste a PDF of my bloodwork and hit Compose — instead of pasting my labs, waiting, and getting a raw SDK error that reads like a stack trace and sends me back to a friend asking "is this thing broken?"

## Why now (four lenses)

### Product Owner

The onboarding form asks for an Anthropic API key with a "Get one →" link and a one-line hint, then accepts whatever the user types and saves it. The first time the key is ever exercised is the lab-extraction call — which is also the highest-stakes moment in the whole app (the user is pasting a PDF with their full name, DOB, and medical data). If the key is wrong, expired, has no credit, or names a model the account can't reach, the user discovers it *after* committing their most sensitive document, and the failure surfaces as a raw Anthropic SDK error (`401`, `model_not_found`, `credit_balance_too_low`) with no editorial framing. That is the worst possible place to fail. The smallest meaningful unit of value is a "Check this key" button beside the key field that fires one minimal `messages.create` call (max_tokens 1, a one-token prompt) against the selected model, and renders one of three deterministic outcomes: a quiet "Key works. Model reachable." confirmation, or a single-line plain-English failure naming the cause and the fix. The probe is opt-in (the user taps it), runs zero extra calls on its own, and costs a fraction of a cent. Nothing about the existing save flow changes; this is an additive affordance that de-risks the most expensive moment in the funnel by moving the first failure to the cheapest possible point.

### Stakeholder

This does not widen a moat asset directly — it removes the single largest acquisition cliff that sits *in front of* every moat asset. The BYOK architecture is non-negotiable (it is the privacy contract), but BYOK is also the steepest activation step in the product: a cold or referred user must leave the app, create an Anthropic account, generate a key, fund it, paste it back, and *then* trust it with their bloodwork — all before they have seen a single composed plan. Every acquisition feature we have shipped (the sample tour 0014, the share link 0017) and every one in flight (adopt-and-adapt 0020) funnels the prospect toward this exact wall. A backend-shaped competitor hides this wall behind a managed key and an account; we cannot and will not. What we *can* do — and what no managed-key product needs to — is make the BYOK step legible and verifiable at the moment it is taken, in our own editorial voice, so the BYOK requirement reads as "you are in control" rather than "this is broken." Turning the most-cited reason a referred prospect bounces (the key step felt fragile and opaque) into a thirty-second confirmable step is the highest-leverage non-moat work on the board.

### User (at 7am on the phone)

Sunday morning. My friend's link sent me here; I liked what I read; I tapped through to set up my own. I am on the onboarding form. I pasted my key — I generated it five minutes ago and I am not sure I copied the whole thing. There is a small link under the field: "Check this key." I tap it. A spinner for two seconds, on a flaky cafe connection. Then one line, in ink, under the field: "Key works. claude-sonnet-4-6 is reachable." I exhale and keep going. The alternative, the bad path: I pasted only half the key. I tap "Check this key." One line, in oxblood: "That key did not authenticate. Re-copy it from console.anthropic.com — the key starts with sk-ant- and is one long string." I fix it, tap again, see green, and move on — without ever having pasted my labs into a broken pipe. The whole thing is one tap, survives a slow connection (the probe has a bounded timeout and a clean "could not reach Anthropic — check your connection" fallback), and never blocks me from saving the profile if I would rather skip the check.

### Growth

This is the conversion-rate ticket for the entire BYOK funnel. The arithmetic is upstream of every acquisition surface: a referred prospect who reaches onboarding has already spent the trust the friend lent them; if the key step fails opaquely, that trust evaporates at the worst possible moment and the prospect tells the *referring friend* "I tried it, it didn't work" — which poisons the channel that brought them. (Hypothesis: an opaque key-failure at the lab-extraction moment is the single largest source of silent referred-prospect bounce, and a verify-before-commit step lifts onboarding-to-first-plan completion by 15-30% among referred users; back-of-envelope from how Stripe's test-mode key validation and Postman's "send test request" affordances reduce integration-abandonment — treat as untested without remote analytics, which we will never add). The second-order growth value is reputational: a prospect whose key check passes in two seconds, in our voice, comes away with "this app is careful" — the exact reputation that makes them comfortable pasting their bloodwork a screen later, and comfortable being the next person to send the share link.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The onboarding form's key field (`#key` in `src/pages/onboarding.ts`) gains a "Check this key" affordance directly below the existing hint line. It is a `role="button"` styled as a small-caps eyebrow link in ink (not oxblood — it is informational, not a primary CTA). It is disabled (with `aria-disabled="true"`) when the key field is empty, and enabled once any non-whitespace text is present.
- [ ] Tapping "Check this key" reads the current value of the key field AND the current selection of the model field, and fires exactly ONE `messages.create` call to `api.anthropic.com` with `max_tokens: 1` and a single-token user message (e.g. `"hi"`). No system prompt, no caching block, no labs — the probe is the cheapest possible authenticated round-trip. Asserted by the mock recording exactly one request with `max_tokens === 1` and an empty/absent system prompt.
- [ ] On a 200 response, the affordance area renders one editorial confirmation line in ink: "Key works. <model> is reachable." where `<model>` is the selected model id. Asserted by the mock returning a success fixture and the line rendering with the model id substring.
- [ ] On a 401 (auth failure) the area renders, in oxblood: "That key did not authenticate. Re-copy it from console.anthropic.com — the key starts with sk-ant- and is one long string." Asserted by the mock returning a 401 and the exact copy rendering.
- [ ] On a `model_not_found` / 404 the area renders: "Your key works, but the selected model is not reachable on this account. Pick a different model." Asserted by the mock returning the model-not-found shape.
- [ ] On a `credit_balance_too_low` / billing error the area renders: "Your key works, but the account has no credit. Add credit at console.anthropic.com, then check again." Asserted by the mock returning the billing-error shape.
- [ ] On a network failure or a timeout (the probe carries a bounded client-side timeout — re-use the existing call-timeout convention if one exists in `src/claude.ts`, otherwise 15s), the area renders: "Could not reach Anthropic. Check your connection and try again." The check NEVER throws an unhandled rejection to the console; the failure is caught and rendered. Asserted by the mock aborting the route and the fallback line rendering.
- [ ] The key check NEVER displays, logs, or echoes the key value anywhere — not in the success line, not in any error, not in the DOM, not in `console`. Asserted by a spec that runs the check with a sentinel key value and confirms the sentinel string appears nowhere in the rendered DOM and nowhere in captured `console` output.
- [ ] The check is purely advisory: it does NOT gate the form's Save button. A user can ignore the check entirely, fill the form, and submit — the existing onboarding submit path is byte-for-byte unchanged when the check is never invoked. Asserted by completing onboarding without ever tapping the check and confirming the saved profile is identical to today's behavior.
- [ ] The same affordance appears on the Settings key field (`src/pages/settings.ts`) so a returning user who rotated their key, added credit, or switched models can re-verify without re-onboarding. Same three-outcome rendering; same one-call probe.
- [ ] The probe re-uses the existing telemetry recording path (`recordCall` in `src/telemetry.ts`) so the local AI-calls log in Settings accounts for the probe's tokens — the user can always see every call we made on their behalf, the probe included. Asserted by checking the telemetry count increments by exactly one after a successful check.
- [ ] Renders and works on both **chromium and mobile-webkit**. The affordance is a ≥44×44 css px touch target on mobile; the result line wraps cleanly at the 390 px viewport; the spinner does not shift the form layout (reserve the line height before the result arrives).
- [ ] Tour mode (0014) and shared-view mode (0017) do NOT render the key check — neither has a real key field, and the check must never fire a billable call in a fixture/sandbox context. Asserted by entering the tour and confirming the affordance is absent.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the probe calls only `api.anthropic.com` (already on the allow-list); no new hostnames; the key is never transmitted anywhere but the direct BYOK call it was always going to make.
- [ ] Schema migration: **no** — the check reads the in-form key value (or the saved profile key on Settings) and persists nothing new.
- [ ] New `tests/e2e/key-verify.spec.ts` covers: affordance disabled on empty field and enabled on input, exactly one min-token probe call fires, success line renders with model id, 401 / model-not-found / billing / network each render their exact editorial copy, the key value never appears in DOM or console, the check does not gate Save, the Settings variant works, telemetry increments by one, tour mode hides the affordance.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A managed or pooled key, a free-trial key, a server-issued key, or any path that bills inference to anyone but the user. The whole product rests on BYOK; this ticket makes BYOK *legible*, it does not soften it.
- A backend that validates keys on our behalf. The probe runs directly from the browser to `api.anthropic.com` exactly like every other call. No proxy, no validation endpoint we operate.
- Auto-running the check on field blur or on form load. The check is one billable call (however tiny); it fires only when the user explicitly taps it. No background probing.
- Persisting the check result ("last verified at"). The result is render-time only; a key that worked an hour ago can fail now (credit ran out), so a cached "verified" badge would lie. The user re-checks when they want certainty.
- Estimating or displaying the dollar cost of the user's eventual extraction/compose calls. Cost transparency is the existing Settings → AI calls telemetry surface's job; this ticket is about reachability, not pricing.
- A model picker that lists every model the account can reach (an account-introspection call). The probe checks the *currently selected* model only. A dynamic model list is a separate ticket if real users ask for it.
- Blocking onboarding submit until the key is verified. The check is advisory by design; a user who knows their key is good should not be forced through a probe.
- An onboarding-wide rewrite. This ticket adds one affordance to one field on two pages. It does not restructure the form, re-order fields, or touch the consent gate.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/claude.ts` — add `verifyKey(key: string, model: string): Promise<KeyCheckResult>` where `KeyCheckResult` is a discriminated union `{ ok: true } | { ok: false; reason: "auth" | "model" | "billing" | "network" }`. It constructs an `Anthropic` client with the passed key and `dangerouslyAllowBrowser: true` (the existing pattern), fires `messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] })`, classifies the caught error by status / error type into the union, and calls `recordCall(...)` on success exactly as the existing generators do. The function NEVER includes the key in the resolved value or in any thrown error. Wrap the call in a bounded timeout using whatever convention `generatePlan` already uses.
- `src/pages/onboarding.ts` — under the existing `#key` field hint (lines ~88-93), add the "Check this key" affordance and a result slot (`<div class="key-check" role="status" aria-live="polite"></div>` with reserved min-height). Wire a click handler that reads `#key` and the model select, disables the affordance + shows a spinner, awaits `verifyKey()`, and paints one of the deterministic lines. The handler is independent of the form submit handler — submit is untouched.
- `src/pages/settings.ts` — mirror the same affordance under the Settings key field. Re-use the same render helper so the copy and behavior cannot drift between the two pages. Extract a small `renderKeyCheck(slot, getKey, getModel)` helper (in `src/ui.ts` or a new tiny `src/onboarding/key-check.ts`) shared by both pages.
- `src/styles.css` — `.key-check` (the reserved result slot — fixed min-height so the spinner doesn't shift layout), `.key-check__action` (the eyebrow-link affordance, ink), `.key-check__ok` (ink result line), `.key-check__fail` (oxblood result line — oxblood is permitted here because a failed key is a genuine stop, the one place an alert register is honest). Small-caps eyebrow tokens already exist; re-use them.
- `tests/helpers/mocks.ts` — extend the Anthropic mock to recognize a min-token probe (`max_tokens === 1`, no system prompt) and to be drivable into 401 / model-not-found / billing / network-abort responses per-test (a query flag or a per-test override hook). Keep the existing extraction/plan/meals fixture routing intact.
- `tests/helpers/flows.ts` — no new flow needed; the key-check spec drives the onboarding form directly. Optionally add `runKeyCheck(page)` if it reduces duplication across the success/failure cases.
- `tests/e2e/key-verify.spec.ts` (new) — every acceptance bullet maps to a `test()` or `expect()`. The "key never leaks" test uses a sentinel key (e.g. `"sk-ant-SENTINEL-DO-NOT-LEAK"`) and asserts it appears in zero rendered nodes and zero console messages.
- `tests/e2e/privacy.spec.ts` — extend the existing sweep with a key-check invocation to confirm the egress allow-list is unchanged (the probe hits only `api.anthropic.com`).
- New deps: **no**. The Anthropic SDK is already a dependency; the probe is a normal `messages.create`.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the affordance label is "Check this key." Success: "Key works. <model> is reachable." Failures are one declarative sentence each, naming the cause and the fix, no exclamation marks. Banned: "amazing," "exciting," "journey," "great." Oxblood is reserved for the failure line only (a failed key is a real stop); everything else is ink.

## Implementation log

(Appended by the implementation-dev agent during execution.)

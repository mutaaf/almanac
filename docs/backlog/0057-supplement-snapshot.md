---
id: 0057
title: The supplement snapshot — capture what you're already taking so the plan can name synergies and flag timing conflicts
status: groomed
priority: P1
area: onboarding
created: 2026-05-23
owner: gtm-innovation
---

## User story

As a health-curious user who already takes a handful of supplements — magnesium glycinate before bed, vitamin D3 in the morning, fish oil with dinner, NAC — I want a place on my profile to type that list in plain English, so that the plan can reason against what I already take (naming the magnesium that already supports my sleep, flagging that I should take it apart from the calcium I'm about to add, confirming the fish oil dose already serves my ApoB protocol), instead of recommending things I'm already on or ignoring conflicts it can't see.

## Why now (four lenses)

### Product Owner

The plan generator already runs LLM reasoning over the whole intake — name, age, sex, goals, conditions, dietary pattern — and `formatProfile()` assembles that into the prompt as labeled blocks. There is one obvious, high-signal field missing: what the user already takes. Today the model recommends supplements blind to the user's shelf, so a user on 5,000 IU of D3 can get told to "consider vitamin D," and a user taking magnesium at bedtime never gets told to separate it from the calcium the plan just added. The conditions field nominally covers "dx, meds, allergies," but supplements are a distinct, list-shaped thing the persona thinks about separately — dose and timing matter, and burying them in a free-form conditions blob loses them. The smallest meaningful unit of value is one optional free-form text field — "Supplements you already take" — on the onboarding and settings profile forms, surfaced into `formatProfile()` as its own labeled block when non-empty. No dropdown, no structured dose parser, no inference to name the supplements: the user's verbatim text is handed to the plan prompt, which already does the reasoning. It makes the plan smarter about the user's actual regimen with one textarea and one new profile field.

### Stakeholder

This deepens the **structured intake → plan** moat at the exact seam where a chat box looks closest: a prospect *could* paste their supplement list into Claude.app once. But Almanac's profile is persistent — the supplement snapshot rides every future recompose, every meal generation, every plan re-tune, without the user re-typing it, and it lives on-device with the rest of the intake. The plan can say "your magnesium glycinate before bed already supports the sleep tier; take it separately from any calcium-rich addition" because the regimen is *state*, not a one-shot paste that evaporates with the chat. It widens the moat cheaply — no new table, no new inference call, no new egress — by feeding the existing plan-compose prompt richer raw material from the persistent timeline. It also strengthens the honesty posture the product trades on: a plan that acknowledges what you already take, and avoids double-dosing you, reads as a coach who listened, which is the trust a wrapper can't fake.

### User (at 7am on the phone)

Setting up, or later in Settings: one calm field below my conditions — "Supplements you already take." I type it the way I'd say it: "magnesium glycinate 400mg at night, D3 5000 IU am, fish oil 2g with dinner, NAC 600mg." That's it — no picker, no per-row dose dropdown, just the line as I'd write it on a sticky note. Next time I compose, the plan reads it back to me: it doesn't tell me to start D3 (I'm on it), it tells me to take the new calcium away from my magnesium, and it confirms my fish oil dose already serves the ApoB target. It feels like the plan finally knows what's in my cabinet. One field, free text, hands-half-asleep simple, and it's saved with the rest of my profile so I never type it twice.

### Growth

This is a retention-and-trust ticket more than an acquisition one, but it has a real "show me." (Hypothesis: a plan that names the user's own supplements — "your magnesium already covers this; take it apart from the calcium" — reads as markedly more personal than a generic supplement list, which lifts the rate at which the first plan feels worth keeping; back-of-envelope from how specificity-to-the-individual drives perceived value in coaching products; treat as untested without remote analytics, which we will never add.) The "show me" frame is a plan line that references the user's own regimen by name — a screenshot of "take your magnesium glycinate separately from the calcium below" is the kind of detail the persona forwards to the friend who also takes a handful of supplements and wonders if they're timing them wrong. It is the intake-depth sibling of the dietary-pattern field: that made the meals personal, this makes the supplements personal.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] The onboarding profile form (`src/pages/onboarding.ts`) renders an optional "Supplements you already take" textarea, distinct from the conditions field, with a one-line hint that it's free-form (e.g. "List them the way you'd say them — name, dose, timing. Optional."). Asserted by visiting onboarding and confirming the supplements textarea is present and separate from conditions.
- [ ] The settings profile form (`src/pages/settings.ts`) renders the same supplements textarea, pre-filled with the saved value when one exists, editable and savable. Asserted by saving a supplements value in settings, reloading, and confirming the value persists in the field.
- [ ] The field is capped at 500 characters and is optional — an empty value saves cleanly and is treated as "none stated." Asserted by saving an empty value (no error) and by confirming input beyond the cap is rejected or truncated per the documented rule.
- [ ] `formatProfile()` (in `src/claude.ts`) includes a labeled `# Supplements you already take` block carrying the verbatim field text ONLY when the field is non-empty. Asserted by composing a plan with a non-empty supplements value, intercepting the plan-compose call, and confirming the prompt body contains the block and the verbatim text.
- [ ] When the supplements field is empty, `formatProfile()` output is byte-for-byte identical to the pre-0057 output — no empty block, no trailing whitespace, no orphan heading. Asserted by composing with an empty supplements value and confirming the prompt body contains no supplements heading.
- [ ] The supplements value is included in the readable Markdown export (0027) as part of the profile section, when 0027 has shipped. Asserted (or noted N/A with a one-line reason if 0027 has not shipped) by exporting and confirming the supplements text appears under the profile section.
- [ ] The Anthropic key NEVER appears in the supplements field, in `formatProfile()`'s supplements block, or in any intermediate string — and the field cannot be used to exfiltrate the key (the field is plain text echoed verbatim; assert the key is not present even when a sentinel key is seeded). Asserted by seeding a sentinel key and a supplements value and confirming the key appears nowhere in the field render or the prompt body.
- [ ] The supplements text is local-only: it lives on the singleton `Profile` in IndexedDB, is sent only as part of the existing plan-compose call to `api.anthropic.com`, and introduces no new egress. Asserted by Privacy E2E (`tests/e2e/privacy.spec.ts`) confirming no new hostnames after onboarding-with-supplements and a compose.
- [ ] Renders on both **chromium and mobile-webkit**: the textarea wraps cleanly at the 390 px viewport, does not push the key field off-screen on onboarding, and respects `min-width: 0` for any adjacent grid children. Asserted on both projects.
- [ ] Schema migration: **yes** — Dexie bumps to v9 with a new additive `.version(9).stores({...})` block (the field is optional on `Profile`, so an existing v8 profile loads with `supplements === undefined` and simply shows an empty field). Migration test asserts a prior-version export imports with no profile-field loss and the supplements field empty.
- [ ] The existing onboarding and settings flows — every other profile field, the key field, export/import, the consent gate — are unchanged in behavior; the supplements field is purely additive. Asserted by running the existing onboarding and settings flows and confirming they are unchanged.
- [ ] New `tests/e2e/supplement-snapshot.spec.ts` covers: the field renders on onboarding AND settings, it persists across reload, the 500-char cap, inclusion in `formatProfile()` when non-empty, exact-byte exclusion when empty, inclusion in the 0027 export (or N/A), the key never appears (sentinel), zero new egress, the migration, the existing flows unchanged, mobile rendering.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A structured supplement picker, dose parser, or interaction-checker. The field is one free-form textarea handed verbatim to the plan prompt. No dropdown of brands, no per-row dose/timing inputs, no clinical interaction database — the model does the reasoning over the raw text, exactly as it does for the goals and conditions fields.
- An LLM call to normalize, expand, or canonicalize the supplement names. The text travels verbatim. No pre-processing inference, no new Anthropic call beyond the existing plan-compose.
- Building a separate `supplements` table or a per-supplement timeline. This is one optional string on the existing singleton `Profile`, additive at the next Dexie version. A structured, trackable supplement log is a plausible future ticket, not this one.
- Folding supplements into the conditions field or re-purposing conditions. Supplements get their own labeled field and their own `formatProfile()` block; the conditions field is unchanged.
- Recommending the user stop, change, or dose a supplement deterministically in TypeScript. Any guidance comes from the plan generator (which already carries the "informational, not medical advice" voice), not from a new rule engine in this ticket.
- Surfacing the supplements anywhere except the profile forms, `formatProfile()`, and the 0027 export. No new card on Today, no new Plan section dedicated to supplements display (the plan already renders its own supplements list; this is intake, not output).

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/types.ts` — add an optional `supplements?: string` field to `Profile`, documented as free-form intake (≤500 chars), distinct from `conditions`. Additive; an existing profile loads with `supplements === undefined`.
- `src/db.ts` — bump Dexie to `version(9)` with a NEW additive `.version(9).stores({...})` block per the AGENTS.md schema rule (never edit the existing v8 block). The field is optional on the `profile` singleton; no data migration is required (read-side optional). Add a migration test confirming a v8 profile loads.
- `src/claude.ts` — in `formatProfile()`, add a `# Supplements you already take` block AFTER the conditions/diet blocks, gated on a non-empty `p.supplements` (use the same `.filter(Boolean)` join idiom already used so the block is absent when empty and the output is byte-identical to pre-0057). Do NOT touch the adopt-referral block ordering — append supplements before/independent of it per the documented placement.
- `src/pages/onboarding.ts` — add the supplements textarea to the profile form, distinct from conditions, with the documented hint. Wire it into the existing profile-save path (no new save mechanism).
- `src/pages/settings.ts` — add the same supplements textarea to the profile-edit form, pre-filled from the saved value, saved through the existing settings save path.
- `src/pages/labs.ts` / `src/main.ts` — read-only; no new route.
- `src/styles.css` — reuse the existing form-field / textarea idioms (the conditions and goals textareas are the template). No new colors; ink and ink-soft. Grid children `min-width: 0`.
- `src/share/markdown-export.ts` (or wherever 0027's export lives, if shipped) — include `supplements` in the profile section of the export. If 0027 has not shipped, note N/A in the spec; 0027's own ticket should pick the field up when it ships.
- `tests/helpers/flows.ts` — extend `onboard()` to optionally accept a `supplements` value (default empty so existing callers are unaffected), so specs can drive an onboard-with-supplements without re-creating the form clicks.
- `tests/e2e/supplement-snapshot.spec.ts` (new) — every acceptance bullet maps to a `test()`. The `formatProfile()` inclusion test composes a plan with a non-empty supplements value and asserts the prompt body via the existing plan-compose mock accessor; the byte-identical test composes with an empty value and asserts the supplements heading is absent.
- `tests/e2e/privacy.spec.ts` — extend with an onboard-with-supplements + compose, confirming zero off-allow-list egress.
- New deps: **no**.
- Egress allow-list change: **no**.
- Schema migration: **yes** — Dexie v9, additive `Profile.supplements?`.
- Voice spec: the field label reads "Supplements you already take"; the hint reads "List them the way you'd say them — name, dose, timing. Optional." Declarative, no exclamation. Banned: "amazing," "exciting," "journey," "great." Ink and ink-soft only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

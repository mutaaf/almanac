---
id: NNNN
title: Short imperative title
status: proposed
priority: P2
area: plan
created: YYYY-MM-DD
owner: gtm-innovation
---

## User story

As a [persona, e.g. "halal-pescatarian user mid-protocol"], I want [specific behavior], so that [user-visible outcome — not engineering, not metrics].

## Why now (four lenses)

### Product Owner
What is the smallest meaningful unit of value? What gets simpler for the user, not just richer?

### Stakeholder
How does this widen the moat (persistent timeline / functional-range DB / canonicalization / insight engine / adherence loop / structured artifact / privacy)? Or — if it doesn't widen the moat — what specific user pain does it cure that justifies the work?

### User (at 7am on the phone)
What does this *feel* like? One tap or three? Resilient to a flaky connection? Does it work with wet hands?

### Growth
Why does this make someone tell one specific person about it? What is the "show me" moment — the single screenshot a friend would want to see?

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario. The dev agent will write tests against this list before writing code.

- [ ] [Observable behavior 1 — be specific. e.g. "Pasting 3 images with 3 distinct dates produces 3 panels in the labs index."]
- [ ] [Observable behavior 2.]
- [ ] [Observable behavior 3.]
- [ ] [Regression check that's relevant. e.g. "Pasting 3 images with the same date still produces 1 panel."]
- [ ] [Cross-cutting: works in chromium AND mobile-webkit, or note explicitly if mobile is out-of-scope.]
- [ ] [Privacy check: no new hostnames appear in the network allow-list.]

## Out of scope

Explicit anti-goals — the dev agent will not do these even if they seem related.

- ...
- ...

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/...` — what to change here
- `tests/e2e/...` — where the test goes
- New deps: yes/no, and which
- Schema migration needed: yes/no, and at what version
- Egress allow-list change required: yes/no — if yes, the privacy E2E will fail unless updated; justify here

## Implementation log

(Appended by the implementation-dev agent during execution.)

- YYYY-MM-DD — branch `feat/NNNN-...` opened
- YYYY-MM-DD — failing test added in `tests/e2e/...`
- YYYY-MM-DD — PR #N opened, CI [state]
- YYYY-MM-DD — merged to main

# Backlog

The single source of truth for what gets built next. Owned jointly by the **GTM & Innovation** subagent (writes tickets) and the **Implementation Developer** subagent (ships them).

## How it works

1. **Ideate** — `/ideate` (or `@gtm-innovation`) generates new tickets and drops them in this directory as `NNNN-kebab-title.md`.
2. **Groom** — `/groom` re-prioritizes existing tickets, rewrites vague ones, prunes the no-longer-worth-doing.
3. **Ship** — `/ship` (or `/ship 0003`) picks the top-priority ticket, opens a branch, writes the test first, ships it through CI, opens a PR.

The PR merges only when the gating CI checks pass (see `AGENTS.md`).

## Ticket conventions

Every ticket lives in its own file named `NNNN-kebab-title.md` where `NNNN` is a zero-padded incrementing id. Use `_template.md` as the starting point — copy it, don't edit it.

**Frontmatter is required:**

```yaml
---
id: 0007
title: Auto-split panels by drawn date
status: groomed     # proposed | groomed | in-progress | shipped | rejected | needs-discovery
priority: P1        # P0 (do now) | P1 (next sprint) | P2 (someday-maybe) | P3 (icebox)
area: labs          # labs | plan | meals | today | progress | settings | infra | privacy | growth
created: 2026-05-14
owner: gtm-innovation
---
```

**Body must include:**
1. **User story** — the persona + behavior + outcome triple.
2. **Why now (four lenses)** — Product Owner, Stakeholder, User, Growth.
3. **Acceptance criteria** — checkbox list that maps 1:1 to E2E test scenarios.
4. **Out of scope** — explicit anti-goals so the dev agent doesn't gold-plate.
5. **Engineering notes** — files to touch, dependencies, hard constraints.
6. **Implementation log** — appended by the dev agent during execution.

## Priorities

- **P0** — ships this week. Either user-visible breakage, a security/privacy issue, or a wedge a sibling ticket depends on.
- **P1** — ships next. The next compounding lever (a real feature, a meaningful UX leap, a moat-deepener).
- **P2** — someday-maybe. Good ideas waiting for context. Most tickets sit here.
- **P3** — icebox. Don't ship without a fresh `/groom` pass first.

## Statuses

- `proposed` — written by GTM, not yet validated for execution.
- `groomed` — validated; acceptance criteria are test-shaped; ready for dev to pick up.
- `in-progress` — a feature branch + PR is open against it.
- `shipped` — merged on `main`. Keep the file for traceability.
- `rejected` — closed without shipping. Body explains why.
- `needs-discovery` — too vague; needs a `/groom` rewrite or human conversation.

## Index (top of the stack, by priority)

> Updated by `/groom`. This table is the truth about ordering; ignore filesystem ordering.
> Sorted by status (in-progress > groomed > proposed > needs-discovery > shipped > rejected), then priority (P0 > P1 > P2 > P3), then id ascending.

| id | title | priority | status | area |
|----|-------|----------|--------|------|
| 0014 | Sample tour before consent — let prospects see the artifact before trusting it | P1 | proposed | growth |
| 0015 | Quiet-day card on Today — a reason to open the app on a Wednesday | P1 | proposed | today |
| 0016 | Provenance appendix on the doctor PDF — auditable rule trail in the clinical hand-off | P2 | proposed | plan |
| 0005 | Mobile-WebKit timing hardening — promote to gating CI check | P0 | shipped | infra |
| 0007 | First plan from intake alone (no labs required) | P0 | shipped | onboarding |
| 0001 | Auto-split panels by drawn date | P1 | shipped | labs |
| 0002 | User-extensible marker database | P1 | shipped | labs |
| 0003 | Single-meal swap with constraint preservation | P1 | shipped | meals |
| 0006 | Per-marker "Why is this a problem?" expansion | P1 | shipped | plan |
| 0008 | Weekly recap — "this week in your protocol" | P1 | shipped | today |
| 0009 | Side-by-side draw comparison with shared-marker deltas | P1 | shipped | progress |
| 0011 | Marker hero share card — one-marker, phone-shaped image for social | P1 | shipped | growth |
| 0012 | Next-draw projection — what we'd expect to see if you tested today | P1 | shipped | progress |
| 0004 | Apple Health import (CSV/XML, on-device) | P2 | shipped | infra |
| 0010 | Printable one-page protocol (on-device, share with doctor or friend) | P2 | shipped | plan |
| 0013 | Insight engine provenance — show every rule's evidence on the Plan page | P2 | shipped | plan |

## Hand-off discipline

GTM never edits `src/`. Dev never invents acceptance criteria the ticket doesn't already have — if the ticket is unclear, the dev pushes back via the ticket's body, not by improvising.

# AGENTS.md — contributor guide for autonomous agents

This file is the contract for any AI agent (Claude, GPT, Aider, etc.) or human contributor working on Almanac. Read it before you change a single line.

## The non-negotiables

These are not opinions, they're the product:

1. **No regressions allowed.** Every feature is end-to-end tested. If you change a file in `src/`, run `npm run ci` locally before you commit, and don't merge until GitHub Actions is green.
2. **Privacy is the contract, not a feature.** Almanac never transmits user data anywhere except `api.anthropic.com` (BYOK, directly from the browser). No backend. No analytics. No error reporting. No "feature flags fetched from a server". If you find yourself adding any of those, you're building a different product — stop.
3. **The user's API key is sacred.** It lives in IndexedDB on the user's device. It is *never* logged, displayed in the DOM, sent to any server we operate, or persisted anywhere outside the user's own browser. Adding telemetry that includes the key is grounds for revert.
4. **Test first, then code.** Add or update a Playwright spec in `tests/e2e/` for any new feature before you write the implementation. The spec is the proof the feature works, and the proof it doesn't regress later.
5. **No new dependencies without a justification.** Every new npm package widens the supply-chain surface. Anchor every dep to a real product need (Dexie: IndexedDB ergonomics; Anthropic SDK: API client; Playwright: E2E). Reject "but it's just X kb" as a reason.
6. **The voice spec is editorial, not chatty.** Banned words across UI copy and AI prompts: "journey", "amazing", "exciting", "great", emoji-heavy headings. The aesthetic is a printed almanac, not a kanban board.

## Two agents, one backlog

Almanac is built by two specialized subagents working through a single backlog:

| Agent | Role | Lives at | Touches |
|---|---|---|---|
| **GTM & Innovation** | Product owner + stakeholder + user + growth lead in one voice. Generates and grooms feature tickets. | `.claude/agents/gtm-innovation.md` | `docs/backlog/` only — **never** `src/` or `tests/` |
| **Implementation Developer** | Test-first executor. Picks the top ticket, writes the failing E2E, implements, ships through CI, opens a PR with auto-merge enabled. | `.claude/agents/implementation-dev.md` | Everything — but always via a feature branch + PR, never direct to `main` |
| **Review** | Grades the PR against AGENTS.md + the ticket's acceptance criteria. Posts an approve (which unblocks auto-merge) or request-changes (with line-anchored comments). | `.claude/agents/review.md` | Read-only on the diff. Only writes via `gh pr review`. |

The backlog at `docs/backlog/` is the single source of truth for what gets built next. Each ticket is a self-contained markdown file (`NNNN-kebab-title.md`) with frontmatter (id, status, priority, area, owner) and a body that includes user story, four-lens "Why now" (PO / Stakeholder / User / Growth), acceptance criteria mapped to test scenarios, out-of-scope, and engineering notes. See `docs/backlog/README.md` for the full conventions.

**The full autonomous loop:**

```
GTM agent ──► Dev agent ──► Review agent ──► auto-merge ──► auto-deploy
(launchd     (launchd       (launchd polls    (GitHub when    (Vercel on
 every 6h)    every 1h)      every 5 min)      CI green +      push to main)
                                                no blocking
                                                review)
```

All three agents run **locally** via your `claude` CLI, so they run against your Claude Max subscription (free under your plan, no separate API charges). The only cost in the loop is your Claude usage, which is the same whether you ran these prompts manually or autonomously.

Each handoff is gated:
- **Dev → Review**: Dev opens the PR with `gh pr merge --auto --squash`. GitHub holds the merge.
- **Review → merge**: branch protection requires (a) Typecheck + build green, (b) E2E (chromium) green. The local review agent posts a `--comment` sign-off (informational) or a `--request-changes` review which **blocks** the auto-merge. Since the review agent runs as the repo owner (same identity as the PR author), GitHub forbids self-approval — so we use the request-changes path as the blocker instead of approval as the unblocker.
- **merge → deploy**: Vercel watches the GitHub repo; every push to `main` triggers a production deploy automatically.

**Slash commands** (manual, interactive — you drive):
- `/ideate [focus area]` — fires the GTM agent to add new tickets. Optional `$ARGUMENTS` like "growth", "moat", "mobile retention".
- `/groom` — fires the GTM agent to re-prioritize and prune existing tickets without adding new ones.
- `/ship [ticket-id]` — fires the Dev agent to execute the top-priority groomed ticket (or a specific id if you pass one).
- `/backlog` — read-only summary of the current backlog state.

**Autonomous local schedule** (launchd jobs, no human required — see `scripts/README.md`):
- `agent-ship.sh` — fires every hour at :41 local. Picks the top groomed/proposed ticket, runs the full Dev loop, opens a PR with auto-merge enabled. Single-PR-at-a-time gated.
- `agent-groom.sh` — fires every 6 hours at :17 local. Runs the GTM agent to re-prioritize + add 2-4 fresh tickets focused on acquisition/retention/moat. Self-gates when there are already 3+ groomed P0/P1.
- `agent-review.sh` — polls every 5 minutes for open agent PRs with no review yet. Posts a `--comment` sign-off if clean, `--request-changes` if blocking. Self-gates silently when there's nothing to review.
- Install: `bash scripts/install-agents.sh` once on a Mac. Uninstall: `bash scripts/uninstall-agents.sh`. Logs at `~/.cache/almanac-agent/logs/`.
- All three have a self-cancel date baked in (2026-05-28) to bound autonomous spend; edit the scripts to extend.

**The handoff discipline:**
- GTM writes specs. Dev writes code. Neither does the other's job.
- If a spec is ambiguous, the Dev pushes back through the ticket body, not by improvising.
- If a feature would violate this contract (`AGENTS.md`), the GTM finds a different solution rather than weakening the contract.
- Every ticket is shippable on its own. No "phase 1 / phase 2" multi-ticket plans.

## Architecture, in one paragraph

Almanac is a single-page Vite + vanilla TypeScript app. All persistence is in IndexedDB via Dexie. The user's profile, lab panels, generated plans, weekly meal plans, daily check-ins, and a small extraction-cache all live in one local DB. Three kinds of Anthropic API calls run directly from the browser using the user's BYOK key: **extraction** (PDF/image → structured Results), **plan generation** (panels + adherence → structured Plan with eatList/avoidList/insights/habits/retest), and **meal generation** (Plan + dietary pattern → 7 days × breakfast/lunch/dinner + grocery list). A **deterministic cross-marker insight engine** runs in pure TypeScript before each plan generation; its output is injected into the prompt as authoritative findings.

## Directory map

```
almanac/
├── AGENTS.md                ← you are here
├── README.md                ← user-facing docs, deploy, run
├── CLAUDE.md                ← Claude-Code-specific notes (if present)
├── .claude/
│   ├── agents/
│   │   ├── gtm-innovation.md        ← the product/growth subagent
│   │   └── implementation-dev.md    ← the test-first dev subagent
│   └── commands/
│       ├── ideate.md        ← /ideate — GTM adds tickets
│       ├── groom.md         ← /groom — GTM re-prioritizes
│       ├── ship.md          ← /ship — Dev executes top ticket
│       └── backlog.md       ← /backlog — read-only summary
├── docs/
│   └── backlog/
│       ├── README.md        ← backlog conventions + index
│       ├── _template.md     ← copy this when writing a new ticket
│       └── NNNN-*.md        ← one file per ticket
├── package.json
├── playwright.config.ts     ← E2E config (chromium + mobile-webkit)
├── vercel.json              ← deploy config (SPA rewrites + security headers)
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts              ← bootstrap + hash router (only entry point)
│   ├── styles.css           ← single CSS file. No CSS modules / styled-c***.
│   ├── ui.ts                ← templating helpers + errorCard()
│   ├── chrome.ts            ← masthead + foot
│   ├── types.ts             ← every domain type. Read this first.
│   ├── db.ts                ← Dexie schema (v4) + every persistence helper
│   ├── claude.ts            ← Anthropic SDK client + PLAN_VOICE / MEAL_VOICE
│   ├── extractor.ts         ← lab PDF/image → structured Results
│   ├── insights.ts          ← cross-marker pattern + trend rules
│   ├── telemetry.ts         ← token-usage recording (localStorage)
│   ├── viz.ts               ← thermometer / sparkline / ring SVG helpers
│   ├── data/
│   │   └── markers.ts       ← the functional-range marker database
│   └── pages/
│       ├── welcome.ts       ← consent splash (the gate)
│       ├── onboarding.ts    ← profile setup
│       ├── today.ts         ← meals + habit stack + streak strip
│       ├── plan.ts          ← protocol (Dashboard / Read modes)
│       ├── meals.ts         ← 7-day meal plan + grocery list
│       ├── labs.ts          ← upload (multi-file paste/drop) + manual + detail + match-unrecognized
│       ├── progress.ts      ← marker trends with functional-range band
│       └── settings.ts      ← profile edit, export/import, telemetry, wipe
├── tests/
│   ├── fixtures/            ← canned API responses (extraction / plan / meals)
│   ├── helpers/
│   │   ├── mocks.ts         ← page.route Anthropic mock + egress allow-list
│   │   └── flows.ts         ← reusable onboarding / addPanel / compose flows
│   └── e2e/                 ← one spec per route
└── .github/workflows/ci.yml ← the green bar
```

## How to add a feature (the canonical loop)

**If you're a human** — pick a ticket from `docs/backlog/`, branch, and follow the loop below. Or invoke `/ship <ticket-id>` to delegate to the Implementation Developer subagent.

**If you're the Implementation Developer subagent** — your full execution loop is in `.claude/agents/implementation-dev.md`. The condensed version:

1. **Pick the ticket.** Top-priority `groomed` (or `proposed` if none groomed). Read it in full.
2. **Branch.** `git checkout -b feat/<ticket-id>-<slug>`.
3. **Mark in-progress.** Update the ticket's frontmatter + commit.
4. **Write the failing E2E test FIRST.** Map every acceptance-criteria checkbox to a test or expectation.
5. **Run `npm run test -- --headed`** locally. Confirm it fails for the right reason.
6. **Write the minimum code to pass the test.** Match surrounding style.
7. **Run `npm run ci`** locally — typecheck, build, chromium suite. All green.
8. **Commit.** Message names the user-facing behavior. Trailer:
   ```
   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
9. **Push the branch + open a PR.** `git push -u origin HEAD && gh pr create --fill`.
10. **Watch CI.** `gh pr checks --watch`. Green = update ticket to `shipped`, push the status update. Red = fix, push, repeat.

Never push to `main` directly. Never bypass branch protection. Never disable a passing test to ship.

## Where things live

| Task | File |
|---|---|
| Add a new biomarker | `src/data/markers.ts` — append to `MARKERS[]`. Aliases matter; include every variant your lab uses. Add a Playwright test in `tests/e2e/labs.spec.ts` that auto-matches your marker name. |
| Add a cross-marker insight | `src/insights.ts` — add a rule to `RULES[]` (multi-marker pattern) or `TREND_RULES[]` (time-series). Add a test in `tests/e2e/plan.spec.ts` that constructs a panel which fires the rule. |
| Change LLM voice / system prompt | `src/claude.ts` — `PLAN_VOICE` or `MEAL_VOICE` or `src/extractor.ts` `EXTRACTION_PROMPT`. **Bump fixtures** in `tests/fixtures/` if the JSON shape changes. |
| Add a route | New file in `src/pages/`, register in `src/main.ts` router and `src/chrome.ts` nav, add a spec in `tests/e2e/`. |
| Touch persistence | `src/db.ts` — if you change schema, bump the version number, add a new `.version(N).stores({...})` block, never edit existing ones. Add a migration test. |
| Add a UI primitive | `src/viz.ts` for SVG, `src/ui.ts` for templating helpers, `src/styles.css` for styles. **One** CSS file. No CSS-in-JS. |
| Add a config / env var | Stop. Almanac has no environment variables. If you think you need one, propose first in an issue. |

## Test infrastructure

- **Framework**: `@playwright/test`.
- **Projects**: `chromium` (desktop) and `mobile-webkit` (iPhone 15 viewport). Every spec runs on both.
- **Anthropic mock**: `tests/helpers/mocks.ts` intercepts `https://api.anthropic.com/v1/messages` via `page.route()` and serves fixtures. Sniffs the system prompt to decide which fixture (extraction / plan / meals).
- **Egress allow-list**: the mock blocks anything not on `[127.0.0.1, localhost, fonts.googleapis.com, fonts.gstatic.com, api.anthropic.com]`. `tests/e2e/privacy.spec.ts` asserts the live URL list against this. Don't widen it.
- **Reusable flows**: `tests/helpers/flows.ts` exports `acknowledgeConsent`, `onboard`, `addManualPanel`, `composePlan`. Use them. Don't re-create the click sequences inline.
- **Fixtures**: `tests/fixtures/{extraction,plan,meals}.json`. If you change the Plan / MealPlan / Result types, update the fixtures and re-run the tests.

## Running locally

```bash
npm install                  # one-time
npx playwright install       # one-time
npm run dev                  # http://127.0.0.1:5181
npm run test                 # E2E on chromium + mobile-webkit
npm run test:headed          # watch the browser drive itself
npm run test:ui              # Playwright's interactive UI
npm run ci                   # what GitHub Actions runs
```

If a test fails, `playwright-report/index.html` has a video, a trace timeline, and a DOM snapshot at the failure point.

## Hard NOs

- **Don't add a backend.** This includes Cloudflare Workers, Vercel Edge Functions, a Postgres anywhere. If you think you need a server, the answer is to use a local primitive or punt.
- **Don't add analytics.** No Plausible, no Vercel Analytics, no "anonymous usage stats". Telemetry is local-only and stays in localStorage.
- **Don't proxy the Anthropic call** through your own server. The key is the user's; the call is direct.
- **Don't widen the egress allow-list** without an explicit feature design discussion. The privacy test exists to catch you.
- **Don't break the consent gate.** Routes are blocked until consent is acknowledged. Don't add a "skip welcome" shortcut.
- **Don't ship "AI-generic" UI.** No emoji-decorated headings, no purple gradients, no rounded everything. Match the editorial almanac aesthetic — Cormorant Garamond display + Inter Tight body, cream paper + ink + oxblood accent.

## Known issues

- **Mobile-WebKit post-compose flakes.** A handful of tests that compose a Plan and then assert on subsequent screens (Today, dashboard re-renders, habit-tap persistence) flake on Mobile Safari but pass on Chromium. The pattern: writes to IndexedDB aren't immediately readable on the next page render in some WebKit versions. CI runs the WebKit project with `continue-on-error: true` so these don't block merge; Chromium is the gating check. **Fix priority: high.** Likely fixes: synchronous `Promise.resolve().then(reload)` patterns, or explicit `waitForFunction` polling IndexedDB before assertions in the helpers.

## When things go wrong

- **Plan composition fails** with "Could not parse JSON" → response was truncated. Bump `max_tokens` in `src/claude.ts` for the relevant generator. See commit `21fbf50` for prior fix pattern.
- **Paste duplicates** → don't read both `clipboardData.items` and `clipboardData.files`. Pick one (we use `items`). Belt-and-braces dedupe by `name|size|lastModified` in `tests/e2e/labs.spec.ts`.
- **CSS overflow** → grid children need `min-width: 0` to actually respect `text-overflow: ellipsis`. See `.staged__chip` and `.result__ranges` for prior fix.
- **`page.goto("/#/route")` returns before the SPA renders** → hash-only navigations don't trigger `'load'`. After each goto, wait for a sentinel element of the target page (e.g. `await page.locator(".eyebrow").waitFor()`). Use the `composePlan` helper for the post-compose pattern — it does the reload-after-write that makes WebKit reads deterministic.

## License

Private. For me, and for whoever I hand a copy to. AI agents may contribute, but credit yourself in the commit trailer.

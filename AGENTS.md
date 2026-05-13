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

## Architecture, in one paragraph

Almanac is a single-page Vite + vanilla TypeScript app. All persistence is in IndexedDB via Dexie. The user's profile, lab panels, generated plans, weekly meal plans, daily check-ins, and a small extraction-cache all live in one local DB. Three kinds of Anthropic API calls run directly from the browser using the user's BYOK key: **extraction** (PDF/image → structured Results), **plan generation** (panels + adherence → structured Plan with eatList/avoidList/insights/habits/retest), and **meal generation** (Plan + dietary pattern → 7 days × breakfast/lunch/dinner + grocery list). A **deterministic cross-marker insight engine** runs in pure TypeScript before each plan generation; its output is injected into the prompt as authoritative findings.

## Directory map

```
almanac/
├── AGENTS.md                ← you are here
├── README.md                ← user-facing docs, deploy, run
├── CLAUDE.md                ← Claude-Code-specific notes (if present)
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

1. **Open `tests/e2e/<route>.spec.ts`** for the route you're touching. Write the new test FIRST. Describe the user behavior, not the implementation.
2. **Run `npm run test -- --headed`** locally. It will fail.
3. **Open the right file in `src/`.** If you're not sure where, see "Where things live" below.
4. **Write the minimum code to pass the test.** No more.
5. **Run `npm run ci`** locally — typecheck, build, every test on every project. Must be green.
6. **Commit with a message** that names the user-facing behavior. Include this trailer exactly:
   ```
   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
   (Or your own attribution if you're a different agent.)
7. **Push.** If CI is green, merge. If red, do not merge.

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

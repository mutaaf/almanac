---
id: 0033
title: The protocol on the fridge — a phone-shaped image of today's eat, avoid, and habits that lives on a home screen
status: groomed
priority: P2
area: growth
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user who wants the protocol where I will actually see it — on the fridge, on a lock screen, in the household chat — I want a one-tap "Save the card" on my plan that renders a single, phone-shaped image of the protocol's essentials (the three-to-five habits, the top eat-list foods with their frequency, the top avoid items), in the almanac's own type and color, so that I can keep the thing I am supposed to do somewhere I look a dozen times a day — instead of it living only inside an app I have to remember to open, where good intentions go to be forgotten.

## Why now (four lenses)

### Product Owner

The plan is the product's central artifact, and right now it can only be *read inside the app*. The marker-hero card (0011) proved the pattern — render one slice of the data to a phone-shaped image the user can save and post — but it shows a single marker, which is the trend, not the to-do. What a user actually wants on their fridge or lock screen is the *protocol*: what to eat, what to skip, the handful of habits. The smallest meaningful unit of value is a "Save the card" affordance on the Plan page that renders, entirely on-device (canvas, no network, no html-to-image dependency beyond what 0011 already established), one editorial image: a dateline header, the habit stack (3–5 lines), the top eat foods with frequency, and the top avoid items with their swap. It reuses 0011's canvas-render-and-download mechanism wholesale; the only new code is the layout of the protocol fields. Nothing about the plan or its generation changes.

### Stakeholder

This deepens the **structured artifact** moat by carrying it out of the app into the user's physical and digital environment — the difference between an artifact you visit and an artifact that visits you. It is the daily-presence sibling of the share link (0017): the share link sends the *live, tappable* protocol to a friend; this card puts the *glanceable* protocol on the user's own surfaces. A chat-box product cannot do this — it has only prose, which does not render to a clean, typed, glanceable card. The card is also a quiet acquisition surface: an image saved to a camera roll and dropped into a household chat or posted to a feed carries the almanac's editorial type and a single unobtrusive "Almanac" wordmark (no URL, no tracking — we have no backend), which is the most natural, lowest-pressure introduction the product has. The card crosses the boundary on its own because it is genuinely useful to keep, not because we asked the user to share it.

### User (at 7am on the phone)

Sunday, plan just composed. I want this on my fridge. "Save the card." A phone-shaped image lands in my downloads, in the type I have come to trust: "Almanac — week of May 18." Then my five habits, clean and legible. Then the foods to lean into, each with its rhythm — "Fatty fish, 3x / week. Leafy greens, daily." Then the two things to ease off, with the swap. I AirDrop it to my own phone and set it as a lock-screen widget background, or I print it and it goes on the fridge where my partner sees it too. It is the protocol, out of the app, where I live. It worked offline, instantly, because the card is drawn from a plan already on the device — no call, no wait, no key.

### Growth

This is a retention-through-presence ticket with a real acquisition tail. Retention: a protocol you see a dozen times a day is a protocol you follow; a protocol locked in an app you must remember to open is one you forget. The card converts the plan from a destination into ambient presence, which is the strongest non-notification adherence mechanism available to a product that will never send a push. (Hypothesis: users who save the protocol card show higher habit-adherence and higher week-4 retention than those who only read the plan in-app, because ambient visibility beats recalled intention — back-of-envelope from how habit-tracker home-screen widgets outperform in-app-only reminders; treat as untested without remote analytics.) The "show me" frame: a clean, typed protocol card on a fridge or a lock screen is a more frequent, more casual social impression than a one-time share — friends and housemates see it repeatedly, and "what's that on your fridge?" is the lowest-friction introduction the product can earn. The single quiet wordmark (no link, no UTM) is enough; the artifact's quality does the work.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/plan/protocol-card.ts` (new) exports `renderProtocolCard(plan: Plan, profile: Profile, opts: { width: number; height: number }): Promise<Blob>` (or returns a canvas the page converts to a Blob — match 0011's exact render-and-download mechanism). It draws a phone-shaped (portrait, e.g. 1080×1920) editorial image: a dateline header ("Almanac — week of <month day>"), the habit stack titles (capped at 5), the top eat-list foods with frequency (capped at 5, in plan order), and the top avoid-list items with their swap (capped at 3). Pure render: no Dexie, no network. Asserted by invoking the function with a known plan + profile and confirming a non-empty image Blob of the requested dimensions is produced.
- [ ] The Plan page (`src/pages/plan.ts`) gains a "Save the card" affordance near the existing plan actions. Tapping it builds the card from the current plan + profile and triggers a download (`<slug(ownerName)>-protocol.png`, falling back to `almanac-protocol.png`). Re-use 0011's download mechanism. Asserted by tapping the action and confirming a `.png` download with the expected filename.
- [ ] The card renders the habit stack titles verbatim from `plan.habitStack.habits`, capped at the first 5, in stored order. Asserted by seeding a plan with 6 habits and confirming exactly 5 render on the card (verify via a deterministic render-content assertion — see engineering notes for how 0011's spec checks card content).
- [ ] The card renders the top eat foods with their `frequency` (e.g. "Fatty fish — 3x per week"), capped at the first 5 eat items in stored order. Asserted with a plan whose eat list exceeds 5 items.
- [ ] The card renders the top avoid items with their `swap` where present (e.g. "Industrial seed oils → olive oil"), capped at the first 3. An avoid item with no swap renders the food name alone. Asserted with a mix of swap/no-swap avoid items.
- [ ] The card carries the editorial type (Cormorant Garamond display + Inter Tight body) and the cream/ink palette — no oxblood flood, no purple, no emoji — and a single small "Almanac" wordmark with NO URL and NO tracking parameter. Asserted by confirming the rendered card content/text includes the wordmark string and that no `http`/`https`/`?`-bearing string is drawn (assert on the text the renderer composes).
- [ ] The card is generated with **zero network calls** and **zero Anthropic calls** — it is a pure render of local data with locally-loaded fonts. Asserted by triggering the save and confirming the mock recorded zero requests. (Fonts are the existing Google Fonts already on the allow-list and already loaded by the app shell; the card render must not introduce a new font fetch — re-use the loaded faces.)
- [ ] The API key is NEVER drawn on the card and NEVER appears in any intermediate string. Asserted by seeding a sentinel key on the profile and confirming the sentinel appears nowhere in the card's composed text.
- [ ] When no plan exists, the "Save the card" affordance is absent (there is nothing to render) and the Plan page is byte-for-byte unchanged from today. Asserted on a fresh profile with no plan.
- [ ] Renders the affordance on both **chromium and mobile-webkit**. The download triggers on mobile-webkit, or — where WebKit blocks programmatic download — the card Blob/content is verified via the same mechanism 0011's spec uses. Touch target ≥44×44 css px. Note in the spec which path is asserted per project.
- [ ] Tour mode (0014) offers "Save the card" against the tour's fixture plan so a prospect can feel the artifact (the card is clearly the sample plan). Shared-view mode (0017) does NOT render the affordance — the recipient is viewing a shared protocol, not composing their own, and the existing share-view actions are the only ones offered there. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — the card is local-only; no new hostnames (fonts already on the allow-list); the key never appears; the wordmark carries no URL.
- [ ] Schema migration: **no** — the card is a render-time transform of the existing plan + profile. Nothing new is persisted.
- [ ] New `tests/e2e/protocol-card.spec.ts` covers: the action triggers a `.png` download with the right filename, habits/eat/avoid caps and content, swap rendering, the editorial wordmark with no URL, the key never appears (sentinel test), zero-network during render, action absent with no plan, tour vs shared-view behavior, mobile rendering/path note.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A live home-screen widget or a PWA install flow. We render a static image the user saves and places wherever they like. An OS widget is a platform-specific build we do not maintain; the image is the universal, dependency-free path.
- A new image/canvas dependency. The marker-hero card (0011) already established the on-device render-and-download mechanism; this ticket reuses it. If 0011's mechanism is canvas-based, this is canvas-based; do not introduce html-to-image, dom-to-png, or any new library.
- Rendering the full plan (snapshot, insights, lifestyle, supplements, retest) onto the card. The card is the *glanceable* protocol — habits, top eats, top avoids. The full plan lives in the app, the printable one-pager (0010), and the Markdown export (0027). A dense card defeats its purpose.
- A QR code or any link on the card. We have no backend; a QR to "the app" would point at a static SPA with no per-user state, which is misleading. The single wordmark is the only attribution; the share link (0017) is the path for sending the live protocol.
- Multiple card themes / color pickers / layout options. One editorial layout in the house style. Customization is gold-plating and dilutes the recognizable aesthetic.
- The 7-day meal plan or grocery list on the card. Those are their own surfaces (the meal grid in-app, the portable grocery list 0030). The protocol card is eat/avoid/habits.
- Carrying the card into the doctor PDF (0010/0016). The PDF is the clinical hand-off; the card is the user's own glanceable keepsake. Different artifacts, different audiences.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/plan/protocol-card.ts` (new) — `renderProtocolCard(plan, profile, opts)`. FIRST read the marker-hero card module from 0011 (the growth-area share card) and reuse its canvas setup, font handling, color tokens, and the convert-to-Blob + download path verbatim — this ticket is a second layout on the same proven mechanism, not a new rendering stack. Lay out: dateline → habits (≤5) → eat foods + frequency (≤5) → avoid foods + swap (≤3). Pure render.
- `src/pages/plan.ts` — add the "Save the card" affordance in the plan-actions region (where the existing plan-page actions live). Gate on a plan existing. Wire it to `renderProtocolCard(plan, profile, …)` → Blob → the same download helper 0011 uses. Do not invent a second download mechanism.
- `src/data/markers.ts` — read-only, only if the card references a marker name anywhere (it primarily renders the plan's own free-form food/habit strings). If a marker name is shown, resolve via `findMarker()`.
- `src/types.ts` — no new persistent types; any internal layout type lives inside `protocol-card.ts`.
- `src/styles.css` — minimal; one new action button styled like the existing plan-page actions and 0011's "Save card" action. The card itself is canvas-drawn, not CSS; the color/type tokens come from the shared constants 0011 already defines (cream, ink, the display + body font families). No new colors.
- `src/share/shared-state.ts` / `src/sample/state.ts` — gate with `isSharedView()` (absent) / `isTour()` (present, sample plan).
- `tests/helpers/flows.ts` — re-use `composePlan` (or seed a Plan with known habits/eat/avoid via `page.evaluate`) so the spec has a deterministic plan to render. Mirror however 0011's spec asserts card content (0011 likely exposes the composed text or asserts on a known-pixel/known-text path — match it).
- `tests/e2e/protocol-card.spec.ts` (new) — every acceptance bullet maps to a `test()`. The "key never appears" test seeds a sentinel key and asserts it is absent from the card's composed text. The "no URL" test asserts the composed text contains no `http`/`https`/`?`.
- `tests/e2e/privacy.spec.ts` — extend with a card-save invocation confirming zero off-allow-list egress (fonts already allow-listed; no new font fetch).
- New deps: **no** — reuse 0011's render mechanism.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the card dateline reads "Almanac — week of <month day>." Section labels (if any) are restrained ("Lean into," "Ease off," "Habits"). The wordmark is "Almanac" with no URL. Banned: "amazing," "exciting," "journey," "great." Cream + ink, the single oxblood accent used sparingly if at all; editorial type only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

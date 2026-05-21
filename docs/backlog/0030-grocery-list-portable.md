---
id: 0030
title: The grocery list, out of the app — copy or share the week's shopping to the partner who actually shops
status: proposed
priority: P2
area: meals
created: 2026-05-21
owner: gtm-innovation
---

## User story

As a user whose partner does the grocery run — and who keeps the shopping list in their phone's notes app, not in Almanac — I want a one-tap "copy the list" and, where the phone supports it, a "share the list" on the grocery surface, so that the section-organized list the meal plan already built lands in my partner's hands (a text message, the household notes, a native reminders app) as plain text they can check off in whatever they already use — instead of being trapped inside an app the person doing the shopping has never opened and is not going to install.

## Why now (four lenses)

### Product Owner

The 7-day meal plan auto-derives a grocery list organized by section — produce, protein, pantry, and so on. It is genuinely useful and completely stranded: it lives only inside `#/meals`, on the device of the person who composed the plan, in a form no other app and no other person can reach. The person who actually shops is frequently *not* the person who set up Almanac — it is a partner, a roommate, a parent — and they are not going to install a precision-health app to read a shopping list. The result is that a real feature dies at the last six inches: the user re-types the list into their notes app, or photographs the screen, or just shops from memory. The smallest meaningful unit of value is two affordances on the grocery surface: "Copy list" (writes the section-organized list to the clipboard as clean plain text) and, on browsers that expose `navigator.share`, "Share list" (hands the same text to the OS share sheet — Messages, Notes, Reminders, whatever). Both are pure, local, zero-network transforms of the grocery data already on screen. Nothing about the meal plan or its generation changes; this is the missing exit door on an artifact that already exists.

### Stakeholder

This does not widen a moat asset — it cures a sharp, specific friction that quietly undercuts the **structured artifact** moat. The grocery list is one of the clearest expressions of why Almanac is not a chat box: a chat box gives you prose; Almanac gives you a section-organized, checkable shopping list derived from a real meal plan. But a structured artifact the user cannot get *out* of the app is only half a moat — the value leaks at the boundary. Making the list portable as plain text completes the artifact: it becomes a thing the user can actually use in their real life, with the people in it, which is the difference between a feature they admire and a feature they depend on. And there is a quiet acquisition vector: a partner who receives "here's our shopping list from Almanac" every week is a warm prospect — they are already benefiting from the product secondhand, and the plain-text list (with a one-line "made with Almanac" footer, no link, no tracking) is the most natural possible introduction. The household is the smallest viral unit, and the grocery list is the thing that already crosses its boundary.

### User (at 7am on the phone)

Sunday, planning the week, list of groceries on screen, partner already asking what we need. Two small affordances under the list: "Copy list" and "Share list." I tap Share. The OS sheet comes up; I pick Messages, pick my partner, send. They get a clean, readable, section-organized list — "Produce: spinach, lemons, avocado (2)... Protein: salmon fillets (2 lb), eggs (1 dozen)... Pantry: olive oil, lentils..." — that they can check off in the thread or paste into their own list. No app to install, no account, no friction. The copy path is the wet-hands fallback: one tap, "Copied," and I paste it into our shared notes myself. It works offline, instantly, because the list is text I already have on the device — the share sheet and the clipboard are the only things involved, and neither touches the network.

### Growth

This is a friction-removal ticket with a real household-acquisition tail. The friction it removes is the last-mile failure of the meal plan: a list you cannot get to the person shopping is a list that does not get shopped. (Hypothesis: making the grocery list one-tap portable raises weekly meal-plan engagement and re-roll rate, because a list that reaches the shopper is a list that gets used, and a used list is a reason to generate next week's — back-of-envelope from how recipe apps with native share-to-list features show higher week-over-week meal-plan retention than those that strand the list in-app; treat as untested without remote analytics.) The acquisition tail is the household: the partner who receives the shared list every week is the most warmly-qualified prospect the product has — they already eat the protocol's food and see its list. The plain-text list with a single quiet "made with Almanac" line at the bottom (no URL, no tracking pixel — we have no backend and want none) is the lowest-pressure introduction imaginable, and it crosses the household boundary on its own, every week, without a share *button* the user has to think to press for marketing reasons.

## Acceptance criteria

Each box maps 1:1 to a Playwright test scenario.

- [ ] `src/meals/grocery-text.ts` (new) exports `renderGroceryText(groceryList: GroceryList): string` (confirm the exact grocery shape in `src/types.ts`). It emits the section-organized list as clean plain text: a "<plan week> grocery list" header line, then one block per section with the section name and its items (one per line, with quantity where present), then a final line "Made with Almanac." Pure: no DOM, no clipboard, no network. Asserted by importing the function and snapshotting its output against a known grocery fixture.
- [ ] The meals/grocery surface (`src/pages/meals.ts`) gains a "Copy list" affordance adjacent to the grocery list. Tapping it writes `renderGroceryText(...)` to the clipboard (`navigator.clipboard.writeText`) and renders a transient confirmation "Copied." in the editorial register. Asserted by tapping Copy, reading the clipboard via Playwright's clipboard permission, and confirming the section-organized text matches the rendered list.
- [ ] On browsers exposing `navigator.share`, a "Share list" affordance appears beside "Copy list" and, when tapped, invokes `navigator.share({ text: renderGroceryText(...) })`. On browsers without `navigator.share`, the Share affordance is absent and only Copy renders. Asserted by stubbing `navigator.share` (present → Share affordance fires with the expected text; absent → only Copy renders).
- [ ] The copied/shared text preserves section order and includes item quantities exactly as the on-screen list shows them. Asserted by a fixture with multiple sections and quantified items, comparing the text output to the rendered DOM list.
- [ ] When the grocery list is empty (no meal plan generated yet, or a plan with no derived list), neither affordance renders and the empty-state of the meals page is byte-for-byte unchanged from today. Asserted by visiting meals with no generated week.
- [ ] Both affordances are computed and executed with **zero network calls** — the text is built from local grocery data; the clipboard and the share sheet are device-local. Asserted by tapping Copy and Share and confirming the mock recorded zero requests.
- [ ] The text output contains NO banned editorial words ("journey", "amazing", "exciting", "great") in its template copy; the "Made with Almanac." footer is a single plain line with no URL and no tracking parameter. Asserted by scanning the template's static strings and confirming no `http`/`https`/query-string content in the output.
- [ ] Renders on both **chromium and mobile-webkit**. The affordances are ≥44×44 css px touch targets; on mobile-webkit, where clipboard/share APIs may be gated, the spec verifies the generated text via the same mechanism used to test the JSON export (read the would-be-copied string), and confirms the Share affordance presence tracks `navigator.share` availability. Note explicitly in the spec which path is asserted per project.
- [ ] The existing on-screen grocery list (checkboxes, sections) is unchanged in behavior and layout — the affordances are purely additive. Asserted by confirming the grocery list checkbox interactions still work after the affordances render.
- [ ] Tour mode (0014) offers Copy/Share against the tour's grocery fixture so a prospect can feel the exit door (the copied text carries the sample list, clearly the sample). Shared-view mode (0017) does NOT render the meal plan or grocery list (not part of the shared payload), so the affordances are absent there. Asserted in both modes.
- [ ] Privacy E2E (`tests/e2e/privacy.spec.ts`) still passes — copy/share are device-local; no new hostnames; no inference call; the "Made with Almanac." footer carries no URL.
- [ ] Schema migration: **no** — the text is a render-time transform of the existing grocery list. Nothing new is persisted.
- [ ] New `tests/e2e/grocery-portable.spec.ts` covers: Copy writes the section-organized text to the clipboard, Share fires `navigator.share` with the expected text when available and is absent when not, section order + quantities preserved, affordances absent on an empty list, zero-network, no-URL footer, on-screen list unchanged, tour vs shared-view behavior, mobile rendering/path note.

## Out of scope

Explicit anti-goals. The dev agent will not do these even if they seem related.

- A "publish list to a URL" / "share to web" path. That requires a backend. The list leaves as plain text via the clipboard or the OS share sheet — both device-local — never via a server we operate.
- Integration with a specific grocery or delivery service (Instacart, AnyList, etc.). Those are third-party APIs and accounts; plain text into the user's existing app is the universal, dependency-free path. A targeted integration is a separate ticket only if real users ask for one specific service.
- A live, shared, collaboratively-editable list across two devices. That is sync, which needs a backend. The list crosses the household boundary as a static text snapshot the partner uses in their own app.
- Re-deriving or re-rolling the grocery list. This ticket only exports the list the meal plan already produced. Generation is unchanged.
- A PDF or richly-formatted grocery export. Plain text is the maximally-portable, app-agnostic format that pastes cleanly into Messages, Notes, and Reminders. No styling, no print sheet.
- Carrying check-state ("already have olive oil") into the export. The exported text is the full list; the partner checks it off in their own app. A "only un-checked items" export is a possible follow-up, not v1.
- Any tracking, link, or attribution beyond the single plain "Made with Almanac." line. No URL, no UTM, no referral code — we have no backend to receive a click and no analytics to read one.

## Engineering notes

Files / patterns the dev should touch. Be specific enough that the dev doesn't have to re-discover the architecture.

- `src/meals/grocery-text.ts` (new) — `renderGroceryText(groceryList)` per the acceptance bullets. Confirm the grocery list shape in `src/types.ts` (the MealPlan's derived grocery list — sections + items + quantities). Pure string templating; no Markdown library, no I/O. Mirror the deterministic-renderer pattern the Markdown export (0027) establishes if it has shipped, but do not depend on it.
- `src/pages/meals.ts` — the page renders the 7-day grid and the section-organized grocery list with checkboxes. Add the "Copy list" and (conditionally) "Share list" affordances adjacent to the grocery list heading. Wire Copy to `navigator.clipboard.writeText(renderGroceryText(list))` with a transient "Copied." confirmation; wire Share to `navigator.share({ text: renderGroceryText(list) })`, rendering the Share affordance only when `typeof navigator.share === "function"`. Re-use whatever transient-confirmation idiom the app already uses (the share-card or share-link flows likely have one).
- `src/types.ts` — no new persistent types; add any internal render type inside `grocery-text.ts`. The grocery list type already exists on the MealPlan.
- `src/styles.css` — `.grocery-actions` (the affordance row), styled as small-caps eyebrow links in ink, ≥44×44 css px touch targets. No new colors. Match the existing meals-page action styling.
- `src/share/shared-state.ts` / `src/sample/state.ts` — gate with `isSharedView()` (meal plan/grocery not in shared payload → affordances absent) and `isTour()` (tour grocery fixture → affordances present, copied text is the sample).
- `tests/helpers/flows.ts` — re-use the meal-generation flow (or seed a MealPlan with a known grocery list straight to Dexie) so the spec has a deterministic list to copy/share. If no `seedMealPlan` helper exists, add one that writes a fully-formed MealPlan to Dexie.
- `tests/e2e/grocery-portable.spec.ts` (new) — every acceptance bullet maps to a `test()`. Grant clipboard permission in the chromium project for the Copy assertion; stub `navigator.share` via `page.addInitScript` to test both the present and absent branches and to capture the shared text. The "no URL" test asserts the output contains no `http`/`https`/`?`.
- `tests/e2e/privacy.spec.ts` — extend with a Copy/Share invocation confirming zero off-allow-list egress and a no-URL footer.
- New deps: **no** — plain-text templating; clipboard and Web Share are platform APIs.
- Egress allow-list change: **no**.
- Schema migration: **no**.
- Voice spec: the header reads "<week> grocery list"; section names and items pass through from the data; the footer is exactly "Made with Almanac." (no URL). On-screen confirmation is "Copied." Banned: "amazing," "exciting," "journey," "great." Ink only.

## Implementation log

(Appended by the implementation-dev agent during execution.)

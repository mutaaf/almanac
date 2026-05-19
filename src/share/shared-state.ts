// Shared-view state module (ticket 0017).
//
// Mirrors `src/sample/state.ts` from 0014 — same tiny boundary between the
// rest of the app and an in-memory state object, same localStorage sentinel
// pattern, same restraint over novelty. The two modules deliberately do not
// share code: a future refactor could pull them into a common base if a
// third such mode ever appears, but for v1 the duplication is the lower
// risk than a premature abstraction.
//
//   - `isSharedView()`           reads the localStorage sentinel
//   - `enterSharedView(state)`   sets the sentinel + the in-memory state
//   - `exitSharedView()`         clears both
//   - `sharedPlan()`, `sharedMealPlan()`, `sharedProfile()`
//                                getter shims for the read-shim path in db.ts
//
// The in-memory state is held in a module-scoped variable. Page refreshes
// drop the state and the localStorage flag stays set — the next render will
// detect the mismatch and route to #/welcome with the decode-failure notice
// (the share URL would need to be re-opened). That's the intentional
// trade-off for never writing the recipient's IndexedDB.

import type {
  Plan, MealPlan, Profile, SharedProtocolState,
} from "../types";

const SHARED_KEY = "almanac.sharedView";

/* -------------------------------------------------------------------------- */
/*  Sentinel                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * True when the shared-view flag is set in localStorage. Cheap to call; safe
 * from every page render. Guards against the rare environment where
 * localStorage throws on access; in that case we fall back to "not in shared
 * view" and the user gets the real gate.
 */
export function isSharedView(): boolean {
  try { return localStorage.getItem(SHARED_KEY) === "true"; }
  catch { return false; }
}

/**
 * Enter shared-view mode. Sets the sentinel AND the in-memory state in one
 * call so the next render has everything it needs. Called from the router's
 * `#/shared` branch after a successful `decodeProtocolPayload`.
 */
export function enterSharedView(state: SharedProtocolState): void {
  try { localStorage.setItem(SHARED_KEY, "true"); }
  catch { /* private mode: the next isSharedView() returns false anyway */ }
  _state = state;
}

/**
 * Exit shared-view mode. Clears the sentinel AND the in-memory state.
 * Called by the masthead banner's "Start your own →" link via the router's
 * `#/welcome` branch. Idempotent — calling it when not in shared-view is a
 * no-op.
 */
export function exitSharedView(): void {
  try { localStorage.removeItem(SHARED_KEY); }
  catch { /* nothing to do */ }
  _state = null;
}

/* -------------------------------------------------------------------------- */
/*  In-memory state + getters                                                 */
/* -------------------------------------------------------------------------- */

let _state: SharedProtocolState | null = null;

/**
 * The synthetic plan facade. The page renderers on Today, Plan, and Meals
 * call this through the read shims in `src/db.ts`. Returns the same object
 * across calls — pages MAY mutate `.eatList.push(...)` etc., but the shared
 * fixture is built fresh on every share open, so cross-render contamination
 * is bounded to a single recipient session.
 */
export function sharedPlan(): Plan | undefined {
  return _state?.plan;
}

export function sharedMealPlan(): MealPlan | undefined {
  return _state?.mealPlan;
}

/**
 * A synthetic, near-empty Profile shell the page code can read against
 * without crashing. The recipient's Today greeting reads `profile.ownerName`;
 * we surface a friendly placeholder ("a friend") rather than an empty string
 * so the greeting reads naturally. The API key is the empty string — any
 * code path that would try to use it would 401 on Anthropic, but shared-view
 * never reaches an Anthropic call (the privacy contract is asserted in the
 * spec).
 */
export function sharedProfile(): Profile {
  return {
    id: "singleton",
    ownerName: "a friend",
    sex: "unspecified",
    goals: "",
    conditions: "",
    dietPattern: "",
    anthropicKey: "",
    model: "claude-sonnet-4-6",
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * Read access to the raw `SharedProtocolState`. Used by the page-level
 * branches in `today.ts` / `meals.ts` / `plan.ts` that want to know whether
 * a meal plan was shared without re-loading via `sharedMealPlan()`. Returns
 * undefined when shared-view is not active.
 */
export function sharedState(): SharedProtocolState | undefined {
  return _state ?? undefined;
}

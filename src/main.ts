// Bootstrap + hash router.
//
//   #/onboarding   first-run; required before anything else
//   #/today        the daily check-in (the ritual)
//   #/plan         the living protocol
//   #/labs         lab panels: upload, view, manual entry
//   #/progress     trends across panels
//   #/settings     profile, key, export/import/wipe
//
// Ticket 0014 — sample tour. A third branch sits ABOVE the consent + profile
// gates: when `isTour()` is true AND the route is not #/welcome, both gates
// are bypassed and the page renders against the fixture (via the read shims
// in src/db.ts). Routing TO #/welcome explicitly calls `exitTour()` so the
// next render reinstates the gate — the only escape hatch from the tour.
//
// Ticket 0017 — shareable protocol link. A fourth branch sits next to the
// tour branch: when `isSharedView()` is true (set by a successful decode of
// a `#/shared?p=...` URL), the same gate-bypass treatment applies, and the
// read shims in src/db.ts return the decoded payload instead of the user's
// IndexedDB. The `#/shared` route is handled here too — it decodes, enters
// shared-view, and routes to `#/today`. Routing TO `#/welcome` always
// clears shared-view (just like it clears tour) so the consent gate is back.

import { getProfile, recordSession, previousSessionAt, allPanels, latestPlan, db, today } from "./db";
import { renderWelcome, consentAcknowledged } from "./pages/welcome";
import { renderOnboarding } from "./pages/onboarding";
import { renderToday }      from "./pages/today";
import { renderPlan }       from "./pages/plan";
import { renderMeals }      from "./pages/meals";
import { renderLabs }       from "./pages/labs";
import { renderProgress }   from "./pages/progress";
import { renderRecap }      from "./pages/recap";
import { renderSettings }   from "./pages/settings";
import {
  renderWelcomeBack, computeWelcomeBackState, setPendingWelcomeBackState,
} from "./pages/welcome-back";
import { isTour, exitTour } from "./sample/state";
import {
  isSharedView, enterSharedView, exitSharedView,
} from "./share/shared-state";
import { decodeProtocolPayload } from "./share/protocol-link";

/**
 * localStorage key the welcome page reads to render the inline "your shared
 * link did not decode" notice. Set by the router's `#/shared` branch on
 * decode failure, cleared by the welcome page itself after rendering once.
 */
const SHARED_DECODE_ERROR_KEY = "almanac.sharedDecodeError";

/**
 * In-memory once-per-session flag (ticket 0018). The router sets this on the
 * first load where the lapse-aware redirect fires; subsequent in-session
 * navigations to `#/today` skip the redirect even when the gap criteria still
 * hold. Page reloads reset the flag — that's the same "fresh session" boundary
 * that drives the `sessions` table write.
 */
let _welcomeBackFlowFired = false;

/**
 * Per-page-load cache for the session bookkeeping (ticket 0018). The router
 * is re-entrant — `hashchange` fires `route()` again whenever it edits
 * `location.hash` — so we must only write ONE session row per real load.
 * The first call to `loadSessionBookkeeping()` records and reads; subsequent
 * calls in the same load return the cached values.
 */
let _sessionBookkeeping: Promise<{ id: number; prevAt: number | null }> | null = null;
async function loadSessionBookkeeping(): Promise<{ id: number; prevAt: number | null }> {
  if (_sessionBookkeeping) return _sessionBookkeeping;
  _sessionBookkeeping = (async () => {
    let id = 0;
    try { id = await recordSession(); } catch { id = 0; }
    if (id <= 0) return { id: 0, prevAt: null as number | null };
    const prevAt = await previousSessionAt(id);
    return { id, prevAt };
  })();
  return _sessionBookkeeping;
}

export async function route(): Promise<void> {
  const hash = location.hash || "#/today";
  const path = hash.split("?")[0] ?? hash;

  // The `#/shared` route is the recipient's entry point. Decode the payload,
  // enter shared-view, and hand off to `#/today`. On decode failure, set the
  // sentinel localStorage flag and route to `#/welcome` where the welcome
  // page surfaces the inline notice. Never touches IndexedDB.
  if (path === "#/shared") {
    const q = (hash.split("?")[1] ?? "").split("#")[0] ?? "";
    const params = new URLSearchParams(q);
    const encoded = params.get("p") ?? "";
    const state = await decodeProtocolPayload(encoded);
    if (!state) {
      try { localStorage.setItem(SHARED_DECODE_ERROR_KEY, "true"); } catch { /* private mode */ }
      // Clear any prior shared-view so a malformed retry from inside a
      // session still lands on a fresh welcome.
      exitSharedView();
      location.hash = "#/welcome";
      return;
    }
    enterSharedView(state);
    location.hash = "#/today";
    return;
  }

  // Tour and shared-view branches — keep them above the consent gate.
  // A visitor in either mode lands on every page without acknowledging
  // consent and without an IndexedDB profile; the read shims in src/db.ts
  // serve the fixture / payload instead. The ONLY exit is routing TO
  // `#/welcome`, which clears both flags.
  if (path === "#/welcome") {
    // Whether we entered #/welcome via the banner or via a direct visit, we
    // always clear both flags here so the gate is back in force on the
    // next render. Idempotent — clearing an already-clear flag is a no-op.
    exitTour();
    exitSharedView();
    return renderWelcome();
  }
  if (isTour() || isSharedView()) {
    return dispatch(path);
  }

  // Consent gate: every user must explicitly acknowledge the three points
  // (not medical advice / local-first / BYOK billed to them) before any
  // other route. Acknowledgment is one-time, persisted in localStorage.
  if (!consentAcknowledged()) {
    location.hash = "#/welcome";
    return;
  }

  const profile = await getProfile();
  if (!profile && path !== "#/onboarding") {
    location.hash = "#/onboarding";
    return;
  }

  // Lapse-aware welcome-back redirect (ticket 0018). The router writes one
  // session row per full page load and reads the most-recent OLDER row to
  // derive the gap. When the gap exceeds the threshold AND a plan exists AND
  // the resolved route is `#/today` (the default landing) AND the user has
  // not dismissed for today AND we have not already fired this session, the
  // router redirects once to `#/welcome-back`. Tour and shared-view mode
  // short-circuit upstream — the if-block above returns before this runs.
  await maybeRedirectToWelcomeBack(path);
  if (path === "#/welcome-back") {
    return renderWelcomeBack();
  }
  if (location.hash !== hash) {
    // The lapse-aware branch changed the hash; the hashchange listener will
    // re-enter route() with the new path. Don't double-render here.
    return;
  }

  return dispatch(path);
}

/**
 * Record this load's session, derive the prior `at`, and decide whether the
 * lapse-aware welcome-back redirect should fire. The actual side effects are:
 *
 *   - one session row written on every full page load
 *   - `setPendingWelcomeBackState()` called when state is non-null, so the
 *     page renderer can paint without a second DB round-trip
 *   - `location.hash` set to "#/welcome-back" when all gate conditions hold
 */
async function maybeRedirectToWelcomeBack(resolvedPath: string): Promise<void> {
  const { id: sessionId, prevAt } = await loadSessionBookkeeping();
  if (sessionId <= 0) return;

  const [plan, panels] = await Promise.all([
    latestPlan(),
    allPanels(),
  ]);

  if (prevAt == null) return;
  if (plan == null) return;
  if (resolvedPath !== "#/today") return;
  if (_welcomeBackFlowFired) return;

  // Per-day dismissal — namespaced by today's local ISO date so a fresh
  // computation runs tomorrow regardless of the gap.
  const todayIso = today();
  const dismissKey = `almanac.welcomeBack.dismissed.${todayIso}`;
  try {
    if (localStorage.getItem(dismissKey) === "true") return;
  } catch {
    // Private mode: treat as "not dismissed" and proceed.
  }

  // Pull every projection snapshot so the computation can detect
  // `projection-opened` rows across all panels, not just the latest.
  const projections = await db.projections.toArray();

  const state = computeWelcomeBackState(Date.now(), prevAt, plan, panels, projections);
  if (!state) return;

  _welcomeBackFlowFired = true;
  setPendingWelcomeBackState(state);
  location.hash = "#/welcome-back";
}

function dispatch(path: string): Promise<void> {
  switch (path) {
    case "#/onboarding": return renderOnboarding();
    case "#/labs":       return renderLabs();
    case "#/plan":       return renderPlan();
    case "#/meals":      return renderMeals();
    case "#/progress":   return renderProgress();
    case "#/recap":      return renderRecap();
    case "#/settings":   return renderSettings();
    case "#/today":
    default:             return renderToday();
  }
}

window.addEventListener("hashchange", () => { void route(); });
window.addEventListener("DOMContentLoaded", () => { void route(); });
if (document.readyState !== "loading") {
  void route();
}

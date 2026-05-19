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

import { getProfile } from "./db";
import { renderWelcome, consentAcknowledged } from "./pages/welcome";
import { renderOnboarding } from "./pages/onboarding";
import { renderToday }      from "./pages/today";
import { renderPlan }       from "./pages/plan";
import { renderMeals }      from "./pages/meals";
import { renderLabs }       from "./pages/labs";
import { renderProgress }   from "./pages/progress";
import { renderRecap }      from "./pages/recap";
import { renderSettings }   from "./pages/settings";
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

  return dispatch(path);
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

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

export async function route(): Promise<void> {
  const hash = location.hash || "#/today";
  const path = hash.split("?")[0] ?? hash;

  // Tour branch — keep this above the consent gate. A tour visitor lands on
  // every page without acknowledging consent and without an IndexedDB
  // profile; the read shims in src/db.ts serve the fixture instead. The
  // ONLY exit is routing TO #/welcome — the banner's CTA does exactly that.
  if (path === "#/welcome") {
    // Whether we entered #/welcome via the banner or via a direct visit, we
    // always clear the tour flag here so the gate is back in force on the
    // next render. Idempotent — clearing an already-clear flag is a no-op.
    exitTour();
    return renderWelcome();
  }
  if (isTour()) {
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

// Bootstrap + hash router.
//
//   #/onboarding   first-run; required before anything else
//   #/today        the daily check-in (the ritual)
//   #/plan         the living protocol
//   #/labs         lab panels: upload, view, manual entry
//   #/progress     trends across panels
//   #/settings     profile, key, export/import/wipe

import { getProfile } from "./db";
import { renderWelcome, consentAcknowledged } from "./pages/welcome";
import { renderOnboarding } from "./pages/onboarding";
import { renderToday }      from "./pages/today";
import { renderPlan }       from "./pages/plan";
import { renderMeals }      from "./pages/meals";
import { renderLabs }       from "./pages/labs";
import { renderProgress }   from "./pages/progress";
import { renderSettings }   from "./pages/settings";

export async function route(): Promise<void> {
  const hash = location.hash || "#/today";
  const path = hash.split("?")[0] ?? hash;

  // Consent gate: every user must explicitly acknowledge the three points
  // (not medical advice / local-first / BYOK billed to them) before any
  // other route. Acknowledgment is one-time, persisted in localStorage.
  if (!consentAcknowledged() && path !== "#/welcome") {
    location.hash = "#/welcome";
    return;
  }

  const profile = await getProfile();
  if (!profile && path !== "#/onboarding" && path !== "#/welcome") {
    location.hash = "#/onboarding";
    return;
  }

  switch (path) {
    case "#/welcome":    return renderWelcome();
    case "#/onboarding": return renderOnboarding();
    case "#/labs":       return renderLabs();
    case "#/plan":       return renderPlan();
    case "#/meals":      return renderMeals();
    case "#/progress":   return renderProgress();
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

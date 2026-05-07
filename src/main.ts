// Bootstrap + hash router.
//
//   #/onboarding   first-run; required before anything else
//   #/today        the daily check-in (the ritual)
//   #/plan         the living protocol
//   #/labs         lab panels: upload, view, manual entry
//   #/progress     trends across panels
//   #/settings     profile, key, export/import/wipe

import { getProfile } from "./db";
import { renderOnboarding } from "./pages/onboarding";
import { renderToday }      from "./pages/today";
import { renderPlan }       from "./pages/plan";
import { renderLabs }       from "./pages/labs";
import { renderProgress }   from "./pages/progress";
import { renderSettings }   from "./pages/settings";

async function route(): Promise<void> {
  const hash = location.hash || "#/today";
  const path = hash.split("?")[0] ?? hash;

  const profile = await getProfile();
  if (!profile && path !== "#/onboarding") {
    location.hash = "#/onboarding";
    return;
  }

  switch (path) {
    case "#/onboarding": return renderOnboarding();
    case "#/labs":       return renderLabs();
    case "#/plan":       return renderPlan();
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

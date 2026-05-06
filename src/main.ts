// Bootstrap + hash router. Five routes, one root.
//
//   #/onboarding   first-run; required before anything else
//   #/today        the ritual screen
//   #/inputs       the notebook
//   #/almanac      the archive
//   #/settings     identity, key, model, export/import
//

import { getSettings } from "./db";
import { renderOnboarding } from "./pages/onboarding";
import { renderInputs }     from "./pages/inputs";
import { renderToday }      from "./pages/today";
import { renderAlmanac }    from "./pages/almanac";
import { renderSettings }   from "./pages/settings";

async function route(): Promise<void> {
  const hash = location.hash || "#/today";
  const path = hash.split("?")[0] ?? hash;

  // Onboarding gate — if no settings, force users through it.
  const settings = await getSettings();
  if (!settings && path !== "#/onboarding") {
    location.hash = "#/onboarding";
    return;
  }

  switch (path) {
    case "#/onboarding": return renderOnboarding();
    case "#/inputs":     return renderInputs();
    case "#/almanac":    return renderAlmanac();
    case "#/settings":   return renderSettings();
    case "#/today":
    default:             return renderToday();
  }
}

window.addEventListener("hashchange", () => { void route(); });
window.addEventListener("DOMContentLoaded", () => { void route(); });

// If the file is loaded after DOMContentLoaded already fired (Vite), run now.
if (document.readyState !== "loading") {
  void route();
}

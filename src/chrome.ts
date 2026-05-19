// Persistent masthead + foot.
//
// Ticket 0014: when `isTour()` is true, a slim full-bleed banner prepends the
// masthead on every route. It's plain HTML — a single sentence, a hairline
// rule at the bottom, and an inline "Start your own →" link that routes to
// #/welcome. The router's tour branch clears the flag on the next render.

import { esc, longDate, issueLabel } from "./ui";
import { getProfile, today } from "./db";
import { isTour } from "./sample/state";

export async function masthead(currentRoute: string): Promise<string> {
  const profile = await getProfile();
  const dateline = longDate(today());
  const issue = profile ? issueLabel(profile.createdAt) : "";
  const tourBanner = isTour() ? renderTourBanner() : "";

  const link = (href: string, label: string) => {
    const active = href.split("?")[0] === currentRoute.split("?")[0];
    return `<a href="${href}" ${active ? 'aria-current="page"' : ""}>${label}</a>`;
  };

  // The Recap link is intentionally part-time. It shows on Sundays (when the
  // user is most likely to plan the week ahead) and any time the user is
  // already on the recap page, so they can navigate back to it. Mon–Sat on
  // any other route, it stays out of the masthead — Almanac is daily-first,
  // and we don't want a permanent sixth nav slot for a weekly feature.
  const showRecap = new Date().getDay() === 0
    || currentRoute.split("?")[0] === "#/recap";

  return `
    ${tourBanner}
    <header class="masthead">
      <div>
        <div class="dateline">${esc(dateline)}${issue ? ` &nbsp;·&nbsp; ${esc(issue)}` : ""}</div>
        <div class="wordmark">Almanac<span class="amp">.</span></div>
      </div>
      <nav>
        ${link("#/today",    "Today")}
        ${link("#/meals",    "Meals")}
        ${link("#/plan",     "Plan")}
        ${link("#/labs",     "Labs")}
        ${link("#/progress", "Progress")}
        ${showRecap ? link("#/recap", "Recap") : ""}
        ${link("#/settings", "Settings")}
      </nav>
    </header>
  `;
}

/**
 * The tour banner — a slim full-bleed strip with one declarative sentence
 * and a single "Start your own" link. Plain HTML; the link is a real
 * anchor (`href="#/welcome"`) so it works without JS, and the router's tour
 * branch handles the cleanup on the way to #/welcome.
 *
 * Voice: one sentence, no exclamation, no "amazing/journey/exciting".
 */
function renderTourBanner(): string {
  return `
    <div class="tour-banner" role="note">
      <span class="tour-banner__msg">You are touring a sample. Nothing here is yours.</span>
      <a class="tour-banner__cta" href="#/welcome" data-action="exit-tour">Start your own →</a>
    </div>
  `;
}

export function foot(pageNo: number | string = ""): string {
  return `
    <footer class="foot">
      <span class="colophon">Informational, not medical advice. Discuss changes with your clinician.</span>
      <span>${esc(pageNo)}</span>
    </footer>
  `;
}

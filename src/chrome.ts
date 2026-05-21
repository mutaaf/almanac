// Persistent masthead + foot.
//
// Ticket 0014: when `isTour()` is true, a slim full-bleed banner prepends the
// masthead on every route. It's plain HTML — a single sentence, a hairline
// rule at the bottom, and an inline "Start your own →" link that routes to
// #/welcome. The router's tour branch clears the flag on the next render.
//
// Ticket 0017: when `isSharedView()` is true, the SAME `.tour-banner` block
// is emitted with the shared-view copy. The CSS token is shared; the
// editorial copy is the one thing that differs — restraint over novelty.

import { esc, longDate, issueLabel } from "./ui";
import { getProfile, today, hasRealProfile } from "./db";
import { isTour } from "./sample/state";
import { isSharedView } from "./share/shared-state";
import { consentAcknowledged } from "./pages/welcome";

export async function masthead(currentRoute: string): Promise<string> {
  const profile = await getProfile();
  const dateline = longDate(today());
  const issue = profile ? issueLabel(profile.createdAt) : "";
  // Shared-view wins over tour when both flags are set (shouldn't happen in
  // practice — the router clears the other when entering either — but
  // defensive ordering avoids two banners stacked on top of each other).
  //
  // Ticket 0020: the shared-view banner gains an additive "Adopt as a starting
  // point" CTA, but ONLY for a first-time recipient — no real profile AND no
  // consent on this device. A returning user who already trusts Almanac sees
  // the original "Start your own →" alone. `hasRealProfile()` reads the real
  // singleton profile row exactly once per banner render (bypassing the
  // shared-view shim) — it never reads the recipient's panels/plans/check-ins.
  let topBanner = "";
  if (isSharedView()) {
    const showAdopt = !consentAcknowledged() && !(await hasRealProfile());
    topBanner = renderSharedBanner(showAdopt);
  } else if (isTour()) {
    topBanner = renderTourBanner();
  }

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
    ${topBanner}
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

/**
 * The shared-view banner — same CSS token as the tour banner, different
 * editorial copy. The "Start your own →" CTA still routes to #/welcome; the
 * router's shared-view branch clears the flag on the way through.
 *
 * Ticket 0020: when `showAdopt` is true (first-time recipient), an additive
 * second CTA — "Adopt as a starting point" — renders at equal visual weight
 * (same `tour-banner__cta` token, same hairline rule). It is NOT an anchor: a
 * document-level delegated handler in `main.ts` opens the adopt modal, which
 * captures the seed before clearing shared-view. The original "Start your own"
 * stays unchanged in label and behavior — the two paths are independent.
 *
 * Voice: copy is the verbatim string from the ticket. A copy-drift test lives
 * in `tests/e2e/protocol-link.spec.ts` (Start your own) and
 * `tests/e2e/adopt-and-adapt.spec.ts` (Adopt).
 */
function renderSharedBanner(showAdopt: boolean): string {
  const adoptCta = showAdopt
    ? `<button type="button" class="tour-banner__cta" data-action="adopt-protocol">Adopt as a starting point</button>`
    : "";
  return `
    <div class="tour-banner tour-banner--shared" role="note">
      <span class="tour-banner__msg">You are reading a protocol shared with you. Nothing here is yours yet.</span>
      <a class="tour-banner__cta" href="#/welcome" data-action="exit-shared">Start your own →</a>
      ${adoptCta}
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

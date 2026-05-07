// Persistent masthead + foot.

import { esc, longDate, issueLabel } from "./ui";
import { getProfile, today } from "./db";

export async function masthead(currentRoute: string): Promise<string> {
  const profile = await getProfile();
  const dateline = longDate(today());
  const issue = profile ? issueLabel(profile.createdAt) : "";

  const link = (href: string, label: string) => {
    const active = href.split("?")[0] === currentRoute.split("?")[0];
    return `<a href="${href}" ${active ? 'aria-current="page"' : ""}>${label}</a>`;
  };

  return `
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
        ${link("#/settings", "Settings")}
      </nav>
    </header>
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

// Masthead + foot — the persistent chrome around every page.
// Rendered fresh on each navigation; cheap.

import { esc, longDate, issueLabel } from "./ui";
import { getSettings, today } from "./db";

export async function masthead(currentRoute: string): Promise<string> {
  const settings = await getSettings();
  const dateline = longDate(today());
  const issue = settings ? issueLabel(settings.createdAt) : "";

  const link = (href: string, label: string) =>
    `<a href="${href}" ${href === currentRoute ? 'aria-current="page"' : ""}>${label}</a>`;

  return `
    <header class="masthead">
      <div>
        <div class="dateline">${esc(dateline)}${issue ? ` &nbsp;·&nbsp; ${esc(issue)}` : ""}</div>
        <div class="wordmark">Almanac<span class="amp">.</span></div>
      </div>
      <nav>
        ${link("#/today",   "Today")}
        ${link("#/inputs",  "Inputs")}
        ${link("#/almanac", "Almanac")}
        ${link("#/settings","Settings")}
      </nav>
    </header>
  `;
}

export function foot(pageNo: number | string = ""): string {
  return `
    <footer class="foot">
      <span class="colophon">Printed quietly, on this device.</span>
      <span>${esc(pageNo)}</span>
    </footer>
  `;
}

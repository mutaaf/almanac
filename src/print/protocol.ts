// Print orchestrator — wires the audience-specific template renderers to
// the live DOM and the browser's print stack.
//
// Strategy: per the engineering notes on ticket 0010, we use Option 1
// (window.print against a print-only `.print-sheet` block) instead of pulling
// in `pdf-lib`. The browser handles the "Save as PDF" / OS share-sheet flow
// natively — on desktop the print dialog offers "Save as PDF"; on mobile
// Safari and Chrome the system print sheet exposes Files / share / AirPrint.
// Setting `document.title = "almanac-plan-YYYY-MM-DD"` before the print()
// call is the cross-engine way to seed the suggested filename for both.
//
// We mount the print-sheet into the live DOM as a sibling of the page so the
// `@media print` rules can show it and hide everything else. After the print
// dialog dismisses (or window.print returns), we restore the document title
// and leave the sheet attached — that way assertions and follow-up "save
// another variant" actions don't have to re-build it.
//
// Strict privacy: this module never reads `profile.anthropicKey` /
// `profile.goals` / `profile.conditions` / `profile.householdSize`. It
// constructs a `PrintProfile` (ownerName-only) and hands that to the
// renderer. The API key cannot end up in the printed bytes because it
// never enters this code path.

import type { Plan, Panel, Profile } from "../types";
import { renderForDoctor, renderForFriend } from "./template";
import { today } from "../db";

export type Audience = "doctor" | "friend";

export interface MountAndPrintOpts {
  plan: Plan;
  profile: Profile;
  panels: Panel[];
  audience: Audience;
  /** Friend-variant only: drop the name from the title. Ignored for doctor. */
  hideName?: boolean;
}

/**
 * Build the audience-specific print-sheet, mount it into the document,
 * set the suggested filename via `document.title`, and call `window.print()`.
 *
 * Returns the suggested filename (without extension) so callers can wire it
 * to an alternate share / download path if `window.print()` is unavailable —
 * we currently always go through print(), but the return value lets a future
 * `pdf-lib`-backed path drop in without changing the call site.
 */
export function mountAndPrint(opts: MountAndPrintOpts): string {
  const filenameStem = suggestedFilename();
  const html = renderSheet(opts);

  // Replace any previously-mounted sheet so consecutive generates don't
  // pile up DOM nodes. We tag both the wrapper and the sheet itself so
  // tests and the cleanup path can find them deterministically.
  removeMountedSheet();

  const wrap = document.createElement("div");
  wrap.className = "print-sheet-wrap";
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  // Title at the time of print() is what every desktop browser uses as the
  // suggested "Save as PDF" filename. Restore the original on the next tick
  // so the rest of the SPA isn't left wearing the print title.
  const prevTitle = document.title;
  document.title = filenameStem;
  try {
    window.print();
  } finally {
    // queueMicrotask is intentional: some browsers read document.title
    // asynchronously when the print dialog mounts, so restore on the next
    // tick rather than synchronously inside the same frame.
    queueMicrotask(() => { document.title = prevTitle; });
  }

  return filenameStem;
}

/**
 * Remove any previously-mounted print sheet. Public so callers can clean up
 * when the user closes the print panel without generating.
 */
export function removeMountedSheet(): void {
  for (const node of document.querySelectorAll<HTMLElement>(".print-sheet-wrap")) {
    node.remove();
  }
}

/**
 * `almanac-plan-YYYY-MM-DD` (no extension). The print dialog adds .pdf when
 * the user picks "Save as PDF"; downstream share paths append it explicitly.
 */
export function suggestedFilename(d: string = today()): string {
  return `almanac-plan-${d}`;
}

/* -------------------------------------------------------------------------- */
/*  Internal                                                                  */
/* -------------------------------------------------------------------------- */

function renderSheet(opts: MountAndPrintOpts): string {
  // Strip Profile to the minimum subset the renderer is permitted to see.
  // The renderer's type for `profile` only declares `ownerName`, so even a
  // future code path that tries to read `profile.anthropicKey` here will
  // fail typecheck.
  const printProfile = { ownerName: opts.profile.ownerName };
  if (opts.audience === "doctor") {
    return renderForDoctor({
      audience: "doctor",
      profile: printProfile,
      plan: opts.plan,
      panels: opts.panels,
      today: today(),
    });
  }
  return renderForFriend({
    audience: "friend",
    profile: printProfile,
    plan: opts.plan,
    today: today(),
    hideName: opts.hideName ?? false,
  });
}

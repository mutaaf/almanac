// The hundred-day mark — quarterly reflective surface (ticket 0021).
//
// One editorial page, reached via the Today card or by direct URL at
// #/hundred-day. It reads the user's plans + panels + the full 100-day window
// of check-ins + projection snapshots, calls the PURE `computeHundredDayState()`
// (zero Anthropic calls), and paints three sections — the arc, the labs, the
// editorial — under a single eyebrow that continues the editorial register
// ("The first hundred", "The second hundred", ...).
//
// The route follows #/recap's gate posture exactly: it requires consent + a
// profile (enforced by the router upstream) and does NOT bypass either. Tour
// (0014) and shared-view (0017) mode short-circuit — both are session-scoped
// and have no real timeline, so the surface renders its empty state instead of
// a populated arc.

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, allPlans, allPanels, allCheckInsInWindow,
  firstPlanGeneratedAt, db,
} from "../db";
import { isTour } from "../sample/state";
import { isSharedView } from "../share/shared-state";
import { computeHundredDayState } from "../progress/hundred-day";
import { mountAndPrintHundredDay } from "../print/protocol";
import type { HundredDayState, ArcHabit, MarkerMovement } from "../types";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 100;

/* -------------------------------------------------------------------------- */
/*  Window bounds (mirrors the pure compute, for the precise DB query)        */
/* -------------------------------------------------------------------------- */

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The [windowStart, windowEnd] ISO Days for the most-recent completed 100-day
 * block, or null when the user is not yet 100 days past their first plan. The
 * page queries exactly this window from IndexedDB; the pure function re-filters
 * defensively so a stray off-window row can't slip through.
 */
function windowBounds(now: number, firstPlanAt: number): { start: string; end: string } | null {
  const elapsed = Math.floor((now - firstPlanAt) / DAY_MS);
  if (elapsed < WINDOW_DAYS) return null;
  const quarter = Math.floor(elapsed / WINDOW_DAYS);
  const startOffset = (quarter - 1) * WINDOW_DAYS;
  const endOffset = quarter * WINDOW_DAYS - 1;
  return {
    start: isoDay(firstPlanAt + startOffset * DAY_MS),
    end: isoDay(firstPlanAt + endOffset * DAY_MS),
  };
}

/* -------------------------------------------------------------------------- */
/*  Render                                                                    */
/* -------------------------------------------------------------------------- */

export async function renderHundredDay(): Promise<void> {
  const masth = await masthead("#/hundred-day");

  // Tour + shared-view short-circuit — no real timeline, no surface.
  if (isTour() || isSharedView()) {
    return paintEmpty(masth, "This is a sample view, not your timeline. The hundred-day mark reads the protocol you've actually held — start your own to build it.");
  }

  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const firstPlanAt = await firstPlanGeneratedAt();
  if (firstPlanAt == null) {
    return paintEmpty(masth, "A plan first, then a hundred days. Compose your protocol; the quarterly mark reads from the timeline that follows.");
  }

  const now = Date.now();
  const bounds = windowBounds(now, firstPlanAt);
  if (!bounds) {
    return paintEmpty(masth, "Not a hundred days yet. The quarterly mark opens once you're a full hundred days past your first plan — until then, the daily and weekly surfaces carry the record.");
  }

  const [plans, panels, checkIns] = await Promise.all([
    allPlans(),
    allPanels(),
    allCheckInsInWindow(bounds.start, bounds.end),
  ]);
  const projections = await db.projections.toArray();

  const state = computeHundredDayState(now, firstPlanAt, plans, panels, checkIns, projections);
  if (!state) {
    return paintEmpty(masth, "Not enough was logged across this quarter to draw the arc. Fifty check-ins inside a hundred days is the floor — keep logging, and the mark will open.");
  }

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page hundred-day">
        <div class="eyebrow hundred-day__eyebrow">${esc(quarterEyebrow(state.quarterIndex))}</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 22ch;">
          What <em>${windowSpanDays(state)}</em> days actually did.
        </h1>
        <p class="lede hundred-day__range" style="max-width: 56ch;">
          ${esc(longDate(state.windowStart))} — ${esc(longDate(state.windowEnd))}.
        </p>

        ${renderArc(state)}
        ${renderLabs(state)}
        ${renderEditorial(state)}

        <div class="hundred-day__cta">
          <button type="button" class="btn btn--accent hundred-day__print" data-action="hundred-day-print">
            Read this as a one-page PDF
          </button>
        </div>
      </section>
      ${foot("C")}
    </div>
  `);
  mount(frag);

  // Print CTA — fully on-device, zero new network. Mounts a `.print-sheet`
  // and fires window.print() via the 0010 plumbing (mountAndPrintHundredDay).
  document.querySelector("[data-action='hundred-day-print']")?.addEventListener("click", () => {
    mountAndPrintHundredDay(state);
  });
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                  */
/* -------------------------------------------------------------------------- */

function renderArc(state: HundredDayState): string {
  const rows = state.arc.habits.map(renderArcRow).join("");
  return `
    <section class="hundred-day__section hundred-day__arc">
      <div class="section-mark">The arc</div>
      ${state.arc.habits.length
        ? `<ul class="hundred-day__arc-list">${rows}</ul>`
        : `<p class="hundred-day__quiet">No habit appeared in a plan during this quarter.</p>`}
    </section>
  `;
}

function renderArcRow(h: ArcHabit): string {
  const note = arcNote(h);
  return `
    <li class="hundred-day__arc-row" data-habit-id="${esc(h.id)}">
      <span class="hundred-day__arc-title">${esc(h.title)}</span>
      <span class="hundred-day__arc-count">${h.heldDays} of 100 days</span>
      ${note ? `<span class="hundred-day__arc-note">${esc(note)}</span>` : ""}
    </li>
  `;
}

/** The one declarative phrase under a habit row: added / slipped / held. */
function arcNote(h: ArcHabit): string {
  if (h.addedOnDay != null && h.addedOnDay > 0) {
    return `Added on day ${h.addedOnDay}.`;
  }
  if (h.slipWeek != null) {
    return `Slipped from week ${h.slipWeek} onward.`;
  }
  return "Held.";
}

function renderLabs(state: HundredDayState): string {
  const { panels, markerMovements } = state.labs;
  let body: string;
  if (panels.length === 0) {
    body = `<p class="hundred-day__quiet">No draws inside the window. Habit cadence is the only signal we have for this quarter.</p>`;
  } else if (markerMovements.length === 0) {
    // One draw → no delta computable. Name the single draw's date.
    const drawn = panels.length === 1 ? panels[0]!.drawnAt : panels[panels.length - 1]!.drawnAt;
    body = `<p class="hundred-day__quiet">Two draws within the window are needed for a delta. You drew once — ${esc(longDate(drawn))}.</p>`;
  } else {
    body = `<ul class="hundred-day__movement-list">${markerMovements.map(renderMovementRow).join("")}</ul>`;
  }
  return `
    <section class="hundred-day__section hundred-day__labs">
      <div class="section-mark">The labs</div>
      ${body}
    </section>
  `;
}

function renderMovementRow(m: MarkerMovement): string {
  const dir = m.lastValue > m.firstValue ? "↑" : m.lastValue < m.firstValue ? "↓" : "→";
  const verdict = projectionLabel(m.projectionEvaluation);
  return `
    <li class="hundred-day__movement-row" data-marker-key="${esc(m.markerKey)}">
      <span class="hundred-day__movement-marker">${esc(m.markerKey)}</span>
      <span class="hundred-day__movement-delta">${m.firstValue} ${dir} ${m.lastValue} ${esc(m.unit)}</span>
      ${verdict ? `<span class="hundred-day__movement-verdict">${esc(verdict)}</span>` : ""}
    </li>
  `;
}

function projectionLabel(ev: MarkerMovement["projectionEvaluation"]): string {
  if (ev === "within") return "Within the projected band.";
  if (ev === "above")  return "Above the projected band.";
  if (ev === "below")  return "Below the projected band.";
  return "";
}

function renderEditorial(state: HundredDayState): string {
  const paras = state.editorial.paragraphs
    .map(p => `<p class="hundred-day__para" data-kind="${esc(p.kind)}">${esc(p.sentence)}</p>`)
    .join("");
  return `
    <section class="hundred-day__section hundred-day__editorial">
      <div class="section-mark">The editorial</div>
      ${paras || `<p class="hundred-day__quiet">The data this quarter is too thin for a paragraph. Keep logging.</p>`}
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Eyebrow ordinals + helpers                                               */
/* -------------------------------------------------------------------------- */

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

/** "The first hundred" … "The sixth hundred", then "Quarter N" past six. */
function quarterEyebrow(quarterIndex: number): string {
  const ord = ORDINALS[quarterIndex - 1];
  return ord ? `The ${ord} hundred` : `Quarter ${quarterIndex}`;
}

/** Always 100 unless the window function is later extended. */
function windowSpanDays(state: HundredDayState): number {
  const startMs = Date.parse(`${state.windowStart}T00:00:00Z`);
  const endMs = Date.parse(`${state.windowEnd}T00:00:00Z`);
  return Math.round((endMs - startMs) / DAY_MS) + 1;
}

function paintEmpty(masth: string, body: string): void {
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page hundred-day-empty">
        <div class="eyebrow">A quarterly note</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 22ch;">
          The hundred-day <em>mark</em>.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 1rem;">${esc(body)}</p>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <a href="#/today" class="btn btn--ghost">Back to today</a>
        </div>
      </section>
      ${foot("C")}
    </div>
  `);
  mount(frag);
}

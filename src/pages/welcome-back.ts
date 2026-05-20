// Lapse-aware welcome-back surface (ticket 0018).
//
// Fires only when the gap between the user's previous session and this load
// exceeds 14 days AND a composed plan exists. The page renders entirely from
// local data; zero Anthropic calls. The router (src/main.ts) hosts the
// redirect logic and calls into this module twice on each load:
//
//   1. computeWelcomeBackState(now, prev, plan, panels, projections)
//      — pure; returns null when nothing qualifies, a populated state otherwise.
//   2. renderWelcomeBack()
//      — paints. Section headings render only when their list is non-empty.
//
// Engineering notes from the ticket (verbatim CTA labels, eyebrow voice, etc.)
// are honored in the renderer. The two bottom CTAs are equally weighted —
// "Pick up where I left off" routes to #/today; "Re-compose with the time off
// counted" routes to #/plan?recompose=lapse-aware (the Plan page reads the
// query flag and threads the gap into the lapse-aware compose call).

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import {
  iso, latestPlan, allPanels, today,
} from "../db";
import type {
  Day, Panel, Plan, ProjectionSnapshot, WelcomeBackRow, WelcomeBackState,
} from "../types";
import { findMarker } from "../data/markers";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** Gap (in days) below which the surface stays silent. The ticket fixes this at 14. */
export const WELCOME_BACK_THRESHOLD_DAYS = 14;

/** Cap on the synthetic skip days the recompose path feeds into the prompt. */
export const WELCOME_BACK_MAX_SYNTHETIC_SKIP_DAYS = 30;

/** Window in days during which a future retest qualifies as "coming due". */
const RETEST_COMING_DUE_WINDOW_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/* -------------------------------------------------------------------------- */
/*  computeWelcomeBackState — pure                                            */
/* -------------------------------------------------------------------------- */

/**
 * Pure shaping function. Returns null when nothing qualifies; a populated
 * WelcomeBackState otherwise. The caller is responsible for loading inputs
 * (plan, panels, projections) and the wall clock — that keeps the function
 * trivially testable through the existing E2E spec without a mock clock here.
 */
export function computeWelcomeBackState(
  now: number,
  prev: number | null,
  plan: Plan | null,
  panels: Panel[],
  projections: ProjectionSnapshot[],
): WelcomeBackState | null {
  if (prev == null) return null;
  if (plan == null) return null;

  const daysAway = Math.floor((now - prev) / MS_PER_DAY);
  if (daysAway < WELCOME_BACK_THRESHOLD_DAYS) return null;

  return {
    daysAway,
    lastSessionAt: iso(new Date(prev)),
    whatsStill: buildStill(plan),
    whatChanged: buildChanged(now, prev, panels, projections),
    whatsOverdue: buildOverdue(now, plan),
  };
}

/* ---- whatsStill ---------------------------------------------------------- */

function buildStill(plan: Plan): WelcomeBackState["whatsStill"] {
  const all = plan.habitStack.habits.map(h => h.title);
  return {
    planComposedAt: iso(new Date(plan.generatedAt)),
    habitCount: all.length,
    habitTitles: all.slice(0, 3),
  };
}

/* ---- whatChanged --------------------------------------------------------- */

function buildChanged(
  now: number,
  prev: number,
  panels: Panel[],
  projections: ProjectionSnapshot[],
): WelcomeBackRow[] {
  const rows: WelcomeBackRow[] = [];

  // projection-opened — a projection's window opened (createdAt + low*7d
  // crossed) AFTER `prev` and is now in the past. The window's high edge is
  // the closing edge; we say "still open" only when `now` is before it.
  for (const snap of projections) {
    const opensAtMs  = snap.createdAt + snap.weeksOut[0] * 7 * MS_PER_DAY;
    const closesAtMs = snap.createdAt + snap.weeksOut[1] * 7 * MS_PER_DAY;
    if (opensAtMs > now) continue;          // window not open yet
    if (opensAtMs <= prev) continue;        // opened before the lapse — not new news
    if (closesAtMs < now) continue;         // already closed
    const marker = findMarker(snap.markerKey);
    const label = marker?.shortName ?? marker?.name ?? snap.markerKey;
    const opensIso = iso(new Date(opensAtMs));
    rows.push({
      kind: "projection-opened",
      body: `Your ${label} projection window opened on ${longDate(opensIso)} and is still open.`,
      cta: { label: "Plan a retest", href: "#/plan" },
    });
  }

  // projection-evaluated — a panel was uploaded during the gap that landed
  // inside/outside an earlier projection band. Only fires for AUTO-imported
  // panels (a lapsed user can't have manually uploaded), so we require
  // `source !== "manual"`. The branch returns the empty list when no
  // qualifying panels exist — that's the intentional shape from the ticket.
  for (const panel of panels) {
    const drawnMs = new Date(panel.drawnAt + "T00:00:00").getTime();
    if (drawnMs < prev) continue;
    if (drawnMs > now) continue;
    if (panel.source === "manual") continue;
    for (const r of panel.results) {
      const snap = projections.find(s =>
        s.markerKey === r.markerKey && s.panelId !== panel.id,
      );
      if (!snap) continue;
      const marker = findMarker(r.markerKey);
      const label = marker?.shortName ?? marker?.name ?? r.markerKey;
      const verdict = r.value < snap.low ? "under" : r.value > snap.high ? "over" : "within";
      rows.push({
        kind: "projection-evaluated",
        body: `Your ${label} projection landed at ${r.value} ${r.unit} — ${verdict} the projected band.`,
        cta: { label: "Open progress", href: "#/progress" },
      });
    }
  }

  // recap-missed-count — Sundays that occurred strictly after `prev` and on
  // or before `now`. The body uses the actual count.
  const missedSundays = countSundaysBetween(prev, now);
  if (missedSundays >= 1) {
    rows.push({
      kind: "recap-missed-count",
      body: `${missedSundays} Sunday recap${missedSundays === 1 ? "" : "s"} happened while you were away. Tap to read the most recent.`,
      cta: { label: "Read recap", href: "#/recap" },
    });
  }

  return rows;
}

/* ---- whatsOverdue -------------------------------------------------------- */

function buildOverdue(now: number, plan: Plan): WelcomeBackRow[] {
  const rows: WelcomeBackRow[] = [];
  // The persisted Plan carries `retest: RetestItem[]` where each item has a
  // `whenWeeks` field. The "target date" is derived from the plan's
  // `generatedAt` plus `whenWeeks * 7` days. We surface the FIRST retest
  // item — the protocol's most important retest line — to keep the surface
  // restrained to one row per kind.
  const first = plan.retest[0];
  if (!first) return rows;
  const targetMs = plan.generatedAt + first.whenWeeks * 7 * MS_PER_DAY;
  const deltaDays = Math.round((targetMs - now) / MS_PER_DAY);

  if (deltaDays < 0) {
    const targetIso = iso(new Date(targetMs));
    rows.push({
      kind: "retest-overdue",
      body: `Your retest was scheduled for ${longDate(targetIso)}. ${Math.abs(deltaDays)} days ago.`,
      cta: { label: "Update retest plan", href: "#/plan" },
    });
  } else if (deltaDays <= RETEST_COMING_DUE_WINDOW_DAYS) {
    rows.push({
      kind: "retest-coming-due",
      body: `Your retest is in ${deltaDays} day${deltaDays === 1 ? "" : "s"}.`,
      cta: { label: "Update retest plan", href: "#/plan" },
    });
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/*  Local helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Count Sundays strictly after `prevMs` and on-or-before `nowMs`. */
function countSundaysBetween(prevMs: number, nowMs: number): number {
  if (nowMs <= prevMs) return 0;
  let count = 0;
  // Walk forward day-by-day from the day AFTER prev. Bounded to a sane
  // ceiling so a pathological clock can't loop forever.
  const start = new Date(prevMs);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + 1);
  for (let i = 0; i < 366 && start.getTime() <= nowMs; i++) {
    if (start.getDay() === 0) count++;
    start.setDate(start.getDate() + 1);
  }
  return count;
}

/* -------------------------------------------------------------------------- */
/*  Pending-state hand-off from the router                                    */
/* -------------------------------------------------------------------------- */
/*
 * The router computes WelcomeBackState once per load. To avoid a second pass
 * over Dexie we stash it here for the page renderer to read. Lifetime is one
 * render — the page calls `consumePendingState()` which clears the slot.
 */

let _pending: WelcomeBackState | null = null;

export function setPendingWelcomeBackState(s: WelcomeBackState): void {
  _pending = s;
}

function consumePendingState(): WelcomeBackState | null {
  const s = _pending;
  _pending = null;
  return s;
}

/* -------------------------------------------------------------------------- */
/*  renderWelcomeBack — paints                                                */
/* -------------------------------------------------------------------------- */

export async function renderWelcomeBack(): Promise<void> {
  const plan = await latestPlan();
  if (!plan) {
    // Defensive — if the plan vanished between the router's check and now,
    // route back to Today. Should never happen in practice.
    location.hash = "#/today";
    return;
  }
  const state = consumePendingState() ?? (await rebuildStateFromDb());
  if (!state) {
    location.hash = "#/today";
    return;
  }
  await paintWelcomeBack(state);
}

async function rebuildStateFromDb(): Promise<WelcomeBackState | null> {
  // Defensive fallback used when the user reloads `#/welcome-back` directly.
  // We synthesize a `prev = now - threshold * MS_PER_DAY` so the state is at
  // least populated; the router's prev value is the canonical one for the
  // common path through the redirect.
  const plan = await latestPlan();
  if (!plan) return null;
  const panels = await allPanels();
  const now = Date.now();
  const prev = now - WELCOME_BACK_THRESHOLD_DAYS * MS_PER_DAY;
  return computeWelcomeBackState(now, prev, plan, panels, []);
}

async function paintWelcomeBack(state: WelcomeBackState): Promise<void> {
  // The masthead renders without an active-route indicator — this is a
  // re-entry interstitial, not a destination, so no nav slot lights up.
  const masth = await masthead("#/welcome-back");
  const dismissTodayIso = today();

  const stillHtml = renderStill(state);
  const changedHtml = renderListSection(
    "What changed while you were away",
    "welcome-back__changed",
    state.whatChanged,
  );
  const overdueHtml = renderListSection(
    "What is overdue",
    "welcome-back__overdue",
    state.whatsOverdue,
  );

  const frag = h(`
    <div class="reveal">
      ${masth}
      <article class="page welcome-back">
        <header class="welcome-back__head">
          <div class="welcome-back__eyebrow">Welcome back.</div>
          <a class="welcome-back__dismiss" href="#/today" data-action="dismiss-welcome-back" data-today="${esc(dismissTodayIso)}">Dismiss for today</a>
        </header>
        <p class="welcome-back__gap">It has been ${state.daysAway} days.</p>

        ${stillHtml}
        ${changedHtml}
        ${overdueHtml}

        <footer class="welcome-back__ctas">
          <a class="btn btn--accent welcome-back__cta" href="#/today" data-action="welcome-back-pickup">Pick up where I left off</a>
          <a class="btn btn--accent welcome-back__cta" href="#/plan?recompose=lapse-aware" data-action="welcome-back-recompose">Re-compose with the time off counted</a>
        </footer>
      </article>
      ${foot("W")}
    </div>
  `);
  mount(frag);

  // Dismissal — stash the local-ISO-keyed flag and route to Today. The router
  // reads this flag on the next load and skips the redirect for the rest of
  // today; the next morning the surface returns to normal precedence.
  document.querySelector<HTMLAnchorElement>("[data-action='dismiss-welcome-back']")
    ?.addEventListener("click", (ev) => {
      ev.preventDefault();
      const key = `almanac.welcomeBack.dismissed.${dismissTodayIso}`;
      try { localStorage.setItem(key, "true"); } catch { /* private mode is fine */ }
      location.hash = "#/today";
    });
}

function renderStill(state: WelcomeBackState): string {
  const still = state.whatsStill;
  if (still.habitCount === 0) return "";
  const moreSuffix = still.habitCount > 3
    ? ` and ${still.habitCount - 3} more`
    : "";
  const titles = still.habitTitles.map(esc).join(", ") + moreSuffix;
  return `
    <section class="welcome-back__still">
      <div class="welcome-back__heading">What is still here</div>
      <p class="welcome-back__body">Your protocol from ${esc(longDate(still.planComposedAt))} is intact. Your habit stack still has ${titles}.</p>
    </section>
  `;
}

function renderListSection(
  title: string,
  className: "welcome-back__changed" | "welcome-back__overdue",
  rows: WelcomeBackRow[],
): string {
  if (!rows.length) return "";
  return `
    <section class="${className}">
      <div class="welcome-back__heading">${esc(title)}</div>
      <ul class="welcome-back__list">
        ${rows.map(r => `
          <li class="welcome-back__row welcome-back__row--${esc(r.kind)}">
            <p class="welcome-back__body">${esc(r.body)}</p>
            ${r.cta ? `<a class="welcome-back__row-cta" href="${esc(r.cta.href)}">${esc(r.cta.label)}</a>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

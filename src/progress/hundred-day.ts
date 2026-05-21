// The hundred-day mark — pure computation (ticket 0021).
//
// `computeHundredDayState()` takes the user's plans, panels, check-ins, and
// projection snapshots and produces the structured state the quarterly surface
// renders. It is PURE: no DOM, no Dexie, no network, no Anthropic. The surface
// it feeds opens deterministically and offline — the entire point of building
// this on a local-first timeline rather than a server-rendered recap.
//
// The window is a fixed 100-day block from the user's FIRST plan. Quarter 1 is
// days 1–100, quarter 2 is 101–200, and so on; each quarter renders as its own
// surface (no cross-quarter combinators — that's a future ticket).
//
// Re-uses `evaluateLanded()` from projection.ts (ticket 0012) for the labs
// section's within/above/below verdict, so the hundred-day and the Progress
// page agree on what "landed inside the band" means.

import type {
  Plan, Panel, CheckIn, ProjectionSnapshot, Day,
  HundredDayState, ArcHabit, MarkerMovement, EditorialParagraph,
} from "../types";
import { evaluateLanded } from "./projection";
import { findMarker } from "../data/markers";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 100;
const MIN_CHECKINS = 50;
/** A habit "held" the window when it cleared at least half of it. */
const HELD_THRESHOLD = 0.5;

/* -------------------------------------------------------------------------- */
/*  Public entry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Build the HundredDayState for the most-recent completed 100-day block, or
 * null when the surface should not fire.
 *
 *   now                  — wall-clock ms.
 *   firstPlanGeneratedAt — the `generatedAt` of the user's oldest plan (ms).
 *   allPlans             — every plan, any order.
 *   allPanels            — every panel, any order.
 *   allCheckIns          — check-ins spanning at least the window.
 *   allProjections       — every projection snapshot.
 *
 * Returns null when (a) there is no plan, (b) the user is less than 100 days
 * past their first plan, or (c) fewer than 50 check-ins fell inside the window.
 */
export function computeHundredDayState(
  now: number,
  firstPlanGeneratedAt: number,
  allPlans: Plan[],
  allPanels: Panel[],
  allCheckIns: CheckIn[],
  allProjections: ProjectionSnapshot[],
): HundredDayState | null {
  // (a) no plan composed.
  if (!allPlans.length) return null;

  const elapsedDays = Math.floor((now - firstPlanGeneratedAt) / DAY_MS);
  // (b) not yet 100 days past the first plan.
  if (elapsedDays < WINDOW_DAYS) return null;

  // Which 100-day block we're in. quarter 1 = days 1..100 (elapsed 100..199).
  const quarterIndex = Math.floor(elapsedDays / WINDOW_DAYS);

  // Window day-offsets from the first plan: quarter Q covers offsets
  // [(Q-1)*100, Q*100 - 1] inclusive.
  const startOffset = (quarterIndex - 1) * WINDOW_DAYS;
  const endOffset = quarterIndex * WINDOW_DAYS - 1;
  const windowStartMs = firstPlanGeneratedAt + startOffset * DAY_MS;
  const windowEndMs = firstPlanGeneratedAt + endOffset * DAY_MS;
  const windowStart = isoDay(windowStartMs);
  const windowEnd = isoDay(windowEndMs);

  // Offset of a Day within the window (0 = windowStart). Used for adherence
  // weeks and the "added on day" marker.
  const offsetOf = (day: Day): number =>
    Math.round((dayMs(day) - windowStartMs) / DAY_MS);

  const inWindow = (day: Day): boolean => day >= windowStart && day <= windowEnd;

  const windowCheckIns = allCheckIns.filter((c) => inWindow(c.day));

  // (c) under the engagement floor.
  if (windowCheckIns.length < MIN_CHECKINS) return null;

  const arc = { habits: buildArc(allPlans, windowCheckIns, windowStart, windowStartMs, offsetOf) };
  const labs = buildLabs(allPanels, allProjections, inWindow);
  const editorial = { paragraphs: buildEditorial(arc.habits, labs.markerMovements, allPlans) };

  return { quarterIndex, windowStart, windowEnd, arc, labs, editorial };
}

/* -------------------------------------------------------------------------- */
/*  Arc — which habits held, which slipped, which were added                  */
/* -------------------------------------------------------------------------- */

function buildArc(
  allPlans: Plan[],
  windowCheckIns: CheckIn[],
  windowStart: Day,
  windowStartMs: number,
  offsetOf: (day: Day) => number,
): ArcHabit[] {
  // Plans ordered oldest-first so "first appearance" of a habit is stable.
  const plansAsc = [...allPlans].sort((a, b) => a.generatedAt - b.generatedAt);

  // The day-offset within the window where each habit first appeared in ANY
  // plan. A habit present in the very first plan (or any plan composed before
  // the window opened) counts as present from day 0.
  const firstSeenOffset = new Map<string, number>();
  const titleById = new Map<string, string>();
  for (const plan of plansAsc) {
    const planOffset = Math.max(0, Math.round((plan.generatedAt - windowStartMs) / DAY_MS));
    for (const h of plan.habitStack.habits) {
      if (!titleById.has(h.id)) titleById.set(h.id, h.title);
      if (!firstSeenOffset.has(h.id)) firstSeenOffset.set(h.id, planOffset);
    }
  }

  const habits: ArcHabit[] = [];
  for (const [id, title] of titleById) {
    const heldDays = windowCheckIns.filter((c) => c.habitsCompleted.includes(id)).length;
    const addedOnDay = firstSeenOffset.get(id) ?? 0;
    const slipWeek = computeSlipWeek(id, windowCheckIns, offsetOf);

    const row: ArcHabit = { id, title, heldDays };
    if (slipWeek != null) row.slipWeek = slipWeek;
    if (addedOnDay > 0) row.addedOnDay = addedOnDay;
    habits.push(row);
  }

  // Strongest cadence first — the editorial register names the held habit
  // before the slipped one.
  habits.sort((a, b) => b.heldDays - a.heldDays);
  void windowStart;
  return habits;
}

/**
 * The first week (1–14) where this habit's adherence dropped below 50% AND
 * stayed below for the next two weeks (a rolling three-week confirmation, so a
 * single off week doesn't read as a slip). Returns null when the habit never
 * slipped on that rolling basis.
 *
 * Adherence per week = (days the habit was logged that week) / (calendar days
 * in that week that are inside the window, capped at 7).
 */
function computeSlipWeek(
  habitId: string,
  windowCheckIns: CheckIn[],
  offsetOf: (day: Day) => number,
): number | undefined {
  // 14 weeks cover the 100-day window (the 15th week is partial; we cap at 14).
  const weeks = 14;
  const heldByWeek = new Array<number>(weeks).fill(0);
  for (const c of windowCheckIns) {
    if (!c.habitsCompleted.includes(habitId)) continue;
    const off = offsetOf(c.day);
    if (off < 0) continue;
    const w = Math.floor(off / 7);
    if (w >= 0 && w < weeks) heldByWeek[w]! += 1;
  }

  const adherence = (w: number): number => (heldByWeek[w] ?? 0) / 7;

  for (let w = 0; w < weeks; w += 1) {
    if (adherence(w) >= HELD_THRESHOLD) continue;
    // Below 50% this week — confirm it stays below for the next two weeks.
    const w1 = adherence(w + 1);
    const w2 = adherence(w + 2);
    if (w1 < HELD_THRESHOLD && w2 < HELD_THRESHOLD) {
      return w + 1; // 1-indexed week.
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*  Labs — which markers moved, and how they landed against the projection    */
/* -------------------------------------------------------------------------- */

function buildLabs(
  allPanels: Panel[],
  allProjections: ProjectionSnapshot[],
  inWindow: (day: Day) => boolean,
): { panels: Array<{ drawnAt: Day; markerCount: number }>; markerMovements: MarkerMovement[] } {
  // Panels inside the window, oldest draw first.
  const windowPanels = allPanels
    .filter((p) => inWindow(p.drawnAt))
    .sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));

  const panels = windowPanels.map((p) => ({ drawnAt: p.drawnAt, markerCount: p.results.length }));

  // For each marker, gather its readings across the window's panels in draw
  // order. A movement needs at least two readings.
  const readings = new Map<string, Array<{ value: number; unit: string; panelId?: number }>>();
  for (const panel of windowPanels) {
    for (const r of panel.results) {
      const list = readings.get(r.markerKey) ?? [];
      list.push({ value: r.value, unit: r.unit, ...(panel.id != null ? { panelId: panel.id } : {}) });
      readings.set(r.markerKey, list);
    }
  }

  const markerMovements: MarkerMovement[] = [];
  for (const [markerKey, list] of readings) {
    if (list.length < 2) continue; // no delta computable.
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const movement: MarkerMovement = {
      markerKey,
      firstValue: first.value,
      lastValue: last.value,
      unit: last.unit,
      projectionEvaluation: evaluateProjection(markerKey, first.panelId, last.value, allProjections),
    };
    markerMovements.push(movement);
  }

  // Ordered by absolute delta descending — the biggest mover reads first.
  markerMovements.sort(
    (a, b) => Math.abs(b.lastValue - b.firstValue) - Math.abs(a.lastValue - a.firstValue),
  );

  return { panels, markerMovements };
}

/**
 * Map 0012's `evaluateLanded()` verdict ("in-range" / "under-range" /
 * "over-range") onto the hundred-day's vocabulary ("within" / "below" /
 * "above"). The projection snapshot must have been computed FROM a panel inside
 * the window (joined by `panelId` to the marker's FIRST in-window reading); the
 * value evaluated is the marker's LAST in-window reading. Returns null when no
 * qualifying snapshot exists.
 */
function evaluateProjection(
  markerKey: string,
  firstPanelId: number | undefined,
  lastValue: number,
  allProjections: ProjectionSnapshot[],
): "within" | "above" | "below" | null {
  if (firstPanelId == null) return null;
  const snapshot = allProjections.find(
    (p) => p.markerKey === markerKey && p.panelId === firstPanelId,
  );
  if (!snapshot) return null;
  const verdict = evaluateLanded(snapshot, lastValue);
  return verdict === "in-range" ? "within" : verdict === "over-range" ? "above" : "below";
}

/* -------------------------------------------------------------------------- */
/*  Editorial — one declarative sentence per honest finding                   */
/* -------------------------------------------------------------------------- */
/*
 * Deterministic templates fired off the structured ArcSection + LabsSection.
 * Banned words (AGENTS.md + the ticket: "journey", "amazing", "exciting",
 * "great", "crushed", "smashed") are absent by construction. The voice is
 * declarative, never causal or congratulatory: a habit that held 41 of 100
 * days reads "slipped from week 6 onward", not "you crushed it".
 */

function buildEditorial(
  habits: ArcHabit[],
  movements: MarkerMovement[],
  allPlans: Plan[],
): EditorialParagraph[] {
  const paragraphs: EditorialParagraph[] = [];

  // habit-marker-link — fires ONLY when both sides are statistically honest:
  // a habit held ≥50% of the window AND a marker the plan's eat list targets
  // moved by at least the marker's responsiveness.magnitude.low. Declarative
  // ("The iron habit moved the iron biology."), never causal. When no link
  // qualifies, the paragraph is omitted; the section never invents.
  const linkedMarkerKeys = new Set<string>();
  for (const plan of allPlans) {
    for (const eat of plan.eatList) {
      for (const k of eat.markerKeys ?? []) linkedMarkerKeys.add(k);
    }
  }
  const aHabitHeld = habits.some((h) => h.heldDays >= WINDOW_DAYS * HELD_THRESHOLD);
  if (aHabitHeld) {
    for (const m of movements) {
      if (!linkedMarkerKeys.has(m.markerKey)) continue;
      const def = findMarker(m.markerKey);
      const low = def?.responsiveness?.magnitude.low;
      if (low == null) continue;
      if (Math.abs(m.lastValue - m.firstValue) < low) continue;
      const label = markerLabel(m.markerKey);
      paragraphs.push({
        kind: "habit-marker-link",
        sentence: `The ${label} habit moved the ${label} biology.`,
      });
      break; // one link sentence is enough; we don't pile them up.
    }
  }

  // habit-add — a habit that joined mid-quarter.
  for (const h of habits) {
    if (h.addedOnDay != null && h.addedOnDay > 0) {
      paragraphs.push({
        kind: "habit-add",
        sentence: `${h.title} joined on day ${h.addedOnDay} and held ${h.heldDays} of the days since.`,
      });
    }
  }

  // habit-slip — a habit that slipped on the rolling basis.
  for (const h of habits) {
    if (h.slipWeek != null) {
      paragraphs.push({
        kind: "habit-slip",
        sentence: `${h.title} slipped from week ${h.slipWeek} onward — it held ${h.heldDays} of 100 days.`,
      });
    }
  }

  // marker-mover — the largest absolute mover, with the projection verdict.
  const mover = movements[0];
  if (mover) {
    const label = markerLabel(mover.markerKey);
    const dir = mover.lastValue > mover.firstValue ? "up" : "down";
    const verdict =
      mover.projectionEvaluation === "within"
        ? " — inside the band we projected"
        : mover.projectionEvaluation === "above"
          ? " — above the band we projected"
          : mover.projectionEvaluation === "below"
            ? " — below the band we projected"
            : "";
    paragraphs.push({
      kind: "marker-mover",
      sentence: `${label} moved ${dir} from ${mover.firstValue} to ${mover.lastValue} ${mover.unit}${verdict}.`,
    });
  } else {
    // marker-held — when no marker has two draws, the honest line is that
    // cadence is the only signal this quarter carried.
    const held = habits.filter((h) => h.slipWeek == null && h.heldDays >= WINDOW_DAYS * HELD_THRESHOLD);
    if (held.length) {
      paragraphs.push({
        kind: "marker-held",
        sentence: `No draw landed inside this quarter, so cadence is the record: ${held.length} ${held.length === 1 ? "habit" : "habits"} held the line.`,
      });
    }
  }

  return paragraphs;
}

function markerLabel(key: string): string {
  const def = findMarker(key);
  return (def?.shortName ?? def?.name ?? key).toLowerCase();
}

/* -------------------------------------------------------------------------- */
/*  Day math                                                                  */
/* -------------------------------------------------------------------------- */

function isoDay(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayMs(day: Day): number {
  // Parse the YYYY-MM-DD at UTC midnight to match isoDay's UTC slice, so the
  // round-trip offset math is integer-clean regardless of local timezone.
  return Date.parse(`${day}T00:00:00Z`);
}

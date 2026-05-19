// Quiet-day note picker — pure function, no DOM, no Dexie (ticket 0015).
//
// On any non-Sunday morning Today wants a single editorial card above the
// meals row. We compose it from local data, deterministically, in a strict
// precedence order:
//
//   adherence-at-risk > projection-window > meal-skipped-pattern
//
// Each rule is a small private helper. The public `pickQuietDayNote()` runs
// them in order and returns the first match. When none match it returns null
// — the card is omitted from the page rather than rendered as a placeholder.
//
// The shape of the returned note is purely presentational (kind / headline /
// body / cta). The page layer renders it; nothing else in the app reads it.

import type {
  CheckIn, Day, MealPlan, Plan, ProjectionSnapshot, QuietDayNote,
} from "../types";
import { findMarker } from "../data/markers";

/**
 * Inputs the quiet-card module needs from the page layer. Stays private to
 * this module (it's a function argument, not a stored type) so the engineering
 * notes on the ticket can evolve without rippling through the type module.
 */
export interface QuietDayState {
  today: Day;
  plan: Plan;
  /** Most recent 14 days of check-ins, newest first (matches `recentCheckIns(14)`). */
  checkins14: CheckIn[];
  /** Current week's meal plan, when one exists. Optional — many users don't generate one. */
  mealPlan?: MealPlan;
  /** Persisted projection snapshots for the latest panel (or [] when none). */
  projections: ProjectionSnapshot[];
  /** The Monday-of-the-current-week ISO day — the same anchor used for week math. */
  sampleWeekStart: Day;
}

/* -------------------------------------------------------------------------- */
/*  Public picker                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Returns the single highest-precedence quiet-day note that qualifies for the
 * given state, or `null` when nothing qualifies. Pure: no I/O, no Date.now()
 * (the caller passes `today`).
 *
 * Precedence order is fixed and intentional:
 *   1. adherence-at-risk   — a habit is slipping right now
 *   2. projection-window   — a draw's window is open
 *   3. meal-skipped-pattern — a slot has slipped two weeks running
 *
 * Adding a new kind in the future is a one-line addition to this chain plus
 * one new helper. The discipline is "one note, one CTA" — never two.
 */
export function pickQuietDayNote(state: QuietDayState): QuietDayNote | null {
  return (
    pickAdherenceAtRisk(state) ??
    pickProjectionWindow(state) ??
    pickMealSkippedPattern(state) ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/*  Rule: adherence-at-risk                                                   */
/* -------------------------------------------------------------------------- */
/*
 * Fires when at least one habit in plan.habitStack.habits has held fewer than
 * Math.ceil(0.5 * 14) = 7 of the last 14 days AND the most-recent 7 of those
 * 14 days are trending worse than the prior 7 (more skipped days in the
 * latest week than the prior one — "you were doing it then, you're slipping
 * now"). The card names the worst-trending qualifying habit by title.
 *
 * "Skipped days" means: a day in the 14-day window where the habit id does
 * not appear in any check-in's habitsCompleted. Days with no check-in at all
 * count as skipped — they are still days the user didn't do the habit.
 */

const ADHERENCE_THRESHOLD = Math.ceil(0.5 * 14);   // 7

function pickAdherenceAtRisk(state: QuietDayState): QuietDayNote | null {
  const habits = state.plan.habitStack.habits;
  if (!habits.length) return null;

  // Index the 14 days. The window is the 14 calendar days ENDING today
  // (inclusive). Map day-ISO → set of habit ids logged on that day.
  const window = lastNDays(state.today, 14);
  const byDay = new Map<string, Set<string>>();
  for (const c of state.checkins14) {
    byDay.set(c.day, new Set(c.habitsCompleted));
  }

  let worst: { habitId: string; title: string; recentSkips: number; priorSkips: number } | null = null;
  for (const h of habits) {
    const hits = window.filter(d => byDay.get(d)?.has(h.id)).length;
    if (hits >= ADHERENCE_THRESHOLD) continue;   // not slipping enough

    // window is sorted newest → oldest. Recent 7 = indices 0..6; prior 7 = 7..13.
    const recentSkips = window.slice(0, 7).filter(d => !byDay.get(d)?.has(h.id)).length;
    const priorSkips  = window.slice(7, 14).filter(d => !byDay.get(d)?.has(h.id)).length;
    if (recentSkips <= priorSkips) continue;     // not worsening

    // Pick the habit with the biggest worsening delta; ties go to the most
    // recent skips (the most-painful one).
    if (
      !worst ||
      (recentSkips - priorSkips) > (worst.recentSkips - worst.priorSkips) ||
      ((recentSkips - priorSkips) === (worst.recentSkips - worst.priorSkips) && recentSkips > worst.recentSkips)
    ) {
      worst = { habitId: h.id, title: h.title, recentSkips, priorSkips };
    }
  }

  if (!worst) return null;

  return {
    kind: "adherence-at-risk",
    headline: `${worst.title} is slipping`,
    body: `You held it on fewer days this week than last. A couple more skipped days and the 14-day average drops below the easy tier — the plan would need to re-rank it.`,
    cta: { label: "Open habits", href: "#/today" },
  };
}

/* -------------------------------------------------------------------------- */
/*  Rule: projection-window                                                   */
/* -------------------------------------------------------------------------- */
/*
 * Fires when at least one projection snapshot exists for a marker AND today
 * falls within the [weeksOut[0], weeksOut[1]] window measured from the
 * snapshot's createdAt. The headline names the marker; the body says
 * "Your next draw would be the first useful one"; the CTA routes to #/plan.
 */

const MS_PER_WEEK = 7 * 86400_000;

function pickProjectionWindow(state: QuietDayState): QuietDayNote | null {
  if (!state.projections.length) return null;
  const todayMs = dayStartMs(state.today);

  // Find the snapshot whose window opens earliest among those currently open.
  // Sorting by opening date gives the user the earliest "draw makes sense
  // now" signal — the marker whose window has been open the longest.
  const open = state.projections.filter(s => {
    const opensAtMs = s.createdAt + s.weeksOut[0] * MS_PER_WEEK;
    const closesAtMs = s.createdAt + s.weeksOut[1] * MS_PER_WEEK;
    return todayMs >= opensAtMs && todayMs <= closesAtMs;
  });
  if (!open.length) return null;

  const earliest = open.slice().sort((a, b) => a.createdAt - b.createdAt)[0]!;

  const marker = findMarker(earliest.markerKey);
  const label = marker?.shortName ?? marker?.name ?? earliest.markerKey;

  return {
    kind: "projection-window",
    headline: `${label}'s next draw window is open`,
    body: `Your next draw would be the first useful one.`,
    cta: { label: "Plan a retest", href: "#/plan" },
  };
}

/* -------------------------------------------------------------------------- */
/*  Rule: meal-skipped-pattern                                                */
/* -------------------------------------------------------------------------- */
/*
 * Fires when the same meal slot (breakfast / lunch / dinner) on the same
 * weekday across two consecutive weeks shows `mealsAte` NOT containing the
 * meal id from the current meal plan's same-slot meal.
 *
 * Concretely: take the meal plan's upcoming occurrence of each slot. For
 * each, find the matching day-of-week in the prior 7 days and the 7 days
 * before that. If both check-ins have mealsAte that omit the slot's meal id,
 * fire. The CTA routes to #/meals?day=YYYY-MM-DD for the upcoming instance.
 */

function pickMealSkippedPattern(state: QuietDayState): QuietDayNote | null {
  if (!state.mealPlan) return null;
  if (!state.mealPlan.days.length) return null;

  // The check-in map for fast lookup.
  const byDay = new Map<string, CheckIn>();
  for (const c of state.checkins14) byDay.set(c.day, c);

  // For each upcoming day in the meal plan, check each slot.
  // We only consider meal-plan days that are on or after today (the "upcoming
  // occurrence" semantic) so the CTA day-link points to a day the user can
  // actually act on.
  const slots = ["breakfast", "lunch", "dinner"] as const;
  type Slot = typeof slots[number];

  for (const dayMeals of state.mealPlan.days) {
    if (dayMeals.day < state.today) continue;     // already past
    for (const slot of slots) {
      const meal = dayMeals[slot];
      if (!meal) continue;
      const upcomingDay = dayMeals.day;
      const dow = new Date(upcomingDay + "T00:00:00").getDay();
      // Find the two prior occurrences of this day-of-week within the 14-day
      // window ending today. "Prior" = strictly before today.
      const priors: string[] = [];
      for (const c of state.checkins14) {
        if (c.day >= state.today) continue;
        const cdow = new Date(c.day + "T00:00:00").getDay();
        if (cdow === dow) priors.push(c.day);
        if (priors.length === 2) break;
      }
      if (priors.length < 2) continue;
      // Both prior check-ins must omit the meal id from mealsAte.
      const bothSkipped = priors.every(d => {
        const ate = byDay.get(d)?.mealsAte ?? [];
        return !ate.includes(meal.id);
      });
      if (!bothSkipped) continue;

      const slotLabel = slot[0]!.toUpperCase() + slot.slice(1);
      const dayLabel = new Date(upcomingDay + "T00:00:00")
        .toLocaleDateString("en-US", { weekday: "long" });
      return {
        kind: "meal-skipped-pattern",
        headline: `${dayLabel} ${slotLabel.toLowerCase()} keeps slipping`,
        body: `Two weeks of this slot have slipped. Want to swap it permanently?`,
        cta: { label: "Swap this slot", href: `#/meals?day=${upcomingDay}` },
      };
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Local helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Returns the 14 ISO days ending at `today` (inclusive), newest first. */
function lastNDays(today: Day, n: number): Day[] {
  const out: Day[] = [];
  const base = new Date(today + "T00:00:00");
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(isoLocal(d));
  }
  return out;
}

function isoLocal(d: Date): Day {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayStartMs(day: Day): number {
  return new Date(day + "T00:00:00").getTime();
}

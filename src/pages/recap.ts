// Weekly recap — "this week in your protocol" (ticket 0008).
//
// The recap is a deterministic, read-only summary of one ISO week. It runs
// on local data only — never calls Anthropic — so it shows up at 7am Sunday
// whether the network is reachable or not.
//
// Two halves:
//   1. `computeRecap()` — a pure function: (week, checkins, plan, mealPlan)
//      → RecapSummary. Easy to reason about; trivially test-friendly.
//   2. `renderRecap()`  — paints the summary into the masthead/page/foot
//      template the rest of the app uses.

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import {
  latestPlan, latestMealPlan, recentCheckIns,
  today, addDays, isoWeek, weekRange,
} from "../db";
import type {
  CheckIn, Plan, MealPlan, Day,
  RecapSummary, RecapAdherenceRow, RecapSignals, RecapMover,
} from "../types";

/* -------------------------------------------------------------------------- */
/*  Compute                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Build the RecapSummary for the week containing `weekStart` (a Monday).
 *
 * The function takes plan + mealPlan + the full check-in list (last ~21 days
 * is enough — we slice for "this week" and "last week" internally). Nothing
 * here touches IndexedDB; the caller is responsible for loading.
 *
 * Empty-week semantics: if fewer than 3 check-ins fell inside the week, we
 * return a summary with `isEmpty: true` and skip every data section so the
 * renderer can show the editorial empty state instead of "NaN of 7".
 */
export function computeRecap(
  weekStart: Day,
  checkins: CheckIn[],
  plan: Plan,
  mealPlan: MealPlan | undefined,
): RecapSummary {
  const weekEnd = addDays(weekStart, 6);
  const inWeek  = (d: Day) => d >= weekStart && d <= weekEnd;
  const inRange = (start: Day, end: Day) => (d: Day) => d >= start && d <= end;

  const thisWeek = checkins.filter(c => inWeek(c.day));
  const isoLabel = isoWeek(new Date(weekStart + "T12:00:00"));
  const range: [Day, Day] = [weekStart, weekEnd];

  // The previous week — used only for signal deltas.
  const prevStart = addDays(weekStart, -7);
  const prevEnd   = addDays(weekStart, -1);
  const lastWeek  = checkins.filter(c => inRange(prevStart, prevEnd)(c.day));

  // Days-with-habit + days-without-check-in are visible even on partial weeks
  // because the user reads them as "did I show up this week?", which is
  // honest regardless of how much else is missing.
  const daysWithHabit      = new Set(thisWeek.filter(c => c.habitsCompleted.length > 0).map(c => c.day)).size;
  const daysWithoutCheckIn = 7 - new Set(thisWeek.map(c => c.day)).size;

  // Empty-week gate: below the threshold we return a summary that the
  // renderer reads as "show the editorial empty state".
  if (thisWeek.length < 3) {
    return {
      isoWeek: isoLabel,
      range,
      checkInCount: thisWeek.length,
      isEmpty: true,
      daysWithHabit,
      daysWithoutCheckIn,
      adherence: [],
    };
  }

  // Adherence: one row per habit in the plan, regardless of whether it was
  // ever logged this week (a zero is still information).
  const adherence: RecapAdherenceRow[] = plan.habitStack.habits.map(h => {
    const hit = thisWeek.filter(c => c.habitsCompleted.includes(h.id)).length;
    return { habitId: h.id, title: h.title, hit, of: 7 as const };
  });

  // Meals on plan: count `mealsAte` entries that match a meal id present in
  // the week's MealPlan. Total planned is breakfast + lunch + dinner each
  // day (snacks are optional and not counted as "planned" for adherence).
  let meals: RecapSummary["meals"] | undefined;
  if (mealPlan) {
    const planIds = new Set<string>();
    let planned = 0;
    for (const d of mealPlan.days) {
      planIds.add(d.breakfast.id);
      planIds.add(d.lunch.id);
      planIds.add(d.dinner.id);
      planned += 3;
    }
    let ate = 0;
    for (const c of thisWeek) {
      for (const id of c.mealsAte ?? []) if (planIds.has(id)) ate++;
    }
    if (planned > 0) meals = { ate, planned };
  }

  // Signals + deltas — only computed if at least one row in the week had any
  // signals at all. Each field is averaged independently (a user may log
  // sleep but skip mood); deltas only render when last week had data for
  // the same field.
  const signals = computeSignals(thisWeek, lastWeek);

  // Largest absolute mover is the editorial sentence's anchor.
  const mover = pickMover(signals);

  // "The thing to try next week" — first preference: the lowest-adherence
  // habit if it's under the 5/7 floor. If every habit hit ≥ 5/7, look for
  // the most-skipped meal slot; if none, fall back to "hold the line".
  const suggestion = pickSuggestion(adherence, thisWeek, mealPlan);

  return {
    isoWeek: isoLabel,
    range,
    checkInCount: thisWeek.length,
    isEmpty: false,
    daysWithHabit,
    daysWithoutCheckIn,
    adherence,
    ...(meals     ? { meals }     : {}),
    ...(signals   ? { signals }   : {}),
    ...(mover     ? { mover }     : {}),
    ...(suggestion? { suggestion }: {}),
  };
}

function computeSignals(thisWeek: CheckIn[], lastWeek: CheckIn[]): RecapSignals | undefined {
  const pickAvg = (rows: CheckIn[], key: "sleepHours" | "mood" | "energy"): number | undefined => {
    const vals = rows
      .map(r => r.signals?.[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return undefined;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const sleep = pickAvg(thisWeek, "sleepHours");
  const mood  = pickAvg(thisWeek, "mood");
  const energy= pickAvg(thisWeek, "energy");

  if (sleep == null && mood == null && energy == null) return undefined;

  const sleepPrev = pickAvg(lastWeek, "sleepHours");
  const moodPrev  = pickAvg(lastWeek, "mood");
  const energyPrev= pickAvg(lastWeek, "energy");

  const out: RecapSignals = {};
  if (sleep  != null) out.sleepHoursAvg = sleep;
  if (mood   != null) out.moodAvg       = mood;
  if (energy != null) out.energyAvg     = energy;
  if (sleep  != null && sleepPrev  != null) out.sleepHoursDelta = sleep  - sleepPrev;
  if (mood   != null && moodPrev   != null) out.moodDelta       = mood   - moodPrev;
  if (energy != null && energyPrev != null) out.energyDelta     = energy - energyPrev;
  return out;
}

function pickMover(sig: RecapSignals | undefined): RecapMover | undefined {
  if (!sig) return undefined;
  const candidates: Array<RecapMover> = [];
  if (typeof sig.sleepHoursDelta === "number") {
    candidates.push({ kind: "sleep",  delta: sig.sleepHoursDelta, direction: sig.sleepHoursDelta >= 0 ? "up" : "down" });
  }
  if (typeof sig.moodDelta === "number") {
    candidates.push({ kind: "mood",   delta: sig.moodDelta,       direction: sig.moodDelta       >= 0 ? "up" : "down" });
  }
  if (typeof sig.energyDelta === "number") {
    candidates.push({ kind: "energy", delta: sig.energyDelta,     direction: sig.energyDelta     >= 0 ? "up" : "down" });
  }
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return candidates[0];
}

function pickSuggestion(
  adherence: RecapAdherenceRow[],
  thisWeek: CheckIn[],
  mealPlan: MealPlan | undefined,
): string | undefined {
  // The lowest-adherence habit, if under the 5/7 floor.
  const sorted = [...adherence].sort((a, b) => a.hit - b.hit);
  const weakest = sorted[0];
  if (weakest && weakest.hit < 5) {
    return `Hold ${lowerFirst(weakest.title)} on more mornings next week — it only landed ${weakest.hit} of 7 this week.`;
  }

  // Otherwise the most-skipped meal slot (breakfast / lunch / dinner across
  // the week). Skip = the meal was planned but not logged in `mealsAte`.
  if (mealPlan) {
    const skipped = { breakfast: 0, lunch: 0, dinner: 0 } as Record<"breakfast"|"lunch"|"dinner", number>;
    const ate = new Set<string>();
    for (const c of thisWeek) for (const id of c.mealsAte ?? []) ate.add(id);
    for (const d of mealPlan.days) {
      if (!ate.has(d.breakfast.id)) skipped.breakfast++;
      if (!ate.has(d.lunch.id))     skipped.lunch++;
      if (!ate.has(d.dinner.id))    skipped.dinner++;
    }
    const worst = Object.entries(skipped).sort((a, b) => b[1] - a[1])[0];
    if (worst && worst[1] >= 3) {
      return `Aim for ${worst[0]} on the plan next week — ${worst[1]} of 7 slipped this week.`;
    }
  }

  // Everything held. The honest line is "hold the line."
  return "The week held. Carry the same stack into next week — no new variables.";
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1);
}

/* -------------------------------------------------------------------------- */
/*  Render                                                                    */
/* -------------------------------------------------------------------------- */

export async function renderRecap(): Promise<void> {
  const masth = await masthead("#/recap");

  const plan = await latestPlan();
  if (!plan) {
    return paintNoPlan(masth);
  }

  // Resolve "the week": Sunday → current week (which ends today); any other
  // day → the most recent completed week (last Mon → last Sun).
  const now = new Date();
  const isSunday = now.getDay() === 0;
  const todayIso = today();
  const [thisMon, thisSun] = weekRange(now);
  const weekStart = isSunday ? thisMon : addDays(thisMon, -7);
  const weekEndDay = isSunday ? thisSun : addDays(thisMon, -1);

  // Recent check-ins covers two ISO weeks (14 days). The compute helper
  // slices internally; 21 days is a safer pull to make sure the previous
  // week is fully present even if the user's local clock skews near the
  // boundary.
  const checks  = await recentCheckIns(21);
  const mealPlan = await latestMealPlan();

  // Only feed the mealPlan in if it actually covers this recap's week.
  const coveringMealPlan = mealPlan && coversWeek(mealPlan, weekStart, weekEndDay) ? mealPlan : undefined;

  const summary = computeRecap(weekStart, checks, plan, coveringMealPlan);

  const body = summary.isEmpty
    ? renderEmpty(summary)
    : renderFull(summary);

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page recap">
        <div class="eyebrow">Week of ${esc(longDate(summary.range[0]))} — ${esc(longDate(summary.range[1]))}</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 24ch;">
          The week in <em>your protocol</em>.
        </h1>
        ${body}
      </section>
      ${foot("R")}
    </div>
  `);
  mount(frag);
  // touch todayIso so tsc keeps the local even when nothing reads it.
  void todayIso;
}

function coversWeek(mp: MealPlan, mondayIso: Day, sundayIso: Day): boolean {
  // The MealPlan stores its own weekStart Day; treat coverage as "any day in
  // the plan's days[] falls inside our recap range".
  return mp.days.some(d => d.day >= mondayIso && d.day <= sundayIso);
}

function renderEmpty(summary: RecapSummary): string {
  return `
    <section class="recap-empty" style="margin-top: 2.2rem;">
      <p class="lede" style="max-width: 56ch;">
        Not enough was logged this week to draw a picture. Tap
        <a href="#/today">Today</a> and log what you remember.
      </p>
      <p class="quiet" style="margin-top: 1.2rem; padding: 0; font-style: italic;">
        ${summary.checkInCount} of 7 days logged.
      </p>
    </section>
  `;
}

function renderFull(s: RecapSummary): string {
  return `
    <div class="recap-grid" style="margin-top: 2rem;">
      ${renderAdherence(s)}
      ${s.meals   ? renderMeals(s.meals)        : ""}
      ${s.signals ? renderSignals(s.signals)    : ""}
      ${s.mover   ? renderMover(s.mover)        : ""}
      ${s.suggestion ? renderSuggestion(s.suggestion) : ""}
      ${renderNumbers(s)}
    </div>
  `;
}

function renderAdherence(s: RecapSummary): string {
  return `
    <section class="recap-section recap-section--adherence">
      <h2 class="recap-section__title">Adherence</h2>
      <ul class="recap-adherence">
        ${s.adherence.map(row => `
          <li class="recap-adherence-row">
            <span class="recap-adherence-row__title">${esc(row.title)}</span>
            <span class="recap-adherence-row__count">${row.hit} of ${row.of}</span>
            <span class="recap-adherence-row__bar" aria-hidden="true">
              ${renderBar(row.hit, row.of)}
            </span>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function renderBar(hit: number, of: number): string {
  const pct = Math.max(0, Math.min(1, hit / of)) * 100;
  return `<span class="recap-bar"><span class="recap-bar__fill" style="width: ${pct}%;"></span></span>`;
}

function renderMeals(meals: NonNullable<RecapSummary["meals"]>): string {
  return `
    <section class="recap-section recap-section--meals">
      <h2 class="recap-section__title">Meals on plan</h2>
      <p class="recap-bignum"><em>${meals.ate}</em> <span class="recap-bignum__of">of ${meals.planned}</span></p>
      <p class="recap-section__hint">Slots eaten that matched the week's plan.</p>
    </section>
  `;
}

function renderSignals(sig: RecapSignals): string {
  const rows: string[] = [];
  if (typeof sig.sleepHoursAvg === "number") {
    rows.push(signalRow("Sleep", formatSleep(sig.sleepHoursAvg), formatSleepDelta(sig.sleepHoursDelta)));
  }
  if (typeof sig.moodAvg === "number") {
    rows.push(signalRow("Mood", sig.moodAvg.toFixed(1), formatPointDelta(sig.moodDelta)));
  }
  if (typeof sig.energyAvg === "number") {
    rows.push(signalRow("Energy", sig.energyAvg.toFixed(1), formatPointDelta(sig.energyDelta)));
  }
  return `
    <section class="recap-section recap-section--signals">
      <h2 class="recap-section__title">Signals</h2>
      <ul class="recap-signals">${rows.join("")}</ul>
    </section>
  `;
}

function signalRow(label: string, value: string, delta: string): string {
  return `
    <li class="recap-signal-row">
      <span class="recap-signal-row__label">${esc(label)}</span>
      <span class="recap-signal-row__value">${esc(value)}</span>
      <span class="recap-signal-row__delta">${esc(delta)}</span>
    </li>
  `;
}

function formatSleep(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatSleepDelta(delta: number | undefined): string {
  if (delta == null) return "—";
  const mins = Math.round(delta * 60);
  const sign = mins > 0 ? "+" : mins < 0 ? "−" : "";
  const abs = Math.abs(mins);
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sign}${h}h ${String(m).padStart(2, "0")}m vs last week`;
  }
  return `${sign}${abs} min vs last week`;
}

function formatPointDelta(delta: number | undefined): string {
  if (delta == null) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${Math.abs(delta).toFixed(1)} vs last week`;
}

function renderMover(m: RecapMover): string {
  const direction = m.direction === "up" ? "up" : "down";
  const phrasing  = m.kind === "sleep"
    ? `Sleep led the week: ${direction} ${Math.abs(Math.round(m.delta * 60))} minutes per night on average.`
    : m.kind === "mood"
      ? `Mood led the week: ${direction} ${Math.abs(m.delta).toFixed(1)} points on the daily scale.`
      : `Energy led the week: ${direction} ${Math.abs(m.delta).toFixed(1)} points on the daily scale.`;
  return `
    <section class="recap-section recap-section--mover">
      <h2 class="recap-section__title">What moved most</h2>
      <p class="recap-mover">${esc(phrasing)}</p>
    </section>
  `;
}

function renderSuggestion(s: string): string {
  return `
    <section class="recap-section recap-section--suggest">
      <h2 class="recap-section__title">The thing to try next week</h2>
      <p class="recap-suggestion">${esc(s)}</p>
    </section>
  `;
}

function renderNumbers(s: RecapSummary): string {
  return `
    <section class="recap-section recap-section--numbers">
      <h2 class="recap-section__title">The week in numbers</h2>
      <dl class="recap-numbers">
        <div class="recap-numbers__row">
          <dt>Date range</dt>
          <dd>${esc(longDate(s.range[0]))} — ${esc(longDate(s.range[1]))}</dd>
        </div>
        <div class="recap-numbers__row">
          <dt>Days with at least one habit logged</dt>
          <dd>${s.daysWithHabit} of 7</dd>
        </div>
        <div class="recap-numbers__row">
          <dt>Days without a check-in</dt>
          <dd>${s.daysWithoutCheckIn} of 7</dd>
        </div>
      </dl>
    </section>
  `;
}

function paintNoPlan(masth: string): void {
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Weekly recap</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          A plan first, then a <em>recap</em>.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
          The recap reads from your habit stack and meal plan. Compose the plan, log
          a few days, and come back on Sunday.
        </p>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <a href="#/plan" class="btn btn--accent">Compose the plan</a>
        </div>
      </section>
      ${foot("R")}
    </div>
  `);
  mount(frag);
}

// Today — the daily ritual.
//
// Order of importance:
//   1. Today's three meals (breakfast / lunch / dinner). Tap to mark "ate it".
//   2. Habit stack — 3–5 cards.
//   3. Optional how-do-you-feel signals (sleep / mood / energy).
//   4. 14-day streak strip.

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, today, latestPlan, latestMealPlan,
  checkInFor, upsertCheckIn, recentCheckIns, isoWeek,
} from "../db";
import type { CheckIn, Habit, Meal, DayMeals } from "../types";

/* -------------------------------------------------------------------------- */
/*  Sunday recap card                                                         */
/* -------------------------------------------------------------------------- */
/*
 * On Sundays only, the Today screen leads with a small editorial card that
 * surfaces the weekly recap. Tapping "Open recap" routes to #/recap; tapping
 * "Not this week" stores a dismissal flag in localStorage under the ISO week
 * key so the card stays gone for the rest of the week and reappears next
 * Sunday. The decision is made entirely from the local clock — no Anthropic.
 */

const RECAP_DISMISSED_PREFIX = "almanac.recap.dismissed.";

function isSundayLocal(): boolean { return new Date().getDay() === 0; }

function recapCardActive(): boolean {
  if (!isSundayLocal()) return false;
  const key = RECAP_DISMISSED_PREFIX + isoWeek(new Date());
  return localStorage.getItem(key) !== "true";
}

function renderRecapCard(): string {
  return `
    <aside class="recap-card" role="note">
      <div class="recap-card__eyebrow">A Sunday note</div>
      <div class="recap-card__body">
        <p class="recap-card__lede">
          The week is winding down. Read what actually happened — adherence, meals
          on plan, the signal that moved most — before you plan the next one.
        </p>
        <div class="recap-card__actions">
          <a href="#/recap" class="btn btn--accent">Open recap</a>
          <button type="button" class="recap-card__dismiss" data-action="dismiss-recap">
            Not this week
          </button>
        </div>
      </div>
    </aside>
  `;
}

export async function renderToday(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const plan = await latestPlan();
  if (!plan) {
    return paintNoPlan();
  }

  const day = today();
  const ci  = await checkInFor(day);
  const completed = new Set(ci?.habitsCompleted ?? []);
  const ate       = new Set(ci?.mealsAte ?? []);

  // 14-day adherence strip.
  const recent = await recentCheckIns(14);
  const recentMap = new Map(recent.map(c => [c.day, c]));

  // Today's meals — only if there's a current meal plan that covers today.
  const mp = await latestMealPlan();
  const todays: DayMeals | undefined = mp && mp.planId === plan.id
    ? mp.days.find(d => d.day === day)
    : undefined;

  const habits = plan.habitStack.habits;
  const masth  = await masthead("#/today");

  const mealsHtml = todays
    ? renderMealsRow(todays, ate)
    : renderMealsEmpty(!!mp && mp.planId === plan.id);

  const recapCardHtml = recapCardActive() ? renderRecapCard() : "";

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">${esc(longDate(day))}</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 22ch;">
          ${greeting(profile.ownerName)}.
        </h1>

        ${recapCardHtml}

        <section style="margin-top: 2rem;">
          <div class="section-mark">Today's meals</div>
          ${mealsHtml}
        </section>

        <section style="margin-top: 2.6rem;">
          <div class="section-mark">Habit stack</div>
          <p class="lede" style="max-width: 60ch; margin: 0 0 0.9rem;">${esc(plan.habitStack.intro)}</p>
          <ol class="habit-checks">
            ${habits.map((h, i) => habitCheckRow(h, i + 1, completed.has(h.id))).join("")}
          </ol>
        </section>

        <details style="margin-top: 2rem;">
          <summary class="section-mark" style="cursor: pointer; list-style: none;">Optional · how do you feel?</summary>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div class="field"><label for="sleep">Sleep (hours)</label>
              <input id="sleep" type="number" step="0.25" value="${ci?.signals?.sleepHours ?? ""}" /></div>
            <div class="field"><label for="mood">Mood (1–5)</label>
              <input id="mood" type="number" min="1" max="5" value="${ci?.signals?.mood ?? ""}" /></div>
            <div class="field"><label for="energy">Energy (1–5)</label>
              <input id="energy" type="number" min="1" max="5" value="${ci?.signals?.energy ?? ""}" /></div>
          </div>
          <div class="field"><label for="note">A line about today (optional)</label>
            <input id="note" type="text" value="${esc(ci?.note ?? "")}" /></div>
        </details>

        <div class="streak-strip" style="margin-top: 2.4rem;">
          ${streakStrip(habits, recentMap)}
        </div>

        <div style="margin-top: 1rem; display: flex; gap: 1rem; align-items: center;">
          <button id="save" class="btn btn--accent">Save check-in</button>
          <span id="save-status" class="quiet" style="padding:0; font-size: 0.95rem;"></span>
        </div>
      </section>
      ${foot("i")}
    </div>
  `);

  mount(frag);

  // Sunday recap card dismissal — flips the ISO-week-keyed localStorage flag
  // and yanks the card from the DOM in one beat. The flag survives reloads,
  // so the card stays gone for the rest of this week.
  document.querySelector("[data-action='dismiss-recap']")?.addEventListener("click", () => {
    const key = RECAP_DISMISSED_PREFIX + isoWeek(new Date());
    localStorage.setItem(key, "true");
    document.querySelector(".recap-card")?.remove();
  });

  for (const card of document.querySelectorAll(".habit-check"))
    card.addEventListener("click", () => card.classList.toggle("is-done"));

  for (const card of document.querySelectorAll(".meal-tile"))
    card.addEventListener("click", () => card.classList.toggle("is-eaten"));

  document.getElementById("save")?.addEventListener("click", async () => {
    const habitsCompleted: string[] = [];
    document.querySelectorAll(".habit-check.is-done").forEach(c => {
      const id = (c as HTMLElement).dataset.id; if (id) habitsCompleted.push(id);
    });
    const mealsAte: string[] = [];
    document.querySelectorAll(".meal-tile.is-eaten").forEach(c => {
      const id = (c as HTMLElement).dataset.id; if (id) mealsAte.push(id);
    });

    const sleep = numOrUndef((document.getElementById("sleep") as HTMLInputElement)?.value);
    const mood  = clamp1to5((document.getElementById("mood")  as HTMLInputElement)?.value);
    const energy= clamp1to5((document.getElementById("energy")as HTMLInputElement)?.value);
    const note  = ((document.getElementById("note")as HTMLInputElement)?.value ?? "").trim();

    const signals: NonNullable<CheckIn["signals"]> = {};
    if (sleep != null)  signals.sleepHours = sleep;
    if (mood  != null)  signals.mood   = mood;
    if (energy!= null)  signals.energy = energy;

    await upsertCheckIn({
      day: today(),
      habitsCompleted,
      ...(mealsAte.length ? { mealsAte } : {}),
      ...(Object.keys(signals).length ? { signals } : {}),
      ...(note ? { note } : {}),
    });

    const s = document.getElementById("save-status");
    if (s) s.textContent = "Saved.";
  });
}

function renderMealsRow(dm: DayMeals, ate: Set<string>): string {
  const meals: { meal: Meal; label: string }[] = [
    { meal: dm.breakfast, label: "Breakfast" },
    { meal: dm.lunch,     label: "Lunch" },
    { meal: dm.dinner,    label: "Dinner" },
  ];
  if (dm.snack) meals.push({ meal: dm.snack, label: "Snack" });

  return `
    <div class="meal-tiles">
      ${meals.map(({ meal, label }) => `
        <div class="meal-tile ${ate.has(meal.id) ? "is-eaten" : ""}" data-id="${esc(meal.id)}">
          <div class="meal-tile__label">${esc(label)} · ${esc(meal.effort)} · ${meal.timeMinutes}m</div>
          <div class="meal-tile__title">${esc(meal.title)}</div>
          <div class="meal-tile__desc">${esc(meal.description)}</div>
          <div class="meal-tile__mark">✓</div>
        </div>
      `).join("")}
    </div>
    <div style="margin-top: 0.6rem;">
      <a href="#/meals?day=${esc(dm.day)}" style="font-family:var(--body);font-size:0.74rem;color:var(--ink-faint);letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;">View full meal details →</a>
    </div>
  `;
}

function renderMealsEmpty(planExists: boolean): string {
  return `
    <div class="quiet" style="padding: 1.4rem 1.6rem; border: 1px dashed var(--rule); background: var(--paper-deep);">
      ${planExists
        ? `Your plan exists, but the week's meals haven't been generated.<br/>
           <a href="#/meals" class="btn btn--accent" style="margin-top: 1rem;">Generate this week's meals</a>`
        : `Compose the plan first; the meal plan reads from it.<br/>
           <a href="#/plan" class="btn btn--accent" style="margin-top: 1rem;">Go to the plan</a>`}
    </div>
  `;
}

function habitCheckRow(h: Habit, n: number, done: boolean): string {
  return `
    <li class="habit-check ${done ? "is-done" : ""}" data-id="${esc(h.id)}">
      <div class="habit-check__num">${n}</div>
      <div class="habit-check__body">
        <div class="habit-check__title">${esc(h.title)}</div>
        <div class="habit-check__cue">${esc(h.cue)}</div>
      </div>
      <div class="habit-check__mark">✓</div>
    </li>
  `;
}

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 5 ? "Late, but here" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${esc(part)}, <em>${esc(name)}</em>`;
}

function streakStrip(habits: Habit[], map: Map<string, CheckIn>): string {
  const total = Math.max(1, habits.length);
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0,10);
    const ci = map.get(iso);
    const hit = ci ? ci.habitsCompleted.length : 0;
    const pct = Math.min(1, hit / total);
    const isToday = i === 0;
    days.push(`<div class="streak-cell ${isToday ? "is-today" : ""}" style="--fill:${pct};" title="${iso}: ${hit}/${total}"></div>`);
  }
  return `
    <div class="streak-strip__label">Last 14 days</div>
    <div class="streak-strip__cells">${days.join("")}</div>
  `;
}

async function paintNoPlan(): Promise<void> {
  const masth = await masthead("#/today");
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">${esc(longDate(today()))}</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          A plan first, then a <em>day</em>.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
          Today's view shows your meals and your habit stack — both come from the plan. Add a lab panel and compose the plan to begin.
        </p>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <a href="#/labs" class="btn btn--accent">Add labs</a>
          <a href="#/plan" class="btn btn--ghost">Compose the plan</a>
        </div>
      </section>
      ${foot("i")}
    </div>
  `);
  mount(frag);
}

function numOrUndef(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function clamp1to5(v: string | undefined): 1|2|3|4|5 | undefined {
  const n = numOrUndef(v);
  if (n == null) return undefined;
  if (n < 1 || n > 5) return undefined;
  return Math.round(n) as 1|2|3|4|5;
}

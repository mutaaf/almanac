// Today — the daily ritual.
//
// Order of importance:
//   1. Today's three meals (breakfast / lunch / dinner). Tap to mark "ate it".
//   2. Habit stack — 3–5 cards.
//   3. Optional how-do-you-feel signals (sleep / mood / energy).
//   4. 14-day streak strip.

import { mount, h, esc, longDate, tourNotice } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, today, latestPlan, latestMealPlan,
  checkInFor, upsertCheckIn, recentCheckIns, isoWeek,
  allPanels, getProjectionsFor, weekRange,
} from "../db";
import { isTour } from "../sample/state";
import { isSharedView } from "../share/shared-state";
import { pickQuietDayNote } from "../today/quiet-card";
import type { CheckIn, Habit, Meal, DayMeals, QuietDayNote } from "../types";

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

/* -------------------------------------------------------------------------- */
/*  Quiet-day card (ticket 0015)                                              */
/* -------------------------------------------------------------------------- */
/*
 * The Mon–Sat counterpart to the Sunday recap card. The picker
 * (`pickQuietDayNote`) is pure; this function only renders. The wrapping
 * `aside` re-uses the recap-card styles and adds the `--quiet` variant so
 * the dismissal link styling can differ ("Not today" vs "Not this week")
 * without divergent layout. When `note` is null, returns an empty string —
 * the card is omitted from the DOM rather than rendered as a placeholder.
 */

const QUIET_DISMISSED_PREFIX = "almanac.quiet.dismissed.";

function quietCardDismissedToday(today: string): boolean {
  try { return localStorage.getItem(QUIET_DISMISSED_PREFIX + today) === "true"; }
  catch { return false; }
}

function renderQuietCard(note: QuietDayNote): string {
  return `
    <aside class="recap-card recap-card--quiet" role="note">
      <div class="recap-card__eyebrow">A note for today</div>
      <div class="recap-card__body">
        <p class="recap-card__headline">${esc(note.headline)}</p>
        <p class="recap-card__lede">${esc(note.body)}</p>
        <div class="recap-card__actions">
          <a href="${esc(note.cta.href)}" class="btn btn--accent" data-action="quiet-cta" data-kind="${esc(note.kind)}">${esc(note.cta.label)}</a>
          <button type="button" class="recap-card__dismiss" data-action="dismiss-quiet">
            Not today
          </button>
        </div>
      </div>
    </aside>
  `;
}

export async function renderToday(): Promise<void> {
  // Shared-view (ticket 0017): the recipient sees a stripped-down Today —
  // the habit stack, today's meals if shared, and the date. No streak strip
  // (no check-ins exist), no quiet-day card (no projections / adherence
  // history), no Sunday recap. The save-check-in path is hidden because
  // there is nothing to save against.
  if (isSharedView()) {
    return paintShared();
  }

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

  // The quiet-day card (ticket 0015) only renders Mon–Sat AND only when the
  // recap card isn't already taking the slot. The recap is a calendar-aligned
  // ritual; the quiet card is the everyday fallback — never both.
  let quietCardHtml = "";
  if (!recapCardActive() && !quietCardDismissedToday(day)) {
    const panels = await allPanels();
    const latestPanelId = panels[0]?.id;       // newest-first by drawnAt
    const projections = latestPanelId != null
      ? await getProjectionsFor(latestPanelId)
      : [];
    const [mondayIso] = weekRange(new Date());
    const note = pickQuietDayNote({
      today: day,
      plan,
      checkins14: recent,
      ...(mp && mp.planId === plan.id ? { mealPlan: mp } : {}),
      projections,
      sampleWeekStart: mondayIso,
    });
    if (note) quietCardHtml = renderQuietCard(note);
  }

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">${esc(longDate(day))}</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 22ch;">
          ${greeting(profile.ownerName)}.
        </h1>

        ${recapCardHtml}
        ${quietCardHtml}

        <section style="margin-top: 2rem;">
          <div class="section-mark">Today's meals</div>
          ${mealsHtml}
        </section>

        <section data-scroll="habits" style="margin-top: 2.6rem;">
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

  // Quiet-day card (ticket 0015): dismissal is per-DAY, keyed by today's ISO
  // date so a fresh computation runs tomorrow. The "Open habits" CTA on the
  // adherence-at-risk variant is a same-page scroll — intercept it so the
  // browser doesn't reload Today and burn the existing render.
  document.querySelector("[data-action='dismiss-quiet']")?.addEventListener("click", () => {
    const key = QUIET_DISMISSED_PREFIX + day;
    try { localStorage.setItem(key, "true"); } catch { /* private mode is fine */ }
    document.querySelector(".recap-card--quiet")?.remove();
  });

  // Same-page scroll for the adherence-at-risk CTA. Other CTAs (Plan a retest,
  // Swap this slot) are real navigations and fall through to the default
  // anchor behavior.
  document.querySelector("[data-action='quiet-cta']")?.addEventListener("click", (ev) => {
    const a = ev.currentTarget as HTMLAnchorElement;
    if (a.dataset.kind !== "adherence-at-risk") return;
    ev.preventDefault();
    document.querySelector("[data-scroll='habits']")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    // Under the tour, upsertCheckIn already surfaced the inline tour notice
    // into save-status. Don't overwrite it with "Saved." — the write was a
    // no-op and the user needs to read the notice instead.
    if (isTour()) {
      const s = document.getElementById("save-status");
      if (s) s.innerHTML = tourNotice("Start your own to save check-ins.");
      return;
    }

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

/**
 * Render Today against a shared payload (ticket 0017). The synthetic plan
 * the read shim returned has only eat / avoid / habit; the meal plan may or
 * may not be present. We render today's meals when a meal plan exists for
 * any of the next 7 days, otherwise we show the "shared but no meal plan"
 * empty hint. Habit stack always renders. No save button — shared-view
 * never writes a check-in.
 */
async function paintShared(): Promise<void> {
  const plan = await latestPlan();
  const masth = await masthead("#/today");
  if (!plan) {
    const frag = h(`
      <div class="reveal">
        ${masth}
        <section class="page">
          <div class="eyebrow">${esc(longDate(today()))}</div>
          <h1 class="headline" style="margin-top: 0.4rem;">A shared <em>protocol.</em></h1>
          <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
            The shared link did not include a plan. Open Meals or Plan above to read what was shared.
          </p>
        </section>
        ${foot("i")}
      </div>
    `);
    mount(frag);
    return;
  }

  const day = today();
  const mp = await latestMealPlan();
  const todays = mp?.days.find(d => d.day === day) ?? mp?.days[0];

  const habits = plan.habitStack.habits;
  const mealsHtml = todays
    ? renderMealsRow(todays, new Set())
    : `<div class="quiet" style="padding: 1.4rem 1.6rem; border: 1px dashed var(--rule); background: var(--paper-deep);">
         No meal plan was shared. Open Plan above to read what was shared.
       </div>`;

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">${esc(longDate(day))}</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 26ch;">
          A friend's <em>day.</em>
        </h1>

        <section style="margin-top: 2rem;">
          <div class="section-mark">Today's meals</div>
          ${mealsHtml}
        </section>

        <section style="margin-top: 2.6rem;">
          <div class="section-mark">Habit stack</div>
          <p class="lede" style="max-width: 60ch; margin: 0 0 0.9rem;">${esc(plan.habitStack.intro)}</p>
          <ol class="habit-checks">
            ${habits.map((h, i) => habitCheckRow(h, i + 1, false)).join("")}
          </ol>
        </section>
      </section>
      ${foot("i")}
    </div>
  `);

  mount(frag);
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

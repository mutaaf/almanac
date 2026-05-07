// Today — the daily check-in. The whole product compresses to here once
// the plan exists. Tap each habit to mark it done. 20 seconds, done.

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, today, latestPlan, checkInFor, upsertCheckIn, recentCheckIns,
} from "../db";
import type { CheckIn, Habit } from "../types";

export async function renderToday(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const plan = await latestPlan();
  if (!plan) {
    return paintNoPlan();
  }

  const day = today();
  const ci = await checkInFor(day);
  const completed = new Set(ci?.habitsCompleted ?? []);

  // 14-day adherence map for the streak strip.
  const recent = await recentCheckIns(14);
  const recentMap = new Map(recent.map(c => [c.day, c]));

  const habits = plan.habitStack.habits;
  const masth = await masthead("#/today");

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">${esc(longDate(day))}</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 22ch;">
          ${greeting(profile.ownerName)}.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 0.8rem;">
          ${esc(plan.habitStack.intro)}
        </p>

        <ol class="habit-checks" style="margin-top: 2rem;">
          ${habits.map((h, i) => habitCheckRow(h, i + 1, completed.has(h.id))).join("")}
        </ol>

        <details style="margin-top: 2.4rem;">
          <summary class="section-mark" style="cursor: pointer; list-style: none;">Optional · how do you feel?</summary>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div class="field">
              <label for="sleep">Sleep (hours)</label>
              <input id="sleep" type="number" step="0.25" value="${ci?.signals?.sleepHours ?? ""}" />
            </div>
            <div class="field">
              <label for="mood">Mood (1–5)</label>
              <input id="mood" type="number" min="1" max="5" value="${ci?.signals?.mood ?? ""}" />
            </div>
            <div class="field">
              <label for="energy">Energy (1–5)</label>
              <input id="energy" type="number" min="1" max="5" value="${ci?.signals?.energy ?? ""}" />
            </div>
          </div>
          <div class="field">
            <label for="note">A line about today (optional)</label>
            <input id="note" type="text" value="${esc(ci?.note ?? "")}" />
          </div>
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

  // Toggle habit cards
  for (const card of document.querySelectorAll(".habit-check")) {
    card.addEventListener("click", () => {
      card.classList.toggle("is-done");
    });
  }

  document.getElementById("save")?.addEventListener("click", async () => {
    const card$ = document.querySelectorAll(".habit-check.is-done");
    const habitsCompleted: string[] = [];
    card$.forEach(c => { const id = (c as HTMLElement).dataset.id; if (id) habitsCompleted.push(id); });

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
      ...(Object.keys(signals).length ? { signals } : {}),
      ...(note ? { note } : {}),
    });

    const s = document.getElementById("save-status");
    if (s) s.textContent = "Saved.";
  });
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

/** A 14-day strip showing % of habits done each day. */
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
          A plan first, then a <em>habit stack</em>.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
          Today's check-in tracks adherence to your habit stack — and the stack lives inside your plan. Add a lab panel and compose the plan to begin.
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

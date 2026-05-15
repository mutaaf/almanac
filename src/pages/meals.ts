// Meals — the 7-day meal plan + grocery list.
//
//   #/meals          → current week, list view
//   #/meals?day=YYYY-MM-DD → expanded detail for that day
//   #/meals?grocery=1     → focused grocery list view

import { mount, h, esc, errorCard } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, latestPlan, latestMealPlan, allPanels, saveMealPlan, today,
} from "../db";
import { ClaudeClient, TruncatedResponseError } from "../claude";
import { route } from "../main";
import type { MealPlan, Meal, DayMeals, Effort } from "../types";

export async function renderMeals(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const plan = await latestPlan();
  if (!plan) {
    return paintNoPlan();
  }

  const mp = await latestMealPlan();
  const fresh = mp && mp.planId === plan.id;

  if (!fresh) return paintEmpty(plan.id!);

  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  if (params.get("grocery") === "1") return paintGrocery(mp!);
  const focusDay = params.get("day");
  return paint(mp!, focusDay);
}

/* -------------------------------------------------------------------------- */

async function paintNoPlan(): Promise<void> {
  const masth = await masthead("#/meals");
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Meals</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 26ch;">
          A <em>plan</em> first, then <em>meals</em>.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
          The meal generator reads your eat and avoid lists from the plan. Compose the plan first.
        </p>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <a href="#/labs" class="btn btn--accent">Add labs</a>
          <a href="#/plan" class="btn btn--ghost">Compose the plan</a>
        </div>
      </section>
      ${foot("iv")}
    </div>
  `);
  mount(frag);
}

async function paintEmpty(planId: number): Promise<void> {
  const masth = await masthead("#/meals");
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Meals</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 26ch;">
          Generate this <em>week's</em> meals.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
          7 days of breakfast, lunch, and dinner — distributed across batch cooks, weeknight meals, and assemblies. Aligned to your eat list, free of anything on your avoid list.
        </p>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <button id="generate" class="btn btn--accent">Generate the week</button>
          <a href="#/plan" class="btn btn--ghost">Back to plan</a>
        </div>
        <div id="status" class="quiet" style="display: none; margin-top: 1.6rem;"></div>
      </section>
      ${foot("iv")}
    </div>
  `);
  mount(frag);
  document.getElementById("generate")?.addEventListener("click", () => compose(planId));
}

async function compose(planId: number): Promise<void> {
  const profile = await getProfile();
  const plan    = await latestPlan();
  if (!profile || !plan) return;

  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus("Composing 7 days of meals + a grocery list…");
    const panels = await allPanels();
    const previous = await latestMealPlan();

    const client = new ClaudeClient(profile);
    const { mealPlan, model } = await client.generateMealPlan({
      profile, plan, panels,
      weekStart: today(),
      ...(previous && previous.planId === plan.id ? { previousMealPlan: previous } : {}),
    });

    await saveMealPlan({
      ...mealPlan,
      planId,
      generatedAt: Date.now(),
      model,
    });

    // See plan.ts compose() — same fix.
    location.hash = "#/meals";
    await route();
  } catch (err: any) {
    if (!status) return;
    status.style.display = "block";
    const isTrunc = err instanceof TruncatedResponseError;
    const raw = isTrunc ? err.raw : extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Meal generation failed",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
      actions: `<button id="retry" class="btn btn--accent">Try again</button>`,
    });
    document.getElementById("retry")?.addEventListener("click", () => compose(planId));
  }
}

function extractRawFromMessage(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  const m = msg.match(/--- raw ---\n([\s\S]+)$/);
  return m?.[1];
}

/* -------------------------------------------------------------------------- */
/*  Week view                                                                 */
/* -------------------------------------------------------------------------- */

async function paint(mp: MealPlan, focusDay: string | null): Promise<void> {
  const masth = await masthead("#/meals");
  const tdy = today();

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Meals · week of ${esc(mp.weekStart)}</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          Seven <em>days</em>, written.
        </h1>

        <div class="meals-actions" style="margin-top: 1.2rem; display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="#/meals?grocery=1" class="btn btn--accent">Grocery list</a>
          <button id="reroll" class="btn btn--ghost">Re-roll the week</button>
          <a href="#/plan" class="btn btn--ghost">Back to plan</a>
        </div>

        <div class="day-strip" style="margin-top: 2rem;">
          ${mp.days.map(dm => `
            <a class="day-strip__cell ${dm.day === tdy ? "is-today" : ""} ${dm.day === focusDay ? "is-focus" : ""}" href="#/meals?day=${esc(dm.day)}">
              <div class="day-strip__dow">${esc(dowOf(dm.day))}</div>
              <div class="day-strip__num">${esc(dm.day.slice(8))}</div>
            </a>
          `).join("")}
        </div>

        ${focusDay
          ? renderDayDetail(mp.days.find(d => d.day === focusDay) ?? mp.days.find(d => d.day === tdy) ?? mp.days[0]!)
          : mp.days.map(renderDayBlock).join("")}

        <div id="status" class="quiet" style="display: none; margin-top: 1.6rem;"></div>
      </section>
      ${foot("iv")}
    </div>
  `);

  mount(frag);

  document.getElementById("reroll")?.addEventListener("click", async () => {
    if (!confirm("Re-roll all 7 days? The current week's meals will be replaced.")) return;
    await compose(mp.planId);
  });
}

function renderDayBlock(dm: DayMeals): string {
  return `
    <section class="day-block" id="day-${esc(dm.day)}">
      <div class="day-block__head">
        <div class="day-block__dow">${esc(dowOf(dm.day))}</div>
        <div class="day-block__date">${esc(dm.day)}</div>
      </div>
      <div class="day-block__meals">
        ${mealCard(dm.breakfast, "Breakfast")}
        ${mealCard(dm.lunch,     "Lunch")}
        ${mealCard(dm.dinner,    "Dinner")}
        ${dm.snack ? mealCard(dm.snack, "Snack") : ""}
      </div>
    </section>
  `;
}

function renderDayDetail(dm: DayMeals): string {
  return `
    <section style="margin-top: 1.6rem;">
      <div class="day-block__head">
        <div class="day-block__dow">${esc(dowOf(dm.day))}</div>
        <div class="day-block__date">${esc(dm.day)}</div>
      </div>
      ${mealDetail(dm.breakfast, "Breakfast")}
      ${mealDetail(dm.lunch,     "Lunch")}
      ${mealDetail(dm.dinner,    "Dinner")}
      ${dm.snack ? mealDetail(dm.snack, "Snack") : ""}
    </section>
  `;
}

function mealCard(m: Meal, label: string): string {
  return `
    <div class="meal-card meal-card--${esc(m.effort)}">
      <div class="meal-card__label">${esc(label)} · ${esc(m.effort)} · ${m.timeMinutes}m</div>
      <div class="meal-card__title">${esc(m.title)}</div>
      <div class="meal-card__desc">${esc(m.description)}</div>
      ${m.cuisine ? `<div class="meal-card__cuisine">${esc(m.cuisine)}</div>` : ""}
    </div>
  `;
}

function mealDetail(m: Meal, label: string): string {
  return `
    <article class="meal-detail meal-detail--${esc(m.effort)}">
      <header class="meal-detail__head">
        <div class="meal-detail__label">${esc(label)} · ${esc(m.effort)} · ${m.timeMinutes} min · ${m.servings} serving${m.servings === 1 ? "" : "s"}${m.cuisine ? ` · ${esc(m.cuisine)}` : ""}</div>
        <h3 class="meal-detail__title">${esc(m.title)}</h3>
        <p class="meal-detail__desc">${esc(m.description)}</p>
      </header>

      <div class="meal-detail__cols">
        <div class="meal-detail__col">
          <div class="section-mark">Ingredients</div>
          <ul class="meal-detail__ingredients">
            ${m.ingredients.map(i => `<li>${esc(i)}</li>`).join("")}
          </ul>
        </div>
        ${m.steps && m.steps.length ? `
          <div class="meal-detail__col">
            <div class="section-mark">Method</div>
            <ol class="meal-detail__steps">
              ${m.steps.map(s => `<li>${esc(s)}</li>`).join("")}
            </ol>
          </div>
        ` : ""}
      </div>

      ${m.hits.length ? `<div class="meal-detail__hits">Targets: ${m.hits.map(esc).join(", ")}</div>` : ""}
    </article>
  `;
}

function dowOf(day: string): string {
  const d = new Date(day + "T00:00:00");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()] ?? "";
}

/* -------------------------------------------------------------------------- */
/*  Grocery list                                                              */
/* -------------------------------------------------------------------------- */

async function paintGrocery(mp: MealPlan): Promise<void> {
  const masth = await masthead("#/meals");
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div style="margin-bottom: 1rem;"><a href="#/meals" style="font-family:var(--body);font-size:0.78rem;color:var(--ink-faint);letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">← Back to the week</a></div>

        <div class="eyebrow">Groceries · week of ${esc(mp.weekStart)}</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          One <em>shopping run</em>.
        </h1>

        ${mp.grocery.length === 0
          ? `<div class="quiet">No grocery list returned. Try re-rolling.</div>`
          : `<div class="grocery">
              ${mp.grocery.map(section => `
                <section class="grocery__section">
                  <div class="section-mark">${esc(section.name)}</div>
                  <ul class="grocery__items">
                    ${section.items.map(it => `
                      <li>
                        <label class="grocery__row">
                          <input type="checkbox" />
                          <span class="grocery__name">${esc(it.name)}</span>
                          ${it.quantity ? `<span class="grocery__qty">${esc(it.quantity)}</span>` : ""}
                        </label>
                      </li>
                    `).join("")}
                  </ul>
                </section>
              `).join("")}
             </div>`}

        <div style="margin-top: 2.4rem;">
          <button id="copy" class="btn btn--ghost">Copy list to clipboard</button>
        </div>
      </section>
      ${foot("iv")}
    </div>
  `);
  mount(frag);

  document.getElementById("copy")?.addEventListener("click", async () => {
    const text = mp.grocery.map(s => {
      return `## ${s.name}\n` + s.items.map(i =>
        `- ${i.name}${i.quantity ? ` (${i.quantity})` : ""}`
      ).join("\n");
    }).join("\n\n");
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copy")!;
    const orig = btn.textContent;
    btn.textContent = "Copied.";
    setTimeout(() => { btn.textContent = orig; }, 1200);
  });
}

void undefined as unknown as Effort;

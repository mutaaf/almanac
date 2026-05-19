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
import { recomputeGrocery } from "../meals/grocery";
import { route } from "../main";
import { isSharedView } from "../share/shared-state";
import type { MealPlan, Meal, DayMeals, Effort } from "../types";

export async function renderMeals(): Promise<void> {
  // Shared-view (ticket 0017): when the recipient lands on Meals, render the
  // shared payload's meal plan if one exists; otherwise show the editorial
  // empty state ("This was not shared with you."). Never the "generate the
  // week" CTA — shared-view cannot write.
  if (isSharedView()) {
    return paintShared();
  }

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

/**
 * Render Meals against a shared payload (ticket 0017). When the payload
 * carries a meal plan, the standard `paint()` is reused with no day focus
 * and the reroll button is hidden via the absence of `wireShareControl`-
 * style controls. When the payload omits the meal plan, surface the
 * editorial empty state. Neither branch writes anything.
 */
async function paintShared(): Promise<void> {
  const mp = await latestMealPlan();
  const masth = await masthead("#/meals");
  if (!mp) {
    const frag = h(`
      <div class="reveal">
        ${masth}
        <section class="page">
          <div class="eyebrow">Meals</div>
          <div class="shared-empty" role="status">
            <h2 class="shared-empty__title">This was not shared with you.</h2>
            <p class="shared-empty__body">
              Your friend did not share their meal plan. Open Plan above to read the eat list, the avoid list, and the habit stack they did share.
            </p>
          </div>
        </section>
        ${foot("iv")}
      </div>
    `);
    mount(frag);
    return;
  }
  // The standard `paint()` already handles a real MealPlan. Re-use it but
  // strip the day-strip's links to focused-day URLs (the focus mode would
  // re-route through the router which would re-enter shared-view paint —
  // perfectly fine), and skip the reroll button (we don't render the
  // generate flow for shared-view). Easiest: render a minimal week view.
  const tdy = today();
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Meals · week of ${esc(mp.weekStart)}</div>
        <h1 class="headline" style="margin-top: 0.4rem;">A friend's <em>week</em>.</h1>

        <div class="day-strip" style="margin-top: 2rem;">
          ${mp.days.map(dm => `
            <a class="day-strip__cell ${dm.day === tdy ? "is-today" : ""}" href="#/meals?day=${esc(dm.day)}">
              <div class="day-strip__dow">${esc(dowOf(dm.day))}</div>
              <div class="day-strip__num">${esc(dm.day.slice(8))}</div>
            </a>
          `).join("")}
        </div>

        ${mp.days.map(renderDayBlock).join("")}
      </section>
      ${foot("iv")}
    </div>
  `);
  mount(frag);
}

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

    const savedId = await saveMealPlan({
      ...mealPlan,
      planId,
      generatedAt: Date.now(),
      model,
    });

    // See plan.ts compose() — same fix. Poll past WebKit's IDB read-after-
    // write delay before re-rendering.
    await waitForMealPlanCommit(savedId);
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

/**
 * Poll `latestMealPlan()` until the row we just saved is visible. WebKit's
 * IndexedDB on iOS Safari and headless Linux occasionally lags the indexed
 * read behind the resolved write; bounded to 2s so a real failure surfaces.
 */
async function waitForMealPlanCommit(id: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const m = await latestMealPlan();
    if (m && m.id === id) return;
    await new Promise(r => setTimeout(r, 20));
  }
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

  // Per-meal swap buttons live inside the day-detail view; in the week view
  // there are no .meal-detail nodes, so this loop is a no-op there.
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-action='swap']")) {
    btn.addEventListener("click", () => {
      const mealId = btn.dataset.mealId ?? "";
      if (!mealId) return;
      void swapMeal(mp, mealId, btn);
    });
  }
}

/**
 * Replace one Meal in the current week. The id of the original is preserved
 * so the slot stays unambiguous; the LLM only generates the one meal; the
 * grocery list is rebuilt deterministically from the new days array.
 *
 * On failure, the original meal stays intact and an errorCard() takes the
 * place of the status line — never a silent half-swap.
 */
async function swapMeal(mp: MealPlan, mealId: string, btn: HTMLButtonElement): Promise<void> {
  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Swapping…";

  try {
    const profile = await getProfile();
    const plan    = await latestPlan();
    if (!profile || !plan) throw new Error("Missing profile or plan; cannot swap.");

    setStatus("Drafting a replacement meal…");
    const panels = await allPanels();
    const client = new ClaudeClient(profile);
    const { meal: replacement, model } = await client.generateMealSwap({
      profile, plan, panels, prevMealPlan: mp, mealId,
    });

    // Splice the replacement into the days array, keeping every other slot
    // byte-identical. The replacement's id was forced back to mealId in
    // generateMealSwap(), so the slot lookup below is unambiguous.
    const days = mp.days.map(dm => {
      if (dm.breakfast.id === mealId) return { ...dm, breakfast: replacement };
      if (dm.lunch.id     === mealId) return { ...dm, lunch:     replacement };
      if (dm.dinner.id    === mealId) return { ...dm, dinner:    replacement };
      if (dm.snack?.id    === mealId) return { ...dm, snack:     replacement };
      return dm;
    });

    const grocery = recomputeGrocery(days);

    await saveMealPlan({
      planId: mp.planId,
      weekStart: mp.weekStart,
      generatedAt: Date.now(),
      model,
      days,
      grocery,
    });

    // Same WebKit-IndexedDB-race fix the compose() path uses: route() through
    // the SPA router rather than poking location.hash, which on WebKit can
    // suppress the hashchange when the hash hasn't actually changed.
    if (status) { status.style.display = "none"; status.innerHTML = ""; }
    await route();
  } catch (err: any) {
    btn.disabled = false;
    btn.textContent = originalLabel ?? "Swap";
    if (!status) return;
    status.style.display = "block";
    const isTrunc = err instanceof TruncatedResponseError;
    const raw = isTrunc ? err.raw : extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Swap failed — the original meal is unchanged",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
    });
  }
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
    <article class="meal-detail meal-detail--${esc(m.effort)}" data-meal-id="${esc(m.id)}">
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

      <div class="meal-detail__actions">
        <button class="btn btn--ghost meal-detail__swap"
                type="button"
                data-action="swap"
                data-meal-id="${esc(m.id)}">
          Swap
        </button>
      </div>
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

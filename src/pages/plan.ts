// Plan screen — the food-forward protocol.
//
// Two view modes, toggled in the masthead-area chip:
//   - Read       : editorial long-form (prose, drop caps, section marks)
//   - Dashboard  : visual cards, marker thermometers, habit rings, eat gallery
//
// The mode persists in localStorage so each user gets their preferred surface
// every time they open the plan.

import { mount, h, esc, longDate, errorCard, openSlideover, closeSlideover } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, allPanels, latestPlan, savePlan, recentCheckIns,
  latestMealPlan, today, checkInFor, upsertCheckIn,
} from "../db";
import { route } from "../main";
import { ClaudeClient, TruncatedResponseError } from "../claude";
import type {
  Plan, EatItem, AvoidItem, Recommendation, Panel, Profile, CheckIn, Insight,
} from "../types";
import { findMarker } from "./../data/markers";
import { thermometer, sparkline, ring } from "../viz";

type ViewMode = "read" | "dashboard";
const VIEW_KEY = "almanac.plan.view";

function getMode(): ViewMode {
  const v = localStorage.getItem(VIEW_KEY);
  return v === "read" ? "read" : "dashboard";
}
function setMode(m: ViewMode) { localStorage.setItem(VIEW_KEY, m); }

/* ============================================================================
   Top-level renderers
   ============================================================================ */

export async function renderPlan(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const plan = await latestPlan();
  if (!plan) return paintEmpty();

  const mode = getMode();
  return paint(plan, profile, mode);
}

async function paintEmpty(): Promise<void> {
  const masth = await masthead("#/plan");
  const panels = await allPanels();
  const haveLabs = panels.length > 0;

  // Three branches:
  //   - haveLabs                → "compose now from your panels" (the old flow)
  //   - !haveLabs (intake only) → the first-compose two-path state (ticket 0007)
  //
  // The intake branch offers compose-from-intake as the primary CTA and a
  // labs-first link as the secondary. We keep the labs-first option so the
  // reader who came in with a PDF in hand isn't railroaded.
  const body = haveLabs
    ? `
      <div class="eyebrow">The plan</div>
      <h1 class="headline" style="margin-top: 0.4rem; max-width: 26ch;">
        Your <em>protocol</em> hasn't been written yet.
      </h1>
      <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
        ${panels.length} panel${panels.length === 1 ? "" : "s"} ready. Compose the plan when you are.
      </p>
      <div style="display: flex; gap: 1rem; margin-top: 2.2rem;">
        <button id="compose" class="btn btn--accent">Compose the plan</button>
        <a href="#/labs" class="btn btn--ghost">Back to labs</a>
      </div>
    `
    : `
      <div class="eyebrow">The plan</div>
      <h1 class="headline" style="margin-top: 0.4rem; max-width: 30ch;">
        Your first <em>protocol</em>, from what you've told us so far.
      </h1>
      <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
        We can compose a real first plan from your intake — the goals, the dietary pattern, the conditions
        you named. It will be written without lab data, and the first thing it asks you to do is upload your
        most recent labs so the next pass can name specific markers.
      </p>
      <div style="display: flex; gap: 1rem; margin-top: 2.2rem; flex-wrap: wrap;">
        <button id="compose-from-intake" class="btn btn--accent">Compose from intake</button>
        <a href="#/labs" class="btn btn--ghost">I have labs — upload first</a>
      </div>
    `;

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        ${body}
        <div id="status" class="quiet" style="display: none; margin-top: 2rem;"></div>
      </section>
      ${foot("iii")}
    </div>
  `);

  mount(frag);
  document.getElementById("compose")?.addEventListener("click", () => compose());
  document.getElementById("compose-from-intake")?.addEventListener("click", () => composeFromIntake());
}

/**
 * Compose the first plan from intake answers alone — no panels required.
 * Mirrors `compose()` (loading state, telemetry via the SDK call, savePlan,
 * commit-wait, then route() to re-render). The persisted Plan has
 * `basedOnPanelIds: []`, which is the only marker that distinguishes it
 * from a panel-grounded plan in storage. Ticket 0007.
 */
async function composeFromIntake(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus("Reading your intake…");

    setStatus("Composing your first plan…");
    const client = new ClaudeClient(profile);
    const { plan, model } = await client.generatePlanFromIntake({ profile });

    const savedId = await savePlan({
      ...plan,
      generatedAt: Date.now(),
      basedOnPanelIds: [],
      model,
    });

    // Same WebKit/IndexedDB read-after-write wait as compose() — see the
    // comment in compose() for the long form of why this exists.
    await waitForPlanCommit(savedId);

    location.hash = "#/plan";
    await route();
  } catch (err: any) {
    if (!status) return;
    status.style.display = "block";
    const isTrunc = err instanceof TruncatedResponseError;
    const raw = isTrunc ? err.raw : extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Composition failed",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
      actions: `<button id="retry-intake" class="btn btn--accent">Try again</button>`,
    });
    document.getElementById("retry-intake")?.addEventListener("click", () => composeFromIntake());
  }
}

async function compose(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus("Reading your panels…");
    const panels = await allPanels();
    const previousPlan = await latestPlan();
    const recent = await recentCheckIns(14);

    setStatus("Composing your plan…");
    const client = new ClaudeClient(profile);
    const { plan, model } = await client.generatePlan({
      profile,
      panels,
      recentCheckIns: recent,
      ...(previousPlan ? { previousPlan } : {}),
    });

    const savedId = await savePlan({
      ...plan,
      generatedAt: Date.now(),
      basedOnPanelIds: panels.map(p => p.id!).filter(Boolean) as number[],
      model,
    });

    // WebKit (especially headless Linux WebKit in CI) sometimes returns from
    // `db.plans.add()` slightly before the row is readable through the
    // `generatedAt` index — meaning the next `latestPlan()` call inside
    // renderPlan() could see undefined and paint the empty state. Poll until
    // the row we just wrote is visible to a fresh query, then drive the
    // re-render through the router. The loop is bounded (≤500ms in practice).
    await waitForPlanCommit(savedId);

    // We're already on #/plan, so reassigning location.hash to the same value
    // does NOT fire `hashchange` on WebKit. Instead, hand the next paint to
    // the router and await it.
    location.hash = "#/plan";
    await route();
  } catch (err: any) {
    if (!status) return;
    status.style.display = "block";
    const isTrunc = err instanceof TruncatedResponseError;
    const raw = isTrunc ? err.raw : extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Composition failed",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
      actions: `<button id="retry" class="btn btn--accent">Try again</button>`,
    });
    document.getElementById("retry")?.addEventListener("click", () => compose());
  }
}

function extractRawFromMessage(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  const m = msg.match(/--- raw ---\n([\s\S]+)$/);
  return m?.[1];
}

/**
 * Poll `latestPlan()` until it reflects the row we just saved. Used after
 * `savePlan()` to absorb WebKit/IndexedDB's occasional delay between a
 * write resolving and the indexed read returning that row.
 *
 * Bounded by `timeoutMs` so a real bug (the row never landed) still surfaces.
 */
async function waitForPlanCommit(id: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = await latestPlan();
    if (p && p.id === id) return;
    await new Promise(r => setTimeout(r, 20));
  }
  // If we drop out here we still proceed; the subsequent render will paint
  // an empty state (rare), but at least the user sees the screen — not a
  // half-built UI.
}

/* ============================================================================
   Paint — dispatches to the chosen view mode
   ============================================================================ */

async function paint(plan: Plan, profile: Profile, mode: ViewMode): Promise<void> {
  const masth = await masthead("#/plan");
  const panels = await allPanels();
  const mealPlan = await latestMealPlan();
  const haveMeals = mealPlan && mealPlan.planId === plan.id;
  const ci = await checkInFor(today());
  const recent = await recentCheckIns(14);

  const composedDate = esc(longDate(new Date(plan.generatedAt).toISOString().slice(0,10)));
  const toggleHtml = renderViewToggle(mode);

  const body = mode === "dashboard"
    ? renderDashboard(plan, profile, panels, recent, ci, !!haveMeals)
    : renderEditorial(plan, !!haveMeals, mealPlan?.generatedAt);

  const frag = h(`
    <div class="reveal">
      ${masth}
      <article class="page">
        <div class="plan-head">
          <div class="eyebrow">Plan · composed ${composedDate}</div>
          ${toggleHtml}
        </div>
        ${body}
        <div style="margin-top: 3rem; display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="#/today" class="btn btn--accent">Go to today</a>
          <a href="#/meals" class="btn btn--ghost">${haveMeals ? "Open the meals" : "Generate the meals"}</a>
          <button id="recompose" class="btn btn--ghost">Re-compose plan</button>
        </div>
        <div id="status" class="quiet" style="display: none; margin-top: 1.4rem;"></div>
      </article>
      ${foot("iii")}
    </div>
  `);

  mount(frag);

  // View mode toggle
  for (const btn of document.querySelectorAll<HTMLElement>(".view-toggle__opt")) {
    btn.addEventListener("click", async () => {
      const newMode = btn.dataset.mode as ViewMode;
      setMode(newMode);
      await paint(plan, profile, newMode);
    });
  }

  document.getElementById("recompose")?.addEventListener("click", () => compose());

  // Dashboard-only handlers.
  if (mode === "dashboard") {
    wireDashboardHandlers(plan, ci, panels);
  }
}

function renderViewToggle(mode: ViewMode): string {
  const opt = (m: ViewMode, label: string) =>
    `<button class="view-toggle__opt ${m === mode ? "is-active" : ""}" data-mode="${m}">${label}</button>`;
  return `
    <div class="view-toggle" role="tablist">
      ${opt("dashboard", "Dashboard")}
      ${opt("read", "Read")}
    </div>
  `;
}

/* ============================================================================
   Editorial mode (long-form prose)
   ============================================================================ */

function renderEditorial(plan: Plan, haveMeals: boolean, mealsGeneratedAt?: number): string {
  const insights = [...plan.insights].sort((a, b) =>
    priorityOrder(a.priority) - priorityOrder(b.priority));

  return `
    <h1 class="headline" style="margin-top: 0.4rem;"><em>The protocol.</em></h1>
    <div class="ornament"><span class="dot"></span></div>

    <section class="prose">
      <div class="section-mark">Snapshot</div>
      ${plan.snapshot.split(/\n\n+/).map((p, i) => `<p ${i===0?'class="first"':""}>${esc(p)}</p>`).join("")}
    </section>

    <section style="margin-top: 2.4rem;">
      <div class="section-mark">What stands out</div>
      <ul class="insight-list">
        ${insights.map(i => `
          <li class="insight insight--${esc(i.priority)}">
            <div class="insight__title">${esc(i.title)}</div>
            <div class="insight__detail">${esc(i.detail)}</div>
          </li>
        `).join("")}
      </ul>
    </section>

    <section style="margin-top: 2.6rem;">
      <div class="section-mark">Eat — the food prescription</div>
      ${plan.eatList.length === 0
        ? `<div class="quiet">No additions prescribed.</div>`
        : plan.eatList.map(eatRowProse).join("")}
    </section>

    <section style="margin-top: 2.6rem;">
      <div class="section-mark">Reduce or replace</div>
      ${plan.avoidList.length === 0
        ? `<div class="quiet">Nothing flagged for avoidance.</div>`
        : plan.avoidList.map(avoidRow).join("")}
    </section>

    <section style="margin-top: 2.6rem;">
      <div class="meal-cta">
        <div>
          <div class="meal-cta__title">${haveMeals ? `This week's meals are ready.` : `Turn this into a 7-day meal plan.`}</div>
          <div class="meal-cta__hint">${haveMeals
            ? `<span style="color: var(--ink-faint);">Last generated ${mealsGeneratedAt ? new Date(mealsGeneratedAt).toLocaleDateString() : ""}.</span>`
            : `Each meal hits the eat list at the right frequency, never includes anything from the avoid list, and respects your dietary pattern.`}</div>
        </div>
        <a href="#/meals" class="btn btn--accent">${haveMeals ? "Open the meals" : "Generate the meals"}</a>
      </div>
    </section>

    ${recBlock("Lifestyle",   plan.lifestyle,   "")}
    ${recBlock("Supplements", plan.supplements, "No supplement is justified by your current labs.")}

    ${habitsHtml(plan)}
    ${retestHtml(plan)}
  `;
}

/* ============================================================================
   Dashboard mode (visual + interactive)
   ============================================================================ */

function renderDashboard(
  plan: Plan,
  profile: Profile,
  panels: Panel[],
  recent: CheckIn[],
  todayCheckIn: CheckIn | undefined,
  haveMeals: boolean,
): string {
  const insights = [...plan.insights].sort((a, b) =>
    priorityOrder(a.priority) - priorityOrder(b.priority));

  // Build a per-marker timeline so cards can show sparklines + thermometers.
  const series = buildMarkerSeries(panels);

  // Hero: pick up to 3 markers that the plan's high-priority insights cite,
  // or fall back to the first three from the eat list's markerKeys.
  const heroKeys = pickHeroMarkers(plan, profile, series);

  return `
    <h1 class="headline" style="margin-top: 0.4rem;">${esc(profile.ownerName)}'s <em>protocol.</em></h1>

    <section class="dash-snapshot" style="margin-top: 1rem;">
      ${plan.snapshot.split(/\n\n+/).slice(0, 1).map(p => `<p class="dash-snapshot__lede">${esc(p)}</p>`).join("")}
    </section>

    ${heroKeys.length ? `
      <section class="dash-hero">
        ${heroKeys.map(k => renderHeroCard(k, series)).join("")}
      </section>
    ` : ""}

    <section class="dash-section">
      <header class="dash-section__head">
        <h2 class="dash-section__title">What stands out</h2>
        <span class="dash-section__hint">tap a card to see the supporting markers</span>
      </header>
      <div class="dash-insights">
        ${insights.map(i => renderInsightCard(i, series)).join("")}
      </div>
    </section>

    <section class="dash-section">
      <header class="dash-section__head">
        <h2 class="dash-section__title">Eat</h2>
        <span class="dash-section__hint">${plan.eatList.length} ${plan.eatList.length === 1 ? "food" : "foods"} prescribed</span>
      </header>
      <div class="dash-eats">
        ${plan.eatList.map(renderEatCard).join("") || `<div class="quiet">No additions prescribed.</div>`}
      </div>
    </section>

    ${plan.avoidList.length ? `
      <section class="dash-section">
        <header class="dash-section__head">
          <h2 class="dash-section__title">Avoid</h2>
          <span class="dash-section__hint">${plan.avoidList.length} to reduce or swap</span>
        </header>
        <div class="dash-avoids">
          ${plan.avoidList.map(renderAvoidChip).join("")}
        </div>
      </section>
    ` : ""}

    <section class="dash-section">
      <header class="dash-section__head">
        <h2 class="dash-section__title">Habit stack</h2>
        <span class="dash-section__hint">tap to mark today done · 14-day completion ring</span>
      </header>
      <div class="dash-habits">
        ${plan.habitStack.habits.map(h => renderHabitCard(h, recent, todayCheckIn)).join("")}
      </div>
    </section>

    <section class="dash-section">
      <div class="meal-cta">
        <div>
          <div class="meal-cta__title">${haveMeals ? `This week's meals are ready.` : `Turn this into a 7-day meal plan.`}</div>
          <div class="meal-cta__hint">${haveMeals ? `Tap to open today's three meals.` : `Each meal honors the eat list, the avoid list, and your dietary pattern.`}</div>
        </div>
        <a href="#/meals" class="btn btn--accent">${haveMeals ? "Open the meals" : "Generate the meals"}</a>
      </div>
    </section>

    ${plan.supplements.length || plan.lifestyle.length ? `
      <section class="dash-section">
        <header class="dash-section__head">
          <h2 class="dash-section__title">Supporting</h2>
          <span class="dash-section__hint">lifestyle + supplements</span>
        </header>
        <div class="dash-supporting">
          ${plan.lifestyle.map(r => renderSupportingCard(r, "Lifestyle")).join("")}
          ${plan.supplements.map(r => renderSupportingCard(r, "Supplement")).join("")}
        </div>
      </section>
    ` : ""}

    ${plan.retest.length ? `
      <section class="dash-section">
        <header class="dash-section__head">
          <h2 class="dash-section__title">Retest cadence</h2>
        </header>
        <ul class="retest-list">
          ${plan.retest.map(r => `
            <li><strong>${esc(r.markerKeys.join(", "))}</strong> in <strong>${r.whenWeeks}</strong> weeks — ${esc(r.reason)}</li>
          `).join("")}
        </ul>
      </section>
    ` : ""}
  `;
}

/* ---- dashboard pieces -------------------------------------------------- */

interface MarkerSeries {
  values: { value: number; drawnAt: string }[];
  latest: number | undefined;
}

function buildMarkerSeries(panels: Panel[]): Map<string, MarkerSeries> {
  const map = new Map<string, MarkerSeries>();
  // Iterate oldest → newest so series is chronological.
  const ordered = [...panels].sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));
  for (const p of ordered) {
    for (const r of p.results) {
      if (!map.has(r.markerKey)) map.set(r.markerKey, { values: [], latest: undefined });
      const s = map.get(r.markerKey)!;
      s.values.push({ value: r.value, drawnAt: p.drawnAt });
      s.latest = r.value;
    }
  }
  return map;
}

function pickHeroMarkers(plan: Plan, _profile: Profile, series: Map<string, MarkerSeries>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  // Prefer markers cited in HIGH-priority insights.
  for (const i of plan.insights) {
    if (i.priority !== "high") continue;
    if (i.markerKey && series.has(i.markerKey) && !seen.has(i.markerKey)) {
      out.push(i.markerKey); seen.add(i.markerKey);
    }
  }
  // Then medium.
  for (const i of plan.insights) {
    if (i.priority !== "medium") continue;
    if (i.markerKey && series.has(i.markerKey) && !seen.has(i.markerKey)) {
      out.push(i.markerKey); seen.add(i.markerKey);
    }
  }
  // Then anything from the eat-list's markerKeys.
  for (const e of plan.eatList) {
    for (const k of e.markerKeys) {
      if (series.has(k) && !seen.has(k)) {
        out.push(k); seen.add(k);
      }
      if (out.length >= 4) break;
    }
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

function renderHeroCard(markerKey: string, series: Map<string, MarkerSeries>): string {
  const m = findMarker(markerKey);
  const s = series.get(markerKey);
  if (!m || !s || s.latest == null) return "";

  const flag = computeFlag(s.latest, m.optimalRange, m.labRange);
  const sp   = sparkline({ marker: m, points: s.values });

  return `
    <div class="hero-card hero-card--${esc(flag)}">
      <div class="hero-card__name">${esc(m.shortName ?? m.name)}</div>
      <div class="hero-card__value">
        <span class="hero-card__num">${esc(s.latest)}</span>
        <span class="hero-card__unit">${esc(m.unit)}</span>
      </div>
      <div class="hero-card__chart">${sp}</div>
      <div class="hero-card__flag flag--${esc(flag)}">${esc(flag)}</div>
    </div>
  `;
}

function renderInsightCard(i: Insight, series: Map<string, MarkerSeries>): string {
  // The insight may carry a single markerKey; show its thermometer when present.
  const m = i.markerKey ? findMarker(i.markerKey) : undefined;
  const s = i.markerKey ? series.get(i.markerKey) : undefined;
  const therm = (m && s && s.latest != null)
    ? thermometer({ marker: m, value: s.latest })
    : "";

  // "Read why X is on the list" — only when the insight cites a marker we know.
  // Lives outside <summary> so a tap on it never toggles the details
  // disclosure; the JS handler stops propagation as a belt-and-braces too.
  const whyLabel = m ? `Read why ${m.shortName ?? m.name} is on the list` : "";
  const whyChevron = i.markerKey && m
    ? `<button type="button" class="insight-card__why" data-why="${esc(i.markerKey)}" aria-label="${esc(whyLabel)}">›</button>`
    : "";

  // The chevron sits OUTSIDE <details> so closed-state UA styling doesn't
  // hide it. Both live inside a positioning wrapper so the button can be
  // pinned to the top-right corner.
  return `
    <div class="insight-card-wrap">
      <details class="insight-card insight-card--${esc(i.priority)}">
        <summary class="insight-card__head">
          <span class="insight-card__pri">${esc(i.priority)}</span>
          <span class="insight-card__title">${esc(i.title)}</span>
        </summary>
        <div class="insight-card__body">
          <p class="insight-card__detail">${esc(i.detail)}</p>
          ${therm ? `
            <div class="insight-card__therm">
              <div class="insight-card__therm-label">${esc(m!.shortName ?? m!.name)} · ${esc(s!.latest!)} ${esc(m!.unit)}</div>
              ${therm}
            </div>
          ` : ""}
        </div>
      </details>
      ${whyChevron}
    </div>
  `;
}

function renderEatCard(e: EatItem): string {
  // Frequency dots — extract a number from "2x per week", "4 days/week", etc.
  const freqNum = parseFreq(e.frequency);
  const dots = Array.from({ length: 7 }, (_, i) =>
    `<span class="freq-dot ${i < freqNum ? "is-on" : ""}"></span>`,
  ).join("");
  const markerChips = e.markerKeys.map(k => {
    const m = findMarker(k);
    return `<span class="chip">${esc(m?.shortName ?? m?.name ?? k)}</span>`;
  }).join("");

  return `
    <article class="eat-card" data-card-id="${esc(e.id)}">
      <div class="eat-card__head">
        <div class="eat-card__food">${esc(e.food)}</div>
        <div class="eat-card__freq" title="${esc(e.frequency)}">${dots}</div>
      </div>
      <div class="eat-card__portion">${esc(e.portion)}</div>
      <p class="eat-card__why">${esc(e.why)}</p>
      ${e.examples?.length ? `<div class="eat-card__examples">${esc(e.examples.slice(0, 3).join(" · "))}</div>` : ""}
      ${markerChips ? `<div class="eat-card__markers">${markerChips}</div>` : ""}
    </article>
  `;
}

function renderAvoidChip(a: AvoidItem): string {
  return `
    <article class="avoid-chip">
      <div class="avoid-chip__food">${esc(a.food)}</div>
      ${a.swap ? `<div class="avoid-chip__swap">→ ${esc(a.swap)}</div>` : ""}
    </article>
  `;
}

function renderHabitCard(h: { id: string; title: string; cue: string; why: string }, recent: CheckIn[], todayCi: CheckIn | undefined): string {
  // Last 14 days completion — for the ring progress.
  const window = 14;
  let hits = 0;
  for (const c of recent.slice(0, window)) {
    if (c.habitsCompleted.includes(h.id)) hits++;
  }
  const ratio = hits / window;
  const ringSvg = ring({ value: ratio, size: 48, label: `${hits}` });

  const doneToday = todayCi?.habitsCompleted.includes(h.id) ?? false;

  return `
    <button class="habit-card ${doneToday ? "is-done" : ""}" data-habit="${esc(h.id)}" type="button">
      <div class="habit-card__ring">${ringSvg}</div>
      <div class="habit-card__body">
        <div class="habit-card__title">${esc(h.title)}</div>
        <div class="habit-card__cue">${esc(h.cue)}</div>
      </div>
      <div class="habit-card__check">${doneToday ? "✓" : ""}</div>
    </button>
  `;
}

function renderSupportingCard(r: Recommendation, kind: string): string {
  return `
    <details class="support-card support-card--${esc(r.tier)}" data-card-id="${esc(r.id)}">
      <summary>
        <span class="support-card__kind">${esc(kind)}</span>
        <span class="support-card__title">${esc(r.title)}</span>
        <span class="support-card__tier">${esc(r.tier)}</span>
      </summary>
      <div class="support-card__body">
        <p><em>Why:</em> ${esc(r.why)}</p>
        <p><em>How:</em> ${esc(r.how)}</p>
        ${r.expectedImpact ? `<p><em>Expected:</em> ${esc(r.expectedImpact)}</p>` : ""}
        ${r.caution ? `<p class="support-card__caution">⚠ ${esc(r.caution)}</p>` : ""}
      </div>
    </details>
  `;
}

/* ---- dashboard wiring -------------------------------------------------- */

async function wireDashboardHandlers(plan: Plan, _ci: CheckIn | undefined, panels: Panel[]): Promise<void> {
  for (const btn of document.querySelectorAll<HTMLElement>(".habit-card")) {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.habit;
      if (!id) return;

      // Toggle in today's check-in.
      const day = today();
      const current = await checkInFor(day);
      const set = new Set(current?.habitsCompleted ?? []);
      if (set.has(id)) set.delete(id); else set.add(id);

      await upsertCheckIn({
        day,
        habitsCompleted: Array.from(set),
        ...(current?.mealsAte ? { mealsAte: current.mealsAte } : {}),
        ...(current?.signals ? { signals: current.signals } : {}),
        ...(current?.note ? { note: current.note } : {}),
      });

      // Optimistic UI: toggle state + the check mark. The 14-day completion
      // ring only refreshes on the next render — that's a deliberate lag,
      // not a bug. Doing a full repaint here used to race with concurrent
      // UI assertions on WebKit and yielded no visual win.
      btn.classList.toggle("is-done");
      const checkEl = btn.querySelector(".habit-card__check");
      if (checkEl) checkEl.textContent = btn.classList.contains("is-done") ? "✓" : "";
    });
  }

  // "Why is this a problem?" chevrons on each insight card — open the
  // slideover with three local sections built from the marker DB, the
  // user's own trajectory, and the current plan. Zero API calls.
  for (const btn of document.querySelectorAll<HTMLElement>(".insight-card__why")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();   // never toggle the wrapping <details>
      const key = btn.dataset.why;
      if (!key) return;
      const insight = plan.insights.find(i => i.markerKey === key);
      if (!insight) return;
      openWhySlideover(insight, plan, panels, btn);
    });
  }
}

/* ---- why slideover ---------------------------------------------------- */

/**
 * Build and open the "Why is this a problem?" slideover for a single insight.
 * All data comes from the marker DB, the user's panels, and the current plan
 * — strictly local, zero network. Tap-targets close the slideover and scroll
 * to the matching plan card.
 */
function openWhySlideover(insight: Insight, plan: Plan, panels: Panel[], opener: HTMLElement): void {
  const key = insight.markerKey!;
  const marker = findMarker(key);

  // -- "The marker": marker DB description verbatim ----------------------
  const markerSection = marker
    ? `
      <section class="slideover__section">
        <h2 class="slideover__heading">The marker</h2>
        <div class="slideover__marker-name">${esc(marker.shortName ?? marker.name)}</div>
        <p class="slideover__marker-desc">${esc(marker.description)}</p>
      </section>
    `
    : `
      <section class="slideover__section">
        <h2 class="slideover__heading">The marker</h2>
        <p class="slideover__marker-desc">No reference entry on file.</p>
      </section>
    `;

  // -- "Your trajectory": ≤6 newest-first readings -----------------------
  // Walk every panel; gather (drawnAt, value, unit, flag) for this markerKey.
  // Sort newest → oldest by drawnAt and slice 6.
  type Row = { drawnAt: string; value: number; unit: string; flag?: string };
  const all: Row[] = [];
  for (const p of panels) {
    for (const r of p.results) {
      if (r.markerKey === key) {
        all.push({
          drawnAt: p.drawnAt,
          value: r.value,
          unit: r.unit,
          ...(r.flag ? { flag: r.flag as string } : {}),
        });
      }
    }
  }
  all.sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
  const visible = all.slice(0, 6);

  const trajectorySection = visible.length <= 1
    ? `
      <section class="slideover__section">
        <h2 class="slideover__heading">Your trajectory</h2>
        <div class="slideover__trajectory">
          <p>Only one reading on file — upload earlier draws to see a trend.</p>
          <p><a href="#/labs">Add earlier panels in labs →</a></p>
        </div>
      </section>
    `
    : `
      <section class="slideover__section">
        <h2 class="slideover__heading">Your trajectory</h2>
        <div class="slideover__trajectory">
          <ol class="slideover__trajectory-list">
            ${visible.map(r => `
              <li class="slideover__trajectory-row">
                <span class="slideover__trajectory-date">${esc(r.drawnAt)}</span>
                <span class="slideover__trajectory-value">${esc(r.value)} <span class="slideover__trajectory-unit">${esc(r.unit)}</span></span>
                ${r.flag ? `<span class="slideover__trajectory-flag flag--${esc(r.flag)}">${esc(r.flag)}</span>` : ""}
              </li>
            `).join("")}
          </ol>
        </div>
      </section>
    `;

  // -- "How to move it": insight detail + tap-targets --------------------
  const matchingEats: Array<{ id: string; label: string }> = plan.eatList
    .filter(e => e.markerKeys.includes(key))
    .map(e => ({ id: e.id, label: e.food }));
  const matchingSupps: Array<{ id: string; label: string }> = plan.supplements
    .filter(r => (r.markerKeys ?? []).includes(key))
    .map(r => ({ id: r.id, label: r.title }));
  const targets = [...matchingEats, ...matchingSupps];

  const moveSection = `
    <section class="slideover__section">
      <h2 class="slideover__heading">How to move it</h2>
      <p class="slideover__detail">${esc(insight.detail)}</p>
      ${targets.length ? `
        <div class="slideover__move">
          <div class="slideover__move-label">In your plan:</div>
          ${targets.map(t => `
            <button type="button" class="slideover__target" data-target="${esc(t.id)}">${esc(t.label)} <span class="slideover__target-arrow">↘</span></button>
          `).join("")}
        </div>
      ` : `
        <p class="slideover__detail slideover__detail--muted">No directly-matched items in your current plan.</p>
      `}
    </section>
  `;

  const labelName = marker?.shortName ?? marker?.name ?? insight.title;
  openSlideover(
    `<div class="slideover__sections">${markerSection}${trajectorySection}${moveSection}</div>`,
    { label: `Why ${labelName} is on the list`, returnFocusTo: opener },
  );

  // Wire tap-targets after the slideover is in the DOM.
  for (const t of document.querySelectorAll<HTMLElement>("aside.slideover .slideover__target")) {
    t.addEventListener("click", () => {
      const id = t.dataset.target;
      closeSlideover();
      if (!id) return;
      // Find the matching card on the plan: either an `.eat-card` (no data-id
      // today) or a `.support-card`. We tag both by data-card-id below to
      // make this scrollIntoView deterministic.
      const card = document.querySelector<HTMLElement>(`[data-card-id="${cssEscape(id)}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

/**
 * Bare-bones CSS.escape polyfill. WebKit/Chromium ship CSS.escape but
 * eat-item ids are simple slugs in practice; this just protects against
 * the unlikely id containing characters CSS would mis-parse.
 */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
}

/* ============================================================================
   Helpers shared between modes
   ============================================================================ */

function eatRowProse(e: EatItem): string {
  return `
    <div class="eat-item">
      <div class="eat-item__head">
        <div class="eat-item__food">${esc(e.food)}</div>
        <div class="eat-item__freq">${esc(e.frequency)} · ${esc(e.portion)}</div>
      </div>
      <p class="eat-item__why"><em>Why:</em> ${esc(e.why)}</p>
      ${e.examples?.length ? `<div class="eat-item__examples">e.g. ${e.examples.map(esc).join(" · ")}</div>` : ""}
      ${e.cuisineNotes ? `<div class="eat-item__cuisine">${esc(e.cuisineNotes)}</div>` : ""}
    </div>
  `;
}

function avoidRow(a: AvoidItem): string {
  return `
    <div class="avoid-item">
      <div class="avoid-item__food">${esc(a.food)}</div>
      <p class="avoid-item__why"><em>Why:</em> ${esc(a.why)}</p>
      ${a.swap ? `<p class="avoid-item__swap"><em>Swap:</em> ${esc(a.swap)}</p>` : ""}
    </div>
  `;
}

function recBlock(title: string, items: Recommendation[], emptyText: string): string {
  return `
    <section class="prose" style="margin-top: 2.4rem;">
      <div class="section-mark">${esc(title)}</div>
      ${items.length === 0 ? `<div class="quiet" style="padding: 0.6rem 0;">${esc(emptyText)}</div>` : ""}
      ${items.map(r => `
        <div class="rec rec--${esc(r.tier)}">
          <div class="rec__title">${esc(r.title)} <span class="rec__tier">${esc(r.tier)}</span></div>
          <p class="rec__why"><em>Why:</em> ${esc(r.why)}</p>
          <p class="rec__how"><em>How:</em> ${esc(r.how)}</p>
          ${r.expectedImpact ? `<p class="rec__impact"><em>Expected:</em> ${esc(r.expectedImpact)}</p>` : ""}
          ${r.caution ? `<p class="rec__caution">⚠ ${esc(r.caution)}</p>` : ""}
        </div>
      `).join("")}
    </section>
  `;
}

function habitsHtml(plan: Plan): string {
  return `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Habit stack · the easy tier</div>
      <p class="lede" style="max-width: 60ch; margin: 0 0 1.2rem;">${esc(plan.habitStack.intro)}</p>
      <ol class="habit-list">
        ${plan.habitStack.habits.map((h, i) => `
          <li class="habit-list__item">
            <span class="habit-list__num">${i + 1}</span>
            <div>
              <div class="habit-list__title">${esc(h.title)}</div>
              <div class="habit-list__cue">${esc(h.cue)}</div>
              <div class="habit-list__why"><em>${esc(h.why)}</em></div>
            </div>
          </li>
        `).join("")}
      </ol>
    </section>
  `;
}

function retestHtml(plan: Plan): string {
  if (plan.retest.length === 0) return "";
  return `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Retest cadence</div>
      <ul class="retest-list">
        ${plan.retest.map(r => `
          <li><strong>${esc(r.markerKeys.join(", "))}</strong> in <strong>${r.whenWeeks}</strong> weeks — ${esc(r.reason)}</li>
        `).join("")}
      </ul>
    </section>
  `;
}

function priorityOrder(p: "high" | "medium" | "low"): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

function parseFreq(s: string): number {
  // Try to extract a /week count from common phrasings.
  const m = s.match(/(\d+)\s*(?:x|times|servings?|days?)?\s*(?:per|\/)?\s*(?:wk|week)/i);
  if (m && m[1]) return Math.min(7, Math.max(1, parseInt(m[1], 10)));
  // "daily" / "every day"
  if (/daily|every day|each day/i.test(s)) return 7;
  // "twice daily" — cap at 7 for the dot strip
  if (/twice daily|2x daily/i.test(s)) return 7;
  return 3; // sensible default
}

function computeFlag(value: number, opt: { low?: number; high?: number }, lab?: { low?: number; high?: number }): string {
  const within = (v: number, r?: { low?: number; high?: number }) => {
    if (!r) return true;
    if (r.low != null  && v < r.low)  return false;
    if (r.high != null && v > r.high) return false;
    return true;
  };
  if (!within(value, lab)) return value < (lab?.low ?? -Infinity) ? "low" : "high";
  if (within(value, opt)) return "optimal";
  return "suboptimal";
}

// Plan screen — the living protocol. Reads latest Plan from IndexedDB; if none
// exists (or the user hits "regenerate"), calls Claude with current panels +
// adherence to compose a fresh one.

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, allPanels, latestPlan, savePlan, recentCheckIns,
} from "../db";
import { ClaudeClient } from "../claude";
import type { Plan, Recommendation } from "../types";

export async function renderPlan(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const plan = await latestPlan();
  if (!plan) return paintEmpty();
  return paint(plan);
}

async function paintEmpty(): Promise<void> {
  const masth = await masthead("#/plan");
  const panels = await allPanels();
  const haveLabs = panels.length > 0;

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">The plan</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 26ch;">
          ${haveLabs
            ? `Your <em>protocol</em> hasn't been written yet.`
            : `Add labs first; the <em>protocol</em> reads from them.`}
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
          ${haveLabs
            ? `${panels.length} panel${panels.length === 1 ? "" : "s"} ready. Compose the plan when you are.`
            : `Drop a PDF or photo of your last labs to begin.`}
        </p>
        <div style="display: flex; gap: 1rem; margin-top: 2.2rem;">
          ${haveLabs
            ? `<button id="compose" class="btn btn--accent">Compose the plan</button>
               <a href="#/labs" class="btn btn--ghost">Back to labs</a>`
            : `<a href="#/labs" class="btn btn--accent">Add labs</a>`}
        </div>
        <div id="status" class="quiet" style="display: none; margin-top: 2rem;"></div>
      </section>
      ${foot("iii")}
    </div>
  `);

  mount(frag);
  document.getElementById("compose")?.addEventListener("click", () => compose());
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

    await savePlan({
      ...plan,
      generatedAt: Date.now(),
      basedOnPanelIds: panels.map(p => p.id!).filter(Boolean) as number[],
      model,
    });

    location.hash = "#/plan";
    void renderPlan();
  } catch (err: any) {
    if (status) {
      status.style.display = "block";
      status.innerHTML = `<strong style="color: var(--oxblood)">Composition failed.</strong><br/>${esc(err.message ?? String(err))}`;
    }
  }
}

/* -------------------------------------------------------------------------- */

async function paint(plan: Plan): Promise<void> {
  const masth = await masthead("#/plan");

  const insights = [...plan.insights].sort((a, b) =>
    priorityOrder(a.priority) - priorityOrder(b.priority));

  const recBlock = (title: string, items: Recommendation[], emptyText: string) => `
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

  const habits = plan.habitStack.habits;
  const habitsHtml = `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Habit stack · the easy tier</div>
      <p class="lede" style="max-width: 60ch; margin: 0 0 1.2rem;">${esc(plan.habitStack.intro)}</p>
      <ol class="habit-list">
        ${habits.map((h, i) => `
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

  const retestHtml = plan.retest.length === 0 ? "" : `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Retest cadence</div>
      <ul class="retest-list">
        ${plan.retest.map(r => `
          <li><strong>${esc(r.markerKeys.join(", "))}</strong> in <strong>${r.whenWeeks}</strong> weeks — ${esc(r.reason)}</li>
        `).join("")}
      </ul>
    </section>
  `;

  const frag = h(`
    <div class="reveal">
      ${masth}
      <article class="page">
        <div class="eyebrow">Plan · composed ${esc(longDate(new Date(plan.generatedAt).toISOString().slice(0,10)))}</div>
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

        ${recBlock("Nutrition",   plan.nutrition,   "Nothing prescribed beyond what the labs already support.")}
        ${recBlock("Lifestyle",   plan.lifestyle,   "")}
        ${recBlock("Supplements", plan.supplements, "No supplement is justified by your current labs.")}

        ${habitsHtml}

        ${retestHtml}

        <div style="margin-top: 3rem; display: flex; gap: 1rem;">
          <a href="#/today" class="btn btn--accent">Go to today's check-in</a>
          <button id="recompose" class="btn btn--ghost">Re-compose</button>
        </div>
        <div id="status" class="quiet" style="display: none; margin-top: 1.4rem;"></div>
      </article>
      ${foot("iii")}
    </div>
  `);

  mount(frag);

  document.getElementById("recompose")?.addEventListener("click", () => compose());
}

function priorityOrder(p: "high" | "medium" | "low"): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

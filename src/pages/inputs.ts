// The inputs screen. One textarea is the main thing — everything else is
// optional. The editorial conceit: this is the writer's notebook, the
// almanac's raw material.

import { mount, h, esc } from "../ui";
import { masthead, foot } from "../chrome";
import { appendEntry, entriesForDay, getSettings, today } from "../db";
import type { Entry, Signals } from "../types";

export async function renderInputs(): Promise<void> {
  const settings = await getSettings();
  if (!settings) { location.hash = "#/onboarding"; return; }

  const day = today();
  const todays = await entriesForDay(day);
  const enabled = settings.enabledSignals ?? [];

  const masth = await masthead("#/inputs");

  const frag = h(`
    <div class="reveal">
      ${masth}

      <section class="page">
        <div class="eyebrow">The notebook · ${esc(day)}</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          Tell the editor <em>what happened</em>.
        </h1>

        <p class="lede" style="max-width: 60ch; margin-top: 0.8rem;">
          A paragraph is plenty. Lab values, a meal, a sentence about how you slept.
          The page tomorrow morning will read what you wrote.
        </p>

        <form id="entry" style="max-width: 64ch; margin-top: 2.2rem;">
          <div class="field">
            <label for="body">Today's note</label>
            <textarea id="body" name="body" required autofocus
                      placeholder="Slept ~6h, woken twice. Lifted heavy. Skipped breakfast. Felt foggy until 11."></textarea>
          </div>

          ${signalsSection(enabled)}

          <div style="display: flex; gap: 1rem; align-items: center; margin-top: 1.2rem;">
            <button type="submit" class="btn btn--accent">Add to the notebook</button>
            <span id="entry-status" class="quiet" style="padding: 0; font-size: 0.95rem;"></span>
          </div>
        </form>

        <div style="margin-top: 3.4rem;">
          <div class="section-mark">Already in the notebook today</div>
          ${todays.length === 0
            ? `<div class="quiet">Nothing yet. The page will be quiet without you.</div>`
            : todays.map(renderTodayEntry).join("")}
        </div>
      </section>

      ${foot("ii")}
    </div>
  `);

  mount(frag);

  document.getElementById("entry")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const fd = new FormData(f);
    const body = String(fd.get("body") ?? "").trim();
    if (!body) return;

    const signals: Signals = {};
    for (const key of enabled) {
      const raw = fd.get(`sig.${key}`);
      if (raw == null || raw === "") continue;
      const num = Number(raw);
      if (!Number.isNaN(num)) (signals as any)[key] = num;
    }

    await appendEntry({
      day,
      body,
      ...(Object.keys(signals).length ? { signals } : {}),
    });

    const status = document.getElementById("entry-status");
    if (status) {
      status.textContent = "Added. The editor will see it.";
      setTimeout(() => renderInputs(), 700);
    }
  });
}

function signalsSection(enabled: string[]): string {
  if (!enabled.length) return "";
  const labels: Record<string, string> = {
    sleepHours: "Sleep (hours)",
    weight: "Weight",
    mood: "Mood (1–5)",
    energy: "Energy (1–5)",
  };
  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem;">
      ${enabled.map(key => `
        <div class="field">
          <label for="sig-${esc(key)}">${esc(labels[key] ?? key)}</label>
          <input id="sig-${esc(key)}" name="sig.${esc(key)}" type="number" step="any" />
        </div>
      `).join("")}
    </div>
  `;
}

function renderTodayEntry(e: Entry): string {
  const time = new Date(e.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sig = e.signals && Object.keys(e.signals).length
    ? `<div class="dateline" style="margin-top: 0.4rem;">${
        Object.entries(e.signals).map(([k,v]) => `${esc(k)}: ${esc(v)}`).join(" &nbsp;·&nbsp; ")
      }</div>`
    : "";
  return `
    <div style="border-bottom: 1px solid var(--rule); padding: 1rem 0;">
      <div class="dateline">${esc(time)}</div>
      <div class="prose" style="margin-top: 0.4rem;">
        <p style="font-size: 1.05rem;">${esc(e.body)}</p>
      </div>
      ${sig}
    </div>
  `;
}

// Today's Page — the ritual screen. The whole product compresses to this one
// view. Open the app, read it, close the app.

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getSettings, today, entriesForDay, recentEntries,
  pageFor, savePage, latestSummary, saveSummary, db,
} from "../db";
import { ClaudeClient, pageFromResponse } from "../claude";
import { summarizeEntries, olderThan } from "../summarizer";
import type { Page } from "../types";

export async function renderToday(): Promise<void> {
  const settings = await getSettings();
  if (!settings) { location.hash = "#/onboarding"; return; }

  const day = today();
  const existing = await pageFor(day);

  if (existing) {
    return paint(existing);
  }

  // No page yet for today. Show the "compose" affordance.
  await paintEmpty();
}

async function paintEmpty(): Promise<void> {
  const day = today();
  const masth = await masthead("#/today");
  const todays = await entriesForDay(day);

  const frag = h(`
    <div class="reveal">
      ${masth}

      <section class="page">
        <div class="eyebrow">${esc(longDate(day))}</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 22ch;">
          Today's page is <em>not yet written</em>.
        </h1>

        <p class="lede" style="max-width: 56ch; margin-top: 1rem;">
          ${todays.length
            ? `You've added <strong>${todays.length}</strong> note${todays.length === 1 ? "" : "s"} so far.
               Compose the page when you're ready — you can always re-roll it.`
            : `Add a note from yesterday or this morning, then ask the editor to compose the page.`}
        </p>

        <div style="display: flex; gap: 1rem; margin-top: 2.2rem;">
          <button id="compose" class="btn btn--accent">Compose today's page</button>
          <a href="#/inputs" class="btn btn--ghost">Add a note first</a>
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
  const settings = await getSettings();
  if (!settings) return;
  const day = today();

  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus("Gathering notes from the past week…");
    const recent = await recentEntries(60);   // raw window, generous
    const todays = await entriesForDay(day);

    // If there are entries older than ~7 days that aren't yet summarized,
    // (re)summarize them on-device.
    const old = olderThan(recent, day, 7);
    let history = await latestSummary();
    const haveOld = old.length > 0;
    const needsRefresh = haveOld && (
      !history ||
      // Refresh weekly: if newest summary is more than 7 days old.
      (Date.now() - history.createdAt) > 7 * 86400000
    );

    if (needsRefresh) {
      setStatus("Loading the on-device summarizer (one-time, ~80MB)…");
      // Pull the *whole* archive of older entries for the summary, not just the
      // 60-row window — the local summarizer handles long input via trimming.
      const allOlderEntries = await db.entries
        .where("day").below(olderCutoffIso(day, 7))
        .toArray();
      setStatus("Summarizing your earlier weeks on this device…");
      const text = await summarizeEntries(allOlderEntries);
      if (text) {
        await saveSummary({ day, text });
        history = { day, text, createdAt: Date.now() };
      }
    }

    setStatus("Asking the editor to compose the page…");
    const client = new ClaudeClient(settings);
    const recentForClaude = recent.filter(e => e.day >= olderCutoffIso(day, 7));

    const resp = await client.generatePage({
      settings,
      day,
      todayEntries: todays,
      recentEntries: recentForClaude,
      ...(history ? { historySummary: history } : {}),
    });

    const page = pageFromResponse(day, resp, history?.text);
    await savePage(page);

    paint({ ...page, id: 0 });
  } catch (err: any) {
    if (status) {
      status.style.display = "block";
      status.innerHTML = `<strong style="color: var(--oxblood)">The page didn't compose.</strong><br/>${esc(err.message ?? String(err))}`;
    }
  }
}

function olderCutoffIso(day: string, keepDays: number): string {
  const d = new Date(day);
  d.setDate(d.getDate() - keepDays);
  return d.toISOString().slice(0, 10);
}

async function paint(page: Page): Promise<void> {
  const settings = await getSettings();
  const day = page.day;
  const masth = await masthead("#/today");

  const frag = h(`
    <div class="reveal">
      ${masth}

      <article class="page">
        <div class="spread">
          <div class="body">
            <div class="eyebrow">${esc(longDate(day))}</div>
            <h1 class="headline" style="margin-top: 0.4rem;">
              ${esc(page.headline)}
            </h1>

            <div class="ornament"><span class="dot"></span></div>

            <section class="prose">
              <div class="section-mark">Read</div>
              <p class="first">${esc(page.read)}</p>
            </section>

            <section class="prose">
              <div class="section-mark">Do</div>
              <p>${esc(page.do)}</p>
            </section>

            <section class="prose">
              <div class="section-mark">Notice</div>
              <p>${esc(page.notice)}</p>
            </section>

            <div class="action">
              <p>${esc(page.action)}</p>
            </div>

            <div style="margin-top: 2.4rem; display: flex; gap: 0.8rem;">
              <button id="reroll" class="btn btn--ghost">Re-roll the page</button>
              <a href="#/almanac" class="btn btn--ghost">The almanac</a>
            </div>
          </div>

          <aside class="marginalia">
            <div class="label">Reader</div>
            <div class="value">${esc(settings?.ownerName ?? "")}</div>

            <div class="label">Composed</div>
            <div class="value">${esc(new Date(page.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}</div>

            <div class="label">Editor</div>
            <div class="value" style="font-family: var(--mono); font-size: 0.82rem;">${esc(page.model ?? "")}</div>
          </aside>
        </div>
      </article>

      ${foot("iii")}
    </div>
  `);

  mount(frag);

  document.getElementById("reroll")?.addEventListener("click", async () => {
    // Drop today's page so compose() will write a fresh one.
    const existing = await pageFor(day);
    if (existing?.id != null) {
      await db.pages.delete(existing.id);
    }
    await paintEmpty();
    setTimeout(() => compose(), 50);
  });
}

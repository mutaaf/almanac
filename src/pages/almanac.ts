// The archive. A bound book of past pages, listed reverse-chronologically.
// Click a row → read that day's full page.

import { mount, h, esc, longDate } from "../ui";
import { masthead, foot } from "../chrome";
import { allPages, getSettings } from "../db";
import type { Page } from "../types";

export async function renderAlmanac(): Promise<void> {
  const settings = await getSettings();
  if (!settings) { location.hash = "#/onboarding"; return; }

  const masth = await masthead("#/almanac");
  const pages = await allPages();

  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const openDay = params.get("day");
  const open = openDay ? pages.find(p => p.day === openDay) : undefined;

  const body = open ? renderOpenPage(open) : renderIndex(pages);

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        ${body}
      </section>
      ${foot("iv")}
    </div>
  `);

  mount(frag);
}

function renderIndex(pages: Page[]): string {
  if (!pages.length) {
    return `
      <div class="eyebrow">The almanac</div>
      <h1 class="headline" style="margin-top: 0.4rem;">
        <em>Empty pages</em> — for now.
      </h1>
      <p class="lede" style="max-width: 56ch; margin-top: 1rem;">
        Once you've composed a few mornings, they bind themselves into this book.
        <a href="#/today">Begin today.</a>
      </p>
    `;
  }

  return `
    <div class="eyebrow">The almanac · ${pages.length} page${pages.length === 1 ? "" : "s"}</div>
    <h1 class="headline" style="margin-top: 0.4rem;">
      A <em>private record</em> of mornings.
    </h1>

    <div class="archive" style="margin-top: 2.4rem;">
      ${pages.map((p, i) => `
        <a class="entry-row" href="#/almanac?day=${esc(p.day)}">
          <div class="date">${esc(longDate(p.day))}</div>
          <div class="title">${esc(p.headline)}</div>
          <div class="pageno">${pages.length - i}</div>
        </a>
      `).join("")}
    </div>
  `;
}

function renderOpenPage(p: Page): string {
  return `
    <div style="margin-bottom: 1.2rem;">
      <a href="#/almanac" style="font-family: var(--body); font-size: 0.78rem; color: var(--ink-faint); letter-spacing: 0.16em; text-transform: uppercase; text-decoration: none;">
        ← Back to the almanac
      </a>
    </div>

    <article>
      <div class="eyebrow">${esc(longDate(p.day))}</div>
      <h1 class="headline" style="margin-top: 0.4rem;">${esc(p.headline)}</h1>
      <div class="ornament"><span class="dot"></span></div>

      <section class="prose">
        <div class="section-mark">Read</div>
        <p class="first">${esc(p.read)}</p>
      </section>

      <section class="prose">
        <div class="section-mark">Do</div>
        <p>${esc(p.do)}</p>
      </section>

      <section class="prose">
        <div class="section-mark">Notice</div>
        <p>${esc(p.notice)}</p>
      </section>

      <div class="action">
        <p>${esc(p.action)}</p>
      </div>
    </article>
  `;
}

// Progress — for any marker that appears in 2+ panels, show a small inline
// trend (sparkline) plus latest value, delta, and flag.

import { mount, h, esc } from "../ui";
import { masthead, foot } from "../chrome";
import { getProfile, allPanels } from "../db";
import { findMarker } from "../data/markers";
import type { Panel, Result } from "../types";

interface Series {
  markerKey: string;
  points: { drawnAt: string; value: number; flag?: string }[];
}

export async function renderProgress(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }
  const masth = await masthead("#/progress");
  const panels = await allPanels();

  // Sort oldest → newest for trend reading.
  const ordered = [...panels].sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));

  // Collect series per marker.
  const seriesMap = new Map<string, Series>();
  for (const p of ordered) {
    for (const r of p.results) {
      if (!seriesMap.has(r.markerKey)) seriesMap.set(r.markerKey, { markerKey: r.markerKey, points: [] });
      seriesMap.get(r.markerKey)!.points.push({
        drawnAt: p.drawnAt, value: r.value,
        ...(r.flag ? { flag: r.flag } : {}),
      });
    }
  }

  // Group by category, only markers with 2+ points get a trend.
  const groups = new Map<string, Series[]>();
  for (const s of seriesMap.values()) {
    if (s.points.length < 2) continue;
    const m = findMarker(s.markerKey);
    const cat = m?.category ?? "other";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(s);
  }

  // Single-point markers (latest values) — for completeness.
  const singletons: { marker: ReturnType<typeof findMarker>; result: Result; drawnAt: string }[] = [];
  if (panels.length) {
    const newest = ordered[ordered.length - 1]!;
    for (const r of newest.results) {
      const series = seriesMap.get(r.markerKey);
      if (series && series.points.length >= 2) continue;
      const m = findMarker(r.markerKey);
      if (!m) continue;
      singletons.push({ marker: m, result: r, drawnAt: newest.drawnAt });
    }
  }

  const groupsHtml = Array.from(groups.entries()).map(([cat, series]) => `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">${esc(cat)}</div>
      <div class="trend-list">
        ${series.map(renderTrend).join("")}
      </div>
    </section>
  `).join("");

  const singletonHtml = singletons.length === 0 ? "" : `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Latest values · awaiting a second draw</div>
      <div class="trend-list">
        ${singletons.map(({ marker, result }) => latestOnlyRow(marker!, result)).join("")}
      </div>
    </section>
  `;

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Progress</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          What is <em>moving</em>.
        </h1>
        ${panels.length === 0
          ? `<div class="quiet">No labs yet. <a href="#/labs">Add a panel</a>.</div>`
          : panels.length === 1
            ? `<p class="lede" style="max-width: 60ch; margin-top: 1rem;">One panel on file. Trends appear after a second draw.</p>${singletonHtml}`
            : `${groupsHtml}${singletonHtml}`}
      </section>
      ${foot("iv")}
    </div>
  `);

  mount(frag);
}

function renderTrend(s: Series): string {
  const m = findMarker(s.markerKey);
  if (!m) return "";
  const name = m.shortName ?? m.name;
  const last = s.points[s.points.length - 1]!;
  const prev = s.points[s.points.length - 2];
  const delta = prev ? last.value - prev.value : 0;
  const arrow = delta === 0 ? "→" : delta > 0 ? "▲" : "▼";
  const direction = signOfChange(s, m);

  return `
    <div class="trend">
      <div class="trend__name">${esc(name)}</div>
      <div class="trend__chart">${sparkline(s, m)}</div>
      <div class="trend__latest">
        <span class="trend__value">${esc(last.value)}</span>
        <span class="trend__unit">${esc(m.unit)}</span>
      </div>
      <div class="trend__delta trend__delta--${direction}">${arrow} ${esc(formatDelta(delta))}</div>
      <div class="trend__flag flag--${esc(last.flag ?? "")}">${esc(last.flag ?? "")}</div>
    </div>
  `;
}

function latestOnlyRow(marker: NonNullable<ReturnType<typeof findMarker>>, r: Result): string {
  return `
    <div class="trend">
      <div class="trend__name">${esc(marker.shortName ?? marker.name)}</div>
      <div class="trend__chart trend__chart--empty">— need 2+ panels —</div>
      <div class="trend__latest">
        <span class="trend__value">${esc(r.value)}</span>
        <span class="trend__unit">${esc(r.unit)}</span>
      </div>
      <div class="trend__delta">—</div>
      <div class="trend__flag flag--${esc(r.flag ?? "")}">${esc(r.flag ?? "")}</div>
    </div>
  `;
}

function formatDelta(d: number): string {
  if (d === 0) return "0";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(Math.abs(d) < 1 ? 2 : 1)}`;
}

/** "good" / "bad" depending on whether the latest move is toward the optimal range. */
function signOfChange(s: Series, m: NonNullable<ReturnType<typeof findMarker>>): "good" | "bad" | "flat" {
  if (s.points.length < 2) return "flat";
  const a = s.points[s.points.length - 2]!.value;
  const b = s.points[s.points.length - 1]!.value;
  if (a === b) return "flat";

  const opt = m.optimalRange;
  if (!opt) return "flat";

  const distA = distanceToRange(a, opt);
  const distB = distanceToRange(b, opt);
  if (distB < distA) return "good";
  if (distB > distA) return "bad";
  return "flat";
}

function distanceToRange(v: number, r: { low?: number; high?: number }): number {
  if (r.low != null && v < r.low) return r.low - v;
  if (r.high != null && v > r.high) return v - r.high;
  return 0;
}

/** Tiny inline SVG sparkline, dimensions ~180×34. */
function sparkline(s: Series, m: NonNullable<ReturnType<typeof findMarker>>): string {
  const w = 180, h = 34, pad = 3;
  const values = s.points.map(p => p.value);
  const opt = m.optimalRange ?? {};
  const lab = m.labRange ?? {};

  const allBounds = [
    ...values,
    opt.low, opt.high, lab.low, lab.high,
  ].filter((v): v is number => typeof v === "number");
  const min = Math.min(...allBounds);
  const max = Math.max(...allBounds);
  const span = (max - min) || 1;

  const xFor = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
  const yFor = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);

  // Functional band, drawn behind the line.
  const bandLow  = opt.low  ?? min;
  const bandHigh = opt.high ?? max;
  const bandY1 = yFor(bandHigh);
  const bandY2 = yFor(bandLow);
  const bandH  = Math.max(1, bandY2 - bandY1);

  const path = values.map((v, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(" ");
  const dots = values.map((v, i) => `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="2" fill="var(--ink)" />`).join("");

  return `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="${bandY1.toFixed(1)}" width="${w}" height="${bandH.toFixed(1)}" fill="rgba(122,31,43,0.08)" />
      <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="1.4" />
      ${dots}
    </svg>
  `;
}

// quiet linting — allow Panel import in case we extend
void undefined as unknown as Panel;

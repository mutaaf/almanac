// Progress — for any marker that appears in 2+ panels, show a small inline
// trend (sparkline) plus latest value, delta, and flag.
//
// The page also hosts the "Compare two draws" picker at its top (ticket 0009).
// When `?compare=A,B` is present in the URL, the page swaps in the side-by-side
// comparison render path — the picker and trends step aside so the comparison
// is the only thing on screen.

import { mount, h, esc } from "../ui";
import { masthead, foot } from "../chrome";
import { getProfile, allPanels, getPanel, recentCheckIns } from "../db";
import { findMarker } from "../data/markers";
import { getAllMarkers } from "../data/userMarkers";
import { thermometer } from "../viz";
import { route } from "../main";
import { computeComparison, type ComparisonRow } from "../progress/compare";
import type { CheckIn, MarkerDef, Panel, Result } from "../types";

interface Series {
  markerKey: string;
  points: { drawnAt: string; value: number; flag?: string }[];
}

export async function renderProgress(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  // Branch on the compare param BEFORE rendering the trend page — the compare
  // view is self-contained and re-uses neither the picker nor the trends.
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const cmp = params.get("compare");
  if (cmp) {
    const [aStr, bStr] = cmp.split(",");
    const aId = Number(aStr); const bId = Number(bStr);
    if (Number.isFinite(aId) && Number.isFinite(bId)) {
      return renderCompare(aId, bId);
    }
  }

  const masth = await masthead("#/progress");
  const panels = await allPanels();
  // Last 90 days of check-ins for the "Continuous signals" section (ticket
  // 0004). Read once here so we don't fan out to multiple Dexie roundtrips
  // inside the render pass.
  const checkins = await recentCheckIns(90);

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

  const continuousHtml = renderContinuousSignals(checkins);

  const singletonHtml = singletons.length === 0 ? "" : `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Latest values · awaiting a second draw</div>
      <div class="trend-list">
        ${singletons.map(({ marker, result }) => latestOnlyRow(marker!, result)).join("")}
      </div>
    </section>
  `;

  // The picker is meaningful only when there are 2+ panels on file. When
  // we have one or zero, the empty / single-panel guidance below covers it
  // and adding empty selects would be confusing.
  const pickerHtml = panels.length >= 2 ? renderPicker(panels) : "";

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Progress</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          What is <em>moving</em>.
        </h1>
        ${pickerHtml}
        ${panels.length === 0
          ? `<div class="quiet">No labs yet. <a href="#/labs">Add a panel</a>.</div>`
          : panels.length === 1
            ? `<p class="lede" style="max-width: 60ch; margin-top: 1rem;">One panel on file. Trends appear after a second draw.</p>${singletonHtml}`
            : `${groupsHtml}${singletonHtml}`}
        ${continuousHtml}
      </section>
      ${foot("iv")}
    </div>
  `);

  mount(frag);
  wirePicker();
}

/* -------------------------------------------------------------------------- */
/*  Compare two draws (ticket 0009)                                           */
/* -------------------------------------------------------------------------- */

/**
 * The inline picker shown above the trends. Two selects (earlier / later)
 * populated from the panel list newest-first, plus a Compare button that
 * builds the `?compare=earlierId,laterId` URL and re-renders via `route()`.
 *
 * No slideover — keep the affordance self-contained, the way the ticket
 * called it out.
 */
function renderPicker(panels: Panel[]): string {
  // panels arrives newest-first from allPanels(); use that order in the UI.
  const options = panels.map(p => {
    const label = `${p.drawnAt}${p.labName ? ` · ${p.labName}` : ""} · ${p.results.length} markers`;
    return `<option value="${esc(p.id)}">${esc(label)}</option>`;
  }).join("");

  // Default "earlier" to the SECOND-newest, "later" to the newest so the
  // most common comparison (this draw vs the previous draw) is one click.
  const newestId = panels[0]?.id;
  const prevId   = panels[1]?.id ?? newestId;

  return `
    <section class="compare-picker" aria-label="Compare two draws">
      <div class="section-mark">Compare two draws</div>
      <p class="compare-picker__lede">
        Pick any two panels. We show the markers they share, the deltas, and what crossed the optimal band.
      </p>
      <form id="compare-form" class="compare-picker__form">
        <label class="compare-picker__field">
          <span class="compare-picker__label">Earlier draw</span>
          <select id="compare-earlier" required>
            ${options.replace(`value="${esc(prevId)}"`, `value="${esc(prevId)}" selected`)}
          </select>
        </label>
        <label class="compare-picker__field">
          <span class="compare-picker__label">Later draw</span>
          <select id="compare-later" required>
            ${options.replace(`value="${esc(newestId)}"`, `value="${esc(newestId)}" selected`)}
          </select>
        </label>
        <button type="submit" class="btn btn--accent">Compare</button>
      </form>
    </section>
  `;
}

function wirePicker(): void {
  const form = document.getElementById("compare-form") as HTMLFormElement | null;
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const earlier = (document.getElementById("compare-earlier") as HTMLSelectElement | null)?.value;
    const later   = (document.getElementById("compare-later")   as HTMLSelectElement | null)?.value;
    if (!earlier || !later) return;
    location.hash = `#/progress?compare=${earlier},${later}`;
    // The hashchange listener in main.ts will fire route(); call it directly
    // too so the post-submit render is deterministic under Mobile WebKit
    // (the same belt-and-braces pattern used by compose() in plan.ts).
    void route();
  });
}

/**
 * Render the comparison page: header + per-row breakdown + back link.
 *
 * If either id resolves to nothing, render the editorial empty state so the
 * URL stays valid (and the back link still works) even when one panel was
 * just deleted on another tab.
 */
async function renderCompare(aId: number, bId: number): Promise<void> {
  const masth = await masthead("#/progress");
  const [a, b, markers] = await Promise.all([getPanel(aId), getPanel(bId), getAllMarkers()]);

  if (!a || !b) {
    mount(h(`
      <div class="reveal">
        ${masth}
        <section class="page">
          <div class="eyebrow">Compare</div>
          <h1 class="headline" style="margin-top: 0.4rem;">No panels at <em>those ids</em>.</h1>
          <div class="compare-empty" style="margin-top: 1.4rem;">
            <p class="lede">One or both of the panels in the URL no longer exist.</p>
            <p><a href="#/progress" class="btn btn--ghost">Pick another pair</a></p>
          </div>
        </section>
        ${foot("iv")}
      </div>
    `));
    return;
  }

  // Honor the ticket: if the URL passes the panels in reverse chronological
  // order, swap them and warn quietly. The header's date pair always reads
  // older-first so the visual story is consistent.
  let earlier = a, later = b, swapped = false;
  if (a.drawnAt > b.drawnAt) { earlier = b; later = a; swapped = true; }

  const summary = computeComparison(earlier, later, markers);

  const swapNotice = swapped
    ? `<div class="compare-swap-notice">Reading these in chronological order: <strong>${esc(earlier.drawnAt)}</strong> first, then <strong>${esc(later.drawnAt)}</strong>.</div>`
    : "";

  const header = `
    <div class="compare-summary">
      <span class="compare-summary__dates">${esc(earlier.drawnAt)} <span class="compare-summary__sep">·</span> ${esc(later.drawnAt)}</span>
      <span class="compare-summary__sep">·</span>
      <span class="compare-summary__count">${summary.count} markers in common</span>
      <span class="compare-summary__sep">·</span>
      <span class="compare-summary__tally">${summary.improved} improved, ${summary.regressed} regressed</span>
    </div>
  `;

  const body = summary.count === 0
    ? renderEmpty(earlier, later)
    : renderRowsByCategory(summary.rows);

  mount(h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div style="margin-bottom: 1rem;">
          <a href="#/progress" style="font-family:var(--body);font-size:0.78rem;color:var(--ink-faint);letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">← Back to progress</a>
        </div>
        <div class="eyebrow">Compare two draws</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          <em>${esc(earlier.drawnAt)}</em> &nbsp;vs.&nbsp; <em>${esc(later.drawnAt)}</em>.
        </h1>
        ${swapNotice}
        ${header}
        ${body}
      </section>
      ${foot("iv")}
    </div>
  `));
}

function renderEmpty(earlier: Panel, later: Panel): string {
  return `
    <div class="compare-empty">
      <p class="lede">
        These two draws share no markers in common. The earlier panel
        (<strong>${esc(earlier.drawnAt)}</strong>) carries
        ${earlier.results.length} marker${earlier.results.length === 1 ? "" : "s"};
        the later one (<strong>${esc(later.drawnAt)}</strong>) carries
        ${later.results.length}. Pick a different pair to see the side-by-side.
      </p>
      <p><a href="#/progress" class="btn btn--ghost">Pick another pair</a></p>
    </div>
  `;
}

function renderRowsByCategory(rows: ComparisonRow[]): string {
  // Group preserving the already-sorted row order (category major, |pct| desc).
  const groups = new Map<string, ComparisonRow[]>();
  for (const r of rows) {
    const c = r.marker.category;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(r);
  }
  return Array.from(groups.entries()).map(([cat, list]) => `
    <section style="margin-top: 2rem;">
      <div class="section-mark">${esc(cat)}</div>
      <div class="compare-list">
        ${list.map(renderRow).join("")}
      </div>
    </section>
  `).join("");
}

function renderRow(r: ComparisonRow): string {
  const arrowClass = r.delta === 0 ? "" : r.delta > 0 ? "compare-row__arrow--up" : "compare-row__arrow--down";

  // The badge is the editorial summary of the crossing — oxblood for
  // regressed, ink for improved (per the ticket: "use existing oxblood / ink
  // tokens — no new colors"). When `null`, no badge.
  const badge = r.crossing === "improved"
    ? `<span class="compare-row__badge compare-row__badge--improved">improved</span>`
    : r.crossing === "regressed"
      ? `<span class="compare-row__badge compare-row__badge--regressed">regressed</span>`
      : "";

  const pctText = r.pctChange === 0
    ? "0.0%"
    : `${r.pctChange > 0 ? "+" : ""}${r.pctChange.toFixed(1)}%`;

  // Re-use thermometer() per the ticket: render two stacked thermometers
  // (earlier on top, later below) so the user sees both points against the
  // same functional / lab band without inventing a new viz primitive.
  const therms = `
    <div class="compare-row__therm">
      <div class="compare-row__therm-label">earlier</div>
      ${thermometer({ marker: r.marker, value: r.earlier, height: 30 })}
      <div class="compare-row__therm-label">later</div>
      ${thermometer({ marker: r.marker, value: r.later, height: 30 })}
    </div>
  `;

  return `
    <article class="compare-row">
      <header class="compare-row__head">
        <div class="compare-row__name">${esc(r.marker.name)}</div>
        ${badge}
      </header>
      <div class="compare-row__grid">
        <div class="compare-row__cell">
          <div class="compare-row__cell-label">earlier</div>
          <div class="compare-row__cell-value"><span class="compare-row__num">${esc(formatValue(r.earlier))}</span> <span class="compare-row__unit">${esc(r.unit)}</span></div>
        </div>
        <div class="compare-row__cell">
          <div class="compare-row__cell-label">later</div>
          <div class="compare-row__cell-value"><span class="compare-row__num">${esc(formatValue(r.later))}</span> <span class="compare-row__unit">${esc(r.unit)}</span></div>
        </div>
        <div class="compare-row__cell compare-row__cell--delta">
          <div class="compare-row__cell-label">Δ</div>
          <div class="compare-row__cell-value">
            <span class="compare-row__arrow ${arrowClass}">${r.arrow}</span>
            <span class="compare-row__num">${esc(formatDelta(r.delta))}</span>
            <span class="compare-row__pct">${esc(pctText)}</span>
          </div>
        </div>
      </div>
      ${therms}
    </article>
  `;
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
}

function formatDelta(d: number): string {
  if (d === 0) return "0";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(Math.abs(d) < 1 ? 2 : 1)}`;
}

/* -------------------------------------------------------------------------- */
/*  Trend list — the existing main-page render                                */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Continuous signals (ticket 0004 — Apple Health import)                    */
/* -------------------------------------------------------------------------- */
/*
 * The section renders three sparklines — HRV, RHR, sleep — over the last 90
 * days when any imported data exists. The section is omitted ENTIRELY when
 * no check-in row carries any of those fields, per the ticket: we don't show
 * empty cards inviting the user to "import their data" here. The Settings
 * page already owns that affordance.
 */

interface ContinuousSeries {
  /** Editorial label, used as the card title. */
  label: string;
  /** Stable id so the test can count cards reliably. */
  key: "hrv" | "rhr" | "sleep";
  /** Unit suffix shown next to the latest reading. */
  unit: string;
  /** Per-day points, oldest → newest. Missing days are dropped (not zero-filled). */
  points: { day: string; value: number }[];
}

function renderContinuousSignals(checkins: CheckIn[]): string {
  // recentCheckIns returns rows newest-first; we want chronological for the
  // sparkline x-axis to read left-to-right as time-forward.
  const chrono = [...checkins].sort((a, b) => a.day.localeCompare(b.day));

  const hrv: ContinuousSeries["points"] = [];
  const rhr: ContinuousSeries["points"] = [];
  const slp: ContinuousSeries["points"] = [];
  for (const c of chrono) {
    const s = c.signals;
    if (!s) continue;
    if (typeof s.hrvMs       === "number") hrv.push({ day: c.day, value: s.hrvMs });
    if (typeof s.rhrBpm      === "number") rhr.push({ day: c.day, value: s.rhrBpm });
    if (typeof s.sleepHours  === "number") slp.push({ day: c.day, value: s.sleepHours });
  }

  // Section gate: no continuous data → no section.
  if (hrv.length === 0 && rhr.length === 0 && slp.length === 0) return "";

  const series: ContinuousSeries[] = [
    { label: "HRV (SDNN)",          key: "hrv",   unit: "ms",  points: hrv },
    { label: "Resting heart rate",  key: "rhr",   unit: "bpm", points: rhr },
    { label: "Sleep",               key: "sleep", unit: "h",   points: slp },
  ];

  return `
    <section style="margin-top: 2.8rem;">
      <div class="section-mark">Continuous signals · last 90 days</div>
      <div class="continuous-list">
        ${series.map(renderContinuousCard).join("")}
      </div>
    </section>
  `;
}

function renderContinuousCard(s: ContinuousSeries): string {
  if (s.points.length === 0) {
    return `
      <div class="continuous-signal continuous-signal--empty" data-key="${esc(s.key)}">
        <div class="continuous-signal__label">${esc(s.label)}</div>
        <div class="continuous-signal__chart continuous-signal__chart--empty">— no readings yet —</div>
        <div class="continuous-signal__latest continuous-signal__latest--empty">—</div>
      </div>
    `;
  }
  const last = s.points[s.points.length - 1]!;
  const avg = s.points.reduce((n, p) => n + p.value, 0) / s.points.length;
  return `
    <div class="continuous-signal" data-key="${esc(s.key)}">
      <div class="continuous-signal__label">${esc(s.label)}</div>
      <div class="continuous-signal__chart">${continuousSparkline(s)}</div>
      <div class="continuous-signal__latest">
        <span class="continuous-signal__value">${esc(formatValue(last.value))}</span>
        <span class="continuous-signal__unit">${esc(s.unit)}</span>
      </div>
      <div class="continuous-signal__avg">90-day avg ${esc(formatValue(avg))} ${esc(s.unit)}</div>
    </div>
  `;
}

/**
 * Sparkline tuned for sparse, gap-heavy continuous data: the x-axis is
 * indexed by reading (not calendar day), the y-axis spans min..max of the
 * series with a small padding, and we draw a faint horizontal mean line so
 * the latest reading reads against the user's own baseline rather than an
 * arbitrary zero.
 */
function continuousSparkline(s: ContinuousSeries): string {
  const w = 220, h = 36, pad = 3;
  const vals = s.points.map(p => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = (max - min) || 1;
  const yPad = span * 0.15;
  const yMin = min - yPad;
  const yMax = max + yPad;
  const yFor = (v: number) => h - pad - ((v - yMin) / (yMax - yMin)) * (h - pad * 2);
  const xFor = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1);
  const path = vals.map((v, i) =>
    `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`,
  ).join(" ");
  const dots = vals.map((v, i) =>
    `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="1.6" fill="var(--ink)" />`,
  ).join("");
  const mean = vals.reduce((n, v) => n + v, 0) / vals.length;
  const meanY = yFor(mean).toFixed(1);

  return `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="${w}" y1="${meanY}" y2="${meanY}" stroke="var(--rule)" stroke-dasharray="2 3" stroke-width="0.7" />
      <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="1.4" />
      ${dots}
    </svg>
  `;
}

// quiet linting — allow MarkerDef import in case we extend
void undefined as unknown as MarkerDef;

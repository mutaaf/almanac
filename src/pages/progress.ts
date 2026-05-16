// Progress — for any marker that appears in 2+ panels, show a small inline
// trend (sparkline) plus latest value, delta, and flag.
//
// The page also hosts the "Compare two draws" picker at its top (ticket 0009).
// When `?compare=A,B` is present in the URL, the page swaps in the side-by-side
// comparison render path — the picker and trends step aside so the comparison
// is the only thing on screen.

import { mount, h, esc, openSlideover } from "../ui";
import { masthead, foot } from "../chrome";
import { getProfile, allPanels, getPanel, recentCheckIns, latestPlan, getProjectionsFor } from "../db";
import { findMarker } from "../data/markers";
import { getAllMarkers } from "../data/userMarkers";
import { thermometer } from "../viz";
import { route } from "../main";
import { computeComparison, type ComparisonRow } from "../progress/compare";
import { computeProjection, evaluateLanded, type ProjectionBand, type LandedVerdict } from "../progress/projection";
import { generateMarkerCardPng, markerCardFilename, shareOrDownload } from "../share/marker-card";
import type { CheckIn, MarkerDef, Panel, Plan, ProjectionSnapshot, Result } from "../types";

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
  // inside the render pass. The projection module (ticket 0012) consumes
  // the most-recent 14 of these as its adherence window.
  const checkins = await recentCheckIns(90);
  const plan = await latestPlan();

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
  // The projection module needs the most-recent 14 days; `recentCheckIns`
  // already gave us up to 90 newest-first, so the slice is cheap.
  const projectionItems = panels.length === 0
    ? []
    : await buildProjectionItems(ordered, checkins.slice(0, 14), plan);
  const projectionHtml = renderProjectionSection(projectionItems);

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
        ${projectionHtml}
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
  wireProjectionCards(projectionItems);
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

  // Wire the per-row "Share marker" chips (ticket 0011). Build a quick lookup
  // by marker key so the click handler can hand the right ComparisonRow and
  // MarkerDef to the canvas-rendering module without re-deriving them.
  wireShareChips(summary.rows, earlier.drawnAt, later.drawnAt);
}

/**
 * One delegated click handler covering every `.compare-row__share` button on
 * the page — rows are grouped by category into multiple `.compare-list`
 * containers, so we attach the listener to the page section itself rather
 * than to each list. The handler resolves the row + marker by data-key,
 * then asks the share module to render and ship the PNG. Keeping the
 * resolution table local to this function means the share module never sees
 * a Profile, a Plan, or any other marker — the ticket's privacy-by-
 * construction discipline.
 */
function wireShareChips(rows: ComparisonRow[], earlierDate: string, laterDate: string): void {
  const byKey = new Map<string, ComparisonRow>();
  for (const r of rows) byKey.set(r.marker.key, r);

  // Delegate from the page <section>, which contains every category group.
  const root = document.querySelector(".page");
  if (!root) return;
  root.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>(".compare-row__share");
    if (!btn) return;
    const key = btn.dataset.markerKey;
    if (!key) return;
    const row = byKey.get(key);
    if (!row) return;
    // Optimistic state — disable the chip while we draw to avoid double-fires.
    btn.disabled = true;
    void shareMarker(row, earlierDate, laterDate).finally(() => {
      btn.disabled = false;
    });
  });
}

async function shareMarker(row: ComparisonRow, earlierDate: string, laterDate: string): Promise<void> {
  const blob = await generateMarkerCardPng(row, row.marker, earlierDate, laterDate);
  const filename = markerCardFilename(row.marker.key, laterDate);
  await shareOrDownload(blob, filename);
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

  // Ticket 0011 — per-row "Share marker" chip. Lives in the head on desktop
  // (right-edge) and folds under the value pair on mobile (via the CSS
  // media query in styles.css). It's a button, not a link, so it's
  // keyboard-focusable by default and never confuses screen readers.
  const shareChip = `
    <button type="button"
            class="compare-row__share"
            data-marker-key="${esc(r.marker.key)}"
            aria-label="Share ${esc(r.marker.name)} as an image">
      Share marker
    </button>
  `;

  return `
    <article class="compare-row">
      <header class="compare-row__head">
        <div class="compare-row__name">${esc(r.marker.name)}</div>
        ${badge}
        ${shareChip}
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

/* -------------------------------------------------------------------------- */
/*  Between-draws projection section (ticket 0012)                            */
/* -------------------------------------------------------------------------- */
/*
 * The section sits above the trend list. It iterates the most recent panel's
 * results and asks the projection module for a band per marker; markers
 * without a curated `responsiveness` entry produce no band and don't show
 * up at all. Markers that DO have a curated entry but whose adherence is
 * below the threshold render the editorial empty-state card so the user
 * sees an honest "hold the easy tier" message instead of a fake number.
 *
 * Post-upload evaluation: when a snapshot is persisted against the PRIOR
 * latest panel (saved by labs.ts on a successful new-panel insert), we
 * surface an `.projection-eval` row using the snapshot's band vs the value
 * that just arrived. This replaces the projection card for that marker on
 * the same render — the snapshot IS the evaluation.
 */

interface ProjectionItem {
  marker: MarkerDef;
  result: Result;
  drawnAt: string;
  /** Present when the snapshot persisted against the prior panel has been
   *  evaluated against a newly-arrived panel value. */
  evaluation?: {
    snapshot: ProjectionSnapshot;
    currentValue: number;
    verdict: LandedVerdict;
  };
  /** Present when there is no evaluation AND the projection math returned
   *  a band. Null branch means "adherence below threshold". */
  band?: ProjectionBand | null;
}

async function buildProjectionItems(
  orderedPanels: Panel[],
  checkins14d: CheckIn[],
  plan: Plan | undefined,
): Promise<ProjectionItem[]> {
  const newest = orderedPanels[orderedPanels.length - 1];
  if (!newest) return [];
  // Prior panel — needed to surface evaluation rows for snapshots that were
  // persisted at the moment THIS newest panel was uploaded. Snapshots are
  // keyed by the PRIOR panel's id (the panel they were computed FROM).
  const prior = orderedPanels.length >= 2
    ? orderedPanels[orderedPanels.length - 2]
    : undefined;
  const evaluations = prior
    ? await getProjectionsFor(prior.id!)
    : [];
  const evalsByKey = new Map<string, ProjectionSnapshot>();
  for (const e of evaluations) evalsByKey.set(e.markerKey, e);

  const items: ProjectionItem[] = [];
  for (const r of newest.results) {
    const marker = findMarker(r.markerKey);
    if (!marker?.responsiveness) continue;

    // If we have a snapshot for the prior panel + a value for this marker
    // on the newest panel, this is an evaluation row, not a projection card.
    const snap = evalsByKey.get(r.markerKey);
    if (snap) {
      items.push({
        marker, result: r, drawnAt: newest.drawnAt,
        evaluation: { snapshot: snap, currentValue: r.value, verdict: evaluateLanded(snap, r.value) },
      });
      continue;
    }

    const band = computeProjection(marker, r, checkins14d, plan);
    items.push({ marker, result: r, drawnAt: newest.drawnAt, band });
  }
  return items;
}

function renderProjectionSection(items: ProjectionItem[]): string {
  if (items.length === 0) return "";
  return `
    <section class="projection-section" aria-label="Between draws — what we'd expect">
      <div class="section-mark">Between draws · what we'd expect</div>
      <div class="projection-list">
        ${items.map(renderProjectionItem).join("")}
      </div>
    </section>
  `;
}

function renderProjectionItem(it: ProjectionItem): string {
  if (it.evaluation) return renderEvaluationRow(it);
  return renderProjectionCard(it);
}

function renderProjectionCard(it: ProjectionItem): string {
  const m = it.marker;
  const name = m.shortName ?? m.name;
  const r = m.responsiveness!;
  const weeks = `${r.weeksToEffect[0]}–${r.weeksToEffect[1]} weeks`;

  if (!it.band) {
    // Adherence below threshold — render the editorial empty state.
    return `
      <button class="projection-card projection-card--empty"
              type="button"
              data-marker-key="${esc(m.key)}"
              data-state="empty"
              aria-label="${esc(name)} — not enough adherence to project yet">
        <header class="projection-card__head">
          <div class="projection-card__name">${esc(name)}</div>
          <div class="projection-card__latest">
            <span class="projection-card__num">${esc(formatValue(it.result.value))}</span>
            <span class="projection-card__unit">${esc(it.result.unit)}</span>
            <span class="projection-card__date">${esc(it.drawnAt)}</span>
          </div>
        </header>
        <p class="projection-card__band-note">
          Hold the easy tier for 7 of 14 days to start projecting where this marker lands.
        </p>
        <p class="projection-card__weeks">Typically moves over ${esc(weeks)}.</p>
      </button>
    `;
  }

  const b = it.band;
  const therm = thermometer({
    marker: m, value: it.result.value, height: 44,
    projectionBand: { low: b.low, high: b.high },
  });
  return `
    <button class="projection-card"
            type="button"
            data-marker-key="${esc(m.key)}"
            data-state="ok"
            aria-label="${esc(name)} — projected range for next draw">
      <header class="projection-card__head">
        <div class="projection-card__name">${esc(name)}</div>
        <div class="projection-card__latest">
          <span class="projection-card__num">${esc(formatValue(it.result.value))}</span>
          <span class="projection-card__unit">${esc(it.result.unit)}</span>
          <span class="projection-card__date">${esc(it.drawnAt)}</span>
        </div>
      </header>
      <div class="projection-card__therm">${therm}</div>
      <p class="projection-card__band-note">
        Holding the <strong>${esc(b.tier)}</strong> tier ·
        <span class="projection-card__tally">${b.daysHeld} of ${b.daysPossible} habit-days</span> ·
        likely range at your next draw <strong>${esc(formatValue(b.low))}–${esc(formatValue(b.high))} ${esc(it.result.unit)}</strong>.
      </p>
      <p class="projection-card__weeks">Typically moves over ${esc(weeks)}.</p>
    </button>
  `;
}

function renderEvaluationRow(it: ProjectionItem): string {
  const m = it.marker;
  const name = m.shortName ?? m.name;
  const e = it.evaluation!;
  const verdictClass =
    e.verdict === "in-range"   ? "projection-eval--in-range" :
    e.verdict === "under-range" ? "projection-eval--under"    :
                                  "projection-eval--over";
  const verdictText =
    e.verdict === "in-range"   ? "within range" :
    e.verdict === "under-range" ? "under range; consider what slipped" :
                                  "over range; the move overshot";
  return `
    <article class="projection-eval ${verdictClass}" data-marker-key="${esc(m.key)}">
      <header class="projection-card__head">
        <div class="projection-card__name">${esc(name)}</div>
        <div class="projection-card__latest">
          <span class="projection-card__num">${esc(formatValue(e.currentValue))}</span>
          <span class="projection-card__unit">${esc(it.result.unit)}</span>
          <span class="projection-card__date">${esc(it.drawnAt)}</span>
        </div>
      </header>
      <p class="projection-card__band-note">
        Projected <strong>${esc(formatValue(e.snapshot.low))}–${esc(formatValue(e.snapshot.high))} ${esc(it.result.unit)}</strong>.
        Landed at <strong>${esc(formatValue(e.currentValue))} ${esc(it.result.unit)}</strong>
        — <em>${esc(verdictText)}</em>.
      </p>
    </article>
  `;
}

function wireProjectionCards(items: ProjectionItem[]): void {
  // Only the .projection-card button (not the .projection-eval row) opens
  // a slideover — the evaluation row is its own self-contained statement.
  const byKey = new Map<string, ProjectionItem>();
  for (const it of items) byKey.set(it.marker.key, it);

  const section = document.querySelector(".projection-section");
  if (!section) return;
  section.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>(".projection-card");
    if (!btn) return;
    const key = btn.dataset.markerKey;
    if (!key) return;
    const it = byKey.get(key);
    if (!it) return;
    openSlideover(renderProjectionSlideoverHtml(it), {
      label: `${it.marker.name} — projection evidence`,
      returnFocusTo: btn,
    });
  });
}

function renderProjectionSlideoverHtml(it: ProjectionItem): string {
  const m = it.marker;
  const r = m.responsiveness!;
  const weeks = `${r.weeksToEffect[0]}–${r.weeksToEffect[1]} weeks`;
  const dirCopy =
    r.direction === "increase" ? `expects ${esc(m.name)} to rise by ${r.magnitude.low}–${r.magnitude.high} ${esc(r.magnitude.unit ?? m.unit)} over ${weeks} on a sustained tier`
  : r.direction === "decrease" ? `expects ${esc(m.name)} to fall by ${r.magnitude.low}–${r.magnitude.high} ${esc(r.magnitude.unit ?? m.unit)} over ${weeks} on a sustained tier`
  :                              `expects ${esc(m.name)} to move ${r.magnitude.low}–${r.magnitude.high} ${esc(r.magnitude.unit ?? m.unit)} toward the optimum over ${weeks} on a sustained tier`;

  if (!it.band) {
    // Empty branch — no band, the slideover surfaces the rule and the
    // editorial "hold the easy tier" instruction.
    return `
      <div class="slideover__sections">
        <section class="slideover__section">
          <div class="slideover__heading">Marker</div>
          <div class="slideover__marker-name">${esc(m.name)}</div>
          <p class="slideover__marker-desc">${esc(m.description)}</p>
        </section>
        <section class="slideover__section">
          <div class="slideover__heading">Why no band yet</div>
          <p>
            Hold the easy tier for 7 of 14 days to start projecting where
            this marker lands. Below that, the projection would be wishful;
            we'd rather show nothing than a number we don't trust.
          </p>
        </section>
        <section class="slideover__section">
          <div class="slideover__heading">Time-to-effect citation</div>
          <p>Common functional-medicine practice ${dirCopy}.</p>
        </section>
        <section class="slideover__section">
          <p style="font-style: italic; color: var(--ink-soft); margin: 0;">
            This is a plausible range, not a prediction. Your next draw is the only ground truth.
          </p>
        </section>
      </div>
    `;
  }

  const b = it.band;
  return `
    <div class="slideover__sections">
      <section class="slideover__section">
        <div class="slideover__heading">Marker</div>
        <div class="slideover__marker-name">${esc(m.name)}</div>
        <p class="slideover__marker-desc">${esc(m.description)}</p>
      </section>
      <section class="slideover__section">
        <div class="slideover__heading">What you've been holding</div>
        <p>
          You've held the <strong>${esc(b.tier)}</strong> tier of your habit stack —
          <strong>${b.daysHeld} of ${b.daysPossible} habit-days held</strong>
          (last 14 days, of ${b.daysPossible} possible).
        </p>
      </section>
      <section class="slideover__section">
        <div class="slideover__heading">Time-to-effect citation</div>
        <p>Common functional-medicine practice ${dirCopy}.</p>
        <p>
          Latest reading: <strong>${esc(formatValue(it.result.value))} ${esc(it.result.unit)}</strong>
          drawn ${esc(it.drawnAt)}. Projected band for the next draw:
          <strong>${esc(formatValue(b.low))}–${esc(formatValue(b.high))} ${esc(it.result.unit)}</strong>
          over the next ${esc(weeks)}.
        </p>
      </section>
      <section class="slideover__section">
        <p style="font-style: italic; color: var(--ink-soft); margin: 0;">
          This is a plausible range, not a prediction. Your next draw is the only ground truth.
        </p>
      </section>
    </div>
  `;
}

// quiet linting — allow MarkerDef import in case we extend
void undefined as unknown as MarkerDef;

// Reusable SVG visualizations for the dashboard view.
//
// Three primitives:
//   - thermometer(): a horizontal scale with lab band + functional band +
//                    current value dot. Used inside insight cards.
//   - sparkline():   N-point line over a marker's history with the
//                    functional range as a band behind it.
//   - ring():        circular progress ring (0..1). Used for habit cards.

import type { MarkerDef } from "./types";

export interface ThermPoint {
  value: number;
  drawnAt?: string;
}

/**
 * Horizontal "thermometer" showing where a value sits relative to its lab
 * and functional ranges. Renders into a fixed viewBox for crisp scaling.
 */
export function thermometer(opts: {
  marker: MarkerDef;
  value: number;
  width?: number;
  height?: number;
}): string {
  const w = opts.width ?? 320;
  const h = opts.height ?? 44;
  const m = opts.marker;

  // Determine the scale: span every bound + value, with 12% padding either side.
  const refs: number[] = [opts.value];
  if (m.labRange?.low  != null) refs.push(m.labRange.low);
  if (m.labRange?.high != null) refs.push(m.labRange.high);
  if (m.optimalRange.low  != null) refs.push(m.optimalRange.low);
  if (m.optimalRange.high != null) refs.push(m.optimalRange.high);

  const min = Math.min(...refs);
  const max = Math.max(...refs);
  const span = (max - min) || Math.max(Math.abs(max), 1) * 0.5;
  const pad = span * 0.12;
  const sMin = min - pad;
  const sMax = max + pad;
  const xFor = (v: number) => ((v - sMin) / (sMax - sMin)) * w;

  const trackY = h / 2 - 1;
  const trackH = 2;

  // Background scale rule.
  const track = `<rect x="0" y="${trackY}" width="${w}" height="${trackH}" fill="var(--rule)" />`;

  // Lab range — wide light band.
  const labBar = (m.labRange?.low != null && m.labRange?.high != null)
    ? `<rect x="${xFor(m.labRange.low)}" y="${h/2 - 8}"
             width="${xFor(m.labRange.high) - xFor(m.labRange.low)}"
             height="16" fill="rgba(26,24,20,0.06)" />`
    : "";

  // Functional / optimal range — tighter, oxblood-tinted band.
  const optLow  = m.optimalRange.low  ?? sMin;
  const optHigh = m.optimalRange.high ?? sMax;
  const optBar = `<rect x="${xFor(optLow)}" y="${h/2 - 8}"
                    width="${Math.max(2, xFor(optHigh) - xFor(optLow))}"
                    height="16" fill="rgba(47,74,46,0.22)" />`;

  // Current value indicator: tick + filled dot + label below.
  const vx = Math.max(8, Math.min(w - 8, xFor(opts.value)));
  const tick = `<line x1="${vx}" x2="${vx}" y1="${h/2 - 12}" y2="${h/2 + 12}" stroke="var(--ink)" stroke-width="1.4" />`;
  const dot  = `<circle cx="${vx}" cy="${h/2}" r="4.5" fill="var(--ink)" />`;

  // Tick labels at the bounds (small, faint).
  const tickLabel = (x: number, text: string) =>
    `<text x="${x.toFixed(1)}" y="${h - 1}" text-anchor="middle"
       font-family="var(--mono)" font-size="9" fill="var(--ink-faint)">${text}</text>`;

  const labels: string[] = [];
  if (m.labRange?.low  != null) labels.push(tickLabel(xFor(m.labRange.low),  String(m.labRange.low)));
  if (m.labRange?.high != null) labels.push(tickLabel(xFor(m.labRange.high), String(m.labRange.high)));

  return `
    <svg class="therm" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      ${labBar}
      ${optBar}
      ${track}
      ${labels.join("")}
      ${tick}
      ${dot}
    </svg>
  `;
}

/**
 * Compact line sparkline with the functional range as a band behind it.
 * Returns an SVG string sized to ~140×34 by default.
 */
export function sparkline(opts: {
  marker: MarkerDef;
  points: ThermPoint[];
  width?: number;
  height?: number;
}): string {
  const w = opts.width  ?? 140;
  const h = opts.height ?? 34;
  const pad = 3;

  const values = opts.points.map(p => p.value);
  if (values.length === 0) {
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"></svg>`;
  }

  const opt = opts.marker.optimalRange ?? {};
  const lab = opts.marker.labRange ?? {};
  const candidates = [
    ...values,
    opt.low, opt.high, lab.low, lab.high,
  ].filter((v): v is number => typeof v === "number");
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = (max - min) || 1;

  const xFor = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
  const yFor = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);

  const bandLow  = opt.low  ?? min;
  const bandHigh = opt.high ?? max;
  const bandY1 = yFor(bandHigh);
  const bandY2 = yFor(bandLow);
  const bandH  = Math.max(1, bandY2 - bandY1);

  const path = values.map((v, i) =>
    `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`,
  ).join(" ");
  const dots = values.map((v, i) =>
    `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="1.6" fill="var(--ink)" />`,
  ).join("");

  return `
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="${bandY1.toFixed(1)}" width="${w}" height="${bandH.toFixed(1)}" fill="rgba(47,74,46,0.16)" />
      <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="1.4" />
      ${dots}
    </svg>
  `;
}

/**
 * Circular progress ring 0..1. Used for habit completion visualizations.
 * The ring is stroked oxblood when filled, faint when empty.
 */
export function ring(opts: { value: number; size?: number; label?: string }): string {
  const size  = opts.size ?? 56;
  const r     = size / 2 - 4;
  const cx    = size / 2;
  const cy    = size / 2;
  const circ  = 2 * Math.PI * r;
  const fill  = Math.max(0, Math.min(1, opts.value));
  const dash  = (fill * circ).toFixed(1);
  const rest  = (circ - fill * circ).toFixed(1);

  const labelEl = opts.label
    ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle"
            font-family="var(--display)" font-size="${(size * 0.34).toFixed(0)}"
            fill="var(--ink)">${opts.label}</text>`
    : "";

  return `
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--rule)" stroke-width="3" />
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
              stroke="var(--oxblood)" stroke-width="3"
              stroke-dasharray="${dash} ${rest}"
              stroke-linecap="round"
              transform="rotate(-90 ${cx} ${cy})" />
      ${labelEl}
    </svg>
  `;
}

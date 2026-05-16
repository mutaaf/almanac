// Marker hero share card (ticket 0011).
//
// A single 1080×1920 PNG of ONE marker's two-draw delta — name, earlier and
// later values, the functional/lab range as a horizontal band with two filled
// dots, the delta + percent, the long-form draw dates, and a small "Almanac"
// wordmark in the corner. The card is the artifact users actually post on
// social — the comparison view is for reading, the PDF (ticket 0010) is for
// the doctor, this is for Stories / Reddit / iMessage / Twitter.
//
// The card carries no profile data, no API key, no other marker, no URL,
// and no QR code. The function signature deliberately does NOT take a
// Profile — the typecheck is the contract that we never even SEE the user's
// display name on this code path. Only what the row + the marker carry is
// drawn.
//
// We draw via canvas 2D. No new dependencies — `html2canvas` and
// `dom-to-image` are explicitly out per the ticket. The layout is six
// elements; a hundred-odd lines of straight `fillText` / `fillRect` /
// rounded-rect math is the right shape here.

import type { MarkerDef } from "../types";
import type { ComparisonRow } from "../progress/compare";

/* -------------------------------------------------------------------------- */
/*  Layout constants                                                          */
/* -------------------------------------------------------------------------- */

const W = 1080;
const H = 1920;

// Editorial palette mirrors --paper / --ink / --ink-soft / --ink-faint /
// --rule / --oxblood from styles.css. Centralised here so the card stays
// consistent with the rest of the app even though it's pixel-rendered.
const PALETTE = {
  paper:     "#F5F1E8",
  paperDeep: "#ECE6D5",
  ink:       "#1A1814",
  inkSoft:   "#4A453C",
  inkFaint:  "#8C8473",
  rule:      "#C9BEA0",
  oxblood:   "#7A1F2B",
  evergreen: "#2F4A2E",
};

const DISPLAY_FONT = "Cormorant Garamond, EB Garamond, Georgia, serif";
const BODY_FONT    = "Inter Tight, -apple-system, BlinkMacSystemFont, sans-serif";
const MONO_FONT    = "JetBrains Mono, ui-monospace, SF Mono, monospace";

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Build the 1080×1920 PNG blob for one comparison row. The card draws only
 * what the row + the marker provides — no profile, no key, no other marker,
 * no URL. The signature is the contract.
 *
 * `earlierDate` / `laterDate` are ISO date strings (YYYY-MM-DD) — we own
 * the long-form formatting in this module.
 */
export async function generateMarkerCardPng(
  row: ComparisonRow,
  marker: MarkerDef,
  earlierDate: string,
  laterDate: string,
): Promise<Blob> {
  // Wait for the editorial display + body fonts to actually be loaded before
  // drawing — otherwise Cormorant Garamond / Inter Tight fall back to the
  // platform serif/sans mid-render and the card ships with the wrong type.
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch { /* non-fatal */ }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2D context unavailable");

  drawCard(ctx, row, marker, earlierDate, laterDate);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("canvas.toBlob returned null")),
      "image/png",
    );
  });
}

/**
 * Filename: `almanac-<markerKey>-<laterDateIso>.png`. Per the ticket.
 */
export function markerCardFilename(markerKey: string, laterDateIso: string): string {
  return `almanac-${markerKey}-${laterDateIso}.png`;
}

/**
 * Hand the blob to the OS share sheet when `navigator.canShare({ files })`
 * is true; otherwise click a hidden `<a download>` so the browser saves the
 * file. Both code paths are on-device — no network, no analytics.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  if (typeof nav.canShare === "function" && nav.canShare({ files: [file] }) && typeof nav.share === "function") {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (err) {
      // The user dismissed the sheet, or the platform rejected silently.
      // Fall through to the download path so they still get the artifact.
      void err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick — Safari needs the URL alive through the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------------- */
/*  Drawing                                                                   */
/* -------------------------------------------------------------------------- */

function drawCard(
  ctx: CanvasRenderingContext2D,
  row: ComparisonRow,
  marker: MarkerDef,
  earlierDate: string,
  laterDate: string,
): void {
  // Page background.
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, W, H);

  // Thin double-rule frame inset, the way a printed almanac page would.
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, W - 120, H - 120);
  ctx.lineWidth = 1;
  ctx.strokeRect(76, 76, W - 152, H - 152);

  // Wordmark — top-left, small. The entire growth ask.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `600 28px ${BODY_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("ALMANAC", 130, 170);

  // Section eyebrow — "MARKER MOVE" — mirrors the editorial section-mark.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 22px ${BODY_FONT}`;
  // Letter-spacing in canvas 2D requires manual layout; the inserted spaces
  // approximate the typographic 0.18em uppercase tracking on .eyebrow.
  ctx.fillText(letterSpace("MARKER MOVE"), 130, 230);

  // Marker name — the headline. Big Cormorant Garamond.
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 96px ${DISPLAY_FONT}`;
  const name = marker.name;
  // Wrap onto two lines if the name is long.
  const wrapped = wrapText(ctx, name, W - 260);
  let y = 340;
  for (const line of wrapped) {
    ctx.fillText(line, 130, y);
    y += 110;
  }

  // Short descriptor (the marker's category-level positioning, e.g. "Lipids ·
  // particle count" derived from the description's first sentence) — quiet
  // line under the headline so the user knows what they're looking at.
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.font = `400 34px ${BODY_FONT}`;
  ctx.fillText(shortDescriptor(marker), 130, y + 12);
  y += 80;

  // Hairline rule.
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(130, y + 30);
  ctx.lineTo(W - 130, y + 30);
  ctx.stroke();

  // Earlier / later values — the central two-number claim.
  const valueY = y + 200;
  drawValuePair(ctx, row, valueY);

  // Functional-range band with two dots — the credibility move.
  const bandY = valueY + 200;
  drawRangeBand(ctx, row, marker, bandY);

  // Delta line — "↓ 17 · −17.9%" in oxblood-or-evergreen depending on
  // direction-of-improvement (using marker.higherIsBetter to flip the sign).
  const deltaY = bandY + 220;
  drawDelta(ctx, row, marker, deltaY);

  // Dates: long-form, "March 4 → October 4, 2026".
  const datesY = deltaY + 130;
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.font = `400 42px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(longDateRange(earlierDate, laterDate), W / 2, datesY);

  // Eyebrow word: "improved" / "regressed" / suppressed.
  if (row.crossing) {
    ctx.fillStyle = row.crossing === "improved" ? PALETTE.evergreen : PALETTE.oxblood;
    ctx.font = `600 26px ${BODY_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(letterSpace(row.crossing.toUpperCase()), W / 2, datesY + 80);
  }

  // Foot rule: small Roman numeral page-number stand-in, like the section foots.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 22px ${BODY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("·  i  ·", W / 2, H - 130);
}

function drawValuePair(
  ctx: CanvasRenderingContext2D,
  row: ComparisonRow,
  y: number,
): void {
  // Earlier value on the left half, later value on the right half. Mono
  // numerals for the values, body type for the unit + tiny "earlier" /
  // "later" caption above.
  const halfW = W / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Captions.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 22px ${BODY_FONT}`;
  ctx.fillText(letterSpace("EARLIER"), halfW * 0.5, y - 80);
  ctx.fillText(letterSpace("LATER"),   halfW * 1.5, y - 80);

  // Values.
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 140px ${MONO_FONT}`;
  ctx.fillText(formatValue(row.earlier), halfW * 0.5, y);
  ctx.fillText(formatValue(row.later),   halfW * 1.5, y);

  // Unit captions.
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.font = `400 32px ${BODY_FONT}`;
  ctx.fillText(row.unit, halfW * 0.5, y + 50);
  ctx.fillText(row.unit, halfW * 1.5, y + 50);
}

function drawRangeBand(
  ctx: CanvasRenderingContext2D,
  row: ComparisonRow,
  marker: MarkerDef,
  y: number,
): void {
  // Re-use the same scale logic as `thermometer()` in viz.ts: pick refs from
  // every defined bound + both values, span with 12% padding either side.
  // The band falls back to the lab range when no optimal range is defined,
  // mirroring the ticket's "lab-range-only fallback" path.
  const opt = marker.optimalRange ?? {};
  const lab = marker.labRange     ?? {};
  const hasOptimum = opt.low != null || opt.high != null;

  const refs: number[] = [row.earlier, row.later];
  if (lab.low  != null) refs.push(lab.low);
  if (lab.high != null) refs.push(lab.high);
  if (opt.low  != null) refs.push(opt.low);
  if (opt.high != null) refs.push(opt.high);

  const min = Math.min(...refs);
  const max = Math.max(...refs);
  const span = (max - min) || Math.max(Math.abs(max), 1) * 0.5;
  const pad = span * 0.12;
  const sMin = min - pad;
  const sMax = max + pad;
  const xFor = (v: number) => 130 + ((v - sMin) / (sMax - sMin)) * (W - 260);

  const trackY = y;
  const trackH = 12;

  // Background track (rule color).
  roundedRect(ctx, 130, trackY - trackH / 2, W - 260, trackH, 6);
  ctx.fillStyle = PALETTE.paperDeep;
  ctx.fill();

  // Lab band (wider, very faint).
  if (lab.low != null && lab.high != null) {
    const x1 = xFor(lab.low);
    const x2 = xFor(lab.high);
    roundedRect(ctx, x1, trackY - 26, x2 - x1, 52, 8);
    ctx.fillStyle = "rgba(26,24,20,0.06)";
    ctx.fill();
  }

  // Optimal band (tighter, evergreen-tinted) — only when the marker has an
  // optimal range defined. Otherwise the lab band IS the band.
  if (hasOptimum) {
    const oLow  = opt.low  ?? sMin;
    const oHigh = opt.high ?? sMax;
    const x1 = xFor(oLow);
    const x2 = xFor(oHigh);
    roundedRect(ctx, x1, trackY - 26, Math.max(2, x2 - x1), 52, 8);
    ctx.fillStyle = "rgba(47,74,46,0.22)";
    ctx.fill();
  }

  // Two filled dots: earlier (faint) and later (ink).
  const ex = xFor(row.earlier);
  const lx = xFor(row.later);

  // Earlier: hollow with ink-faint stroke.
  ctx.beginPath();
  ctx.arc(ex, trackY, 22, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.paper;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.inkFaint;
  ctx.stroke();

  // Later: filled ink.
  ctx.beginPath();
  ctx.arc(lx, trackY, 24, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.ink;
  ctx.fill();

  // Connecting arrow line (subtle).
  ctx.strokeStyle = PALETTE.inkFaint;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Draw above the dots so it reads as a "move" rather than crossing them.
  const arrowY = trackY - 60;
  ctx.moveTo(ex, arrowY);
  ctx.lineTo(lx, arrowY);
  ctx.stroke();
  // Arrowhead.
  const headDir = lx >= ex ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(lx, arrowY);
  ctx.lineTo(lx - 12 * headDir, arrowY - 8);
  ctx.lineTo(lx - 12 * headDir, arrowY + 8);
  ctx.closePath();
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.fill();
}

function drawDelta(
  ctx: CanvasRenderingContext2D,
  row: ComparisonRow,
  marker: MarkerDef,
  y: number,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Color the delta based on the *direction-of-improvement*: down is good
  // for most markers (LDL, ApoB, triglycerides), but up is good for HDL,
  // eGFR, omega-3 index, etc. `marker.higherIsBetter` flips the read.
  const good = isMoveGood(row, marker);
  ctx.fillStyle = good == null
    ? PALETTE.inkSoft
    : good
      ? PALETTE.evergreen
      : PALETTE.oxblood;

  ctx.font = `400 88px ${DISPLAY_FONT}`;
  const arrow = row.arrow;
  const deltaTxt = formatDelta(row.delta);
  const pctTxt = formatPct(row.pctChange);
  ctx.fillText(`${arrow}  ${deltaTxt} ${row.unit}  ·  ${pctTxt}`, W / 2, y);
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Insert a hair-space between letters to approximate uppercase tracking. */
function letterSpace(s: string): string {
  // U+2009 thin space; close enough to the editorial 0.18em tracking when
  // the type is uppercase-only. Pure visual; the underlying string the test
  // greps for is unaffected because the test asserts the binary PNG bytes,
  // not a DOM read.
  return s.split("").join(" ");
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const probe = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(probe).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = probe;
    }
  }
  if (cur) lines.push(cur);
  // Cap at two lines — beyond that the marker name is genuinely too long
  // and we elide rather than letting the layout reflow off the card.
  if (lines.length > 2) {
    return [lines[0]!, `${lines[1]!}…`];
  }
  return lines;
}

function shortDescriptor(marker: MarkerDef): string {
  // The marker's description is a single editorial sentence; pull the first
  // clause as the short label so the card has a quiet subtitle without
  // dumping the whole paragraph.
  const head = (marker.description ?? "").split(/[.;]/)[0]?.trim() ?? "";
  if (!head) return marker.category;
  return `${marker.category}  ·  ${head}`;
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
}

function formatDelta(d: number): string {
  if (d === 0) return "0";
  const sign = d > 0 ? "+" : "−";  // U+2212 minus
  const abs  = Math.abs(d);
  return `${sign}${abs.toFixed(Math.abs(d) < 1 ? 2 : 1).replace(/^/, "")}`;
}

function formatPct(p: number): string {
  if (p === 0) return "0.0%";
  const sign = p > 0 ? "+" : "−";
  return `${sign}${Math.abs(p).toFixed(1)}%`;
}

function isMoveGood(row: ComparisonRow, marker: MarkerDef): boolean | null {
  if (row.delta === 0) return null;
  // If the marker reasoning is "higher is better", an upward move is good.
  if (marker.higherIsBetter === true)  return row.delta > 0;
  if (marker.higherIsBetter === false) return row.delta < 0;

  // Otherwise default to "closer to the optimal range is good", which is what
  // the trend renderer does in pages/progress.ts. When there is no optimal
  // range to reason against, return null and we'll render the delta in
  // neutral ink-soft.
  const opt = marker.optimalRange;
  if (!opt || (opt.low == null && opt.high == null)) return null;
  const distEarlier = distanceToRange(row.earlier, opt);
  const distLater   = distanceToRange(row.later,   opt);
  if (distLater < distEarlier) return true;
  if (distLater > distEarlier) return false;
  return null;
}

function distanceToRange(v: number, r: { low?: number; high?: number }): number {
  if (r.low  != null && v < r.low)  return r.low - v;
  if (r.high != null && v > r.high) return v - r.high;
  return 0;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  // Hand-drawn rounded-rect path — Path2D works in our targets, but the
  // straight beginPath/moveTo/arcTo sequence is the simplest portable form
  // and is what the ticket called out.
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Long-form date range, e.g. "March 4 → October 4, 2026". Both ends are in
 * the same year when the years agree; otherwise both years are spelled out
 * to keep the read unambiguous.
 */
function longDateRange(earlierIso: string, laterIso: string): string {
  const e = parseIsoDate(earlierIso);
  const l = parseIsoDate(laterIso);
  if (!e || !l) return `${earlierIso}  →  ${laterIso}`;
  const sameYear = e.getUTCFullYear() === l.getUTCFullYear();
  const left  = sameYear
    ? formatMonthDay(e)
    : `${formatMonthDay(e)}, ${e.getUTCFullYear()}`;
  const right = `${formatMonthDay(l)}, ${l.getUTCFullYear()}`;
  return `${left}  →  ${right}`;
}

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonthDay(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

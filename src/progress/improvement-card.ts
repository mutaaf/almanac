// The improvement card render (ticket 0047).
//
// A single portrait PNG (default 1080×1920) of the user's MOST-IMPROVED marker
// over time: an "Almanac" wordmark, the marker name, the start value + start
// month, the now value + now month, a one-line plain move ("32 → 48 ng/mL ·
// now in range" when the move crossed into the optimum, else "32 → 48 ng/mL"),
// and a sparkline with the functional-range band behind it.
//
// This is a SECOND LAYOUT on the same proven mechanism the marker-hero card
// (0011) established — canvas 2D, the editorial palette + fonts, fonts.ready
// await before drawing, `canvas.toBlob`, and the OS-share-or-download path. We
// import 0011's `PALETTE` / font constants would mean exporting them; instead
// we mirror the same token values inline (0011 keeps them module-private) and
// REUSE its `shareOrDownload` verbatim so there is exactly one download path in
// the app. The card carries no profile field, no API key, no URL, no QR code —
// the wordmark is the only attribution, exactly as 0011's card.

import type { Day } from "../types";
import type { ImprovedMarker } from "./most-improved";
import { findMarker } from "../data/markers";
import { shareOrDownload } from "../share/marker-card";

/* -------------------------------------------------------------------------- */
/*  Tokens — mirror 0011's marker-card constants (kept private there)          */
/* -------------------------------------------------------------------------- */

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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* -------------------------------------------------------------------------- */
/*  Composed text — the deterministic, render-independent copy                 */
/* -------------------------------------------------------------------------- */

export interface ImprovementText {
  /** Always "Almanac" — the only attribution, no URL. */
  wordmark: string;
  /** Human marker name, e.g. "Ferritin" / "ApoB". */
  markerName: string;
  /** Start value + unit + long month, e.g. "32 ng/mL · February". */
  startLine: string;
  /** Now value + unit + long month, e.g. "48 ng/mL · May". */
  nowLine: string;
  /** The one-line move: "32 → 48 ng/mL" (+ " · now in range" when crossed). */
  moveLine: string;
}

/**
 * Compose the card's deterministic text from the selected marker. Pure: no
 * canvas, no Dexie, no network. The card draws exactly these strings; the spec
 * greps them for the wordmark, the start/now/units/months, the correct move
 * direction, and the absence of any URL or the API key (which this function
 * never receives — its only input is the marker selection).
 */
export function composeImprovementText(improved: ImprovedMarker): ImprovementText {
  const startMonth = monthName(improved.startDay);
  const nowMonth   = monthName(improved.nowDay);
  const move = `${formatValue(improved.startValue)} → ${formatValue(improved.nowValue)} ${improved.unit}`;
  return {
    wordmark: "Almanac",
    markerName: improved.name,
    startLine: `${formatValue(improved.startValue)} ${improved.unit} · ${startMonth}`,
    nowLine:   `${formatValue(improved.nowValue)} ${improved.unit} · ${nowMonth}`,
    moveLine:  improved.movedIntoRange ? `${move} · now in range` : move,
  };
}

/**
 * Filename: `<slug(ownerName)>-improvement.png`, falling back to
 * `almanac-improvement.png` when the slug is empty. Mirrors 0011's
 * `markerCardFilename` shape (a single deterministic kebab name).
 */
export function improvementCardFilename(ownerName: string): string {
  const slug = slugify(ownerName);
  return slug ? `${slug}-improvement.png` : "almanac-improvement.png";
}

/* -------------------------------------------------------------------------- */
/*  Render                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build the portrait PNG blob for one most-improved marker. Pure render: no
 * Dexie, no network. The fonts are awaited (already-loaded — no new fetch)
 * exactly as 0011 does so the editorial type isn't replaced by a fallback
 * mid-render.
 */
export async function renderImprovementCard(
  improved: ImprovedMarker,
  opts: { width: number; height: number },
): Promise<Blob> {
  if (typeof document !== "undefined" && (document as any).fonts?.ready) {
    try { await (document as any).fonts.ready; } catch { /* non-fatal */ }
  }

  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2D context unavailable");

  drawCard(ctx, improved, opts.width, opts.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("canvas.toBlob returned null")),
      "image/png",
    );
  });
}

/**
 * Render the card and ship it via the OS share sheet or a `<a download>`
 * fallback — the SAME `shareOrDownload` 0011's compare-view chip uses, so the
 * app has exactly one download path. `ownerName` only sets the filename; it is
 * never drawn on the card (the card carries no profile data).
 */
export async function saveImprovementCard(
  improved: ImprovedMarker,
  ownerName: string,
  opts: { width: number; height: number } = { width: 1080, height: 1920 },
): Promise<void> {
  const blob = await renderImprovementCard(improved, opts);
  await shareOrDownload(blob, improvementCardFilename(ownerName));
}

/* -------------------------------------------------------------------------- */
/*  Drawing                                                                    */
/* -------------------------------------------------------------------------- */

function drawCard(
  ctx: CanvasRenderingContext2D,
  improved: ImprovedMarker,
  W: number,
  H: number,
): void {
  const text = composeImprovementText(improved);

  // Page background.
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, W, H);

  // Thin double-rule frame, the way a printed almanac page would.
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, W - 120, H - 120);
  ctx.lineWidth = 1;
  ctx.strokeRect(76, 76, W - 152, H - 152);

  // Wordmark — top-left, small. The entire growth ask; no URL.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `600 28px ${BODY_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text.wordmark.toUpperCase(), 130, 170);

  // Section eyebrow — "THE IMPROVEMENT" — mirrors the editorial section-mark.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 22px ${BODY_FONT}`;
  ctx.fillText(letterSpace("THE IMPROVEMENT"), 130, 230);

  // Marker name — the headline. Big Cormorant Garamond.
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 100px ${DISPLAY_FONT}`;
  const wrapped = wrapText(ctx, text.markerName, W - 260);
  let y = 360;
  for (const line of wrapped) {
    ctx.fillText(line, 130, y);
    y += 112;
  }

  // Hairline rule under the headline.
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(130, y);
  ctx.lineTo(W - 130, y);
  ctx.stroke();

  // Start / now value pair — the central two-number claim, with the month
  // captioned under each.
  const valueY = y + 220;
  drawValuePair(ctx, improved, valueY, W);

  // The plain move line, in oxblood when the move crossed into range (the one
  // sparing accent), else ink-soft.
  const moveY = valueY + 150;
  ctx.fillStyle = improved.movedIntoRange ? PALETTE.oxblood : PALETTE.inkSoft;
  ctx.font = `400 64px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(text.moveLine, W / 2, moveY);

  // Sparkline with the functional-range band behind it — the credibility move.
  // Reuse the same series + band math as src/viz.ts sparkline(), drawn on the
  // card canvas (the viz helper renders SVG; we draw the identical geometry).
  const sparkY = moveY + 120;
  const sparkH = 360;
  drawSparkline(ctx, improved, 130, sparkY, W - 260, sparkH);

  // Foot rule: small Roman numeral page-number stand-in, like the section foots.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 22px ${BODY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("·  i  ·", W / 2, H - 130);
}

function drawValuePair(
  ctx: CanvasRenderingContext2D,
  improved: ImprovedMarker,
  y: number,
  W: number,
): void {
  const halfW = W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Captions: the long month each value was drawn.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 24px ${BODY_FONT}`;
  ctx.fillText(letterSpace(monthName(improved.startDay).toUpperCase()), halfW * 0.5, y - 90);
  ctx.fillText(letterSpace(monthName(improved.nowDay).toUpperCase()),   halfW * 1.5, y - 90);

  // Values — mono numerals, the way the trend reads.
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 150px ${MONO_FONT}`;
  ctx.fillText(formatValue(improved.startValue), halfW * 0.5, y);
  ctx.fillText(formatValue(improved.nowValue),   halfW * 1.5, y);

  // Unit captions under each value.
  ctx.fillStyle = PALETTE.inkSoft;
  ctx.font = `400 34px ${BODY_FONT}`;
  ctx.fillText(improved.unit, halfW * 0.5, y + 56);
  ctx.fillText(improved.unit, halfW * 1.5, y + 56);
}

/**
 * Draw the start→now sparkline with the marker's functional-range band behind
 * it. The geometry mirrors `src/viz.ts` sparkline(): span min..max across the
 * two values plus the optimal/lab bounds, draw the optimal band as a
 * horizontal stripe, then the line + endpoint dots. Two points here (start +
 * now) — the same two the value pair shows — so the rising / falling slope
 * reads at a glance.
 */
function drawSparkline(
  ctx: CanvasRenderingContext2D,
  improved: ImprovedMarker,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const marker = findMarker(improved.markerKey);
  const opt = marker?.optimalRange ?? {};
  const lab = marker?.labRange ?? {};
  const values = [improved.startValue, improved.nowValue];

  const candidates = [
    ...values,
    opt.low, opt.high, lab.low, lab.high,
  ].filter((v): v is number => typeof v === "number");
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = (max - min) || 1;
  const pad = 8;

  const xFor = (i: number) => x + pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
  const yFor = (v: number) => y + h - pad - ((v - min) / span) * (h - pad * 2);

  // Background card behind the chart so it reads as its own panel.
  ctx.fillStyle = PALETTE.paperDeep;
  roundedRect(ctx, x, y, w, h, 10);
  ctx.fill();

  // Functional band — evergreen-tinted horizontal stripe, drawn behind the line.
  const bandLow  = opt.low  ?? min;
  const bandHigh = opt.high ?? max;
  const bandY1 = yFor(bandHigh);
  const bandY2 = yFor(bandLow);
  ctx.fillStyle = "rgba(47,74,46,0.20)";
  ctx.fillRect(x, Math.min(bandY1, bandY2), w, Math.max(2, Math.abs(bandY2 - bandY1)));

  // The trend line.
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  values.forEach((v, i) => {
    const px = xFor(i), py = yFor(v);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Endpoint dots: start hollow, now filled — same earlier/later read as 0011.
  const sx = xFor(0), syy = yFor(values[0]!);
  ctx.beginPath();
  ctx.arc(sx, syy, 12, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.paper;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.inkFaint;
  ctx.stroke();

  const nx = xFor(1), nyy = yFor(values[1]!);
  ctx.beginPath();
  ctx.arc(nx, nyy, 14, 0, Math.PI * 2);
  ctx.fillStyle = PALETTE.ink;
  ctx.fill();
}

/* -------------------------------------------------------------------------- */
/*  Helpers (mirror 0011's marker-card helpers)                                */
/* -------------------------------------------------------------------------- */

function letterSpace(s: string): string {
  return s.split("").join(" ");
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
  if (lines.length > 2) return [lines[0]!, `${lines[1]!}…`];
  return lines;
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function monthName(iso: Day): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const mo = Number(m[2]) - 1;
  return MONTHS[mo] ?? iso;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

// The protocol-on-the-fridge card (ticket 0033).
//
// A single portrait PNG (default 1080×1920) of the protocol's GLANCEABLE
// essentials: a dateline header ("Almanac — week of <month day>"), the habit
// stack titles (≤5), the top eat foods with their frequency (≤5), and the top
// avoid items with their swap (≤3). It is the thing a user keeps where they
// look a dozen times a day — the fridge, a lock screen, the household chat —
// instead of the protocol living only inside an app they must remember to open.
//
// This is a SECOND LAYOUT on the same proven mechanism the marker-hero card
// (0011) established and the improvement card (0047) reused: canvas 2D, the
// editorial palette + fonts, `fonts.ready` awaited before drawing (no new font
// fetch — the faces are already loaded by the app shell), `canvas.toBlob`, and
// the ONE OS-share-or-download path the app owns. We REUSE 0011's
// `shareOrDownload` verbatim so there is exactly one download mechanism, and we
// mirror its `PALETTE` / font constants inline (0011 keeps them module-private)
// — no new rendering dependency. The card carries no API key, no labs, no
// insights, no URL, no QR code; the single "Almanac" wordmark is the only
// attribution, exactly as 0011 / 0047's cards.
//
// `ownerName` only sets the filename; nothing about the user's identity is
// drawn on the card. The composed-text function takes a Profile but reads only
// `ownerName` (for the filename) — never the key, never the labs.

import type { Plan, Profile } from "../types";
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
};

const DISPLAY_FONT = "Cormorant Garamond, EB Garamond, Georgia, serif";
const BODY_FONT    = "Inter Tight, -apple-system, BlinkMacSystemFont, sans-serif";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// How many of each section the glanceable card carries. Beyond these, the card
// stops being glanceable — the full plan lives in the app, the printable
// one-pager (0010), and the Markdown export (0027). Per the ticket's anti-goals.
const HABIT_CAP = 5;
const EAT_CAP   = 5;
const AVOID_CAP = 3;

/* -------------------------------------------------------------------------- */
/*  Composed text — the deterministic, render-independent copy                 */
/* -------------------------------------------------------------------------- */

export interface ProtocolCardText {
  /** Always "Almanac" — the only attribution, no URL. */
  wordmark: string;
  /** "Almanac — week of <month day>", e.g. "Almanac — week of May 18". */
  dateline: string;
  /** Habit titles verbatim, capped at the first 5, in stored order. */
  habits: string[];
  /** Eat foods with frequency, e.g. "Fatty fish — 3x per week", capped at 5. */
  eat: string[];
  /** Avoid items with swap ("Industrial seed oils → olive oil"), or the food
   *  name alone when no swap is present, capped at the first 3. */
  avoid: string[];
}

/**
 * Compose the card's deterministic text from the plan. Pure: no canvas, no
 * Dexie, no network. The card draws exactly these strings; the spec greps them
 * for the dateline, the caps, the frequency + swap formatting, the wordmark,
 * the absence of any URL, and the absence of the API key.
 *
 * The profile is read for `ownerName` only (used by the filename, not drawn) —
 * the key and the labs are never touched on this code path, which is the
 * privacy contract for the artifact.
 */
export function composeProtocolCardText(plan: Plan, _profile: Profile): ProtocolCardText {
  void _profile;  // the card draws no profile field — the signature documents that.

  const habits = plan.habitStack.habits
    .slice(0, HABIT_CAP)
    .map(h => h.title.trim())
    .filter(Boolean);

  const eat = plan.eatList
    .slice(0, EAT_CAP)
    .map(e => {
      const food = e.food.trim();
      const freq = e.frequency.trim();
      return freq ? `${food} — ${freq}` : food;
    })
    .filter(Boolean);

  const avoid = plan.avoidList
    .slice(0, AVOID_CAP)
    .map(a => {
      const food = a.food.trim();
      const swap = a.swap?.trim();
      return swap ? `${food} → ${swap}` : food;
    })
    .filter(Boolean);

  return {
    wordmark: "Almanac",
    dateline: `Almanac — week of ${weekOf(plan.generatedAt)}`,
    habits,
    eat,
    avoid,
  };
}

/**
 * Filename: `<slug(ownerName)>-protocol.png`, falling back to
 * `almanac-protocol.png` when the slug is empty. Mirrors 0047's
 * `improvementCardFilename` shape (a single deterministic kebab name).
 */
export function protocolCardFilename(ownerName: string): string {
  const slug = slugify(ownerName);
  return slug ? `${slug}-protocol.png` : "almanac-protocol.png";
}

/* -------------------------------------------------------------------------- */
/*  Render                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Build the portrait PNG blob for one plan. Pure render: no Dexie, no network.
 * The fonts are awaited (already-loaded — no new fetch) exactly as 0011 / 0047
 * do so the editorial type isn't replaced by a fallback mid-render.
 */
export async function renderProtocolCard(
  plan: Plan,
  profile: Profile,
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

  drawCard(ctx, composeProtocolCardText(plan, profile), opts.width, opts.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error("canvas.toBlob returned null")),
      "image/png",
    );
  });
}

/**
 * Render the card and ship it via the OS share sheet or a `<a download>`
 * fallback — the SAME `shareOrDownload` 0011's compare-view chip and 0047's
 * improvement card use, so the app has exactly one download path. `ownerName`
 * only sets the filename; it is never drawn on the card.
 */
export async function saveProtocolCard(
  plan: Plan,
  profile: Profile,
  opts: { width: number; height: number } = { width: 1080, height: 1920 },
): Promise<void> {
  const blob = await renderProtocolCard(plan, profile, opts);
  await shareOrDownload(blob, protocolCardFilename(profile.ownerName));
}

/* -------------------------------------------------------------------------- */
/*  Drawing                                                                    */
/* -------------------------------------------------------------------------- */

function drawCard(
  ctx: CanvasRenderingContext2D,
  text: ProtocolCardText,
  W: number,
  H: number,
): void {
  // Page background.
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, W, H);

  // Thin double-rule frame, the way a printed almanac page would.
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(60, 60, W - 120, H - 120);
  ctx.lineWidth = 1;
  ctx.strokeRect(76, 76, W - 152, H - 152);

  const M = 130;             // text margin inside the frame
  const colW = W - M * 2;    // usable column width

  // Wordmark — top-left, small. The entire growth ask; no URL.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `600 28px ${BODY_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text.wordmark.toUpperCase(), M, 170);

  // Dateline — the headline, Cormorant Garamond. "Almanac — week of May 18".
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 72px ${DISPLAY_FONT}`;
  let y = 280;
  for (const line of wrapText(ctx, text.dateline, colW)) {
    ctx.fillText(line, M, y);
    y += 82;
  }

  // Hairline rule under the headline.
  y += 6;
  hairline(ctx, M, W - M, y);
  y += 70;

  // Section: Habits.
  y = drawSection(ctx, "Habits", text.habits, M, colW, y);
  y += 36;

  // Section: Lean into (the eat list).
  y = drawSection(ctx, "Lean into", text.eat, M, colW, y);
  y += 36;

  // Section: Ease off (the avoid list).
  y = drawSection(ctx, "Ease off", text.avoid, M, colW, y);

  // Foot rule: small Roman numeral page-number stand-in, like the section foots.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 22px ${BODY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("·  i  ·", W / 2, H - 130);
}

/**
 * Draw one labelled section — an uppercase letter-spaced eyebrow, then each item
 * as a wrapped body line with a hanging editorial bullet. Returns the y after
 * the last line so the caller can stack the next section. A section with no
 * items renders only its label (the card never fabricates content).
 */
function drawSection(
  ctx: CanvasRenderingContext2D,
  label: string,
  items: string[],
  x: number,
  colW: number,
  startY: number,
): number {
  let y = startY;

  // Eyebrow.
  ctx.fillStyle = PALETTE.inkFaint;
  ctx.font = `500 26px ${BODY_FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(letterSpace(label.toUpperCase()), x, y);
  y += 58;

  // Body lines.
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `400 44px ${DISPLAY_FONT}`;
  const bulletGap = 44;          // hanging-indent width for the bullet
  const lineH = 60;
  for (const item of items) {
    // Bullet, oxblood — the single sparing accent.
    ctx.fillStyle = PALETTE.oxblood;
    ctx.font = `400 44px ${DISPLAY_FONT}`;
    ctx.fillText("·", x, y);

    // The item, wrapped within the remaining column width, hanging-indented.
    ctx.fillStyle = PALETTE.ink;
    const lines = wrapText(ctx, item, colW - bulletGap);
    for (const line of lines) {
      ctx.fillText(line, x + bulletGap, y);
      y += lineH;
    }
    y += 8;  // a hair of breathing room between items
  }

  return y;
}

/* -------------------------------------------------------------------------- */
/*  Helpers (mirror 0011 / 0047's card helpers)                                */
/* -------------------------------------------------------------------------- */

function hairline(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number): void {
  ctx.strokeStyle = PALETTE.rule;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

/** Insert a hair-space between letters to approximate uppercase tracking. */
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
  // Cap at two lines per item — beyond that the line is genuinely too long for a
  // glanceable card and we elide rather than letting the layout reflow off it.
  if (lines.length > 2) return [lines[0]!, `${lines[1]!}…`];
  return lines;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * "Week of <month day>" from a wall-clock ms timestamp (the plan's
 * `generatedAt`). The card owns the long-form formatting; the plan stores only
 * the epoch ms. Local time — the dateline is the user's own week.
 */
function weekOf(generatedAt: number): string {
  const d = new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return "this week";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

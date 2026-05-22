// Tell a friend — the share-message composer (ticket 0050).
//
// `composeShareMessage(plan, profile, improved)` assembles a pure-ASCII,
// plain-text recommendation a user can send in one tap of the native share
// sheet (or paste from the clipboard). It is built entirely from data already
// on the device:
//
//   - the product wordmark ("Almanac"),
//   - the user's TOP eat-list item + its frequency (`plan.eatList[0]`),
//   - the user's most-improved marker IFF one exists (the optional `improved`
//     selection — reused VERBATIM from 0047's `selectMostImproved`, so the
//     "my ferritin went 32 -> 48" claim is true by construction and is omitted
//     gracefully when there is no favorable move), and
//   - the canonical sample-tour path `#/try` (the route 0040 registered).
//
// Pure: no DOM, no Dexie, no network, no clipboard, no `navigator.share`. The
// page does the I/O; this function does the string assembly only. The voice is
// declarative — no exclamation, no boast, no emoji, no banned words ("journey",
// "amazing", "exciting", "great"). The wordmark is the only attribution; the
// ONLY link token is the literal `#/try` (no http/https, no `?`, no UTM, no
// host). The API key is never an input to this function and so can never appear
// in the output.
//
// This is the text-recommendation sibling of the image cards (0011/0033/0047)
// and the share link (0017): the share link sends the live tappable protocol;
// this sends a sentence a person actually sends.

import type { Plan, Profile } from "../types";
import type { ImprovedMarker } from "../progress/most-improved";

/** The canonical, personal-data-free sample-tour path. The only link token. */
const TOUR_PATH = "#/try";

/**
 * Compose the share message. `improved` is the optional most-improved selection
 * (the page passes `selectMostImproved(allPanels(), profile)`); when it is null
 * the marker line is omitted and the message still reads as a complete,
 * grammatical recommendation. `profile` is unused for the key (which never
 * reaches here) — it is accepted for symmetry with the other composers and so a
 * future personalization has the seam without widening the signature.
 */
export function composeShareMessage(
  plan: Plan,
  _profile: Profile,
  improved: ImprovedMarker | null,
): string {
  void _profile;

  const lines: string[] = [];

  // Opening line — names the product, states plainly what it does.
  lines.push("I've been using Almanac to turn my labs into a daily protocol.");

  // Top action — the first eat-list item and its frequency. Guarded: a plan
  // with no eat list omits this line and the rest still reads true.
  const top = plan.eatList[0];
  if (top && top.food) {
    const food = ascii(top.food);
    const freq = ascii(top.frequency ?? "").trim();
    lines.push(freq
      ? `Right now I'm eating ${food} ${freq}.`
      : `Right now I'm eating ${food}.`);
  }

  // Marker line — ONLY when there is an honest favorable move. The "- now in
  // range" suffix is added only when the move crossed into the functional
  // optimum (`movedIntoRange`), so the recommendation never overclaims.
  if (improved) {
    const name = ascii(improved.name);
    const start = formatValue(improved.startValue);
    const now = formatValue(improved.nowValue);
    const unit = ascii(improved.unit ?? "").trim();
    const move = unit
      ? `My ${name} moved from ${start} to ${now} ${unit}`
      : `My ${name} moved from ${start} to ${now}`;
    lines.push(improved.movedIntoRange ? `${move} - now in range.` : `${move}.`);
  }

  // No-pressure invitation + the canonical tour link. The friend lands in the
  // shipped pre-key funnel (the sandbox 0040 / tour 0014), where conviction is
  // formed on their own terms.
  lines.push(
    "If you've ever been told everything's normal but didn't feel it, "
    + `try it with your own numbers: ${TOUR_PATH}`,
  );

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Coerce any input string to pure ASCII so the composed message is maximally
 * portable (pastes clean into any messenger) and provably carries no hidden
 * non-ASCII payload. We decompose accents to their base letters (NFKD) and then
 * drop anything still outside 0x00–0x7F — the plan content is ASCII in practice,
 * but this is the structural guarantee the privacy + portability contract needs,
 * not a best-effort. Curly quotes / em-dashes degrade to nothing rather than to
 * a mojibake byte.
 */
function ascii(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[‘’]/g, "'")   // curly single quotes -> apostrophe
    .replace(/[“”]/g, '"')   // curly double quotes -> straight
    .replace(/[–—]/g, "-")   // en/em dash -> hyphen
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, "")      // drop any remaining non-ASCII
    .trim();
}

/** Integer-clean number formatting, mirroring the improvement card (0047). */
function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(Math.abs(v) < 1 ? 2 : 1);
}

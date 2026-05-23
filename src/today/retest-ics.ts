// Put the draw on your calendar (ticket 0054).
//
// `buildRetestIcs` is a pure, deterministic transform from the already-computed
// `RetestStatus` (ticket 0028) into a standard iCalendar (.ics) document. The
// Today retest card hands it the soonest-due draw; this returns one all-day
// `VEVENT` the user's own calendar app can import. The OS then owns the
// reminder during the long quiet between draws — the one re-engagement channel a
// no-backend product can honestly own.
//
// Built BY HAND, with no dependency (per AGENTS.md / the ticket): RFC 5545
// CRLF-terminated lines, a `DTSTART;VALUE=DATE` all-day date, an escaped
// `SUMMARY` / `DESCRIPTION`, a stable `UID`, and a `DTSTAMP`. Pure: no DOM, no
// Dexie, no network, no Anthropic. Nothing personal is emitted — only the
// markers to draw, the due date, and the plan's retest reason. No name, no
// email, no key, no attendee/organizer line, no URL.

import type { RetestStatus } from "../types";

/** A line longer than 75 octets must be folded per RFC 5545; our lines are
 *  short, but fold defensively so a long reason can't produce an invalid file. */
const MAX_LINE = 73; // 75 minus the leading space + the CR/LF the fold adds

/** RFC 5545 text escaping for SUMMARY / DESCRIPTION values. Order matters:
 *  backslash first so the others aren't double-escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/** Join marker display names the same way the 0028 card does: "A", "A and B",
 *  "A, B and C". The names arrive already resolved on `status.markers`, so the
 *  SUMMARY matches the card by construction. */
function joinMarkers(markers: string[]): string {
  if (markers.length <= 1) return markers[0] ?? "";
  if (markers.length === 2) return `${markers[0]} and ${markers[1]}`;
  return `${markers.slice(0, -1).join(", ")} and ${markers[markers.length - 1]}`;
}

/** YYYYMMDD in local wall-clock time — the all-day DTSTART date matches the day
 *  the card displays (the card reads the due date in local time too). */
function basicDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** YYYYMMDDThhmmssZ in UTC — the DTSTAMP basic form. */
function basicDateTimeUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Fold a single content line to <=75 octets per RFC 5545 (continuation lines
 *  begin with a single space). ASCII-only here, so octets == chars. */
function foldLine(line: string): string {
  if (line.length <= MAX_LINE + 2) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, MAX_LINE + 2));
  rest = rest.slice(MAX_LINE + 2);
  while (rest.length) {
    parts.push(" " + rest.slice(0, MAX_LINE));
    rest = rest.slice(MAX_LINE);
  }
  return parts.join("\r\n");
}

/**
 * Build the iCalendar document for the soonest-due retest draw. Returns a single
 * CRLF-terminated `VCALENDAR` carrying one all-day `VEVENT`. Pure — the caller
 * passes the already-computed `RetestStatus`.
 */
export function buildRetestIcs(status: RetestStatus): string {
  const markers = joinMarkers(status.markers);
  const summary = `Almanac: draw ${markers}`;

  // The reason, then the bring-it-back line. The reason may be empty (a cadence
  // the generator wrote without one); fall back to the bring-it-back line alone.
  const reason = status.reason?.trim();
  const description = reason
    ? `${reason} Bring your results back to Almanac.`
    : "Bring your results back to Almanac.";

  const dtDate = basicDate(status.dueDate);

  // A stable UID so re-importing the same draw updates rather than duplicates:
  // derived from the due date + the marker keys, suffixed with a local domain.
  // No personal data — the markers are display names already on the status, the
  // date is the draw date. Lower-cased + alnum so the UID is import-safe.
  const uidMarkers = status.markers
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const uid = `retest-${dtDate}-${uidMarkers}@almanac.local`;

  // DTSTAMP is the build instant in UTC. Deterministic per call; not personal.
  const dtstamp = basicDateTimeUtc(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Almanac//Retest//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dtDate}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // RFC 5545 line endings: CRLF, with a trailing CRLF after END:VCALENDAR.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

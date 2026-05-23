// Parse pasted lab text into recognized markers (ticket 0055).
//
// The pre-key sandbox (#/try, ticket 0040) lets a prospect paste a blob of raw
// patient-portal text and have the markers it recognizes scored against the
// functional optimum — no key, no upload, nothing saved. This module is the
// deterministic, no-LLM recognizer that backs that paste.
//
// IMPORTANT — what "the recognizer" means here. The four-lens body and
// engineering notes describe ticket 0046's paste-as-text as "a deterministic,
// no-LLM parse." It is not: 0046's text path (`extractFromText` in
// src/extractor.ts) sends the pasted text to api.anthropic.com and parses the
// model's structured JSON. The genuinely pure, deterministic recognizer that
// 0046's *reconcile* step (and the 0040 sandbox) rely on is the alias-match
// layer in src/data/markers.ts — `matchMarker()` / `findBestMatches()` over
// `MARKERS[].aliases`. This pre-consent page must fire ZERO Anthropic / network
// calls, so it CANNOT route through `extractFromText`. We therefore reuse the
// alias logic verbatim by importing `matchMarker` — never duplicating it — and
// add only the line-level value tokenizer the LLM used to perform: split each
// line into a candidate name + numeric value, resolve the name through
// `matchMarker()`, and keep the recognized lines.
//
// Pure: no DOM, no Dexie, no network. Deterministic: same input → same output.

import { matchMarker } from "../data/markers";

/** One recognized line — the same `{ key, value }` shape the sandbox's typed
 *  rows (src/pages/try.ts `TryRow`) and the 0049 carry payload already use. */
export interface ParsedMarker {
  key: string;
  value: number;
}

/**
 * Parse a blob of pasted lab text into one `{ key, value }` per recognized line,
 * in the order encountered. Lines the alias recognizer cannot resolve to a
 * marker — CBC noise, the lab's address, account numbers, free prose — are
 * silently skipped. A line with no parseable numeric value is skipped too.
 *
 * Duplicate reconciliation: when the same canonical marker key appears on more
 * than one line, the LAST value wins and a single entry remains for that key, in
 * the position of its FIRST appearance (so a re-paste of a corrected value reads
 * as an in-place update, the way a person re-typing a form value expects). This
 * is the documented rule the sandbox row-merge mirrors.
 *
 * No `sex` is passed to `matchMarker` — this page reads no profile (pre-consent,
 * no IndexedDB). A sex-specific marker name (e.g. "ferritin") therefore resolves
 * to whichever sex variant scores first on the alias match; the sandbox scores
 * the pasted snapshot against the curated ranges only and never branches on a
 * profile it does not have.
 */
export function parsePastedLabText(text: string): ParsedMarker[] {
  if (!text) return [];

  // Preserve first-appearance order with a key→index map so a later duplicate
  // overwrites the value in place rather than appending a second entry.
  const out: ParsedMarker[] = [];
  const indexByKey = new Map<string, number>();

  for (const rawLine of text.split(/\r?\n/)) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;

    const existing = indexByKey.get(parsed.key);
    if (existing != null) {
      out[existing]!.value = parsed.value;   // last value wins, in place
      continue;
    }
    indexByKey.set(parsed.key, out.length);
    out.push(parsed);
  }

  return out;
}

/**
 * Recognize a single line: extract a candidate marker name and the first
 * plausible numeric reading, then resolve the name through the alias matcher.
 * Returns `undefined` for any line that lacks a value or whose name doesn't
 * resolve to a marker.
 */
function parseLine(line: string): ParsedMarker | undefined {
  const value = firstReading(line);
  if (value == null) return undefined;

  // The name is the text BEFORE the first numeric reading — "Apolipoprotein B
  // (ApoB)   110 mg/dL" → "Apolipoprotein B (ApoB)". Strip a trailing colon and
  // surrounding whitespace; `matchMarker` normalizes punctuation/case itself.
  const name = line.slice(0, value.index).replace(/[:\s]+$/, "").trim();
  if (!name) return undefined;

  const marker = matchMarker(name);
  if (!marker) return undefined;

  return { key: marker.key, value: value.value };
}

/**
 * The first standalone numeric reading on a line, plus the index where it
 * starts. "Standalone" means a number that is not glued to a letter on its
 * left (so we don't read the "25" out of "25-Hydroxy" as the value, or a date
 * fragment, or an account number's digits embedded in a token). We accept an
 * integer or decimal optionally preceded by a sign, bounded by a non-word char
 * (or start of line) on the left and whitespace / unit / end on the right.
 */
function firstReading(line: string): { value: number; index: number } | undefined {
  // A number token: optional sign, digits with an optional decimal part, or a
  // bare decimal like ".8". Anchored so the char before it is whitespace or the
  // line start — never a letter or digit (rules out "25-Hydroxy", "B12", and the
  // tail digits of an account number token).
  const re = /(?:^|[\s(])([-+]?(?:\d+(?:\.\d+)?|\.\d+))(?=$|[\s)%])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const token = m[1]!;
    const num = Number(token);
    if (!Number.isFinite(num)) continue;
    // The captured group starts after the optional leading boundary char.
    const index = m.index + (m[0]!.length - token.length);
    return { value: num, index };
  }
  return undefined;
}

// Apple Health export parser.
//
// The Apple Health "Export Health Data" feature writes a single XML file
// (`export.xml`) of one self-closing `<Record .../>` element per data point,
// usually inside a ZIP alongside ECG / workout-route GPX files. The XML is
// dense — multi-MB at the low end, multi-GB for long-tenured users — so a
// DOMParser is a non-starter: it allocates a node per element and OOMs.
//
// Instead we scan the source as a stream. Each Record has its payload encoded
// entirely in attributes (`type=`, `startDate=`, `endDate=`, `value=`,
// `unit=`, `sourceName=`), so a single regex pass extracts everything we need
// without ever building a DOM. Memory stays bounded by what we emit, not by
// what we consume.
//
// We extract five record types per the ticket:
//   - HKQuantityTypeIdentifierHeartRateVariabilitySDNN    → ContinuousSignal.hrvMs
//   - HKQuantityTypeIdentifierRestingHeartRate            → ContinuousSignal.rhrBpm
//   - HKCategoryTypeIdentifierSleepAnalysis               → ContinuousSignal.sleepHours
//   - HKQuantityTypeIdentifierBodyMass                    → ContinuousSignal.weightKg
//   - HKQuantityTypeIdentifierBloodGlucose                → ContinuousSignal.glucoseMgDl
//
// Everything else (steps, distance, workouts, MetadataEntry, the `Me` and
// `ExportDate` header tags) is silently skipped.
//
// This module is pure: it takes a string and returns data. The Web Worker
// wrapper in `apple.worker.ts` adds zip handling and message plumbing.

import type { ContinuousSignal, Day } from "../types";

/** Counts the importer surfaces in the banner after a successful parse. */
export interface ImportCounts {
  hrvDays: number;
  sleepNights: number;
  weights: number;
  rhrReadings: number;
  glucoseReadings: number;
}

/** Result returned by the worker once a file has been fully parsed. */
export interface ImportResult {
  signals: ContinuousSignal[];   // one entry per local day, sorted ascending
  counts: ImportCounts;
}

/* -------------------------------------------------------------------------- */
/*  The five HK identifiers we care about (ticket 0004)                       */
/* -------------------------------------------------------------------------- */

const HK_HRV     = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
const HK_RHR     = "HKQuantityTypeIdentifierRestingHeartRate";
const HK_SLEEP   = "HKCategoryTypeIdentifierSleepAnalysis";
const HK_WEIGHT  = "HKQuantityTypeIdentifierBodyMass";
const HK_GLUCOSE = "HKQuantityTypeIdentifierBloodGlucose";

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Parse a UTF-8 Apple Health export XML and return one ContinuousSignal row
 * per local day plus the counts banner. Pure; no IO.
 *
 * `progress` lets the caller (the Web Worker, in practice) emit periodic
 * updates back to the main thread so the UI can show a determinate-ish bar.
 * Called with a value in [0, 1] roughly every 256 KB of consumed input.
 *
 * @throws on malformed input where the surrounding `<HealthData>` root is
 *         missing — the most common failure mode for a corrupt or truncated
 *         export. We do NOT throw on individual unparseable Record tags —
 *         a single bad row is silently skipped so one corruption doesn't
 *         destroy 9 months of clean data.
 */
export function parseAppleHealthXml(
  xml: string,
  progress?: (pct: number) => void,
): ImportResult {
  // Guard: the export.xml file always opens with `<?xml version=` and contains
  // a `<HealthData` root. Reject anything that doesn't look like Apple Health
  // before we spend cycles scanning attributes.
  if (xml.length === 0) {
    throw new Error("The export was empty. Pick the export.xml inside the Apple Health ZIP.");
  }
  if (!/<HealthData[\s>]/.test(xml.slice(0, 4096))) {
    throw new Error(
      "Could not read this file as an Apple Health export. " +
      "Make sure you exported from Health → your profile → Export All Health Data, " +
      "and dropped the export.xml (or the whole ZIP) here.",
    );
  }

  // Per-day accumulators. Sleep needs special handling because Apple Health
  // emits one Record per sleep STAGE (in-bed, asleep-core, asleep-deep, etc.)
  // — we sum the asleep* segments and attribute them to the wake-up date.
  const hrvByDay     = new Map<Day, { sum: number; n: number }>();
  const rhrByDay     = new Map<Day, { sum: number; n: number }>();
  const sleepByDay   = new Map<Day, number>();
  const weightByDay  = new Map<Day, { value: number; at: number }>();
  const glucoseByDay = new Map<Day, { value: number; at: number }[]>();

  // The scanner. We match self-closing <Record .../> tags only — Apple's
  // exporter writes Records as self-closing, with the optional nested
  // HeartRateVariabilityMetadataList we don't read. We capture the attribute
  // payload as a single chunk and pull individual fields out with a second
  // attribute regex (much faster than parsing each tag with a full XML
  // parser).
  const RECORD_RE = /<Record\b([^>]*?)\/>/g;
  // We deliberately don't try to match Record with body content — those are
  // rare in real exports (only the HRV metadata list) and the nested children
  // hold no extractable signal for the five HK types we care about. Skipping
  // them keeps the regex simple and the parser fast.

  let m: RegExpExecArray | null;
  const total = xml.length;
  let lastReport = 0;

  while ((m = RECORD_RE.exec(xml)) !== null) {
    const attrChunk = m[1]!;
    try {
      const type = attr(attrChunk, "type");
      if (!type) continue;
      if (type !== HK_HRV && type !== HK_RHR && type !== HK_SLEEP &&
          type !== HK_WEIGHT && type !== HK_GLUCOSE) {
        continue;
      }

      const startDate = attr(attrChunk, "startDate");
      const endDate   = attr(attrChunk, "endDate");
      if (!startDate || !endDate) continue;

      if (type === HK_SLEEP) {
        // Sleep semantics:
        //   - We only count segments whose value starts with "HKCategoryValueSleepAnalysisAsleep".
        //     "InBed" and any future stage we don't recognize are skipped.
        //   - Duration is endDate - startDate.
        //   - The night is attributed to the LOCAL DATE of the endDate (wake-up).
        //     This matches the convention every consumer-facing sleep app uses:
        //     "Tuesday's sleep" is the night you woke up Tuesday morning.
        const value = attr(attrChunk, "value");
        if (!value || !value.startsWith("HKCategoryValueSleepAnalysisAsleep")) continue;
        const start = parseAppleDate(startDate);
        const end   = parseAppleDate(endDate);
        if (!start || !end || end <= start) continue;
        const hours = (end - start) / 3_600_000;
        const day = localIso(end);
        sleepByDay.set(day, (sleepByDay.get(day) ?? 0) + hours);
        continue;
      }

      // The four quantity types are all single-instant readings — start/end
      // are the same. We attribute to the LOCAL DATE of the start.
      const valueStr = attr(attrChunk, "value");
      const value = valueStr ? Number(valueStr) : NaN;
      if (!Number.isFinite(value)) continue;

      const start = parseAppleDate(startDate);
      if (!start) continue;
      const day = localIso(start);

      if (type === HK_HRV) {
        const slot = hrvByDay.get(day) ?? { sum: 0, n: 0 };
        slot.sum += value; slot.n += 1;
        hrvByDay.set(day, slot);
      } else if (type === HK_RHR) {
        const slot = rhrByDay.get(day) ?? { sum: 0, n: 0 };
        slot.sum += value; slot.n += 1;
        rhrByDay.set(day, slot);
      } else if (type === HK_WEIGHT) {
        // Weight: latest reading of the day wins. People can step on the
        // scale twice a day (morning + after a workout); the morning reading
        // is the meaningful one and that's typically what's stored first,
        // but we don't enforce order — the LATEST start timestamp wins so
        // re-importing a later edit is stable.
        const prev = weightByDay.get(day);
        if (!prev || start > prev.at) {
          // Apple Health weights are always in kg in the export XML
          // regardless of the user's display units — the `unit` attribute
          // tells us which (e.g. "lb"). Convert if needed.
          const unit = attr(attrChunk, "unit") ?? "kg";
          const kg = unit === "lb" ? value * 0.45359237 : value;
          weightByDay.set(day, { value: kg, at: start });
        }
      } else if (type === HK_GLUCOSE) {
        // Glucose: keep every reading. Apple Health writes mg/dL on
        // exports from US-locale devices and mmol/L elsewhere; we normalize
        // to mg/dL since that's how the Plan reads dysglycemia.
        const unit = attr(attrChunk, "unit") ?? "mg/dL";
        const mgdl = unit === "mmol/L" ? value * 18.0182 : value;
        const arr = glucoseByDay.get(day) ?? [];
        arr.push({ value: mgdl, at: start });
        glucoseByDay.set(day, arr);
      }
    } catch {
      // Per the docstring: one bad Record doesn't kill the whole import.
      // We swallow and keep scanning.
    }

    // Periodic progress report so the worker can post updates back. The
    // 256 KB granularity is small enough to feel live and large enough not
    // to dominate the parse loop with postMessage overhead.
    if (progress && m.index - lastReport > 262_144) {
      lastReport = m.index;
      try { progress(m.index / total); } catch { /* ignore */ }
    }
  }

  // Collect by-day rows, sort glucose readings within each day, and
  // sort the rows themselves ascending by day.
  const days = new Set<Day>([
    ...hrvByDay.keys(),
    ...rhrByDay.keys(),
    ...sleepByDay.keys(),
    ...weightByDay.keys(),
    ...glucoseByDay.keys(),
  ]);

  const rows: ContinuousSignal[] = [];
  for (const day of days) {
    const row: ContinuousSignal = { day };
    const hrv = hrvByDay.get(day);
    if (hrv && hrv.n > 0) row.hrvMs = round1(hrv.sum / hrv.n);
    const rhr = rhrByDay.get(day);
    if (rhr && rhr.n > 0) row.rhrBpm = round1(rhr.sum / rhr.n);
    const sleep = sleepByDay.get(day);
    if (sleep != null && sleep > 0) row.sleepHours = round2(sleep);
    const weight = weightByDay.get(day);
    if (weight) row.weightKg = round2(weight.value);
    const glucose = glucoseByDay.get(day);
    if (glucose && glucose.length) {
      glucose.sort((a, b) => a.at - b.at);
      row.glucoseMgDl = glucose.map(g => round1(g.value));
    }
    rows.push(row);
  }
  rows.sort((a, b) => a.day.localeCompare(b.day));

  if (progress) { try { progress(1); } catch { /* ignore */ } }

  return {
    signals: rows,
    counts: {
      hrvDays: hrvByDay.size,
      sleepNights: sleepByDay.size,
      weights: weightByDay.size,
      rhrReadings: countSum(rhrByDay),
      glucoseReadings: Array.from(glucoseByDay.values()).reduce((n, arr) => n + arr.length, 0),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Extract one attribute from a single `<Record ... />` opening-tag payload.
 * Apple Health exports always use double-quoted attribute values; we don't
 * try to handle single quotes or unquoted attrs because Apple's exporter
 * never produces them.
 */
function attr(chunk: string, name: string): string | undefined {
  // Anchor the attribute by a leading whitespace OR the chunk start, so
  // `startDate=` doesn't accidentally match the tail of `endStartDate=`
  // (no such attribute exists, but the principle holds).
  const re = new RegExp(`(?:^|\\s)${name}="([^"]*)"`);
  const m = chunk.match(re);
  return m?.[1];
}

/**
 * Parse Apple Health's date format: `YYYY-MM-DD HH:MM:SS ±HHMM`.
 * Returns the value as a UTC millisecond timestamp, or undefined if it
 * doesn't match. The exporter is consistent — every date in every export I
 * have seen uses this exact format — but a defensive parser shouldn't
 * assume that, so we return undefined rather than throwing on a miss.
 */
function parseAppleDate(s: string): number | undefined {
  // Match "2026-05-01 07:15:00 -0700" (note: tz is optional in some old
  // exports, defaulting to UTC).
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?$/,
  );
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se, sign, tzH, tzM] = m;
  // Reconstruct an ISO 8601 string the Date constructor groks.
  const tz = sign && tzH && tzM ? `${sign}${tzH}:${tzM}` : "Z";
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${tz}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Render a millisecond timestamp as a local-time YYYY-MM-DD string. We
 * deliberately use the LOCAL date (the date the user lived) rather than
 * UTC — a 2 AM London bedtime is still "yesterday's sleep" to the user.
 */
function localIso(ms: number): Day {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

function countSum(map: Map<Day, { sum: number; n: number }>): number {
  let s = 0;
  for (const v of map.values()) s += v.n;
  return s;
}

/* -------------------------------------------------------------------------- */
/*  Banner copy                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Editorial copy for the results banner. Pure pluralization rules — we keep
 * this here (not in the UI) so the same string can be asserted on by the
 * E2E and reused if the import becomes a CLI later.
 */
export function formatBanner(counts: ImportCounts): string {
  return (
    `Imported ${counts.hrvDays} days of HRV, ` +
    `${counts.sleepNights} nights of sleep, ` +
    `${counts.weights} ${plural(counts.weights, "weight")}, ` +
    `${counts.rhrReadings} RHR readings, ` +
    `${counts.glucoseReadings} glucose readings.`
  );
}

function plural(n: number, base: string): string {
  return n === 1 ? base : `${base}s`;
}

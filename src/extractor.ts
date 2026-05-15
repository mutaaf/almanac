// Lab extractor.
//
// Accepts one or more files (PDFs and/or images) representing pages of a
// SINGLE lab draw. Sends all of them in one Claude Vision call so the model
// can deduplicate across pages and reconcile a single set of results.
//
// Files stay on-device; only the base64 payload is transmitted, and only to
// api.anthropic.com via BYOK.

import Anthropic from "@anthropic-ai/sdk";
import type { Profile, Result, Panel } from "./types";
import { matchMarker, flagFor, findMarker } from "./data/markers";
import { recordCall } from "./telemetry";
import { getCachedExtraction, cacheExtraction } from "./db";

const EXTRACTION_PROMPT = `
You are extracting structured biomarker results from a clinical lab report.
The inputs may be MULTIPLE pages — PDFs and/or images — and may span MULTIPLE
distinct draw dates (e.g. a user pasted a stack of historical reports). Group
the rows by draw date and return one panel per distinct date. Within a panel,
deduplicate any marker that appears on more than one page (keep the most
complete row).

For each numeric marker in a panel, return:
  - "rawName":   the marker name exactly as printed on the report
  - "value":     the numeric result (number, no units in this field)
  - "unit":      the unit as printed (e.g. "mg/dL", "ng/mL", "uIU/mL", "%")
  - "labRange":  { "low": number?, "high": number? }   the lab's reference
                 range as printed; omit a side if it's one-sided

Per-panel fields:
  - "drawnAt":   YYYY-MM-DD for that panel's draw; null only if no date is
                 visible anywhere on the contributing pages
  - "labName":   laboratory's name if visible on the contributing pages; else null

Return ONLY a JSON object, no prose, no code fences:

{
  "panels": [
    {
      "drawnAt": "YYYY-MM-DD" | null,
      "labName": string | null,
      "results": [
        {
          "rawName": string,
          "value": number,
          "unit": string,
          "labRange": { "low": number?, "high": number? } | null
        },
        ...
      ]
    },
    ...
  ]
}

Rules:
  - If every page is from the same draw, return exactly one panel.
  - If you see multiple distinct draw dates, return one panel per date,
    with each panel containing ONLY the rows from pages of that date.
  - Skip qualitative-only results (e.g. "Negative", "Positive", "Not Detected").
  - Skip ratios and calculated indices unless the report explicitly numbers them.
  - If a value is reported as "<5" or ">30", use the bound as the value
    (5 or 30 respectively).
  - Keep units exactly as the lab printed them; do not convert.
  - Do not invent results. If unsure, omit the row.
`.trim();

export interface ExtractedRow {
  rawName: string;
  value: number;
  unit: string;
  labRange?: { low?: number; high?: number };
}

/** One panel's worth of extracted rows + its draw context. */
export interface ExtractedPanel {
  drawnAt?: string;
  labName?: string;
  rows: ExtractedRow[];
}

/** The full extraction return: one or more panels, split by draw date. */
export interface ExtractionResult {
  panels: ExtractedPanel[];
}

/* -------------------------------------------------------------------------- */

/** Read a File into a base64 string (without the data: URL prefix). */
async function fileToBase64(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

type Mt =
  | { kind: "pdf";   mt: "application/pdf" }
  | { kind: "image"; mt: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };

function mediaTypeOf(file: File): Mt {
  const t = file.type;
  const name = (file.name ?? "").toLowerCase();
  if (t === "application/pdf" || name.endsWith(".pdf")) {
    return { kind: "pdf", mt: "application/pdf" };
  }
  if (t === "image/png")  return { kind: "image", mt: "image/png"  };
  if (t === "image/jpeg" || t === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return { kind: "image", mt: "image/jpeg" };
  }
  if (t === "image/webp") return { kind: "image", mt: "image/webp" };
  if (t === "image/gif")  return { kind: "image", mt: "image/gif"  };
  // Default to JPEG; Claude is forgiving on photo uploads.
  return { kind: "image", mt: "image/jpeg" };
}

/**
 * SHA-256 hash of the concatenated file contents — stable across re-pastes,
 * so we can cache the extraction result and avoid re-billing Claude Vision
 * if the user (re)uploads the same screenshots.
 */
async function hashFiles(files: File[]): Promise<string> {
  const enc = new TextEncoder();
  const buffers: ArrayBuffer[] = [];
  for (const f of files) {
    // Mix in name + size so a renamed file invalidates the cache.
    buffers.push(enc.encode(`${f.name}|${f.size}|`).buffer);
    buffers.push(await f.arrayBuffer());
  }
  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    combined.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Run the extraction over a set of files (treated as pages of ONE panel).
 * Cached: if the user re-uploads the same files, we replay the prior
 * extraction instead of paying Claude again.
 */
export async function extractFromFiles(files: File[], profile: Profile): Promise<ExtractionResult> {
  if (!files.length) throw new Error("No files to extract from.");

  const hash = await hashFiles(files);
  const cached = await getCachedExtraction<ExtractionResult>(hash);
  if (cached) return cached;

  const client = new Anthropic({
    apiKey: profile.anthropicKey,
    dangerouslyAllowBrowser: true,
  });

  // Build one content block per file, then a single text instruction.
  // We include the file names (in upload order) so Claude can attribute
  // pages to draw dates when filenames carry date hints — and so the test
  // mock has a deterministic hook into the multi-date branch.
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const file of files) {
    const b64 = await fileToBase64(file);
    const mt  = mediaTypeOf(file);
    blocks.push(mt.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as any
      : { type: "image",    source: { type: "base64", media_type: mt.mt,           data: b64 } });
  }
  const namesList = files.map((f, i) => `  ${i + 1}. ${f.name}`).join("\n");
  blocks.push({
    type: "text",
    text:
      `${files.length} ${files.length === 1 ? "page/file" : "pages/files"} above, in this order:\n` +
      `${namesList}\n\n` +
      `Extract every biomarker per the schema. Group rows by draw date — ` +
      `if the pages span multiple distinct draws, return one panel per date. ` +
      `Deduplicate any marker that repeats within the same panel. Return JSON only.`,
  });

  const model = profile.model || "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model,
    max_tokens: 8000,
    system: [
      { type: "text", text: EXTRACTION_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: blocks }],
  });

  recordCall("extract", model, resp);

  if (resp.stop_reason === "max_tokens") {
    throw new Error(
      `Extraction was cut off before finishing — the report has more rows than fit in one response. ` +
      `Try splitting the upload into fewer pages and run extraction twice.`,
    );
  }

  const raw = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text).join("\n").trim();

  const parsed = parseJson(raw);
  const rawPanels = Array.isArray((parsed as any).panels)
    ? ((parsed as any).panels as Array<Record<string, unknown>>)
    : [];

  const panels: ExtractedPanel[] = rawPanels.map(p => ({
    ...(p.drawnAt ? { drawnAt: String(p.drawnAt) } : {}),
    ...(p.labName ? { labName: String(p.labName) } : {}),
    rows: Array.isArray(p.results) ? (p.results as ExtractedRow[]) : [],
  }));

  // Guard against empty/garbage payloads — surface a clear error rather
  // than silently writing zero panels.
  if (!panels.length) {
    throw new Error(
      `Extraction returned no panels — the model couldn't read any biomarkers ` +
      `from the upload. Try a clearer photo, or use Manual entry.`,
    );
  }

  const result: ExtractionResult = { panels };
  // Persist the extraction so re-pastes don't re-bill.
  await cacheExtraction(hash, result);
  return result;
}

/**
 * Reconcile extraction rows against the marker DB and produce Result[].
 */
export function reconcile(rows: ExtractedRow[], profile: Profile): {
  results: Result[];
  unmatched: ExtractedRow[];
} {
  const results: Result[] = [];
  const unmatched: ExtractedRow[] = [];

  for (const row of rows) {
    const marker = matchMarker(row.rawName, profile.sex);
    if (!marker) { unmatched.push(row); continue; }

    let value = row.value;
    let unit  = row.unit;
    if (unit.toLowerCase() !== marker.unit.toLowerCase()) {
      const alt = (marker.altUnits ?? []).find(a => a.unit.toLowerCase() === unit.toLowerCase());
      if (alt) {
        value = row.value * alt.toCanonical;
        unit  = marker.unit;
      }
    }

    const labRange = row.labRange ?? marker.labRange;
    const optimal  = marker.optimalRange;
    const flag     = flagFor(value, optimal, labRange);

    results.push({
      markerKey: marker.key,
      rawName: row.rawName,
      value,
      unit,
      ...(labRange ? { labRange } : {}),
      ...(optimal  ? { optimalRange: optimal } : {}),
      flag,
    });
  }

  return { results, unmatched };
}

/**
 * Build one or more Panels from a set of files + extraction + reconcile pass.
 *
 * When the user uploads a stack of pages spanning multiple distinct draw
 * dates, the extractor groups rows by date and returns N panels. We pass
 * each panel's rows through `reconcile` independently so flag computation
 * uses that panel's own lab ranges. File-name attribution is best-effort:
 * if the extractor surfaces no per-page mapping (the v1 schema doesn't),
 * we attach the full file list to the latest (newest-`drawnAt`) panel —
 * the only one a user is likely to come back and re-inspect — and leave
 * older split panels with an empty `fileNames`.
 */
export async function panelsFromFiles(files: File[], profile: Profile): Promise<{
  panels: Omit<Panel, "id" | "createdAt">[];
  unmatched: ExtractedRow[];
}> {
  const ext = await extractFromFiles(files, profile);

  // Determine source kind: pdf-only / image-only / mixed.
  const kinds = new Set(files.map(f => mediaTypeOf(f).kind));
  const source: Panel["source"] =
    kinds.size === 1 ? (kinds.has("pdf") ? "pdf" : "image") : "mixed";

  // Sort panels by drawnAt ascending so "latest" is the last one.
  const sorted = ext.panels.slice().sort((a, b) => {
    const da = a.drawnAt ?? "";
    const db = b.drawnAt ?? "";
    return da.localeCompare(db);
  });
  const latestIdx = sorted.length - 1;

  const allUnmatched: ExtractedRow[] = [];
  const panels: Omit<Panel, "id" | "createdAt">[] = sorted.map((ep, i) => {
    const { results, unmatched } = reconcile(ep.rows, profile);
    allUnmatched.push(...unmatched);
    // Best-effort attribution: the latest panel gets the file names list;
    // older split panels list none. (Per ticket engineering notes: if we
    // can't attribute pages to dates, attach all pages to the latest panel.)
    // fileBlobs intentionally NOT persisted — Mobile WebKit's IndexedDB
    // refuses to clone File/Blob entries reliably, and the originals are
    // never read back for display.
    const fileNames = i === latestIdx ? files.map(f => f.name) : [];
    return {
      drawnAt: ep.drawnAt && /^\d{4}-\d{2}-\d{2}$/.test(ep.drawnAt) ? ep.drawnAt : todayIso(),
      ...(ep.labName ? { labName: ep.labName } : {}),
      source,
      fileNames,
      results,
    };
  });

  return { panels, unmatched: allUnmatched };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function parseJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const slice = (start >= 0 && end > start) ? candidate.slice(start, end + 1) : candidate;
  try { return JSON.parse(slice); }
  catch { throw new Error(`Could not parse extraction JSON.\n--- raw ---\n${text}`); }
}

export { findMarker };

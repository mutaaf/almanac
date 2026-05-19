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
You are extracting structured biomarker results from clinical lab reports.
The inputs may be MULTIPLE pages — PDFs and/or images — and they may come
from a SINGLE draw or from SEVERAL draws spanning different dates. If you
see more than one distinct draw date across the pages, return one entry
per date in the "panels" array, with that date's rows grouped together.
If every page is from the same draw, return a single entry. Within a panel,
deduplicate any marker that appears on more than one page (keep the most
complete row).

For each numeric marker, return:
  - "rawName":   the marker name exactly as printed on the report
  - "value":     the numeric result (number, no units in this field)
  - "unit":      the unit as printed (e.g. "mg/dL", "ng/mL", "uIU/mL", "%")
  - "labRange":  { "low": number?, "high": number? }   the lab's reference
                 range as printed; omit a side if it's one-sided

For each panel, return:
  - "drawnAt":     YYYY-MM-DD if visible anywhere on the report; else null
  - "labName":     laboratory's name if visible; else null
  - "pageIndices": optional 1-indexed list of input page numbers that
                   contributed to this panel, if you can attribute them.
                   Omit if unsure.

Return ONLY a JSON object, no prose, no code fences:

{
  "panels": [
    {
      "drawnAt": "YYYY-MM-DD" | null,
      "labName": string | null,
      "pageIndices": [number, ...] | null,
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

export interface ExtractedPanel {
  drawnAt?: string;
  labName?: string;
  rows: ExtractedRow[];
  /** 1-indexed page numbers from the input that contributed to this panel. */
  pageIndices?: number[];
}

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
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const file of files) {
    const b64 = await fileToBase64(file);
    const mt  = mediaTypeOf(file);
    blocks.push(mt.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as any
      : { type: "image",    source: { type: "base64", media_type: mt.mt,           data: b64 } });
  }
  // Filenames are listed inline so the model has chronology hints (and so
  // the test mock can pick a fixture by filename without inspecting bytes).
  const fileList = files.map((f, i) => `${i + 1}. ${f.name}`).join("\n");
  blocks.push({
    type: "text",
    text:
      `${files.length} ${files.length === 1 ? "page/file" : "pages/files"} above (1-indexed):\n${fileList}\n\n` +
      `Extract every biomarker per the schema. If the pages span multiple draw dates, ` +
      `return one panel per date in the "panels" array. Deduplicate within each panel. ` +
      `Return JSON only.`,
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
  const panels: ExtractedPanel[] = Array.isArray((parsed as any).panels)
    ? (parsed as any).panels.map((p: any) => ({
        ...(p?.drawnAt ? { drawnAt: String(p.drawnAt) } : {}),
        ...(p?.labName ? { labName: String(p.labName) } : {}),
        ...(Array.isArray(p?.pageIndices)
          ? { pageIndices: (p.pageIndices as unknown[]).map(n => Number(n)).filter(Number.isFinite) }
          : {}),
        rows: Array.isArray(p?.results) ? (p.results as ExtractedRow[]) : [],
      }))
    : [];
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
 * Build one or more Panels from a set of files. The extractor decides how
 * many: if it sees multiple distinct draw dates across the pages, it splits
 * them into separate panels (one per date). The unmatched rows are tagged
 * to their owning panel by INDEX in the returned array.
 */
export async function panelsFromFiles(files: File[], profile: Profile): Promise<Array<{
  panel: Omit<Panel, "id" | "createdAt">;
  unmatched: ExtractedRow[];
}>> {
  const ext = await extractFromFiles(files, profile);
  const panels = ext.panels.length ? ext.panels : [{ rows: [] as ExtractedRow[] }];

  // Determine source kind once — every split shares the same input file set.
  // fileBlobs intentionally NOT persisted: Mobile WebKit's IndexedDB
  // refuses to clone File/Blob entries reliably ("Error preparing Blob/File
  // data to be stored in object store"), and the originals are never read
  // back for display — only `fileNames.length` is used as a page count.
  // Keeping them on-device gave no user-visible benefit and broke the
  // upload flow on iOS Safari.
  const kinds = new Set(files.map(f => mediaTypeOf(f).kind));
  const source: Panel["source"] =
    kinds.size === 1 ? (kinds.has("pdf") ? "pdf" : "image") : "mixed";

  // Order panels by drawnAt ascending, so the most recent ends up last —
  // that's where we attach the full filename list when Claude couldn't
  // attribute pages to dates.
  const ordered = panels.slice().sort((a, b) =>
    (a.drawnAt ?? "").localeCompare(b.drawnAt ?? ""));

  const out: Array<{ panel: Omit<Panel, "id" | "createdAt">; unmatched: ExtractedRow[] }> = [];
  const anyAttributed = ordered.some(p => Array.isArray(p.pageIndices) && p.pageIndices.length);

  ordered.forEach((ep, i) => {
    const { results, unmatched } = reconcile(ep.rows, profile);

    let fileNames: string[];
    if (anyAttributed) {
      // Use the attribution Claude provided; fall back to empty on the panels
      // that didn't get any.
      const indices = (ep.pageIndices ?? []).filter(n => n >= 1 && n <= files.length);
      fileNames = indices.map(n => files[n - 1]!.name);
    } else {
      // Fallback: every page goes on the most-recent panel; older panels
      // are filename-less (page count column will read "—" in the UI).
      fileNames = i === ordered.length - 1 ? files.map(f => f.name) : [];
    }

    const panel: Omit<Panel, "id" | "createdAt"> = {
      drawnAt: ep.drawnAt && /^\d{4}-\d{2}-\d{2}$/.test(ep.drawnAt) ? ep.drawnAt : todayIso(),
      ...(ep.labName ? { labName: ep.labName } : {}),
      source,
      fileNames,
      results,
    };
    out.push({ panel, unmatched });
  });

  return out;
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

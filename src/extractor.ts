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

const EXTRACTION_PROMPT = `
You are extracting structured biomarker results from a clinical lab report.
The inputs may be MULTIPLE pages of the same draw — PDFs and/or images.
Aggregate results across all pages and deduplicate any marker that appears
on more than one page (keep the most complete row).

For each numeric marker, return:
  - "rawName":   the marker name exactly as printed on the report
  - "value":     the numeric result (number, no units in this field)
  - "unit":      the unit as printed (e.g. "mg/dL", "ng/mL", "uIU/mL", "%")
  - "labRange":  { "low": number?, "high": number? }   the lab's reference
                 range as printed; omit a side if it's one-sided

Top-level fields:
  - "drawnAt":   YYYY-MM-DD if visible anywhere on the report; else null
  - "labName":   laboratory's name if visible; else null

Return ONLY a JSON object, no prose, no code fences:

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

export interface ExtractionResult {
  drawnAt?: string;
  labName?: string;
  rows: ExtractedRow[];
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
 * Run the extraction over a set of files (treated as pages of ONE panel).
 */
export async function extractFromFiles(files: File[], profile: Profile): Promise<ExtractionResult> {
  if (!files.length) throw new Error("No files to extract from.");

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
  blocks.push({
    type: "text",
    text: `${files.length} ${files.length === 1 ? "page/file" : "pages/files"} above. Extract every biomarker per the schema; deduplicate across pages. Return JSON only.`,
  });

  const resp = await client.messages.create({
    model: profile.model || "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      { type: "text", text: EXTRACTION_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: blocks }],
  });

  const raw = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text).join("\n").trim();

  const parsed = parseJson(raw);
  return {
    ...(parsed.drawnAt ? { drawnAt: String(parsed.drawnAt) } : {}),
    ...(parsed.labName ? { labName: String(parsed.labName) } : {}),
    rows: Array.isArray(parsed.results) ? (parsed.results as ExtractedRow[]) : [],
  };
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
 * Build a Panel from a set of files + extraction + reconcile pass.
 */
export async function panelFromFiles(files: File[], profile: Profile): Promise<{
  panel: Omit<Panel, "id" | "createdAt">;
  unmatched: ExtractedRow[];
}> {
  const ext = await extractFromFiles(files, profile);
  const { results, unmatched } = reconcile(ext.rows, profile);

  // Determine source kind: pdf-only / image-only / mixed.
  const kinds = new Set(files.map(f => mediaTypeOf(f).kind));
  const source: Panel["source"] =
    kinds.size === 1 ? (kinds.has("pdf") ? "pdf" : "image") : "mixed";

  const panel: Omit<Panel, "id" | "createdAt"> = {
    drawnAt: ext.drawnAt && /^\d{4}-\d{2}-\d{2}$/.test(ext.drawnAt) ? ext.drawnAt : todayIso(),
    ...(ext.labName ? { labName: ext.labName } : {}),
    source,
    fileNames: files.map(f => f.name),
    fileBlobs: files.slice(),
    results,
  };

  return { panel, unmatched };
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

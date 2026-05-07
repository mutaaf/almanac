// Lab extractor.
//
// Takes a File (PDF or image) the user uploaded, base64-encodes it, hands it
// to Claude with a strict extraction schema, then reconciles each extracted
// row against the local marker database to attach functional ranges and flags.
//
// The file blob itself stays in IndexedDB on the user's device — only the
// base64 payload is transmitted, and only to api.anthropic.com via BYOK.

import Anthropic from "@anthropic-ai/sdk";
import type { Profile, Result, Panel } from "./types";
import { matchMarker, flagFor, findMarker } from "./data/markers";

const EXTRACTION_PROMPT = `
You are extracting structured biomarker results from a clinical lab report.

For each numeric marker, return:
  - "rawName":   the marker name exactly as printed on the report
  - "value":     the numeric result (number, no units in this field)
  - "unit":      the unit as printed (e.g. "mg/dL", "ng/mL", "uIU/mL", "%")
  - "labRange":  { "low": number?, "high": number? }   the lab's reference
                 range as printed; omit a side if it's one-sided
  - "drawnAt":   the date the sample was drawn, in YYYY-MM-DD form, if visible
                 anywhere on the report. Same date applies to all rows from
                 the same draw — return it once at the top level too.
  - "labName":   the laboratory's name (e.g. "Quest Diagnostics", "LabCorp")
                 if visible on the page; otherwise omit.

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
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  // Browsers cap btoa() at small chunk sizes for big buffers; stream it.
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mediaTypeOf(file: File): { kind: "pdf"; mt: "application/pdf" }
                                  | { kind: "image"; mt: "image/png" | "image/jpeg" | "image/webp" | "image/gif" } {
  const t = file.type;
  if (t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return { kind: "pdf", mt: "application/pdf" };
  }
  if (t === "image/png")  return { kind: "image", mt: "image/png"  };
  if (t === "image/jpeg" || t === "image/jpg") return { kind: "image", mt: "image/jpeg" };
  if (t === "image/webp") return { kind: "image", mt: "image/webp" };
  if (t === "image/gif")  return { kind: "image", mt: "image/gif"  };
  // Default to JPEG; Claude is forgiving on photo uploads.
  return { kind: "image", mt: "image/jpeg" };
}

/**
 * Run the extraction. Throws on parse / API failure.
 */
export async function extractFromFile(file: File, profile: Profile): Promise<ExtractionResult> {
  const client = new Anthropic({
    apiKey: profile.anthropicKey,
    dangerouslyAllowBrowser: true,
  });

  const b64 = await fileToBase64(file);
  const mt  = mediaTypeOf(file);

  // Build the user content. PDFs use document blocks; images use image blocks.
  const fileBlock: Anthropic.ContentBlockParam = mt.kind === "pdf"
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: b64 },
      } as any   // SDK types still tightening on document blocks
    : {
        type: "image",
        source: { type: "base64", media_type: mt.mt, data: b64 },
      };

  const resp = await client.messages.create({
    model: profile.model || "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      { type: "text", text: EXTRACTION_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{
      role: "user",
      content: [
        fileBlock,
        { type: "text", text: "Extract every biomarker per the schema. Return JSON only." },
      ],
    }],
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
 * Drops rows we can't match (caller can surface them as "unrecognized").
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

    // Try to convert into the canonical unit if the lab reported a different one.
    let value = row.value;
    let unit  = row.unit;
    if (unit.toLowerCase() !== marker.unit.toLowerCase()) {
      const alt = (marker.altUnits ?? []).find(a => a.unit.toLowerCase() === unit.toLowerCase());
      if (alt) {
        value = row.value * alt.toCanonical;
        unit  = marker.unit;
      }
      // If no conversion known, leave the value alone but note the unit
      // mismatch so the UI can flag it. We still attempt a flag using the
      // optimal range (best effort).
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
 * Build a Panel from a file + extraction + reconcile pass.
 */
export async function panelFromFile(file: File, profile: Profile): Promise<{
  panel: Omit<Panel, "id" | "createdAt">;
  unmatched: ExtractedRow[];
}> {
  const ext = await extractFromFile(file, profile);
  const { results, unmatched } = reconcile(ext.rows, profile);

  const mt = mediaTypeOf(file);
  const panel: Omit<Panel, "id" | "createdAt"> = {
    drawnAt: ext.drawnAt && /^\d{4}-\d{2}-\d{2}$/.test(ext.drawnAt) ? ext.drawnAt : todayIso(),
    ...(ext.labName ? { labName: ext.labName } : {}),
    source: mt.kind,
    fileName: file.name,
    fileBlob: file,
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
  catch (err) { throw new Error(`Could not parse extraction JSON.\n--- raw ---\n${text}`); }
}

/** Re-export for callers (e.g. preview before saving). */
export { findMarker };

// On-device summarizer. We compress older entries locally with Transformers.js
// before we ever hand context to Claude — partly to keep token counts down,
// partly to keep raw old prose from leaving the machine repeatedly.
//
// The model (distilbart-cnn-6-6, ~80MB ONNX) is downloaded once and cached by
// the browser. First load is slow; subsequent loads are instant.
//
// We only call this for entries older than ~7 days. Recent days go to Claude
// raw, because freshness matters for the page's "read" paragraph.

import type { Entry, Day } from "./types";

// `pipeline` is dynamically imported the first time we need it, so the 80MB
// model isn't downloaded just because the user opened settings.
let pipelinePromise: Promise<any> | null = null;

async function getSummarizer(): Promise<any> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      // Use the hosted ONNX models; they're served with CORS.
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      return pipeline("summarization", "Xenova/distilbart-cnn-6-6");
    })();
  }
  return pipelinePromise;
}

/**
 * Summarize a chunk of older entries into a single dense paragraph.
 * Returns null if no entries to summarize.
 *
 * onProgress is called with a 0..1 fraction during model download, so the UI
 * can show "Loading the on-device summarizer…".
 */
export async function summarizeEntries(
  entries: Entry[],
  onProgress?: (fraction: number) => void,
): Promise<string | null> {
  if (!entries.length) return null;

  // Stitch entries into a single document, day-tagged.
  const doc = entries
    .map(e => `[${e.day}] ${e.body.trim()}`)
    .join("\n\n");

  // Distilbart has ~1024-token input; we hand it a trimmed window.
  const trimmed = doc.length > 6000 ? doc.slice(-6000) : doc;

  const summarizer = await getSummarizer();
  if (onProgress) onProgress(0.5);

  const result = await summarizer(trimmed, {
    max_new_tokens: 180,
    min_length: 60,
    do_sample: false,
  });
  if (onProgress) onProgress(1);

  // Normalize the various shapes Transformers.js returns.
  const arr = Array.isArray(result) ? result : [result];
  const text = arr.map((r: any) => r.summary_text ?? r.generated_text ?? "").join(" ").trim();
  return text || null;
}

/**
 * Pick which entries to summarize: anything older than `keepRecentDays`.
 */
export function olderThan(entries: Entry[], referenceDay: Day, keepRecentDays = 7): Entry[] {
  const cutoff = new Date(referenceDay);
  cutoff.setDate(cutoff.getDate() - keepRecentDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return entries.filter(e => e.day < cutoffIso);
}

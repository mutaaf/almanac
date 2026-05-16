// Token telemetry. Records every Anthropic API call's usage stats locally
// (in localStorage, never transmitted) so the user can see exactly what the
// AI work cost — and verify that prompt caching is doing its job.
//
// What's stored: the kind of call (plan / meals / extract / swap), the model,
// all four token counts (input / cache-create / cache-read / output), the
// stop_reason, and a wall-clock timestamp. Last 50 calls.

import type Anthropic from "@anthropic-ai/sdk";

export interface CallRecord {
  at: number;                              // ms epoch
  kind: "plan" | "meals" | "extract" | "swap";
  model: string;
  inputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  stopReason: string;
}

const KEY = "almanac.telemetry.v1";
const LIMIT = 50;

export function recordCall(
  kind: CallRecord["kind"],
  model: string,
  resp: Anthropic.Message,
): void {
  try {
    const usage = resp.usage as Anthropic.Usage & {
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    const rec: CallRecord = {
      at: Date.now(),
      kind,
      model,
      inputTokens:       usage.input_tokens ?? 0,
      cacheCreateTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens:   usage.cache_read_input_tokens ?? 0,
      outputTokens:      usage.output_tokens ?? 0,
      stopReason:        resp.stop_reason ?? "unknown",
    };
    const arr = list();
    arr.unshift(rec);
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, LIMIT)));
  } catch {
    // Telemetry must never break a real call.
  }
}

export function list(): CallRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr as CallRecord[] : [];
  } catch {
    return [];
  }
}

export function clear(): void {
  localStorage.removeItem(KEY);
}

export interface Aggregates {
  totalCalls: number;
  totalInput: number;
  totalCacheRead: number;
  totalCacheCreate: number;
  totalOutput: number;
  /** Fraction of (input + cacheRead) that came from the cache. 0..1. */
  cacheHitRate: number;
  /** Tokens we'd have paid for at full price if there were no cache. */
  hypotheticalInput: number;
  /** Tokens actually billed at full price (input + 25% of cache-create writes). */
  effectiveInput: number;
}

export function aggregate(records: CallRecord[]): Aggregates {
  let inp = 0, cr = 0, cc = 0, out = 0;
  for (const r of records) {
    inp += r.inputTokens;
    cr  += r.cacheReadTokens;
    cc  += r.cacheCreateTokens;
    out += r.outputTokens;
  }
  const totalCacheable = inp + cr;
  // Anthropic cache pricing: cache reads are ~10% of input cost; cache writes
  // are ~125% of input. Approximate "effective" tokens = inp + cc * 1.25 + cr * 0.1.
  const hypothetical = totalCacheable + cc;
  const effective = inp + cc * 1.25 + cr * 0.1;
  return {
    totalCalls: records.length,
    totalInput: inp,
    totalCacheRead: cr,
    totalCacheCreate: cc,
    totalOutput: out,
    cacheHitRate: totalCacheable > 0 ? cr / totalCacheable : 0,
    hypotheticalInput: Math.round(hypothetical),
    effectiveInput: Math.round(effective),
  };
}

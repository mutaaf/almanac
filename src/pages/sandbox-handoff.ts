// Bring your sandbox numbers in — the pre-key → first-panel handoff (ticket 0049).
//
// The pre-key sandbox (#/try, ticket 0040) holds its typed marker values in a
// per-tab session payload. After consent, the onboarding page (src/pages/
// onboarding.ts) offers ONCE to seed a first manual panel from those values; on
// accept it stages the resolved values for the existing manual-entry review
// (src/pages/labs.ts `renderManualEntry`), which pre-populates its inputs.
//
// This module owns the two session keys and the small read/resolve/clear
// helpers both pages share. It writes NO IndexedDB and makes NO network call —
// the first IndexedDB write happens later, through the unchanged manual `addPanel`
// path, only when the prospect commits the editable review.

import { findMarker } from "../data/markers";

/** The per-tab payload the sandbox writes its typed rows to. */
const SANDBOX_SESSION_KEY = "almanac.sandbox.rows";

/** The per-tab payload the accept path stages for the manual-entry review. */
const MANUAL_PREFILL_KEY = "almanac.manualPrefill";

/** One typed value carried from the sandbox — the same shape 0040's rows use. */
export interface SandboxRow {
  key: string;
  value: number;
}

/**
 * Read the sandbox session payload and keep only rows whose marker key still
 * resolves via `findMarker()` (ticket 0049 — stale keys are skipped without
 * error). Returns [] when the key is absent, malformed, or all keys are stale.
 */
export function readResolvableSandboxRows(): SandboxRow[] {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(SANDBOX_SESSION_KEY); }
  catch { return []; }
  if (!raw) return [];

  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const rows: SandboxRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const key = (item as Record<string, unknown>).key;
    const value = (item as Record<string, unknown>).value;
    if (typeof key !== "string" || typeof value !== "number" || !Number.isFinite(value)) continue;
    // Skip a stale key that no longer resolves to a marker definition.
    if (!findMarker(key)) continue;
    rows.push({ key, value });
  }
  return rows;
}

/** Clear the sandbox session payload — called once, on accept or decline. */
export function clearSandboxRows(): void {
  try { sessionStorage.removeItem(SANDBOX_SESSION_KEY); }
  catch { /* private mode: nothing to clear */ }
}

/**
 * Stage resolved sandbox rows for the manual-entry review (ticket 0049). The
 * labs page reads this on `#/labs?manual=1` to pre-populate its inputs, then
 * clears it. Only the resolvable rows are staged (stale keys already dropped).
 */
export function stageManualPrefill(rows: SandboxRow[]): void {
  try { sessionStorage.setItem(MANUAL_PREFILL_KEY, JSON.stringify(rows)); }
  catch { /* private mode: the review just opens empty */ }
}

/**
 * Consume the staged manual prefill (ticket 0049): read it, clear it, and return
 * the resolvable rows. Single-use — a reload of the review opens empty. Returns
 * [] when nothing is staged.
 */
export function consumeManualPrefill(): SandboxRow[] {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(MANUAL_PREFILL_KEY); }
  catch { return []; }
  try { sessionStorage.removeItem(MANUAL_PREFILL_KEY); }
  catch { /* best-effort */ }
  if (!raw) return [];

  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const rows: SandboxRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const key = (item as Record<string, unknown>).key;
    const value = (item as Record<string, unknown>).value;
    if (typeof key !== "string" || typeof value !== "number" || !Number.isFinite(value)) continue;
    if (!findMarker(key)) continue;
    rows.push({ key, value });
  }
  return rows;
}

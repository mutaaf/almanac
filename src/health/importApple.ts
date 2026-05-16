// Apple Health import — main-thread orchestration.
//
// Spawn the worker, ship the file bytes off-thread, await the parsed
// ContinuousSignal rows, and merge them into the CheckIn timeline.
//
// Merge rules (per ticket 0004 acceptance criteria):
//   - Manual fields (mood, energy, sleepHours-when-already-set) NEVER get
//     overwritten by the import. The user's hand-typed values win forever.
//   - Continuous fields (hrvMs, rhrBpm, weightKg, glucoseMgDl) are filled
//     in or replaced from the import. Re-importing the same export is a
//     no-op for existing rows and an idempotent insert for missing ones.
//   - `sleepHours` is special — both the manual screen and the import can
//     write it. Manual entry wins if present; otherwise the import fills.
//
// The "no duplicate CheckIn rows" guarantee comes from the existing Dexie
// `&day` unique index on `checkins.day` — we upsert via `where(day).first()`
// just like `upsertCheckIn` does.

import { db, today as todayIso } from "../db";
import type { CheckIn } from "../types";
import type { ImportResult } from "./apple";
import type { WorkerEvent, ImportRequest } from "./apple.worker";

export interface ImportOpts {
  /** Optional progress callback for the UI (0..1). */
  onProgress?: (pct: number) => void;
}

/**
 * Run a full import: parse the file in a worker, persist the merged rows.
 * Returns the parser's ImportResult so the caller can render the banner.
 *
 * The worker is spawned per-import and terminated at the end — Web Workers
 * are cheap and the lifecycle is easier to reason about than a singleton.
 */
export async function importAppleHealth(
  file: File,
  opts: ImportOpts = {},
): Promise<ImportResult> {
  const bytes = await file.arrayBuffer();
  const result = await runWorker({ kind: "import", name: file.name, bytes }, opts);
  await mergeIntoCheckins(result);
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Worker lifecycle                                                          */
/* -------------------------------------------------------------------------- */

function runWorker(req: ImportRequest, opts: ImportOpts): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    // The `new URL(..., import.meta.url)` form is Vite's recommended Worker
    // construction — it lets the bundler emit the worker chunk separately
    // and gives the same code path in dev and prod.
    const worker = new Worker(
      new URL("./apple.worker.ts", import.meta.url),
      { type: "module" },
    );

    const cleanup = () => { try { worker.terminate(); } catch { /* ignore */ } };

    worker.addEventListener("message", (e: MessageEvent<WorkerEvent>) => {
      const ev = e.data;
      if (ev.kind === "progress") {
        opts.onProgress?.(ev.value);
        return;
      }
      if (ev.kind === "done") {
        cleanup();
        resolve(ev.result);
        return;
      }
      if (ev.kind === "error") {
        cleanup();
        reject(new Error(ev.message));
        return;
      }
    });

    worker.addEventListener("error", (e) => {
      cleanup();
      // ErrorEvent's `message` is usually populated; fall back to a generic
      // line if not.
      reject(new Error(e.message || "Worker crashed while parsing the export."));
    });

    // Transfer the bytes — that hands ownership to the worker and avoids
    // a multi-MB copy at the structured-clone boundary.
    worker.postMessage(req, [req.bytes]);
  });
}

/* -------------------------------------------------------------------------- */
/*  Merge logic                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Upsert one CheckIn per imported day, preserving any manually-logged
 * signal fields already on file. Future days are skipped — Apple Health
 * exports can include partial-day data from the day the user runs the
 * export, which is fine, but we never invent future history.
 */
async function mergeIntoCheckins(result: ImportResult): Promise<void> {
  if (result.signals.length === 0) return;
  const cutoff = todayIso();   // string compare works on YYYY-MM-DD

  await db.transaction("rw", db.checkins, async () => {
    for (const sig of result.signals) {
      if (sig.day > cutoff) continue;   // never insert future rows

      const existing = await db.checkins.where("day").equals(sig.day).first();

      // Build the merged signals object. Existing manual values win for
      // mood / energy unconditionally. sleepHours: existing wins; otherwise
      // import fills. The four continuous fields: import wins (re-importing
      // is the canonical way to update them after a watch firmware update).
      const merged: NonNullable<CheckIn["signals"]> = {
        ...(existing?.signals ?? {}),
        ...(sig.hrvMs       != null ? { hrvMs:       sig.hrvMs }       : {}),
        ...(sig.rhrBpm      != null ? { rhrBpm:      sig.rhrBpm }      : {}),
        ...(sig.weightKg    != null ? { weightKg:    sig.weightKg }    : {}),
        ...(sig.glucoseMgDl != null ? { glucoseMgDl: sig.glucoseMgDl } : {}),
      };
      // Sleep hours: prefer existing manual entry. Only fill from import
      // when the user hasn't typed one in by hand.
      if (existing?.signals?.sleepHours == null && sig.sleepHours != null) {
        merged.sleepHours = sig.sleepHours;
      }

      if (existing?.id != null) {
        await db.checkins.update(existing.id, { signals: merged });
      } else {
        await db.checkins.add({
          day: sig.day,
          habitsCompleted: [],
          signals: merged,
          createdAt: Date.now(),
        });
      }
    }
  });
}

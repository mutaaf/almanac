// Pre-analytical prep notes per marker (ticket 0051).
//
// A curated, static companion to the functional-range marker DB. Each entry
// maps a canonical marker key to a one-line note describing the widely-understood
// pre-analytical conditions that make THAT marker's reading truest — the small,
// real things (fast, exercise, time of day, alcohol) that quietly foul a draw if
// you only learn them as a regret after the needle is out.
//
// This is editorial copy keyed by marker, exactly like the marker descriptions
// in `markers.ts` — there is NO Claude call, NO derivation, NO inference. The
// notes state common, source-grounded pre-analytical practice (not a clinical
// prescription); the standing "informational, not medical advice" disclaimer
// applies. We are not telling anyone to fast for exactly 11.5 hours.
//
// Coverage is the high-frequency retest set (lipids, ferritin, fasting
// insulin/glucose, thyroid, hs-CRP, HbA1c, vitamin D). A retest marker NOT
// covered here is listed by the primer with a neutral "No special prep needed."
// line rather than omitted — broadening this table is a separate, additive
// ticket (see ticket out-of-scope).
//
// Sources, by group (consensus pre-analytical practice):
//   lipids / fasting glucose+insulin — CLSI/NACB venous-draw fasting guidance;
//     lipids and fasting insulin read truest after a 12h / 8h fast respectively,
//     and acute exercise transiently shifts triglycerides + lipid fractions.
//   thyroid — TSH has a diurnal peak in the early morning; a morning draw is the
//     comparable baseline, and thyroid replacement taken before the draw skews
//     free-hormone reads, so it is taken after.
//   hs-CRP — an acute illness, injury, or hard workout transiently elevates CRP;
//     a draw away from those reads the chronic baseline.
//   HbA1c / vitamin D — 90-day / multi-week integrators; no acute fast or timing
//     materially changes the read, so the note says so honestly.

import { findMarker } from "./markers";

/** The shared lipid-panel pre-analytical note (LDL, HDL, triglycerides, total). */
const LIPID_NOTE = "A 12-hour fast; avoid heavy exercise the 24 hours before.";

/** The shared thyroid pre-analytical note (TSH, free T3, free T4). */
const THYROID_NOTE = "A morning draw reads truest; take thyroid meds after the draw if applicable.";

/**
 * Static lookup keyed by canonical marker key → one-line pre-analytical prep
 * note. Keys are validated against the marker DB at module load (see the guard
 * below) so a stale key cannot ship.
 */
export const DRAW_PREP: Record<string, string> = {
  // Iron — ferritin is sensitive to a recent meal and to inflammation; a fasting
  // morning draw away from acute illness reads the storage baseline.
  ferritin_m: "A 12-hour fast reads truest.",
  ferritin_f: "A 12-hour fast reads truest.",

  // Lipids — fast + no acute exercise.
  ldl_c: LIPID_NOTE,
  hdl_c: LIPID_NOTE,
  triglycerides: LIPID_NOTE,
  total_cholesterol: LIPID_NOTE,

  // Metabolic — fasting glucose and insulin both read the basal state.
  fasting_glucose: "A 12-hour fast; no caffeine before the draw.",
  fasting_insulin: "An 8-hour fast; no alcohol the 24 hours before.",

  // Thyroid — morning, meds after.
  tsh: THYROID_NOTE,
  free_t3: THYROID_NOTE,
  free_t4: THYROID_NOTE,

  // Inflammation — read the chronic baseline.
  hs_crp: "Draw away from any acute illness or hard workout; both read high.",

  // Long-window integrators — honest "nothing special".
  hba1c: "No fast needed; a 90-day average, not a moment-in-time read.",
  vit_d_25oh: "No fast needed; any time of day reads the same.",
};

/**
 * Guard: every key in `DRAW_PREP` must resolve to a known marker via
 * `findMarker()`. Runs once at module load against the seed catalog (the only
 * catalog available at import time) so a typo or a renamed/removed marker key
 * fails fast — in `npm run typecheck`'s sibling `npm run build`, in the dev
 * server, and in the spec that imports this module. Pure: no DB, no network.
 */
for (const key of Object.keys(DRAW_PREP)) {
  if (!findMarker(key)) {
    throw new Error(`DRAW_PREP: "${key}" does not resolve to a known marker key in src/data/markers.ts`);
  }
}

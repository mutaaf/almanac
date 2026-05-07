// Functional-range marker database.
//
// For each marker we record:
//   - the unit Almanac stores values in (the "canonical" unit)
//   - the lab's typical reference range (broad, "normal" — not aspirational)
//   - the functional / optimal range (tighter, what proactive practice targets)
//   - aliases the extractor matches against when reading a report
//
// Functional ranges are sourced from common functional-medicine consensus
// (Bryan Walsh, Chris Kresser, Ben Bikman, Peter Attia, etc.) — they are
// targets, not diagnoses. The plan generator always shows BOTH ranges so the
// user sees how the lab's "normal" compares to a tighter optimum.
//
// Values are written in adult, fasting-draw assumptions unless otherwise
// noted. Sex-specific markers carry the `sex` field.

import type { MarkerDef } from "../types";

export const MARKERS: MarkerDef[] = [
  /* ---------- Metabolic / glucose ---------------------------------------- */
  {
    key: "fasting_glucose",
    name: "Fasting Glucose",
    category: "metabolic",
    unit: "mg/dL",
    altUnits: [{ unit: "mmol/L", toCanonical: 18.0182 }],
    aliases: ["glucose, fasting", "glucose", "fasting blood glucose", "fbg"],
    labRange:     { low: 70, high: 99 },
    optimalRange: { low: 75, high: 90 },
    description: "Fasting blood sugar. Stable below 90 reflects good insulin sensitivity; above 100 suggests early dysregulation.",
  },
  {
    key: "hba1c",
    name: "Hemoglobin A1c",
    shortName: "HbA1c",
    category: "metabolic",
    unit: "%",
    aliases: ["hba1c", "a1c", "glycated hemoglobin", "hemoglobin a1c"],
    labRange:     { high: 5.6 },
    optimalRange: { low: 4.6, high: 5.3 },
    description: "Three-month average glucose. <5.3% is a marker of metabolic resilience; lab cutoff for prediabetes is 5.7%.",
  },
  {
    key: "fasting_insulin",
    name: "Fasting Insulin",
    category: "metabolic",
    unit: "uIU/mL",
    aliases: ["insulin, fasting", "insulin", "fasting insulin"],
    labRange:     { low: 2,   high: 25 },
    optimalRange: { low: 2,   high: 5  },
    description: "How hard the pancreas is working. Functional optimum is 2–5; >7 with normal glucose still flags insulin resistance.",
  },
  {
    key: "homa_ir",
    name: "HOMA-IR",
    category: "metabolic",
    unit: "ratio",
    aliases: ["homa-ir", "homa ir", "homa"],
    labRange:     { high: 2.5 },
    optimalRange: { high: 1.0 },
    description: "Insulin × glucose ÷ 405. Functional <1.0 indicates strong sensitivity; >2.0 means the body is fighting to keep glucose down.",
  },

  /* ---------- Lipids ------------------------------------------------------ */
  {
    key: "ldl_c",
    name: "LDL Cholesterol",
    category: "lipids",
    unit: "mg/dL",
    altUnits: [{ unit: "mmol/L", toCanonical: 38.66976 }],
    aliases: ["ldl", "ldl-c", "ldl cholesterol", "ldl, calculated", "ldl direct"],
    labRange:     { high: 100 },
    optimalRange: { high: 100 },
    description: "Atherogenic carrier. Single-number target depends heavily on apoB and risk profile; flag context, not just the number.",
  },
  {
    key: "hdl_c",
    name: "HDL Cholesterol",
    category: "lipids",
    unit: "mg/dL",
    altUnits: [{ unit: "mmol/L", toCanonical: 38.66976 }],
    aliases: ["hdl", "hdl-c", "hdl cholesterol"],
    labRange:     { low: 40 },
    optimalRange: { low: 55 },
    higherIsBetter: true,
    description: "Reverse-transport cholesterol. Above 55 (men) / 65 (women) tracks with metabolic health.",
  },
  {
    key: "triglycerides",
    name: "Triglycerides",
    category: "lipids",
    unit: "mg/dL",
    altUnits: [{ unit: "mmol/L", toCanonical: 88.5 }],
    aliases: ["triglycerides", "tg", "trig"],
    labRange:     { high: 150 },
    optimalRange: { high: 80  },
    description: "Storage fat in circulation. Strongly diet-driven; fasting >100 typically signals carbohydrate overload.",
  },
  {
    key: "apo_b",
    name: "Apolipoprotein B",
    shortName: "ApoB",
    category: "lipids",
    unit: "mg/dL",
    aliases: ["apolipoprotein b", "apo b", "apob", "apolipoprotein b-100"],
    labRange:     { high: 100 },
    optimalRange: { high: 80  },
    description: "Particle count for atherogenic lipids — the better cardiovascular predictor than LDL-C alone.",
  },
  {
    key: "lp_a",
    name: "Lipoprotein(a)",
    shortName: "Lp(a)",
    category: "lipids",
    unit: "nmol/L",
    altUnits: [{ unit: "mg/dL", toCanonical: 2.5 }],
    aliases: ["lp(a)", "lipoprotein a", "lipoprotein (a)", "lpa"],
    labRange:     { high: 75 },
    optimalRange: { high: 75 },
    description: "Largely genetic atherogenic particle. If elevated, tightens every other lipid target.",
  },

  /* ---------- Thyroid ----------------------------------------------------- */
  {
    key: "tsh",
    name: "TSH",
    category: "thyroid",
    unit: "uIU/mL",
    aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin"],
    labRange:     { low: 0.4, high: 4.5 },
    optimalRange: { low: 1.0, high: 2.0 },
    description: "Pituitary signal asking the thyroid to work harder. Functional optimum is tighter than the lab range.",
  },
  {
    key: "free_t4",
    name: "Free T4",
    category: "thyroid",
    unit: "ng/dL",
    aliases: ["free t4", "ft4", "free thyroxine", "thyroxine, free"],
    labRange:     { low: 0.8, high: 1.8 },
    optimalRange: { low: 1.1, high: 1.5 },
    description: "Available thyroxine. Below 1.1 with high-normal TSH suggests undertreated/early hypothyroid.",
  },
  {
    key: "free_t3",
    name: "Free T3",
    category: "thyroid",
    unit: "pg/mL",
    aliases: ["free t3", "ft3", "triiodothyronine, free"],
    labRange:     { low: 2.3, high: 4.2 },
    optimalRange: { low: 3.0, high: 3.8 },
    description: "Active thyroid hormone. Low-normal T3 with high-normal rT3 signals stress-driven conversion problems.",
  },
  {
    key: "reverse_t3",
    name: "Reverse T3",
    category: "thyroid",
    unit: "ng/dL",
    aliases: ["reverse t3", "rt3", "rev t3"],
    labRange:     { low: 9.2, high: 24.1 },
    optimalRange: { high: 15 },
    description: "Inactive T3 isomer; rises with chronic stress, calorie restriction, or illness.",
  },

  /* ---------- Hormones (sex-specific where needed) ----------------------- */
  {
    key: "testosterone_total_m",
    name: "Testosterone, Total (Male)",
    shortName: "Total T",
    category: "hormones",
    sex: "male",
    unit: "ng/dL",
    aliases: ["testosterone, total", "total testosterone", "testosterone total", "testosterone"],
    labRange:     { low: 264, high: 916 },
    optimalRange: { low: 600, high: 900 },
    description: "Bottom half of the lab range is symptomatic for many men. Aim middle-to-upper for vitality.",
  },
  {
    key: "testosterone_free_m",
    name: "Testosterone, Free (Male)",
    shortName: "Free T",
    category: "hormones",
    sex: "male",
    unit: "pg/mL",
    aliases: ["free testosterone", "testosterone, free", "ft"],
    labRange:     { low: 4.6, high: 22.4 },
    optimalRange: { low: 12,  high: 22   },
    description: "The bioavailable fraction — symptoms track free T more than total.",
  },
  {
    key: "shbg",
    name: "SHBG",
    category: "hormones",
    unit: "nmol/L",
    aliases: ["shbg", "sex hormone binding globulin"],
    labRange:     { low: 10, high: 80 },
    optimalRange: { low: 20, high: 45 },
    description: "Binding protein that determines free hormone availability. Goes up with low-T diets, alcohol, and thyroid issues.",
  },
  {
    key: "estradiol_m",
    name: "Estradiol (Male)",
    category: "hormones",
    sex: "male",
    unit: "pg/mL",
    aliases: ["estradiol", "e2", "estradiol, sensitive"],
    labRange:     { high: 39 },
    optimalRange: { low: 20, high: 30 },
    description: "Required for libido and bone in men; both too low and too high cause symptoms.",
  },
  {
    key: "dhea_s",
    name: "DHEA-Sulfate",
    shortName: "DHEA-S",
    category: "hormones",
    unit: "ug/dL",
    aliases: ["dhea-s", "dhea sulfate", "dheas", "dehydroepiandrosterone sulfate"],
    labRange:     { low: 80, high: 560 },
    optimalRange: { low: 250, high: 450 },
    description: "Adrenal reserve. Drops with chronic stress; upper-quartile of age-band is the target.",
  },
  {
    key: "cortisol_am",
    name: "Cortisol (AM, Serum)",
    category: "hormones",
    unit: "ug/dL",
    aliases: ["cortisol", "cortisol, am", "cortisol, total"],
    labRange:     { low: 6, high: 23 },
    optimalRange: { low: 10, high: 15 },
    description: "A morning peak around 12–15 reflects healthy circadian rhythm.",
  },

  /* ---------- Vitamins ---------------------------------------------------- */
  {
    key: "vit_d_25oh",
    name: "Vitamin D, 25-Hydroxy",
    shortName: "Vitamin D",
    category: "vitamins",
    unit: "ng/mL",
    altUnits: [{ unit: "nmol/L", toCanonical: 0.4 }],
    aliases: ["vitamin d", "25-hydroxy vitamin d", "25-oh vit d", "vitamin d, 25-hydroxy", "vitamin d3, 25-hydroxy"],
    labRange:     { low: 30, high: 100 },
    optimalRange: { low: 50, high: 80  },
    description: "Hormone-like vitamin. 50–80 ng/mL supports immune, bone, and metabolic function.",
  },
  {
    key: "vit_b12",
    name: "Vitamin B12",
    category: "vitamins",
    unit: "pg/mL",
    altUnits: [{ unit: "pmol/L", toCanonical: 0.7378 }],
    aliases: ["vitamin b12", "b12", "cobalamin"],
    labRange:     { low: 200, high: 900 },
    optimalRange: { low: 600, high: 900 },
    description: "Below 500 pg/mL frequently presents as fatigue and neurological symptoms even though 'in range'.",
  },
  {
    key: "folate_rbc",
    name: "Folate, RBC",
    category: "vitamins",
    unit: "ng/mL",
    aliases: ["folate, rbc", "rbc folate", "folate rbc"],
    labRange:     { low: 280 },
    optimalRange: { low: 600, high: 900 },
    description: "Tissue-level folate; better than serum for assessing methylation cofactors.",
  },
  {
    key: "homocysteine",
    name: "Homocysteine",
    category: "inflammation",
    unit: "umol/L",
    aliases: ["homocysteine"],
    labRange:     { high: 11 },
    optimalRange: { low: 5, high: 7 },
    description: "Methylation byproduct. >9 increases cardiovascular and cognitive risk.",
  },

  /* ---------- Minerals / iron -------------------------------------------- */
  {
    key: "ferritin_m",
    name: "Ferritin (Male)",
    category: "iron",
    sex: "male",
    unit: "ng/mL",
    aliases: ["ferritin", "ferritin, serum"],
    labRange:     { low: 30, high: 400 },
    optimalRange: { low: 70, high: 150 },
    description: "Iron storage. >200 in men flags inflammation or overload; <70 often presents as fatigue.",
  },
  {
    key: "ferritin_f",
    name: "Ferritin (Female)",
    category: "iron",
    sex: "female",
    unit: "ng/mL",
    aliases: ["ferritin", "ferritin, serum"],
    labRange:     { low: 13, high: 150 },
    optimalRange: { low: 50, high: 100 },
    description: "Cycling and post-menopausal women have very different needs; <50 is the most common 'in-range but low' finding.",
  },
  {
    key: "iron_serum",
    name: "Serum Iron",
    category: "iron",
    unit: "ug/dL",
    aliases: ["iron", "iron, serum", "serum iron"],
    labRange:     { low: 50, high: 170 },
    optimalRange: { low: 85, high: 130 },
    description: "Single-point reading; interpret with TIBC and ferritin.",
  },
  {
    key: "transferrin_sat",
    name: "Transferrin Saturation",
    category: "iron",
    unit: "%",
    aliases: ["transferrin saturation", "% saturation", "tsat", "iron saturation"],
    labRange:     { low: 20, high: 50 },
    optimalRange: { low: 25, high: 35 },
    description: "Best single iron-status snapshot; >45 with high ferritin warrants HFE screening.",
  },
  {
    key: "magnesium_rbc",
    name: "Magnesium, RBC",
    category: "minerals",
    unit: "mg/dL",
    aliases: ["magnesium, rbc", "rbc magnesium", "mag rbc"],
    labRange:     { low: 4.2, high: 6.8 },
    optimalRange: { low: 6.0, high: 6.5 },
    description: "Tissue magnesium. Serum mag is normal-looking until tissue stores are very depleted.",
  },
  {
    key: "zinc_plasma",
    name: "Zinc, Plasma",
    category: "minerals",
    unit: "ug/dL",
    aliases: ["zinc", "zinc, plasma", "plasma zinc"],
    labRange:     { low: 60, high: 130 },
    optimalRange: { low: 90, high: 130 },
    description: "Immune and androgen cofactor; low zinc tracks with low testosterone in men.",
  },

  /* ---------- Inflammation ----------------------------------------------- */
  {
    key: "hs_crp",
    name: "hs-CRP",
    category: "inflammation",
    unit: "mg/L",
    aliases: ["hs-crp", "hscrp", "high sensitivity crp", "c-reactive protein, high sensitivity"],
    labRange:     { high: 3.0 },
    optimalRange: { high: 1.0 },
    description: "Smoldering inflammation marker. Strongly tied to cardiovascular risk and metabolic stress.",
  },
  {
    key: "fibrinogen",
    name: "Fibrinogen",
    category: "inflammation",
    unit: "mg/dL",
    aliases: ["fibrinogen"],
    labRange:     { low: 200, high: 400 },
    optimalRange: { low: 200, high: 300 },
    description: "Acute-phase protein and thrombosis driver. Rises with chronic inflammation.",
  },
  {
    key: "uric_acid_m",
    name: "Uric Acid (Male)",
    category: "metabolic",
    sex: "male",
    unit: "mg/dL",
    aliases: ["uric acid"],
    labRange:     { low: 3.4, high: 7.0 },
    optimalRange: { low: 4.0, high: 5.5 },
    description: "Marker of fructose load and cardiometabolic stress; >6 in men often precedes hypertension.",
  },
  {
    key: "uric_acid_f",
    name: "Uric Acid (Female)",
    category: "metabolic",
    sex: "female",
    unit: "mg/dL",
    aliases: ["uric acid"],
    labRange:     { low: 2.4, high: 6.0 },
    optimalRange: { low: 3.0, high: 5.0 },
    description: "Marker of fructose load and cardiometabolic stress.",
  },

  /* ---------- CBC -------------------------------------------------------- */
  {
    key: "hemoglobin_m",
    name: "Hemoglobin (Male)",
    shortName: "Hgb",
    category: "blood",
    sex: "male",
    unit: "g/dL",
    aliases: ["hemoglobin", "hgb", "hb"],
    labRange:     { low: 13.5, high: 17.5 },
    optimalRange: { low: 14.0, high: 15.5 },
    description: "Oxygen-carrying capacity; very high values can reflect dehydration or polycythemia.",
  },
  {
    key: "hemoglobin_f",
    name: "Hemoglobin (Female)",
    shortName: "Hgb",
    category: "blood",
    sex: "female",
    unit: "g/dL",
    aliases: ["hemoglobin", "hgb", "hb"],
    labRange:     { low: 12.0, high: 15.5 },
    optimalRange: { low: 13.0, high: 14.5 },
    description: "Oxygen-carrying capacity; functional women's optimum is tighter than the lab band.",
  },
  {
    key: "wbc",
    name: "White Blood Cells",
    shortName: "WBC",
    category: "blood",
    unit: "K/uL",
    aliases: ["wbc", "white blood cell count", "leukocytes"],
    labRange:     { low: 4.0, high: 11.0 },
    optimalRange: { low: 5.0, high: 7.5  },
    description: "Chronic high-normal points to smoldering infection or stress; chronically low can signal viral load or marrow stress.",
  },
  {
    key: "platelets",
    name: "Platelets",
    category: "blood",
    unit: "K/uL",
    aliases: ["platelets", "platelet count", "plt"],
    labRange:     { low: 150, high: 450 },
    optimalRange: { low: 200, high: 300 },
    description: "Tracks marrow output and inflammation; trends matter more than single values.",
  },

  /* ---------- Kidney / liver -------------------------------------------- */
  {
    key: "egfr",
    name: "eGFR",
    category: "kidney",
    unit: "mL/min/1.73",
    aliases: ["egfr", "estimated gfr", "glomerular filtration rate"],
    labRange:     { low: 60 },
    optimalRange: { low: 90 },
    higherIsBetter: true,
    description: "Filtration capacity. Slow decline with age is normal; <90 in your 30s warrants attention.",
  },
  {
    key: "alt",
    name: "ALT",
    category: "liver",
    unit: "U/L",
    aliases: ["alt", "sgpt", "alanine aminotransferase"],
    labRange:     { low: 7, high: 56 },
    optimalRange: { high: 26 },
    description: "Liver-specific enzyme. >26 in men or >19 in women often flags non-alcoholic fatty liver.",
  },
  {
    key: "ggt",
    name: "GGT",
    category: "liver",
    unit: "U/L",
    aliases: ["ggt", "gamma-gt", "gamma glutamyl transferase"],
    labRange:     { high: 50 },
    optimalRange: { high: 22 },
    description: "Sensitive marker of oxidative stress, alcohol, and biliary issues.",
  },
  {
    key: "albumin",
    name: "Albumin",
    category: "liver",
    unit: "g/dL",
    aliases: ["albumin"],
    labRange:     { low: 3.5, high: 5.5 },
    optimalRange: { low: 4.2, high: 5.0 },
    description: "Liver-synthesized protein. <4.2 commonly seen with chronic inflammation or low protein intake.",
  },

  /* ---------- Cardio extras ---------------------------------------------- */
  {
    key: "omega_3_index",
    name: "Omega-3 Index",
    category: "cardio",
    unit: "%",
    aliases: ["omega-3 index", "omega 3 index", "epa+dha", "epa dha"],
    labRange:     { low: 4 },
    optimalRange: { low: 8 },
    higherIsBetter: true,
    description: "EPA+DHA in red cells. >8% is the best-evidenced cardio-protective range.",
  },
];

/**
 * Look up a marker by canonical key.
 */
export function findMarker(key: string): MarkerDef | undefined {
  return MARKERS.find(m => m.key === key);
}

/**
 * Match a free-form lab name (from a report) to one of our marker keys.
 * Used by the extractor to normalize "25-OH Vit D" / "Vitamin D, 25-Hydroxy" / etc.
 */
export function matchMarker(rawName: string, sex?: string): MarkerDef | undefined {
  const norm = rawName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // First try exact / alias match within sex (if applicable).
  for (const m of MARKERS) {
    if (m.sex && sex && m.sex !== sex) continue;
    if (m.name.toLowerCase() === rawName.toLowerCase()) return m;
    if ((m.shortName ?? "").toLowerCase() === rawName.toLowerCase()) return m;
    for (const a of m.aliases) {
      const an = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (an === norm) return m;
    }
  }
  // Loose contains match as a fallback — pick the longest alias match.
  let best: { m: MarkerDef; score: number } | null = null;
  for (const m of MARKERS) {
    if (m.sex && sex && m.sex !== sex) continue;
    for (const a of m.aliases) {
      const an = a.toLowerCase();
      if (norm.includes(an) || an.includes(norm)) {
        const score = Math.min(an.length, norm.length);
        if (!best || score > best.score) best = { m, score };
      }
    }
  }
  return best?.m;
}

/**
 * Compute a Flag for a value given the optimal and lab ranges.
 */
export function flagFor(
  value: number,
  optimal?: { low?: number; high?: number },
  lab?:     { low?: number; high?: number },
): "low" | "high" | "in-range" | "suboptimal" | "optimal" {
  const inLab     = withinRange(value, lab);
  const inOptimal = withinRange(value, optimal);
  if (!inLab) return value < (lab?.low ?? -Infinity) ? "low" : "high";
  if (inOptimal) return "optimal";
  return "suboptimal";
}

function withinRange(v: number, r?: { low?: number; high?: number }): boolean {
  if (!r) return true;
  if (r.low  != null && v < r.low)  return false;
  if (r.high != null && v > r.high) return false;
  return true;
}

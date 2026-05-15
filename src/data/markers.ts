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

  /* ---------- Lipids — the rest of the panel ---------------------------- */
  {
    key: "total_cholesterol",
    name: "Total Cholesterol",
    category: "lipids",
    unit: "mg/dL",
    altUnits: [{ unit: "mmol/L", toCanonical: 38.66976 }],
    aliases: ["cholesterol, total", "total cholesterol", "cholesterol total", "cholesterol"],
    labRange:     { high: 200 },
    optimalRange: { low: 160, high: 200 },
    description: "Total minus HDL is the better marker; the absolute number matters less than ApoB and the LDL/HDL particle picture.",
  },

  /* ---------- CBC — the rest ------------------------------------------- */
  {
    key: "rbc_count_m",
    name: "Red Blood Cell Count (Male)",
    shortName: "RBC",
    category: "blood",
    sex: "male",
    unit: "10*6/uL",
    altUnits: [{ unit: "M/uL", toCanonical: 1 }, { unit: "x10^6/uL", toCanonical: 1 }],
    aliases: ["red blood cell count", "rbc", "rbc count", "erythrocytes"],
    labRange:     { low: 4.7, high: 6.1 },
    optimalRange: { low: 4.8, high: 5.5 },
    description: "Erythrocyte concentration. Trends with hemoglobin; isolated abnormalities track with hydration status.",
  },
  {
    key: "rbc_count_f",
    name: "Red Blood Cell Count (Female)",
    shortName: "RBC",
    category: "blood",
    sex: "female",
    unit: "10*6/uL",
    altUnits: [{ unit: "M/uL", toCanonical: 1 }, { unit: "x10^6/uL", toCanonical: 1 }],
    aliases: ["red blood cell count", "rbc", "rbc count", "erythrocytes"],
    labRange:     { low: 4.2, high: 5.4 },
    optimalRange: { low: 4.4, high: 5.0 },
    description: "Erythrocyte concentration. Trends with hemoglobin; isolated abnormalities track with hydration status.",
  },
  {
    key: "hematocrit_m",
    name: "Hematocrit (Male)",
    shortName: "Hct",
    category: "blood",
    sex: "male",
    unit: "%",
    aliases: ["hematocrit", "hct"],
    labRange:     { low: 41, high: 53 },
    optimalRange: { low: 43, high: 49 },
    description: "Volume fraction of red cells. >50% can reflect dehydration, smoking, or polycythemia.",
  },
  {
    key: "hematocrit_f",
    name: "Hematocrit (Female)",
    shortName: "Hct",
    category: "blood",
    sex: "female",
    unit: "%",
    aliases: ["hematocrit", "hct"],
    labRange:     { low: 36, high: 46 },
    optimalRange: { low: 38, high: 44 },
    description: "Volume fraction of red cells.",
  },
  {
    key: "mcv",
    name: "MCV — Mean Corpuscular Volume",
    shortName: "MCV",
    category: "blood",
    unit: "fL",
    aliases: ["mcv", "mean corpuscular volume", "mean cell volume"],
    labRange:     { low: 80, high: 100 },
    optimalRange: { low: 88, high: 92 },
    description: "Average red-cell size. Low: iron / B6 deficiency. High: B12 / folate deficiency or alcohol.",
  },
  {
    key: "mch",
    name: "MCH — Mean Corpuscular Hemoglobin",
    shortName: "MCH",
    category: "blood",
    unit: "pg",
    aliases: ["mch", "mean corpuscular hemoglobin"],
    labRange:     { low: 27, high: 33 },
    optimalRange: { low: 28, high: 32 },
    description: "Average hemoglobin per red cell. Tracks with MCV.",
  },
  {
    key: "mchc",
    name: "MCHC — Mean Corpuscular Hemoglobin Concentration",
    shortName: "MCHC",
    category: "blood",
    unit: "g/dL",
    aliases: ["mchc", "mean corpuscular hemoglobin concentration"],
    labRange:     { low: 32, high: 36 },
    optimalRange: { low: 33, high: 35 },
    description: "Hemoglobin density inside red cells.",
  },
  {
    key: "rdw",
    name: "RDW — Red Cell Distribution Width",
    shortName: "RDW",
    category: "blood",
    unit: "%",
    aliases: ["rdw", "rdw-cv", "red cell distribution width", "red cell distribution"],
    labRange:     { high: 14.5 },
    optimalRange: { high: 13.0 },
    description: "Variability in red-cell size. High RDW (>13%) tracks with mortality risk independent of anemia.",
  },
  {
    key: "neutrophils_pct",
    name: "Neutrophils (%)",
    category: "blood",
    unit: "%",
    aliases: ["neutrophils", "neutrophils %", "neutrophils percent", "polys", "segs"],
    labRange:     { low: 40, high: 70 },
    optimalRange: { low: 50, high: 65 },
    description: "Bacterial-defense leukocytes. Chronically high suggests infection or stress.",
  },
  {
    key: "lymphocytes_pct",
    name: "Lymphocytes (%)",
    category: "blood",
    unit: "%",
    aliases: ["lymphocytes", "lymphocytes %", "lymphocytes percent", "lymphs"],
    labRange:     { low: 20, high: 44 },
    optimalRange: { low: 24, high: 40 },
    description: "Adaptive-immune leukocytes. Low during acute viral infections and chronic stress.",
  },
  {
    key: "eosinophils_pct",
    name: "Eosinophils (%)",
    category: "blood",
    unit: "%",
    aliases: ["eosinophils", "eosinophils %", "eos"],
    labRange:     { low: 0, high: 7 },
    optimalRange: { low: 0, high: 3 },
    description: "Allergy + parasite leukocytes. >3% often flags allergic load.",
  },
  {
    key: "monocytes_pct",
    name: "Monocytes (%)",
    category: "blood",
    unit: "%",
    aliases: ["monocytes", "monocytes %", "monos"],
    labRange:     { low: 4, high: 12 },
    optimalRange: { low: 4, high: 8 },
    description: "Tissue-clearing leukocytes. Chronic high tracks with chronic infection or smoldering inflammation.",
  },
  {
    key: "basophils_pct",
    name: "Basophils (%)",
    category: "blood",
    unit: "%",
    aliases: ["basophils", "basophils %", "basos"],
    labRange:     { low: 0, high: 2 },
    optimalRange: { low: 0, high: 1 },
    description: "Rare leukocyte; often unhelpful but reported on every CBC.",
  },

  /* ---------- Kidney / electrolytes ------------------------------------ */
  {
    key: "bun",
    name: "BUN — Blood Urea Nitrogen",
    shortName: "BUN",
    category: "kidney",
    unit: "mg/dL",
    aliases: ["bun", "blood urea nitrogen", "urea nitrogen"],
    labRange:     { low: 7, high: 20 },
    optimalRange: { low: 10, high: 16 },
    description: "Protein catabolism + kidney filtration. High with dehydration or high-protein intake; low with low protein.",
  },
  {
    key: "creatinine_m",
    name: "Creatinine (Male)",
    category: "kidney",
    sex: "male",
    unit: "mg/dL",
    aliases: ["creatinine", "creatinine, serum", "serum creatinine"],
    labRange:     { low: 0.7, high: 1.3 },
    optimalRange: { low: 0.8, high: 1.0 },
    description: "Muscle-derived; varies with mass. Use eGFR for filtration assessment.",
  },
  {
    key: "creatinine_f",
    name: "Creatinine (Female)",
    category: "kidney",
    sex: "female",
    unit: "mg/dL",
    aliases: ["creatinine", "creatinine, serum", "serum creatinine"],
    labRange:     { low: 0.6, high: 1.1 },
    optimalRange: { low: 0.7, high: 0.9 },
    description: "Muscle-derived. Use eGFR for filtration assessment.",
  },
  {
    key: "sodium",
    name: "Sodium",
    category: "metabolic",
    unit: "mEq/L",
    aliases: ["sodium", "na", "na+"],
    labRange:     { low: 136, high: 145 },
    optimalRange: { low: 138, high: 142 },
    description: "Extracellular fluid balance. Low (<135) needs investigation; high tracks with dehydration.",
  },
  {
    key: "potassium",
    name: "Potassium",
    category: "metabolic",
    unit: "mEq/L",
    aliases: ["potassium", "k", "k+"],
    labRange:     { low: 3.5, high: 5.1 },
    optimalRange: { low: 4.0, high: 4.5 },
    description: "Intracellular electrolyte. Symptoms (cramps, palpitations) often appear before lab abnormality.",
  },
  {
    key: "chloride",
    name: "Chloride",
    category: "metabolic",
    unit: "mEq/L",
    aliases: ["chloride", "cl", "cl-"],
    labRange:     { low: 98, high: 107 },
    optimalRange: { low: 100, high: 106 },
    description: "Tracks with sodium; abnormalities usually mirror acid-base disorders.",
  },
  {
    key: "co2",
    name: "CO₂ (Bicarbonate)",
    shortName: "CO₂",
    category: "metabolic",
    unit: "mEq/L",
    aliases: ["co2", "co2, total", "carbon dioxide", "bicarbonate", "hco3"],
    labRange:     { low: 22, high: 29 },
    optimalRange: { low: 25, high: 30 },
    description: "Acid-base balance. Low with metabolic acidosis (uncontrolled DM, kidney disease).",
  },
  {
    key: "calcium",
    name: "Calcium",
    category: "minerals",
    unit: "mg/dL",
    aliases: ["calcium", "calcium, serum", "ca", "total calcium"],
    labRange:     { low: 8.6, high: 10.3 },
    optimalRange: { low: 9.4, high: 9.8 },
    description: "Tightly regulated; check ionized calcium and PTH if abnormal.",
  },

  /* ---------- Liver — the rest ----------------------------------------- */
  {
    key: "ast",
    name: "AST",
    category: "liver",
    unit: "U/L",
    aliases: ["ast", "sgot", "aspartate aminotransferase"],
    labRange:     { low: 10, high: 40 },
    optimalRange: { high: 26 },
    description: "Less liver-specific than ALT; rises with muscle damage too. AST/ALT >1 can flag alcohol or advanced liver disease.",
  },
  {
    key: "alkaline_phosphatase",
    name: "Alkaline Phosphatase",
    shortName: "ALP",
    category: "liver",
    unit: "U/L",
    aliases: ["alkaline phosphatase", "alp"],
    labRange:     { low: 44, high: 147 },
    optimalRange: { low: 60, high: 90 },
    description: "Liver / bone enzyme. Elevated with biliary disease or bone turnover; very low with zinc / B6 deficiency.",
  },
  {
    key: "bilirubin_total",
    name: "Bilirubin, Total",
    category: "liver",
    unit: "mg/dL",
    aliases: ["bilirubin", "bilirubin, total", "total bilirubin"],
    labRange:     { low: 0.2, high: 1.2 },
    optimalRange: { low: 0.2, high: 1.0 },
    description: "Heme catabolism product. Mildly elevated values commonly reflect Gilbert's syndrome.",
  },
  {
    key: "total_protein",
    name: "Total Protein",
    category: "liver",
    unit: "g/dL",
    aliases: ["total protein", "protein, total"],
    labRange:     { low: 6.0, high: 8.3 },
    optimalRange: { low: 6.9, high: 7.4 },
    description: "Albumin + globulins. Low with malnutrition or liver disease; high with chronic inflammation.",
  },
];

/**
 * Look up a marker by canonical key. The optional `extras` lets a caller
 * fold user-defined markers into the search (user wins on key collision).
 */
export function findMarker(key: string, extras: MarkerDef[] = []): MarkerDef | undefined {
  const user = extras.find(m => m.key === key);
  if (user) return user;
  return MARKERS.find(m => m.key === key);
}

/**
 * Match a free-form lab name (from a report) to one of our marker keys.
 * Used by the extractor to normalize "25-OH Vit D" / "Vitamin D, 25-Hydroxy" / etc.
 *
 * `extras` lets a caller pass user-defined markers into the scoring; on a
 * score tie, the user entry wins because it appears first in the scored set.
 */
export function matchMarker(rawName: string, sex?: string, extras: MarkerDef[] = []): MarkerDef | undefined {
  const top = findBestMatches(rawName, sex, 1, extras);
  return top[0]?.marker;
}

/**
 * Return the top N candidate markers for a free-form lab name, scored
 * 0–1 (1 = exact alias match). Used by the panel-detail UI when a row
 * fails automatic matching and needs human review.
 *
 * Sex-restricted markers are filtered out unless the caller's sex matches
 * (`unspecified` is treated as "show all").
 *
 * `extras` is prepended to the seed list so user markers participate in
 * scoring; on a strict tie the user entry wins because it's encountered
 * first by the stable sort. Any seed entry whose key matches an extras
 * entry is suppressed (the user's definition overrides ours).
 */
export function findBestMatches(rawName: string, sex?: string, n = 3, extras: MarkerDef[] = []): {
  marker: MarkerDef; score: number; via: string;
}[] {
  const norm = normalize(rawName);
  const tokens = new Set(norm.split(" ").filter(Boolean));

  type Hit = { marker: MarkerDef; score: number; via: string };
  const hits: Hit[] = [];

  const overriddenKeys = new Set(extras.map(e => e.key));
  const pool: MarkerDef[] = [
    ...extras,
    ...MARKERS.filter(m => !overriddenKeys.has(m.key)),
  ];

  for (const m of pool) {
    if (m.sex && sex && sex !== "unspecified" && m.sex !== sex) continue;

    // Build the candidate label set: name, shortName, every alias.
    const candidates: string[] = [m.name, m.shortName ?? "", ...m.aliases].filter(Boolean);
    let best: { score: number; via: string } | null = null;

    for (const c of candidates) {
      const cn = normalize(c);
      let score = 0;
      let via = c;

      if (cn === norm) {
        score = 1;
      } else if (cn.length >= 3 && (norm === cn || norm.startsWith(cn + " ") || norm.endsWith(" " + cn))) {
        score = 0.95;
      } else if (cn.length >= 4 && (norm.includes(cn) || cn.includes(norm))) {
        score = 0.7 + 0.2 * (Math.min(cn.length, norm.length) / Math.max(cn.length, norm.length));
      } else {
        // Token-overlap (Jaccard).
        const ct = new Set(cn.split(" ").filter(Boolean));
        let inter = 0;
        for (const t of tokens) if (ct.has(t)) inter++;
        const union = tokens.size + ct.size - inter;
        if (inter > 0 && union > 0) score = 0.4 * (inter / union);
      }

      if (score > 0 && (!best || score > best.score)) best = { score, via };
    }

    if (best && best.score > 0.25) {
      hits.push({ marker: m, score: best.score, via: best.via });
    }
  }

  // Stable sort: higher score first, but ties keep input order (user entries
  // prepended, so user wins on tie).
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, n);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

// Cross-marker insight engine.
//
// Curated rules that scan one or more panels for clinically meaningful
// multi-marker patterns. The output is a list of PreComputedInsight entries
// that get passed to the plan generator as AUTHORITATIVE FINDINGS — Claude
// reasons from them instead of having to derive them from the raw values.
//
// This is the part of Almanac that a Claude.app user couldn't replicate by
// pasting screenshots: the rules are curated functional-medicine patterns,
// they look across panels (timeline awareness), and they fire deterministically.

import type { Panel, Profile, Result } from "./types";

export interface PreComputedInsight {
  id: string;
  title: string;
  detail: string;                  // 1–3 sentences explaining the pattern
  priority: "high" | "medium" | "low";
  supportingMarkers: string[];     // markerKeys that triggered the rule
  category: "pattern" | "trend";
  evidence?: string;               // human-readable values that fired the rule
}

interface RuleContext {
  panels: Panel[];                 // newest first
  profile: Profile;
  /** Latest result for a given markerKey across all panels. */
  latest: (key: string) => { value: number; panel: Panel; result: Result } | undefined;
  /** Series of values for a marker, oldest → newest. */
  series: (key: string) => { value: number; drawnAt: string }[];
}

interface Rule {
  id: string;
  category: "pattern" | "trend";
  evaluate: (ctx: RuleContext) => Omit<PreComputedInsight, "id" | "category"> | null;
}

/* ============================================================================
   Pattern rules — multi-marker biology
   ============================================================================ */

const RULES: Rule[] = [
  /* ---------- Iron-restricted erythropoiesis -------------------------- */
  {
    id: "iron_restricted_erythropoiesis",
    category: "pattern",
    evaluate: (ctx) => {
      const ferritin = ctx.latest(ctx.profile.sex === "male" ? "ferritin_m" : "ferritin_f");
      const mcv  = ctx.latest("mcv");
      const mch  = ctx.latest("mch");
      const rbc  = ctx.latest(ctx.profile.sex === "male" ? "rbc_count_m" : "rbc_count_f");
      const hgb  = ctx.latest(ctx.profile.sex === "male" ? "hemoglobin_m" : "hemoglobin_f");

      // Need at least ferritin + one red-cell index.
      if (!ferritin) return null;
      const lowFerritin = ctx.profile.sex === "male"
        ? ferritin.value < 70
        : ferritin.value < 50;
      if (!lowFerritin) return null;

      const supportingHits: string[] = ["ferritin"];
      const evidence: string[] = [`ferritin ${ferritin.value} ng/mL`];
      let signals = 0;

      if (mcv && mcv.value < 88) { signals++; supportingHits.push("mcv"); evidence.push(`MCV ${mcv.value} fL`); }
      if (mch && mch.value < 28) { signals++; supportingHits.push("mch"); evidence.push(`MCH ${mch.value} pg`); }
      if (rbc && rbc.value < (ctx.profile.sex === "male" ? 4.8 : 4.4)) {
        signals++; supportingHits.push("rbc"); evidence.push(`RBC ${rbc.value}`);
      }
      if (hgb && hgb.value < (ctx.profile.sex === "male" ? 14 : 13)) {
        signals++; supportingHits.push("hgb"); evidence.push(`Hgb ${hgb.value} g/dL`);
      }

      if (signals < 1) return null;

      return {
        title: "Iron-restricted erythropoiesis pattern",
        detail:
          `Ferritin sits below the functional floor while red-cell indices ` +
          `are trending small / underfilled. Even with hemoglobin "in range", ` +
          `this picture commonly presents as fatigue, exercise intolerance, ` +
          `and brain fog. Iron repletion through food (red meat, liver, ` +
          `lentils with vitamin C) typically resolves the pattern over 8–12 weeks.`,
        priority: signals >= 2 ? "high" : "medium",
        supportingMarkers: supportingHits,
        evidence: evidence.join(" · "),
      };
    },
  },

  /* ---------- Subclinical hypothyroid pattern ------------------------- */
  {
    id: "subclinical_hypothyroid",
    category: "pattern",
    evaluate: (ctx) => {
      const tsh = ctx.latest("tsh");
      const ft4 = ctx.latest("free_t4");
      const ft3 = ctx.latest("free_t3");
      const rt3 = ctx.latest("reverse_t3");
      if (!tsh) return null;

      const tshHigh = tsh.value > 2.0;     // functional ceiling
      if (!tshHigh) return null;

      const supports: string[] = ["tsh"];
      const ev: string[] = [`TSH ${tsh.value} (functional 1.0–2.0)`];

      const ft4Low = !!(ft4 && ft4.value < 1.1);
      const ft3Low = !!(ft3 && ft3.value < 3.0);
      const rt3Hi  = !!(rt3 && rt3.value > 15);

      if (ft4Low) { supports.push("free_t4"); ev.push(`Free T4 ${ft4!.value}`); }
      if (ft3Low) { supports.push("free_t3"); ev.push(`Free T3 ${ft3!.value}`); }
      if (rt3Hi)  { supports.push("reverse_t3"); ev.push(`rT3 ${rt3!.value}`); }

      const signals = (ft4Low ? 1 : 0) + (ft3Low ? 1 : 0) + (rt3Hi ? 1 : 0);

      // TSH alone is weak; need at least one supporting low/elevated peripheral.
      if (signals < 1 && tsh.value < 4.0) return null;

      return {
        title: "Subclinical thyroid hypofunction pattern",
        detail:
          `TSH above the functional ceiling${signals > 0 ? ` plus low peripheral hormones` : ""} ` +
          `is consistent with early or stress-driven hypothyroid drift. ` +
          `Common contributors: chronic energy deficit, low selenium / iodine intake, ` +
          `gut inflammation, and elevated cortisol. Worth a full thyroid panel ` +
          `(TPO + TG antibodies) and a clinical conversation.`,
        priority: signals >= 2 || tsh.value > 4.0 ? "high" : "medium",
        supportingMarkers: supports,
        evidence: ev.join(" · "),
      };
    },
  },

  /* ---------- Insulin resistance pattern ------------------------------ */
  {
    id: "insulin_resistance",
    category: "pattern",
    evaluate: (ctx) => {
      const fasting = ctx.latest("fasting_glucose");
      const insulin = ctx.latest("fasting_insulin");
      const homa    = ctx.latest("homa_ir");
      const tg      = ctx.latest("triglycerides");
      const hdl     = ctx.latest("hdl_c");
      const a1c     = ctx.latest("hba1c");

      const supports: string[] = [];
      const ev: string[] = [];
      let signals = 0;

      if (insulin && insulin.value > 5)  { signals++; supports.push("fasting_insulin"); ev.push(`fasting insulin ${insulin.value}`); }
      if (homa    && homa.value > 1.0)   { signals++; supports.push("homa_ir"); ev.push(`HOMA-IR ${homa.value}`); }
      if (tg      && tg.value > 100)     { signals++; supports.push("triglycerides"); ev.push(`TG ${tg.value} mg/dL`); }
      if (hdl     && hdl.value < 55)     { signals++; supports.push("hdl_c"); ev.push(`HDL ${hdl.value} mg/dL`); }
      if (a1c     && a1c.value > 5.3)    { signals++; supports.push("hba1c"); ev.push(`A1c ${a1c.value}%`); }
      if (fasting && fasting.value > 90) { signals++; supports.push("fasting_glucose"); ev.push(`fasting glucose ${fasting.value}`); }

      if (signals < 3) return null;

      return {
        title: "Insulin resistance / dysglycemia pattern",
        detail:
          `Multiple markers point to the body fighting to keep glucose in check: ` +
          `${ev.slice(0, 4).join(", ")}. This typically responds well to ` +
          `protein-forward meals, lower refined-carb load, post-meal walking, ` +
          `and resistance training before any pharmacology is needed.`,
        priority: signals >= 4 ? "high" : "medium",
        supportingMarkers: supports,
        evidence: ev.join(" · "),
      };
    },
  },

  /* ---------- Atherogenic dyslipidemia (ApoB / TG / HDL) -------------- */
  {
    id: "atherogenic_dyslipidemia",
    category: "pattern",
    evaluate: (ctx) => {
      const apob = ctx.latest("apo_b");
      const tg   = ctx.latest("triglycerides");
      const hdl  = ctx.latest("hdl_c");
      const ldl  = ctx.latest("ldl_c");

      const supports: string[] = [];
      const ev: string[] = [];
      let signals = 0;

      if (apob && apob.value > 80)    { signals++; supports.push("apo_b"); ev.push(`ApoB ${apob.value}`); }
      if (tg   && tg.value > 100)     { signals++; supports.push("triglycerides"); ev.push(`TG ${tg.value}`); }
      if (hdl  && hdl.value < 55)     { signals++; supports.push("hdl_c"); ev.push(`HDL ${hdl.value}`); }
      if (ldl  && ldl.value > 130)    { signals++; supports.push("ldl_c"); ev.push(`LDL ${ldl.value}`); }
      if (tg && hdl && (tg.value / hdl.value) > 2) {
        signals++; supports.push("tg_hdl_ratio"); ev.push(`TG/HDL ${(tg.value/hdl.value).toFixed(1)}`);
      }

      if (signals < 2) return null;

      return {
        title: "Atherogenic lipid pattern",
        detail:
          `Particle-count and ratio markers indicate elevated cardiovascular risk ` +
          `beyond what total cholesterol alone would suggest. Soluble fiber, ` +
          `omega-3 (EPA+DHA at 2–4 g/d), reducing refined carbs, and weight-bearing ` +
          `exercise all reduce ApoB. Consider Lp(a) and LDL particle count if not yet measured.`,
        priority: signals >= 3 ? "high" : "medium",
        supportingMarkers: supports,
        evidence: ev.join(" · "),
      };
    },
  },

  /* ---------- B12/folate insufficiency w/ macrocytosis --------------- */
  {
    id: "b12_folate_insufficiency",
    category: "pattern",
    evaluate: (ctx) => {
      const b12  = ctx.latest("vit_b12");
      const folate = ctx.latest("folate_rbc");
      const homo = ctx.latest("homocysteine");
      const mcv  = ctx.latest("mcv");

      const supports: string[] = [];
      const ev: string[] = [];
      let signals = 0;

      if (b12 && b12.value < 600)    { signals++; supports.push("vit_b12"); ev.push(`B12 ${b12.value}`); }
      if (folate && folate.value < 600) { signals++; supports.push("folate_rbc"); ev.push(`RBC folate ${folate.value}`); }
      if (homo && homo.value > 9)    { signals++; supports.push("homocysteine"); ev.push(`homocysteine ${homo.value}`); }
      if (mcv && mcv.value > 92)     { signals++; supports.push("mcv"); ev.push(`MCV ${mcv.value}`); }

      if (signals < 2) return null;

      return {
        title: "Methylation cofactor insufficiency",
        detail:
          `B12 and/or folate sit below functional optima${homo ? ` and homocysteine is elevated` : ""}` +
          `${mcv && mcv.value > 92 ? `, with macrocytosis suggesting tissue-level depletion` : ""}. ` +
          `Methylcobalamin + methylfolate (especially if you have an MTHFR variant), ` +
          `pasture-raised eggs, sardines, and dark leafy greens are the food levers.`,
        priority: signals >= 3 ? "high" : "medium",
        supportingMarkers: supports,
        evidence: ev.join(" · "),
      };
    },
  },

  /* ---------- Smoldering inflammation triad -------------------------- */
  {
    id: "inflammation_triad",
    category: "pattern",
    evaluate: (ctx) => {
      const crp  = ctx.latest("hs_crp");
      const fer  = ctx.latest(ctx.profile.sex === "male" ? "ferritin_m" : "ferritin_f");
      const wbc  = ctx.latest("wbc");
      const homo = ctx.latest("homocysteine");

      const supports: string[] = [];
      const ev: string[] = [];
      let signals = 0;

      if (crp && crp.value > 1)       { signals++; supports.push("hs_crp"); ev.push(`hs-CRP ${crp.value}`); }
      // Ferritin acts as an acute-phase reactant — high ferritin with normal iron is a flag.
      if (fer && fer.value > 200 && ctx.profile.sex === "male") {
        signals++; supports.push("ferritin_m"); ev.push(`ferritin ${fer.value}`);
      }
      if (fer && fer.value > 150 && ctx.profile.sex === "female") {
        signals++; supports.push("ferritin_f"); ev.push(`ferritin ${fer.value}`);
      }
      if (wbc && wbc.value > 7.5)     { signals++; supports.push("wbc"); ev.push(`WBC ${wbc.value}`); }
      if (homo && homo.value > 9)     { signals++; supports.push("homocysteine"); ev.push(`homocysteine ${homo.value}`); }

      if (signals < 2) return null;

      return {
        title: "Smoldering inflammation pattern",
        detail:
          `Multiple markers point to chronic low-grade inflammation rather than ` +
          `an acute event. Common drivers: poor sleep, central adiposity, refined ` +
          `seed-oil intake, dental issues, gut permeability. Anti-inflammatory ` +
          `diet (omega-3, polyphenols, removal of seed oils) plus better sleep ` +
          `is the most cost-effective first lever.`,
        priority: signals >= 3 ? "high" : "medium",
        supportingMarkers: supports,
        evidence: ev.join(" · "),
      };
    },
  },
];

/* ============================================================================
   Trend rules — pattern over time
   ============================================================================ */

interface TrendRule {
  id: string;
  evaluate: (ctx: RuleContext) => Omit<PreComputedInsight, "id" | "category"> | null;
}

const TREND_RULES: TrendRule[] = [
  /* ---------- Persistent above functional ----------------------------- */
  {
    id: "persistent_high_total_chol",
    evaluate: (ctx) => persistentAbove(ctx, "total_cholesterol", 200, 3,
      "Total cholesterol persistently elevated",
      "Multiple consecutive draws above the functional ceiling — pattern, not a one-off. " +
      "Soluble fiber, plant sterols, omega-3, and reducing saturated fat are the highest-leverage food moves; " +
      "discuss ApoB / Lp(a) testing with your clinician for a fuller risk picture."),
  },
  {
    id: "persistent_high_ldl",
    evaluate: (ctx) => persistentAbove(ctx, "ldl_c", 130, 2,
      "LDL persistently elevated",
      "LDL has stayed above 130 across recent draws. Consider ApoB testing for particle count if not already done; " +
      "the response to dietary intervention varies, so plan a re-test in 12 weeks."),
  },
  {
    id: "trending_down_ferritin",
    evaluate: (ctx) => trendingMonotonic(ctx,
      ctx.profile.sex === "male" ? "ferritin_m" : "ferritin_f",
      3, "down",
      "Ferritin trending downward",
      "Iron stores have been declining across consecutive draws — a real trajectory, not noise. " +
      "Common causes: occult blood loss, low dietary heme intake, gut absorption issues. " +
      "If the trend continues, a clinician conversation is warranted."),
  },
  {
    id: "trending_up_a1c",
    evaluate: (ctx) => trendingMonotonic(ctx, "hba1c", 3, "up",
      "A1c trending upward",
      "Three-month average glucose is climbing across draws. Even within 'normal lab range', " +
      "a rising A1c is the earliest signal of metabolic drift; protein-forward meals, " +
      "post-meal walks, and resistance training reverse this in most cases."),
  },
];

function persistentAbove(
  ctx: RuleContext,
  key: string,
  threshold: number,
  minPanels: number,
  title: string,
  detail: string,
): Omit<PreComputedInsight, "id" | "category"> | null {
  const series = ctx.series(key);
  if (series.length < minPanels) return null;
  const recent = series.slice(-minPanels);
  if (!recent.every(p => p.value > threshold)) return null;
  const values = recent.map(p => p.value).join(", ");
  return {
    title,
    detail: `${detail} Values: ${values}.`,
    priority: "high",
    supportingMarkers: [key],
    evidence: `${recent.length} consecutive draws above ${threshold}`,
  };
}

function trendingMonotonic(
  ctx: RuleContext,
  key: string,
  minPanels: number,
  direction: "up" | "down",
  title: string,
  detail: string,
): Omit<PreComputedInsight, "id" | "category"> | null {
  const series = ctx.series(key);
  if (series.length < minPanels) return null;
  const recent = series.slice(-minPanels);
  let monotonic = true;
  for (let i = 1; i < recent.length; i++) {
    const a = recent[i-1]!.value, b = recent[i]!.value;
    if (direction === "up"   && b <= a) { monotonic = false; break; }
    if (direction === "down" && b >= a) { monotonic = false; break; }
  }
  if (!monotonic) return null;
  return {
    title,
    detail: `${detail} Values: ${recent.map(p => p.value).join(" → ")}.`,
    priority: "medium",
    supportingMarkers: [key],
    evidence: `${recent.length} consecutive ${direction === "up" ? "rises" : "falls"}`,
  };
}

/* ============================================================================
   Public API
   ============================================================================ */

/**
 * Run every rule against the provided panels + profile and return the firing
 * insights, sorted high → medium → low priority.
 *
 * Pass panels NEWEST FIRST (the same convention used elsewhere).
 */
export function computeInsights(panels: Panel[], profile: Profile): PreComputedInsight[] {
  if (!panels.length) return [];

  // Build the lookup helpers.
  const byKey = new Map<string, { value: number; panel: Panel; result: Result; drawnAt: string }[]>();
  // Iterate oldest → newest so series is chronological.
  const ordered = [...panels].sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));
  for (const p of ordered) {
    for (const r of p.results) {
      if (!byKey.has(r.markerKey)) byKey.set(r.markerKey, []);
      byKey.get(r.markerKey)!.push({ value: r.value, panel: p, result: r, drawnAt: p.drawnAt });
    }
  }

  const ctx: RuleContext = {
    panels,
    profile,
    latest: (key) => {
      const arr = byKey.get(key);
      if (!arr || !arr.length) return undefined;
      const last = arr[arr.length - 1]!;
      return { value: last.value, panel: last.panel, result: last.result };
    },
    series: (key) => (byKey.get(key) ?? []).map(x => ({ value: x.value, drawnAt: x.drawnAt })),
  };

  const out: PreComputedInsight[] = [];

  for (const rule of RULES) {
    const hit = rule.evaluate(ctx);
    if (hit) out.push({ id: rule.id, category: "pattern", ...hit });
  }
  for (const rule of TREND_RULES) {
    const hit = rule.evaluate(ctx);
    if (hit) out.push({ id: rule.id, category: "trend", ...hit });
  }

  const order = (p: "high" | "medium" | "low") => p === "high" ? 0 : p === "medium" ? 1 : 2;
  out.sort((a, b) => order(a.priority) - order(b.priority));
  return out;
}

/**
 * Format insights for inclusion in the LLM prompt. Each entry is a single
 * authoritative line so Claude can incorporate them without needing to
 * re-derive the pattern.
 */
export function formatInsightsForPrompt(insights: PreComputedInsight[]): string {
  if (!insights.length) return "";
  const lines = [
    `# Pre-computed insights (programmatic; deterministic; treat as authoritative findings)`,
    `These were computed from your data BEFORE this prompt was assembled. They are`,
    `multi-marker patterns and time-series trends; incorporate them into the Plan's`,
    `insights array verbatim or refined, but do not contradict them. Each line is:`,
    `[priority] title — detail (markers; evidence).`,
    ``,
  ];
  for (const ins of insights) {
    lines.push(
      `- [${ins.priority}] ${ins.title} — ${ins.detail} (markers: ${ins.supportingMarkers.join(", ")}; evidence: ${ins.evidence ?? ""})`,
    );
  }
  return lines.join("\n");
}

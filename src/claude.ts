// Plan generator. Reads the user's profile, lab panels, prior plan, and
// recent adherence — returns a structured Plan (snapshot, insights,
// nutrition, lifestyle, supplements, habit stack, retest schedule).
//
// BYOK from the browser; all prompt caching is wired so within a 5-minute
// TTL only the freshest content (today's check-ins, a newly-added panel)
// re-reads the input window.

import Anthropic from "@anthropic-ai/sdk";
import type { Profile, Panel, Plan, CheckIn, Result } from "./types";
import { findMarker } from "./data/markers";
import { age } from "./db";

const VOICE_SPEC = `
You are the editor of Almanac — a private, longitudinal precision-health
protocol for one reader. Your job is to translate their lab biology and
adherence data into a plan they can actually keep.

Tone:
  - Editorial. Plain English. No medical jargon without a one-line gloss.
  - Second person ("you"), warm but exacting.
  - Never sycophantic. Never use "journey", "amazing", or "exciting".
  - You are not a coach yelling encouragement and you are not a chatbot
    hedging every claim. You are a careful reader of the person's biology,
    naming what is true and prescribing what is doable.

Operating principles:
  1. Easy-tier first.  Earn harder protocols by holding the easy ones.
     The HabitStack is exactly 3–5 daily things, every one of which a
     tired person can do without thinking. Difficulty is rated 1–5 and
     tier is "easy" by default; "moderate" / "advanced" only when the
     reader's adherence history shows they've held the easy ones.
  2. Tie every recommendation to a specific finding.  No generic advice.
     If you suggest 2g/day EPA+DHA, point to the omega-3 index or hsCRP
     that justifies it.
  3. Functional vs lab range.  Always reason against the FUNCTIONAL /
     OPTIMAL range (provided in the marker reference). The lab's
     "in-range" is a floor, not a target.
  4. Supplement caution.  Only recommend supplements with a clear
     biomarker-driven rationale. Include doses, timing, food/empty-
     stomach notes, and a "caution" line with the most relevant
     interactions or monitoring needed.
  5. Retest cadence.  For each high-priority finding, suggest WHEN to
     re-test in weeks and WHY. 8–12 weeks for most nutrients; 12–16 for
     metabolic; 6–12 weeks post-intervention for inflammation.
  6. This is informational, not medical advice.  Do not diagnose, do not
     name a disease state. Use phrases like "tracks with", "is consistent
     with", "warrants discussion with your clinician".

Output format:
  Return ONLY a single JSON object matching this TypeScript interface, with
  no prose, no markdown fences:

  interface Plan {
    snapshot: string;          // 2 short paragraphs, plain language
    insights: Array<{
      markerKey?: string;
      title: string;           // "Iron stores are low-normal"
      detail: string;          // 1–3 sentences
      priority: "high" | "medium" | "low";
    }>;                        // 3–7 items, ordered high→low
    nutrition:   Recommendation[];   // 3–6 items
    lifestyle:   Recommendation[];   // 3–6 items
    supplements: Recommendation[];   // 0–6 items
    habitStack: {
      intro: string;           // 1 sentence framing
      habits: Array<{
        id: string;            // stable kebab-case id, unique within plan
        title: string;         // short imperative — under ~10 words
        cue: string;           // when/where it lives in the day
        why: string;           // one sentence linking to a finding/goal
      }>;                      // exactly 3–5 items
    };
    retest: Array<{
      markerKeys: string[];
      whenWeeks: number;
      reason: string;
    }>;
  }

  interface Recommendation {
    id: string;                // stable kebab-case id, unique within plan
    title: string;
    why: string;
    how: string;
    tier: "easy" | "moderate" | "advanced";
    expectedImpact?: string;
    caution?: string;          // required for supplements; optional elsewhere
  }
`.trim();

/* -------------------------------------------------------------------------- */

export interface GeneratePlanInput {
  profile: Profile;
  panels: Panel[];          // newest first
  previousPlan?: Plan;
  recentCheckIns: CheckIn[];
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(private profile: Profile) {
    if (!profile.anthropicKey) throw new Error("No Anthropic key set.");
    this.client = new Anthropic({
      apiKey: profile.anthropicKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async generatePlan(input: GeneratePlanInput): Promise<{
    plan: Omit<Plan, "id" | "generatedAt" | "basedOnPanelIds">;
    model: string;
    raw: string;
  }> {
    const model = this.profile.model || "claude-sonnet-4-6";

    /* ------ system: voice spec.  Cached.  ------------------------------- */
    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: VOICE_SPEC, cache_control: { type: "ephemeral" } },
    ];

    /* ------ stable preamble: profile + marker reference.  Cached. ------- */
    const profileBlock = formatProfile(input.profile);
    const markerRef    = formatMarkerReference(input.panels);
    const preamble = [profileBlock, markerRef].join("\n\n");

    /* ------ volatile: panels + check-ins + prior plan. Not cached. ------ */
    const panelsBlock = formatPanels(input.panels);
    const adherence   = formatAdherence(input.recentCheckIns, input.previousPlan);
    const priorPlan   = input.previousPlan ? formatPriorPlan(input.previousPlan) : "";

    const fresh = [
      panelsBlock,
      adherence,
      priorPlan,
      `# Task`,
      `Generate today's Plan in the JSON shape specified by the system message.`,
      `Use the FUNCTIONAL ranges in the Marker Reference to determine what is`,
      `optimal vs merely "in lab range". Tie every recommendation to a finding.`,
      `Keep the HabitStack to 3–5 easy-tier items the reader can hold daily.`,
      `Return only JSON, no prose.`,
    ].join("\n\n");

    const messages: Anthropic.MessageParam[] = [{
      role: "user",
      content: [
        { type: "text", text: preamble, cache_control: { type: "ephemeral" } },
        { type: "text", text: fresh },
      ],
    }];

    const resp = await this.client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages,
    });

    const raw = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text).join("\n").trim();

    const parsed = parseJson(raw);
    const plan = normalizePlan(parsed);
    return { plan, model, raw };
  }
}

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

function formatProfile(p: Profile): string {
  const a = age(p.birthDate) ?? "?";
  return [
    `# Reader`,
    `Name:    ${p.ownerName}`,
    `Age:     ${a}`,
    `Sex:     ${p.sex}`,
    p.heightCm ? `Height:  ${p.heightCm} cm` : "",
    p.weightKg ? `Weight:  ${p.weightKg} kg` : "",
    ``,
    `# Goals`,
    p.goals || "(none stated)",
    ``,
    `# Existing conditions / medications / allergies`,
    p.conditions || "(none stated)",
  ].filter(Boolean).join("\n");
}

/**
 * Compact reference of every marker referenced by any panel — Claude needs
 * the description + functional range to reason. We only include markers
 * that actually appeared in the panels to keep the prompt tight.
 */
function formatMarkerReference(panels: Panel[]): string {
  const keys = new Set<string>();
  for (const p of panels) for (const r of p.results) keys.add(r.markerKey);
  if (keys.size === 0) return `# Marker Reference\n(no markers in panels yet)`;

  const lines = [`# Marker Reference (functional ranges + descriptions)`];
  for (const k of keys) {
    const m = findMarker(k);
    if (!m) continue;
    const lab     = m.labRange     ? rangeStr(m.labRange,     m.unit) : "—";
    const optimal = m.optimalRange ? rangeStr(m.optimalRange, m.unit) : "—";
    lines.push(`- ${m.name} [${m.key}] · unit ${m.unit} · lab ${lab} · functional ${optimal} — ${m.description}`);
  }
  return lines.join("\n");
}

function formatPanels(panels: Panel[]): string {
  if (!panels.length) return `# Panels\n(no labs entered yet)`;
  const lines = [`# Panels (newest first)`];
  for (const p of panels) {
    lines.push(`\n## ${p.drawnAt}${p.labName ? ` · ${p.labName}` : ""} (${p.source})`);
    for (const r of p.results) lines.push(`  - ${formatResult(r)}`);
    if (p.notes) lines.push(`  notes: ${p.notes}`);
  }
  return lines.join("\n");
}

function formatResult(r: Result): string {
  const m = findMarker(r.markerKey);
  const name = m?.shortName ?? m?.name ?? r.markerKey;
  const lab     = r.labRange     ? rangeStr(r.labRange,     r.unit) : "—";
  const optimal = r.optimalRange ? rangeStr(r.optimalRange, r.unit) : "—";
  const flag = r.flag ? ` [${r.flag}]` : "";
  return `${name}: ${r.value} ${r.unit} · lab ${lab} · functional ${optimal}${flag}`;
}

function rangeStr(r: { low?: number; high?: number }, unit: string): string {
  if (r.low != null && r.high != null) return `${r.low}–${r.high} ${unit}`;
  if (r.low != null)  return `≥ ${r.low} ${unit}`;
  if (r.high != null) return `≤ ${r.high} ${unit}`;
  return `— ${unit}`;
}

function formatAdherence(checkins: CheckIn[], prior?: Plan): string {
  if (!checkins.length || !prior) return `# Adherence\n(no check-ins on the prior plan yet)`;
  const habits = prior.habitStack.habits;
  const counts = new Map<string, number>();
  for (const c of checkins) for (const h of c.habitsCompleted) counts.set(h, (counts.get(h) ?? 0) + 1);
  const lines = [`# Adherence (last ${checkins.length} days)`];
  for (const h of habits) {
    const hit = counts.get(h.id) ?? 0;
    const pct = Math.round((hit / checkins.length) * 100);
    lines.push(`  - "${h.title}" — ${hit}/${checkins.length} days (${pct}%)`);
  }
  return lines.join("\n");
}

function formatPriorPlan(p: Plan): string {
  return [
    `# Previous Plan (for continuity — iterate, don't overwrite)`,
    `## Snapshot`,
    p.snapshot,
    `## Habit Stack`,
    ...p.habitStack.habits.map(h => `  - [${h.id}] ${h.title} (cue: ${h.cue})`),
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/*  JSON parsing + normalization                                              */
/* -------------------------------------------------------------------------- */

function parseJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const slice = (start >= 0 && end > start) ? candidate.slice(start, end + 1) : candidate;
  try { return JSON.parse(slice); }
  catch (err) { throw new Error(`Could not parse plan JSON.\n--- raw ---\n${text}`); }
}

function normalizePlan(parsed: Record<string, unknown>): Omit<Plan, "id" | "generatedAt" | "basedOnPanelIds"> {
  const stack = (parsed.habitStack ?? {}) as any;
  return {
    snapshot: String(parsed.snapshot ?? "").trim(),
    insights: Array.isArray(parsed.insights) ? parsed.insights as Plan["insights"] : [],
    nutrition:   Array.isArray(parsed.nutrition)   ? parsed.nutrition   as Plan["nutrition"]   : [],
    lifestyle:   Array.isArray(parsed.lifestyle)   ? parsed.lifestyle   as Plan["lifestyle"]   : [],
    supplements: Array.isArray(parsed.supplements) ? parsed.supplements as Plan["supplements"] : [],
    habitStack: {
      intro: String(stack.intro ?? "").trim(),
      habits: Array.isArray(stack.habits) ? stack.habits as Plan["habitStack"]["habits"] : [],
    },
    retest: Array.isArray(parsed.retest) ? parsed.retest as Plan["retest"] : [],
  };
}

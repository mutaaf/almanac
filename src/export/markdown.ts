// Readable Markdown export (ticket 0027).
//
// `renderAlmanacMarkdown` is a pure, deterministic transform over the exact
// shape `exportAll()` returns: it emits a single human-readable Markdown
// document in the editorial register — a dateline header, a Profile summary,
// a section per panel, a section per plan, a marker-trend appendix, and an
// Adherence summary. No DOM, no Dexie, no network. The whole artifact is built
// from data the user already owns; nothing leaves the device.
//
// The companion to the JSON export (`src/db.ts exportAll`): the JSON is the
// importable backup, this is the record a human actually reads. It carries the
// extracted results, not the source PDFs — the same lean shape `exportAll()`
// strips blobs to.
//
// Display names resolve through the marker DB (`findMarker` folding in the
// merged catalog from `getAllMarkers`) so sex-specific and user-defined keys
// render their human names. The trend appendix mirrors the Progress page's
// oldest → newest per-markerKey series logic.
//
// THE ANTHROPIC KEY IS NEVER RENDERED — not the value, not a masked form, not a
// "key present" note. The Profile section reads only the human-facing fields.

import type { AlmanacExport } from "../db";
import type { MarkerDef, Panel, Plan, Result, CheckIn, Range, Profile } from "../types";
import { findMarker } from "../data/markers";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Full "Month Year" of an ISO `YYYY-MM-DD` date, e.g. "May 2026". */
function monthYear(iso: string): string {
  const mo = Number(iso.slice(5, 7));
  const yr = iso.slice(0, 4);
  return `${MONTHS[mo - 1] ?? ""} ${yr}`.trim();
}

/** Full month name of an ISO `YYYY-MM-DD` date, e.g. "May". */
function monthName(iso: string): string {
  const mo = Number(iso.slice(5, 7));
  return MONTHS[mo - 1] ?? "";
}

/** "Month Year" of a wall-clock ms timestamp, e.g. "May 2026". */
function monthYearOf(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`.trim();
}

/** Whole years from `birthDate` to the export instant. Undefined when absent. */
function ageAt(birthDate: string | undefined, exportedAt: number): number | undefined {
  if (!birthDate) return undefined;
  const b = new Date(birthDate + "T00:00:00");
  const now = new Date(exportedAt);
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

/** A filename-safe slug of the owner name, e.g. "Mira Chen" → "mira-chen". */
export function slugifyName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The download filename for the Markdown export: `<slug(ownerName)>.almanac.md`,
 * falling back to `almanac.md` when the name slugs to empty. Mirrors the JSON
 * export's `.almanac.json` suffix convention so the two read as a pair.
 */
export function markdownFilename(ownerName: string | undefined): string {
  const slug = slugifyName(ownerName ?? "");
  return slug ? `${slug}.almanac.md` : "almanac.md";
}

/** Human display name for a markerKey — shortName, then name, then the key. */
function displayName(markerKey: string, markers: MarkerDef[]): string {
  const m = findMarker(markerKey, markers);
  return m?.shortName ?? m?.name ?? markerKey;
}

/** Render one range as "low–high", a half-open bound, or "—" when absent. */
function rangeText(range: Range | undefined): string {
  if (!range || (range.low == null && range.high == null)) return "—";
  if (range.low != null && range.high != null) return `${range.low}–${range.high}`;
  if (range.low != null) return `≥ ${range.low}`;
  return `≤ ${range.high}`;
}

/** A single result line: "<name> — <value> <unit> · lab range … · functional … · <flag>". */
function resultLine(r: Result, markers: MarkerDef[]): string {
  const name = displayName(r.markerKey, markers);
  const flag = r.flag ?? "—";
  return `- ${name} — ${r.value} ${r.unit} · lab range ${rangeText(r.labRange)} · functional ${rangeText(r.optimalRange)} · ${flag}`;
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                  */
/* -------------------------------------------------------------------------- */

function renderDateline(profile: Profile | undefined, panels: Panel[], exportedAt: number): string {
  const owner = profile?.ownerName?.trim() || "A user";
  // Newest panel month, or the export month when there are no panels.
  const newestDraw = panels.reduce<string | null>((acc, p) => {
    return acc == null || p.drawnAt > acc ? p.drawnAt : acc;
  }, null);
  const through = newestDraw ? monthYear(newestDraw) : monthYearOf(exportedAt);
  return [
    `# Almanac — ${owner}`,
    "",
    `A drawn record through ${through}.`,
  ].join("\n");
}

function renderProfile(profile: Profile | undefined, exportedAt: number): string {
  const lines = ["## Profile", ""];
  if (!profile) {
    lines.push("No profile saved.");
    return lines.join("\n");
  }
  const age = ageAt(profile.birthDate, exportedAt);
  lines.push(`- Name: ${profile.ownerName || "—"}`);
  if (age != null) lines.push(`- Age: ${age}`);
  lines.push(`- Sex: ${profile.sex}`);
  if (profile.goals?.trim()) lines.push(`- Goals: ${profile.goals.trim()}`);
  if (profile.conditions?.trim()) lines.push(`- Conditions: ${profile.conditions.trim()}`);
  if (profile.dietPattern?.trim()) lines.push(`- Dietary pattern: ${profile.dietPattern.trim()}`);
  return lines.join("\n");
}

function renderPanels(panels: Panel[], markers: MarkerDef[]): string {
  const lines = ["## Panels", ""];
  if (!panels.length) {
    lines.push("No panels recorded.");
    return lines.join("\n");
  }
  // Newest first.
  const ordered = [...panels].sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
  for (const p of ordered) {
    const head = p.labName ? `### ${p.drawnAt} · ${p.labName}` : `### ${p.drawnAt}`;
    lines.push(head, "");
    for (const r of p.results) lines.push(resultLine(r, markers));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function renderPlans(plans: Plan[], markers: MarkerDef[]): string {
  const lines = ["## Plans", ""];
  if (!plans.length) {
    lines.push("No plans composed.");
    return lines.join("\n");
  }
  // Newest first.
  const ordered = [...plans].sort((a, b) => b.generatedAt - a.generatedAt);
  for (const plan of ordered) {
    lines.push(`### Composed ${monthYearOf(plan.generatedAt)}`, "");

    if (plan.snapshot?.trim()) {
      lines.push(plan.snapshot.trim(), "");
    }

    // Insights in priority order (high → medium → low), stable within a tier.
    const insights = orderByPriority(plan.insights ?? []);
    if (insights.length) {
      lines.push("**Insights**", "");
      for (const i of insights) lines.push(`- ${i.title} — ${i.detail}`);
      lines.push("");
    }

    if (plan.eatList?.length) {
      lines.push("**Eat**", "");
      for (const e of plan.eatList) {
        const parts = [e.food, e.frequency, e.portion, e.why].filter((s) => s && s.trim());
        lines.push(`- ${parts.join(" · ")}`);
      }
      lines.push("");
    }

    if (plan.avoidList?.length) {
      lines.push("**Avoid**", "");
      for (const a of plan.avoidList) {
        const parts = [a.food, a.swap ? `swap: ${a.swap}` : "", a.why].filter((s) => s && s.trim());
        lines.push(`- ${parts.join(" · ")}`);
      }
      lines.push("");
    }

    const habits = plan.habitStack?.habits ?? [];
    if (habits.length) {
      lines.push("**Habits**", "");
      for (const h of habits) {
        const parts = [h.title, h.cue].filter((s) => s && s.trim());
        lines.push(`- ${parts.join(" · ")}`);
      }
      lines.push("");
    }

    if (plan.retest?.length) {
      lines.push("**Retest**", "");
      for (const rt of plan.retest) {
        const names = rt.markerKeys.map((k) => displayName(k, markers)).join(", ");
        const cadence = `in ${rt.whenWeeks} weeks`;
        const parts = [names, cadence, rt.reason].filter((s) => s && s.trim());
        lines.push(`- ${parts.join(" · ")}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}

/** A high → medium → low ordering that is stable within each tier. */
function orderByPriority<T extends { priority?: "high" | "medium" | "low" }>(items: T[]): T[] {
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...items]
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const ra = rank[a.item.priority ?? "medium"] ?? 1;
      const rb = rank[b.item.priority ?? "medium"] ?? 1;
      return ra === rb ? a.idx - b.idx : ra - rb;
    })
    .map((w) => w.item);
}

/** One trend row per marker with ≥ 2 draws across the timeline. */
interface TrendRow {
  markerKey: string;
  oldestValue: number;
  oldestMonth: string;
  newestValue: number;
  newestMonth: string;
  unit: string;
}

function buildTrends(panels: Panel[]): TrendRow[] {
  // Oldest → newest, the same chronological reading the Progress page uses.
  const ordered = [...panels].sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));
  const series = new Map<string, { drawnAt: string; value: number; unit: string }[]>();
  for (const p of ordered) {
    for (const r of p.results) {
      if (!series.has(r.markerKey)) series.set(r.markerKey, []);
      series.get(r.markerKey)!.push({ drawnAt: p.drawnAt, value: r.value, unit: r.unit });
    }
  }
  const rows: TrendRow[] = [];
  for (const [markerKey, points] of series) {
    if (points.length < 2) continue; // single draw — no trend to show
    const oldest = points[0]!;
    const newest = points[points.length - 1]!;
    rows.push({
      markerKey,
      oldestValue: oldest.value,
      oldestMonth: monthName(oldest.drawnAt),
      newestValue: newest.value,
      newestMonth: monthName(newest.drawnAt),
      unit: newest.unit,
    });
  }
  return rows;
}

function renderTrends(panels: Panel[], markers: MarkerDef[]): string {
  const lines = ["## Marker trends", ""];
  const rows = buildTrends(panels);
  if (!rows.length) {
    lines.push("No marker has two or more draws yet — no trend to show.");
    return lines.join("\n");
  }
  for (const row of rows) {
    const name = displayName(row.markerKey, markers);
    lines.push(`- ${name}: ${row.oldestValue} (${row.oldestMonth}) → ${row.newestValue} (${row.newestMonth}) ${row.unit}`);
  }
  return lines.join("\n");
}

function renderAdherence(checkins: CheckIn[], plans: Plan[], markers: MarkerDef[]): string {
  void markers;
  const lines = ["## Adherence", ""];
  if (!checkins.length) {
    lines.push("No check-ins logged yet.");
    return lines.join("\n");
  }
  const total = checkins.length;
  lines.push(`${total} day${total === 1 ? "" : "s"} logged.`, "");

  // Build the habit-id → title lookup from every plan's habit stack (newest
  // plan wins on id collision so the title matches what the user sees today).
  const titleById = new Map<string, string>();
  const orderedPlans = [...plans].sort((a, b) => a.generatedAt - b.generatedAt);
  for (const plan of orderedPlans) {
    for (const h of plan.habitStack?.habits ?? []) titleById.set(h.id, h.title);
  }

  // Count hits per habit id over the logged span, preserving plan order.
  const hits = new Map<string, number>();
  for (const c of checkins) {
    for (const id of c.habitsCompleted ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
  }

  // Render in the order habits appear in the newest plan, then any orphan ids.
  const newest = orderedPlans[orderedPlans.length - 1];
  const orderedIds: string[] = [];
  for (const h of newest?.habitStack?.habits ?? []) orderedIds.push(h.id);
  for (const id of hits.keys()) if (!orderedIds.includes(id)) orderedIds.push(id);

  for (const id of orderedIds) {
    const count = hits.get(id) ?? 0;
    if (count === 0) continue; // a habit never logged adds no signal
    const label = titleById.get(id) ?? id;
    lines.push(`- ${label} — ${count} of ${total} logged days`);
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Render the whole almanac as a single Markdown document. Pure: the only inputs
 * are the export object and the merged marker catalog (so display names resolve
 * for user-defined and sex-specific keys). No DOM, no Dexie, no network.
 *
 * `markers` defaults to the empty list so `findMarker` falls back to the seed
 * DB — callers that want user-marker names resolved pass `getAllMarkers()`.
 */
export function renderAlmanacMarkdown(data: AlmanacExport, markers: MarkerDef[] = []): string {
  const sections = [
    renderDateline(data.profile, data.panels ?? [], data.exportedAt),
    renderProfile(data.profile, data.exportedAt),
    renderPanels(data.panels ?? [], markers),
    renderPlans(data.plans ?? [], markers),
    renderTrends(data.panels ?? [], markers),
    renderAdherence(data.checkins ?? [], data.plans ?? [], markers),
  ];
  return sections.join("\n\n") + "\n";
}

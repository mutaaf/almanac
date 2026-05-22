// Print-sheet HTML renderers — pure functions over Plan + Profile + Panels.
//
// Two audiences, two templates:
//
//   renderForDoctor — clinical hand-off. Includes the snapshot, every
//     insight (with marker references), eat/avoid items with their `why`,
//     habit stack, retest schedule, and a panels summary that names the most
//     recent draw date + every out-of-range result. Strips goals / conditions
//     / household / API key / meal plan from the source data.
//
//   renderForFriend — social hand-off. Includes the snapshot, the eat list
//     reduced to titles + portions, the avoid list reduced to titles + swap,
//     and the habit stack. Strips every reference to marker data (values,
//     functional ranges, retest schedule) and the user's narrative intake.
//
// Both renderers escape every string they emit (via esc()) so a malicious or
// odd lab note can't smuggle markup into the print output. The API key is
// never read by these functions — it is not part of their input. That's a
// belt-and-braces defence on top of "Profile is not passed verbatim".
//
// Output is a single `.print-sheet[data-audience=...]` block, including the
// editorial type via inline styles that survive the browser's print engine.

import { esc, longDate } from "../ui";
import type {
  Plan, Panel, EatItem, AvoidItem, Habit, RetestItem, Insight,
  HundredDayState, ArcHabit, MarkerMovement,
} from "../types";
import { findMarker } from "../data/markers";
import { glossForRule } from "../insights";

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Minimal subset of Profile that the print renderers may read. Goals,
 * conditions, household size, and the API key are not part of this type
 * on purpose — neither audience PDF should include them, so the renderers
 * cannot accidentally leak what they cannot see.
 */
export interface PrintProfile {
  ownerName: string;
}

export interface DoctorRenderOpts {
  audience: "doctor";
  profile: PrintProfile;
  plan: Plan;
  panels: Panel[];
  today: string;          // YYYY-MM-DD
}

export interface FriendRenderOpts {
  audience: "friend";
  profile: PrintProfile;
  plan: Plan;
  today: string;          // YYYY-MM-DD
  hideName: boolean;
}

/** Render the doctor variant — clinical, marker-grounded. */
export function renderForDoctor(opts: DoctorRenderOpts): string {
  const { profile, plan, panels, today } = opts;
  return wrapSheet("doctor", `
    ${doctorHead(profile.ownerName, today)}
    ${snapshotBlock(plan.snapshot)}
    ${insightsBlock(plan.insights)}
    ${eatBlockDoctor(plan.eatList)}
    ${avoidBlockDoctor(plan.avoidList)}
    ${habitsBlock(plan.habitStack.habits)}
    ${retestBlock(plan.retest)}
    ${panelsSummaryBlock(panels)}
    ${renderProvenanceAppendix(plan)}
    ${colophon("Generated on-device from your protocol. Discuss changes with your clinician.")}
  `);
}

/** Render the friend variant — narrative, no labs. */
export function renderForFriend(opts: FriendRenderOpts): string {
  const { profile, plan, today, hideName } = opts;
  const displayName = hideName ? "A user" : profile.ownerName;
  return wrapSheet("friend", `
    ${friendHead(displayName, today)}
    ${snapshotBlock(plan.snapshot)}
    ${eatBlockFriend(plan.eatList)}
    ${avoidBlockFriend(plan.avoidList)}
    ${habitsBlock(plan.habitStack.habits)}
    ${colophon("Informational. Not medical advice.")}
  `);
}

/* -------------------------------------------------------------------------- */
/*  Hundred-day one-pager (ticket 0021)                                       */
/* -------------------------------------------------------------------------- */

const HD_ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

function hundredDayEyebrow(quarterIndex: number): string {
  const ord = HD_ORDINALS[quarterIndex - 1];
  return ord ? `The ${ord} hundred` : `Quarter ${quarterIndex}`;
}

/**
 * The hundred-day print sheet — the same three sections (arc / labs /
 * editorial) the in-app surface renders, laid onto a `.print-sheet`. The
 * audience is "user / clinician" (informational, not a clinical hand-off), so
 * there is no API key, no goals/conditions, no meal plan — none of which are
 * part of `HundredDayState` to begin with. Re-uses the existing `.print-sheet`
 * typography tokens; no new colors.
 */
export function renderHundredDayTemplate(state: HundredDayState): string {
  const spanDays =
    Math.round(
      (Date.parse(`${state.windowEnd}T00:00:00Z`) - Date.parse(`${state.windowStart}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  return wrapSheet("hundred-day", `
    <header class="print-sheet__head">
      <div class="print-sheet__eyebrow">Almanac · ${esc(hundredDayEyebrow(state.quarterIndex))}</div>
      <h1 class="print-sheet__title">What ${spanDays} days actually did.</h1>
      <div class="print-sheet__meta">${esc(longDate(state.windowStart))} — ${esc(longDate(state.windowEnd))}</div>
    </header>
    ${hundredDayArcBlock(state.arc.habits)}
    ${hundredDayLabsBlock(state.labs)}
    ${hundredDayEditorialBlock(state.editorial.paragraphs)}
    ${colophon("Computed on-device from your protocol timeline. Informational; discuss changes with your clinician.")}
  `);
}

function hundredDayArcBlock(habits: ArcHabit[]): string {
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">The arc</h2>
      ${habits.length
        ? `<ul class="print-sheet__list">
            ${habits.map(h => `
              <li class="print-sheet__habit">
                <strong>${esc(h.title)}</strong>
                <span class="print-sheet__habit-cue"> — ${h.heldDays} of 100 days${hundredDayArcNote(h)}</span>
              </li>
            `).join("")}
          </ul>`
        : `<p class="print-sheet__para">No habit appeared in a plan during this quarter.</p>`}
    </section>
  `;
}

function hundredDayArcNote(h: ArcHabit): string {
  if (h.addedOnDay != null && h.addedOnDay > 0) return `, added on day ${h.addedOnDay}`;
  if (h.slipWeek != null) return `, slipped from week ${h.slipWeek}`;
  return ", held";
}

function hundredDayLabsBlock(labs: HundredDayState["labs"]): string {
  const { panels, markerMovements } = labs;
  let body: string;
  if (panels.length === 0) {
    body = `<p class="print-sheet__para">No draws inside the window. Habit cadence is the only signal we have for this quarter.</p>`;
  } else if (markerMovements.length === 0) {
    const drawn = panels[panels.length - 1]!.drawnAt;
    body = `<p class="print-sheet__para">Two draws within the window are needed for a delta. You drew once — ${esc(longDate(drawn))}.</p>`;
  } else {
    body = `<ul class="print-sheet__list">
      ${markerMovements.map(hundredDayMovementRow).join("")}
    </ul>`;
  }
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">The labs</h2>
      ${body}
    </section>
  `;
}

function hundredDayMovementRow(m: MarkerMovement): string {
  const def = findMarker(m.markerKey);
  const label = def?.shortName ?? def?.name ?? m.markerKey;
  const dir = m.lastValue > m.firstValue ? "→" : m.lastValue < m.firstValue ? "↓" : "→";
  const verdict =
    m.projectionEvaluation === "within" ? " · within the projected band" :
    m.projectionEvaluation === "above"  ? " · above the projected band" :
    m.projectionEvaluation === "below"  ? " · below the projected band" : "";
  return `
    <li class="print-sheet__panel-row">
      <span class="print-sheet__panel-marker">${esc(label)}</span>
      <span class="print-sheet__panel-value">${esc(m.firstValue)} ${dir} ${esc(m.lastValue)} ${esc(m.unit)}</span>
      ${verdict ? `<span class="print-sheet__panel-range">${esc(verdict.replace(/^ · /, ""))}</span>` : ""}
    </li>
  `;
}

function hundredDayEditorialBlock(paragraphs: HundredDayState["editorial"]["paragraphs"]): string {
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">The editorial</h2>
      ${paragraphs.length
        ? paragraphs.map(p => `<p class="print-sheet__para">${esc(p.sentence)}</p>`).join("")
        : `<p class="print-sheet__para">The data this quarter is too thin for a paragraph.</p>`}
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Sheet scaffold + heads                                                    */
/* -------------------------------------------------------------------------- */

function wrapSheet(audience: "doctor" | "friend" | "hundred-day", inner: string): string {
  // Inline the typography variables on the sheet itself so the browser's
  // print engine has everything it needs even if the cascade is hidden by
  // an aggressive `@media print`. The `data-audience` hook is what the spec
  // grep'ing tests assert on.
  return `
    <article class="print-sheet" data-audience="${audience}" aria-label="Almanac protocol — ${esc(audience)}">
      ${inner}
    </article>
  `;
}

function doctorHead(name: string, today: string): string {
  return `
    <header class="print-sheet__head">
      <div class="print-sheet__eyebrow">Almanac · Protocol summary</div>
      <h1 class="print-sheet__title">${esc(name)}</h1>
      <div class="print-sheet__meta">${esc(longDate(today))}</div>
    </header>
  `;
}

function friendHead(displayName: string, today: string): string {
  return `
    <header class="print-sheet__head">
      <div class="print-sheet__eyebrow">${esc(longDate(today))}</div>
      <h1 class="print-sheet__title">${esc(displayName)}'s protocol.</h1>
    </header>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Shared blocks                                                             */
/* -------------------------------------------------------------------------- */

function snapshotBlock(snapshot: string): string {
  const paragraphs = snapshot
    .split(/\n\n+/)
    .filter(p => p.trim().length > 0)
    .map(p => `<p class="print-sheet__para">${esc(p)}</p>`)
    .join("");
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">Snapshot</h2>
      ${paragraphs}
    </section>
  `;
}

function habitsBlock(habits: Habit[]): string {
  if (!habits.length) return "";
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">Habit stack</h2>
      <ol class="print-sheet__list">
        ${habits.map(h => `
          <li class="print-sheet__habit">
            <strong>${esc(h.title)}</strong>
            <span class="print-sheet__habit-cue"> — ${esc(h.cue)}</span>
          </li>
        `).join("")}
      </ol>
    </section>
  `;
}

function colophon(line: string): string {
  return `
    <footer class="print-sheet__colophon">${esc(line)}</footer>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Doctor-only blocks                                                        */
/* -------------------------------------------------------------------------- */

function insightsBlock(insights: Insight[]): string {
  if (!insights.length) return "";
  // Group by priority so the clinical reader sees high → low.
  const ordered = [...insights].sort((a, b) => priWeight(a.priority) - priWeight(b.priority));
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">What stands out</h2>
      <ul class="print-sheet__list">
        ${ordered.map(i => {
          const marker = i.markerKey ? findMarker(i.markerKey) : undefined;
          const markerLabel = marker ? ` <span class="print-sheet__chip">${esc(marker.shortName ?? marker.name)}</span>` : "";
          return `
            <li class="print-sheet__insight print-sheet__insight--${esc(i.priority)}">
              <div class="print-sheet__insight-title">${esc(i.title)}${markerLabel}</div>
              <p class="print-sheet__insight-detail">${esc(i.detail)}</p>
            </li>
          `;
        }).join("")}
      </ul>
    </section>
  `;
}

function eatBlockDoctor(items: EatItem[]): string {
  if (!items.length) return "";
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">Eat — the food prescription</h2>
      <ul class="print-sheet__list">
        ${items.map(e => `
          <li class="print-sheet__eat">
            <div class="print-sheet__eat-head">
              <strong>${esc(e.food)}</strong>
              <span class="print-sheet__eat-meta">${esc(e.frequency)} · ${esc(e.portion)}</span>
            </div>
            <p class="print-sheet__eat-why"><em>Why:</em> ${esc(e.why)}</p>
            ${e.markerKeys.length ? `<div class="print-sheet__markers">${e.markerKeys.map(renderMarkerChip).join("")}</div>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function avoidBlockDoctor(items: AvoidItem[]): string {
  if (!items.length) return "";
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">Reduce or replace</h2>
      <ul class="print-sheet__list">
        ${items.map(a => `
          <li class="print-sheet__avoid">
            <div><strong>${esc(a.food)}</strong></div>
            <p class="print-sheet__avoid-why"><em>Why:</em> ${esc(a.why)}</p>
            ${a.swap ? `<p class="print-sheet__avoid-swap"><em>Swap:</em> ${esc(a.swap)}</p>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function retestBlock(items: RetestItem[]): string {
  if (!items.length) return "";
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">Retest cadence</h2>
      <ul class="print-sheet__list">
        ${items.map(r => `
          <li class="print-sheet__retest">
            <strong>${esc(r.markerKeys.join(", "))}</strong>
            in <strong>${esc(r.whenWeeks)}</strong> weeks — ${esc(r.reason)}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

/**
 * Panel summary: the most recent draw date + every out-of-range result on it,
 * one line per marker with the value, unit, and the marker's functional range
 * (when known). The clinician's at-a-glance "what's actually wrong" table.
 *
 * "Out of range" = either the lab's flag fired, OR the value falls outside
 * the functional range we have on file for the marker. The functional range
 * is the tighter window — most clinicians will recognize it as the basis for
 * the plan's recommendations.
 */
function panelsSummaryBlock(panels: Panel[]): string {
  if (!panels.length) return "";
  // Pick the most recent draw.
  const ordered = [...panels].sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
  const latest = ordered[0]!;
  const rows: string[] = [];
  for (const r of latest.results) {
    const m = findMarker(r.markerKey);
    const opt = m?.optimalRange;
    const lab = r.labRange ?? m?.labRange;
    const isOutOfLab = lab && (
      (lab.low  != null && r.value < lab.low) ||
      (lab.high != null && r.value > lab.high)
    );
    const isOutOfOpt = opt && (
      (opt.low  != null && r.value < opt.low) ||
      (opt.high != null && r.value > opt.high)
    );
    const flagged = !!r.flag && r.flag !== "in-range" && r.flag !== "optimal";
    if (!isOutOfLab && !isOutOfOpt && !flagged) continue;
    rows.push(`
      <li class="print-sheet__panel-row">
        <span class="print-sheet__panel-marker">${esc(m?.shortName ?? m?.name ?? r.markerKey)}</span>
        <span class="print-sheet__panel-value">${esc(r.value)} ${esc(r.unit)}</span>
        ${opt ? `<span class="print-sheet__panel-range">functional ${esc(formatRange(opt))}</span>` : ""}
      </li>
    `);
  }
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">Panel summary — most recent draw</h2>
      <div class="print-sheet__panel-meta">Drawn ${esc(latest.drawnAt)}${latest.labName ? ` · ${esc(latest.labName)}` : ""}</div>
      ${rows.length
        ? `<ul class="print-sheet__list">${rows.join("")}</ul>`
        : `<p class="print-sheet__quiet">No out-of-range markers on the most recent draw.</p>`}
    </section>
  `;
}

function renderMarkerChip(key: string): string {
  const m = findMarker(key);
  return `<span class="print-sheet__chip">${esc(m?.shortName ?? m?.name ?? key)}</span>`;
}

function formatRange(r: { low?: number; high?: number }): string {
  if (r.low != null && r.high != null) return `${r.low}–${r.high}`;
  if (r.high != null) return `< ${r.high}`;
  if (r.low  != null) return `> ${r.low}`;
  return "—";
}

/* -------------------------------------------------------------------------- */
/*  Doctor-only: provenance appendix (ticket 0016)                            */
/* -------------------------------------------------------------------------- */

// The closing line per rule entry, verbatim from ticket 0013's in-app slideover.
// Naming it as a module constant so any future refactor that changes the copy
// has to find both call sites at once.
const PROVENANCE_FOOTER_LINE =
  "This finding was produced by a deterministic rule, not by the language model.";

/**
 * Render the "Rule provenance" appendix for the doctor PDF, ticket 0016.
 *
 * Surfaces the existing `Insight.provenance` data attached by the rule engine
 * (ticket 0013) — one block per rule-emitted insight, in the order they appear
 * in `plan.insights[]`. LLM-only insights (no `provenance` field) are filtered
 * out: provenance on paper is for deterministic findings only, same discipline
 * the in-app slideover enforces.
 *
 * Returns "" when the filtered list is empty so `renderForDoctor()` can append
 * unconditionally without leaving an empty heading on the page.
 */
function renderProvenanceAppendix(plan: Plan): string {
  const rows = plan.insights.filter(i => !!i.provenance);
  if (rows.length === 0) return "";
  return `
    <section class="print-sheet__section provenance-appendix" aria-label="Rule provenance">
      <h2 class="print-sheet__heading">Rule provenance</h2>
      ${rows.map(renderProvenanceRow).join("")}
    </section>
  `;
}

function renderProvenanceRow(insight: Insight): string {
  // The `!` is safe because renderProvenanceAppendix filters to insights
  // that carry a provenance field; this helper isn't called otherwise.
  const p = insight.provenance!;
  const ruleTag = `${p.ruleId} · ${p.category}`;
  const gloss = glossForRule(p.ruleId);
  return `
    <article class="provenance-appendix__rule">
      <header class="provenance-appendix__rule-head">
        <h3 class="provenance-appendix__title">${esc(insight.title)}</h3>
        <code class="provenance-appendix__rule-id">${esc(ruleTag)}</code>
      </header>
      ${renderProvenanceMarkerTable(p.supportingMarkers)}
      <p class="provenance-appendix__evidence">${esc(p.evidence)}</p>
      ${gloss ? `<p class="provenance-appendix__gloss">${esc(gloss)}</p>` : ""}
      <p class="provenance-appendix__footer">${esc(PROVENANCE_FOOTER_LINE)}</p>
    </article>
  `;
}

function renderProvenanceMarkerTable(
  markers: NonNullable<Insight["provenance"]>["supportingMarkers"],
): string {
  // Five columns per the ticket: Marker, Value, Unit, Drawn, Threshold.
  // Threshold is optional on each row and renders as an em-dash when missing —
  // many rules don't carry per-marker thresholds in the engine output today.
  return `
    <table class="provenance-appendix__markers">
      <thead>
        <tr>
          <th scope="col">Marker</th>
          <th scope="col">Value</th>
          <th scope="col">Unit</th>
          <th scope="col">Drawn</th>
          <th scope="col">Threshold</th>
        </tr>
      </thead>
      <tbody>
        ${markers.map(m => {
          const def = findMarker(m.markerKey);
          const label = def?.shortName ?? def?.name ?? m.markerKey;
          return `
            <tr>
              <td>${esc(label)}</td>
              <td>${esc(m.value)}</td>
              <td>${esc(m.unit)}</td>
              <td>${esc(m.drawnAt)}</td>
              <td>${m.threshold ? esc(m.threshold) : "&mdash;"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Friend-only blocks                                                        */
/* -------------------------------------------------------------------------- */

function eatBlockFriend(items: EatItem[]): string {
  if (!items.length) return "";
  // Titles + portions only. No `why`, no markerKeys, no marker-grounded
  // reasoning — the friend gets the "what" without the lab story.
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">What to eat</h2>
      <ul class="print-sheet__list">
        ${items.map(e => `
          <li class="print-sheet__eat-friend">
            <strong>${esc(e.food)}</strong>
            <span class="print-sheet__eat-meta">${esc(e.frequency)} · ${esc(e.portion)}</span>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function avoidBlockFriend(items: AvoidItem[]): string {
  if (!items.length) return "";
  // Titles + swap only.
  return `
    <section class="print-sheet__section">
      <h2 class="print-sheet__heading">What to swap out</h2>
      <ul class="print-sheet__list">
        ${items.map(a => `
          <li class="print-sheet__avoid-friend">
            <strong>${esc(a.food)}</strong>
            ${a.swap ? `<span class="print-sheet__avoid-swap"> → ${esc(a.swap)}</span>` : ""}
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                      */
/* -------------------------------------------------------------------------- */

function priWeight(p: "high" | "medium" | "low"): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

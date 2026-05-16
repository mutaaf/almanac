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
import type { Plan, Panel, EatItem, AvoidItem, Habit, RetestItem, Insight } from "../types";
import { findMarker } from "../data/markers";

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
/*  Sheet scaffold + heads                                                    */
/* -------------------------------------------------------------------------- */

function wrapSheet(audience: "doctor" | "friend", inner: string): string {
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

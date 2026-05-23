// Try it with your numbers — the pre-key sandbox (ticket 0040).
//
// A read-only, gate-bypassed `#/try` route a skeptical prospect reaches from the
// welcome screen WITHOUT acknowledging consent or building a profile. They pick
// a marker from the curated seed, type a value they already know off the top of
// their head — last ApoB, fasting insulin, ferritin — and a row resolves
// instantly: the value, the unit, the lab range, the functional optimum, and the
// SAME `flag` classification the labs page uses (`flagFor()`). Once two or more
// rows exist, the 0036 report-card tally renders above them.
//
// It is a pure client-side render over `MARKERS[]` / `findMarker()` / `flagFor()`
// (src/data/markers.ts) and `computeReportCard()` (src/labs/report-card.ts). No
// key, no upload, no Anthropic call, NO IndexedDB read or write — the typed
// values live only in the in-memory `rows` state below and are gone on reload.
// That is what makes it safe to ship pre-consent: it carries nothing personal
// and reads nothing from the user's device.
//
// The single affordance off the page is "Start your own", which routes to
// `#/welcome` — the path back that reinstates the consent + profile gate. There
// is deliberately no key field, no upload control, no compose action.

import { mount, h, esc } from "../ui";
import { MARKERS, findMarker, flagFor } from "../data/markers";
import { computeReportCard, reportCardSentence } from "../labs/report-card";
import { parsePastedLabText } from "../sandbox/parse-pasted";
import type { MarkerDef, Panel, Result } from "../types";

/** One typed sandbox entry. In-memory only — never persisted to IndexedDB. */
interface TryRow {
  key: string;
  value: number;
}

/**
 * The per-tab session key the sandbox writes its typed rows to (ticket 0049),
 * so the post-consent onboarding affordance can offer them as a first manual
 * panel. This is sessionStorage — per-tab, cleared on tab close — NOT IndexedDB
 * and NOT localStorage; it carries nothing to disk before the consent gate.
 *
 * Reconciliation with 0040's "empty on reload of #/try" rule: `renderTry()`
 * clears this key on every fresh navigation to #/try, then re-writes it on each
 * add/remove. So a hard reload of #/try reads empty (the sandbox page itself
 * carries nothing across loads), while navigating AWAY to #/welcome → consent →
 * onboarding preserves the last-written value for the onboarding side to consume
 * exactly once.
 */
const SANDBOX_SESSION_KEY = "almanac.sandbox.rows";

/** Mirror the live `rows` into the per-tab session payload (ticket 0049). */
function syncSession(): void {
  try {
    if (rows.length === 0) {
      sessionStorage.removeItem(SANDBOX_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(SANDBOX_SESSION_KEY, JSON.stringify(rows));
  } catch {
    // Private mode / storage disabled: the sandbox still works in-memory, the
    // handoff just won't be offered. Never throw out of a render path.
  }
}

/**
 * The page's only state: the markers the prospect has typed so far, in entry
 * order. Module-scoped because the page is re-rendered in place on every add /
 * remove; a reload clears it (the module re-evaluates fresh) — which is exactly
 * the "nothing saved" contract the ticket requires.
 */
let rows: TryRow[] = [];

export async function renderTry(): Promise<void> {
  // Fresh page load resets the sandbox — the typed values never survive a
  // reload (no IndexedDB, no localStorage). Re-renders inside a session reuse
  // the live `rows` array and skip this reset (see `paint()`).
  rows = [];
  // Clear the session carry payload too (ticket 0049): a fresh navigation to
  // #/try reads empty, so the sandbox page itself never resurrects prior rows.
  // The handoff value is the LAST one written before the prospect navigated
  // away to #/welcome — it survives precisely because we are not on #/try then.
  syncSession();
  paint();
}

/* -------------------------------------------------------------------------- */
/*  Render                                                                     */
/* -------------------------------------------------------------------------- */

function paint(): void {
  const frag = h(`
    <div>
      <header class="masthead">
        <div>
          <div class="dateline">No key, nothing saved</div>
          <div class="wordmark">Almanac<span class="amp">.</span></div>
        </div>
      </header>

      <section class="try reveal">
        <div class="eyebrow">Try it with your numbers</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 20ch;">
          Score a number <em>you already know</em>.
        </h1>
        <p class="lede try__sub">
          Type a value you already know and see it scored against the functional
          optimum — no key, nothing saved.
        </p>

        <form class="try__form" id="try-form">
          <label class="try__field">
            <span class="try__label">Marker</span>
            <select id="try-marker">
              ${markerOptions()}
            </select>
          </label>
          <label class="try__field">
            <span class="try__label">Value</span>
            <input id="try-value" type="number" inputmode="decimal" step="any"
                   placeholder="e.g. 8" />
          </label>
          <button id="try-add" class="btn btn--accent" type="submit">Score it</button>
        </form>

        <div class="try__paste">
          <div class="try__paste-title">Or paste your report</div>
          <p class="try__paste-hint">
            Paste the text from your lab portal — we score what we recognize,
            nothing is saved.
          </p>
          <textarea class="try__paste-input" rows="5"
                    placeholder="e.g. ApoB 110 mg/dL · Fasting insulin 8 uIU/mL · Ferritin 32 ng/mL"></textarea>
          <div class="try__paste-actions">
            <button type="button" class="btn btn--accent try__paste-score">Score it</button>
          </div>
          <div class="try__paste-note" hidden></div>
        </div>

        <div id="try-tally"></div>
        <div id="try-rows" class="try__rows"></div>

        <div class="try__start">
          <a href="#/welcome" class="try__start-link">Start your own</a>
          <span class="try__start-note">
            Setting up writes to this device and uses your own Anthropic key.
          </span>
        </div>
      </section>

      <footer class="foot">
        <span class="colophon">Informational, not medical advice. Discuss changes with your clinician.</span>
        <span>i</span>
      </footer>
    </div>
  `);

  mount(frag);
  paintRows();
  paintTally();
  wire();
}

/** The curated seed list, every marker, value-named by canonical key. */
function markerOptions(): string {
  // Built-in seed only — no user markers (this is pre-gate and reads no
  // IndexedDB). Ordered as they appear in the DB so families stay grouped.
  return MARKERS.map(m => {
    const label = m.shortName ? `${m.name} (${m.shortName})` : m.name;
    return `<option value="${esc(m.key)}">${esc(label)}</option>`;
  }).join("");
}

/** Re-render just the resolved rows from the live `rows` state. */
function paintRows(): void {
  const host = document.getElementById("try-rows");
  if (!host) return;
  host.innerHTML = rows.map((r, i) => rowHtml(r, i)).join("");
  for (const btn of host.querySelectorAll<HTMLButtonElement>(".try__remove")) {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index);
      if (!Number.isInteger(idx)) return;
      rows.splice(idx, 1);
      syncSession();
      paintRows();
      paintTally();
    });
  }
}

/** One resolved row: name, value+unit, lab range, functional range, flag. */
function rowHtml(row: TryRow, index: number): string {
  const marker = findMarker(row.key);
  if (!marker) return "";

  const name = marker.shortName ?? marker.name;
  const flag = flagFor(row.value, marker.optimalRange, marker.labRange);
  const lab = marker.labRange ? rangeStr(marker.labRange, marker.unit) : `— ${marker.unit}`;
  const optimal = rangeStr(marker.optimalRange, marker.unit);

  return `
    <div class="try__row">
      <div class="try__name">${esc(name)}</div>
      <div class="try__value">
        <span class="try__num">${esc(row.value)}</span>
        <span class="try__unit">${esc(marker.unit)}</span>
      </div>
      <div class="try__ranges">
        <div><span class="try__rangelabel">lab</span><span>${esc(lab)}</span></div>
        <div><span class="try__rangelabel">functional</span><span>${esc(optimal)}</span></div>
      </div>
      <div class="try__flag flag--${esc(flag)}">${esc(flag)}</div>
      <button type="button" class="try__remove" data-index="${index}" aria-label="Remove ${esc(name)}">×</button>
    </div>
  `;
}

/**
 * Render the report-card tally above the rows once two or more markers are
 * present, reusing 0036's `computeReportCard()` + `reportCardSentence()` over a
 * synthetic in-memory Panel built from the typed rows. Below two rows (or when
 * nothing classifies), the tally host is emptied.
 */
function paintTally(): void {
  const host = document.getElementById("try-tally");
  if (!host) return;

  if (rows.length < 2) { host.innerHTML = ""; return; }

  const card = computeReportCard(syntheticPanel());
  if (card.total === 0) { host.innerHTML = ""; return; }

  host.innerHTML = `
    <section class="report-card" aria-label="Against the optimum">
      <div class="section-mark report-card__eyebrow">Against the optimum</div>
      <p class="report-card__line">${esc(reportCardSentence(card))}</p>
    </section>
  `;
}

/**
 * Build a Panel-shaped object the report card can reduce. Each result carries
 * the marker's lab + optimal ranges and a pre-resolved flag so the count is
 * deterministic and matches the per-row classification exactly. Nothing here is
 * persisted — it exists only for the duration of `computeReportCard()`.
 */
function syntheticPanel(): Panel {
  const results: Result[] = [];
  for (const r of rows) {
    const marker: MarkerDef | undefined = findMarker(r.key);
    if (!marker) continue;
    results.push({
      markerKey: marker.key,
      value: r.value,
      unit: marker.unit,
      ...(marker.labRange ? { labRange: marker.labRange } : {}),
      optimalRange: marker.optimalRange,
      flag: flagFor(r.value, marker.optimalRange, marker.labRange),
    });
  }
  return {
    drawnAt: "1970-01-01",
    source: "manual",
    results,
    createdAt: 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Behavior                                                                   */
/* -------------------------------------------------------------------------- */

function wire(): void {
  const form = document.getElementById("try-form") as HTMLFormElement | null;
  const select = document.getElementById("try-marker") as HTMLSelectElement | null;
  const input = document.getElementById("try-value") as HTMLInputElement | null;
  if (!form || !select || !input) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const key = select.value;
    const value = Number(input.value);
    // Ignore empty / non-numeric entries — the sandbox only resolves a real
    // number against a real marker.
    if (!key || input.value.trim() === "" || !Number.isFinite(value)) return;

    // The typed path APPENDS — 0040's contract lets a prospect add the same
    // marker more than once (e.g. to compare four values across flag classes),
    // so each typed entry is its own row. Duplicate reconciliation is the PASTE
    // path's job (see `wirePaste`), not the picker's.
    rows.push({ key, value });
    syncSession();
    input.value = "";
    paintRows();
    paintTally();
    input.focus();
  });

  wirePaste();
}

/**
 * Wire the "Or paste your report" affordance (ticket 0055). On "Score it" the
 * pure, deterministic recognizer (`parsePastedLabText`) pulls the recognized
 * markers out of the pasted blob and merges them into the live `rows` — exactly
 * the same in-memory state the typed path writes, so they render identically and
 * carry into the 0049 handoff through the same `syncSession()`. No key, no
 * upload, no Anthropic call: this is a static-data parse over `MARKERS[]`.
 */
function wirePaste(): void {
  const ta = document.querySelector<HTMLTextAreaElement>(".try__paste-input");
  const btn = document.querySelector<HTMLButtonElement>(".try__paste-score");
  if (!ta || !btn) return;

  btn.addEventListener("click", () => {
    const parsed = parsePastedLabText(ta.value);
    if (parsed.length === 0) {
      // Nothing we can score — a calm, declarative note, no rows added.
      showPasteNote("No markers we recognize yet — try the picker above, or add a value by hand.");
      return;
    }
    for (const { key, value } of parsed) mergeRow(key, value);
    syncSession();
    ta.value = "";              // clear after a successful parse
    hidePasteNote();
    paintRows();
    paintTally();
  });
}

/**
 * Merge one pasted `{ key, value }` into the live rows, reconciling duplicates
 * to a single row (ticket 0055): if the key is already present (whether typed or
 * from an earlier line of the same paste), the LAST value wins and the existing
 * row is updated IN PLACE (its position is preserved); a new key appends. This
 * is the PASTE path's rule only — the picker (`wire()`) deliberately appends, so
 * 0040's "same marker, four typed values" behavior is unchanged.
 */
function mergeRow(key: string, value: number): void {
  const existing = rows.find(r => r.key === key);
  if (existing) { existing.value = value; return; }
  rows.push({ key, value });
}

function showPasteNote(message: string): void {
  const note = document.querySelector<HTMLDivElement>(".try__paste-note");
  if (!note) return;
  note.textContent = message;
  note.hidden = false;
}

function hidePasteNote(): void {
  const note = document.querySelector<HTMLDivElement>(".try__paste-note");
  if (!note) return;
  note.textContent = "";
  note.hidden = true;
}

/* -------------------------------------------------------------------------- */
/*  Range formatting — open/closed bounds rendered honestly                    */
/* -------------------------------------------------------------------------- */
/*
 * Mirrors the labs page's `rangeStr()` (src/pages/labs.ts): a closed range reads
 * "low–high unit", an open-high range "≤ high unit", an open-low range
 * "≥ low unit". Kept local so this pre-gate page imports nothing from the gated
 * labs module.
 */
function rangeStr(r: { low?: number; high?: number }, unit: string): string {
  if (r.low != null && r.high != null) return `${r.low}–${r.high} ${unit}`;
  if (r.low != null)  return `≥ ${r.low} ${unit}`;
  if (r.high != null) return `≤ ${r.high} ${unit}`;
  return `— ${unit}`;
}

// Labs screen — multi-file upload (PDFs + images), paste support, manual entry,
// and the list of all panels.
//
// Routes:
//   #/labs                → list + upload (paste / drop / pick)
//   #/labs?id=N           → review a single panel's results
//   #/labs?manual=1       → manual entry form

import { mount, h, esc, errorCard } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, allPanels, addPanel, getPanel, deletePanel, updatePanel,
} from "../db";
import { panelFromFiles, type ExtractedRow } from "../extractor";
import { MARKERS, findMarker, flagFor, findBestMatches } from "../data/markers";
import type { Panel, Result } from "../types";

/* The staging set lives outside render so paste handlers can mutate it
   without re-running the whole component. */
let staged: File[] = [];

/**
 * The paste listener is attached to `window` exactly once per browser tab,
 * stashed on the window itself so Vite HMR re-evaluating this module can't
 * leak duplicates. Each invocation re-reads `staged` (a module-level binding)
 * and only acts when we're actually on the labs route.
 */
const PASTE_KEY = "__almanacPasteListener__";

export async function renderLabs(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  if (params.get("manual") === "1") return renderManualEntry();
  const idStr = params.get("id");
  if (idStr) return renderPanelDetail(Number(idStr));

  const panels = await allPanels();
  const masth = await masthead("#/labs");

  // Reset stage on a fresh visit to the upload screen.
  staged = [];

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Labs</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          The <em>raw biology</em>.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 0.8rem;">
          Drop, paste, or pick one or more pages of a lab report — PDFs, photos,
          or screenshots all work. The editor extracts every numeric marker
          across the pages and reconciles them against functional ranges.
        </p>

        <div id="drop" class="dropzone" style="margin-top: 2.2rem;">
          <input id="file" type="file" multiple accept="application/pdf,image/*" style="display:none;" />
          <div class="dropzone__title">Drop, paste, or pick</div>
          <div class="dropzone__hint">
            <kbd class="kbd">⌘V</kbd> to paste a screenshot ·
            drag PDFs/photos here ·
            <a id="pickfile" href="#">choose files</a>.
            Multiple pages of the same draw all go into one panel.
          </div>
        </div>

        <div id="staged" class="staged"></div>

        <div id="actions" style="margin-top: 1rem; display: none; flex-wrap: wrap; gap: 1rem; align-items: center;">
          <button id="extract" class="btn btn--accent">Extract</button>
          <button id="clear"   class="btn btn--ghost">Clear</button>
        </div>

        <div style="margin-top: 1.4rem;">
          <a href="#/labs?manual=1" class="btn btn--ghost">Or enter values manually</a>
        </div>

        <div id="status" class="quiet" style="display: none; margin-top: 2rem;"></div>

        <div style="margin-top: 3.4rem;">
          <div class="section-mark">All panels · ${panels.length}</div>
          ${panels.length === 0
            ? `<div class="quiet">No labs yet. Drop your first report above.</div>`
            : `<div class="archive">${panels.map((p, i) => panelRow(p, panels.length - i)).join("")}</div>`}
        </div>
      </section>
      ${foot("ii")}
    </div>
  `);

  mount(frag);
  wireUpload();
}

function panelRow(p: Panel, idx: number): string {
  const counts = countByFlag(p.results);
  const pieces = [
    counts.optimal     ? `${counts.optimal} optimal`         : "",
    counts.suboptimal  ? `${counts.suboptimal} suboptimal`   : "",
    counts.low + counts.high ? `${counts.low + counts.high} out of range` : "",
  ].filter(Boolean).join(" · ");
  const pageCount = p.fileBlobs?.length ?? (p.source === "manual" ? 0 : 1);
  return `
    <a class="entry-row" href="#/labs?id=${p.id}">
      <div class="date">${esc(p.drawnAt)}</div>
      <div class="title">${esc(p.labName ?? "Lab panel")} <span style="color:var(--ink-faint);font-style:normal;font-size:0.85em;">— ${p.results.length} markers${pageCount > 1 ? ` · ${pageCount} pages` : ""} · ${esc(pieces || "—")}</span></div>
      <div class="pageno">${idx}</div>
    </a>
  `;
}

function countByFlag(results: Result[]) {
  const out = { optimal: 0, suboptimal: 0, low: 0, high: 0, inrange: 0 };
  for (const r of results) {
    if (r.flag === "optimal")       out.optimal++;
    else if (r.flag === "suboptimal") out.suboptimal++;
    else if (r.flag === "low")        out.low++;
    else if (r.flag === "high")       out.high++;
    else                              out.inrange++;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Upload wiring: drop, pick, paste, stage, extract                          */
/* -------------------------------------------------------------------------- */

function wireUpload(): void {
  const drop  = document.getElementById("drop");
  const input = document.getElementById("file") as HTMLInputElement | null;
  const pick  = document.getElementById("pickfile");
  if (!drop || !input) return;

  // Pick
  pick?.addEventListener("click", (e) => { e.preventDefault(); input.click(); });
  drop.addEventListener("click", (e) => {
    // Don't intercept clicks on the inner anchor.
    const t = e.target as HTMLElement;
    if (t.tagName === "A") return;
    input.click();
  });

  // Drag and drop
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const list = (e as DragEvent).dataTransfer?.files;
    if (list) acceptFiles(Array.from(list));
  });

  // Picker
  input.addEventListener("change", () => {
    if (input.files) acceptFiles(Array.from(input.files));
    input.value = "";   // allow re-picking the same file later
  });

  // Paste — single window-level listener, idempotent across HMR reloads.
  // We only attach once per tab; the handler reads `staged` via the
  // module-level binding (which Vite refreshes on HMR), and bails when
  // we're not on the labs route.
  const w = window as unknown as Record<string, unknown>;
  if (w[PASTE_KEY]) {
    window.removeEventListener("paste", w[PASTE_KEY] as EventListener);
  }
  const handler = (e: ClipboardEvent) => {
    if (location.hash.split("?")[0] !== "#/labs") return;
    if (!e.clipboardData) return;

    // Read EXACTLY ONE source — clipboardData.items. Reading both .items
    // and .files double-stages the same image because each lookup yields
    // a fresh File reference that won't match a simple identity dedupe.
    const accepted: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) accepted.push(maybeRename(f));
      }
    }
    if (accepted.length) {
      e.preventDefault();
      acceptFiles(accepted);
    }
  };
  w[PASTE_KEY] = handler;
  window.addEventListener("paste", handler);

  // Buttons
  document.getElementById("extract")?.addEventListener("click", () => {
    if (staged.length) extractStaged();
  });
  document.getElementById("clear")?.addEventListener("click", () => {
    staged = [];
    renderStaged();
  });
}

/** Some clipboard images come in as "image.png" with a generic name; give them
 *  a timestamp so the stage list isn't a wall of "image.png" entries. */
function maybeRename(f: File): File {
  if (f.name && f.name !== "image.png" && f.name !== "image.jpeg") return f;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = f.type === "image/png" ? "png" : "jpg";
  return new File([f], `pasted-${ts}.${ext}`, { type: f.type });
}

function acceptFiles(files: File[]): void {
  for (const f of files) {
    if (!isAllowed(f)) continue;
    if (alreadyStaged(f)) continue;   // belt + braces against duplicate adds
    staged.push(f);
  }
  renderStaged();
}

/**
 * Fingerprint dedupe — a paste/drop that re-introduces the same content
 * (same name, size, and lastModified) is treated as a no-op. Catches both
 * accidental double-adds and any handler-fan-out we haven't anticipated.
 */
function alreadyStaged(f: File): boolean {
  return staged.some(s =>
    s.name === f.name && s.size === f.size && s.lastModified === f.lastModified,
  );
}

function isAllowed(f: File): boolean {
  if (f.type === "application/pdf") return true;
  if (f.type.startsWith("image/")) return true;
  const n = f.name.toLowerCase();
  return n.endsWith(".pdf") || n.endsWith(".png") || n.endsWith(".jpg")
      || n.endsWith(".jpeg") || n.endsWith(".webp") || n.endsWith(".gif");
}

function renderStaged(): void {
  const stage   = document.getElementById("staged");
  const actions = document.getElementById("actions");
  const extract = document.getElementById("extract");
  if (!stage || !actions) return;

  if (!staged.length) {
    stage.innerHTML = "";
    actions.style.display = "none";
    return;
  }

  actions.style.display = "flex";
  // Single text node — inline spans + letter-spacing render with phantom gaps.
  if (extract) {
    extract.textContent = `Extract from ${staged.length} page${staged.length === 1 ? "" : "s"}`;
  }

  stage.innerHTML = staged.map((f, i) => {
    const isImg = f.type.startsWith("image/");
    const url   = isImg ? URL.createObjectURL(f) : "";
    const sub   = isImg ? "" : `<span class="staged__kind">PDF</span>`;
    return `
      <div class="staged__chip" data-i="${i}">
        ${isImg
          ? `<img class="staged__thumb" src="${url}" alt="" />`
          : `<div class="staged__thumb staged__thumb--pdf">PDF</div>`}
        <div class="staged__meta">
          <div class="staged__name" title="${esc(f.name)}">${esc(f.name)}</div>
          <div class="staged__size">${formatBytes(f.size)} ${sub}</div>
        </div>
        <button class="staged__remove" aria-label="Remove" data-i="${i}">×</button>
      </div>
    `;
  }).join("");

  // Wire remove buttons.
  for (const btn of stage.querySelectorAll(".staged__remove")) {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const i = Number((ev.currentTarget as HTMLElement).dataset.i ?? -1);
      if (Number.isFinite(i) && i >= 0) {
        staged = staged.filter((_, j) => j !== i);
        renderStaged();
      }
    });
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function extractStaged(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;

  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus(`Extracting from ${staged.length} page${staged.length === 1 ? "" : "s"}…`);
    const files = staged.slice();
    const { panel, unmatched } = await panelFromFiles(files, profile);

    setStatus("Saving…");
    const id = await addPanel(panel);

    if (unmatched.length) {
      sessionStorage.setItem(`unmatched-${id}`, JSON.stringify(unmatched));
    }
    staged = [];
    location.hash = `#/labs?id=${id}`;
  } catch (err: any) {
    if (!status) return;
    status.style.display = "block";
    const raw = extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Extraction failed",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
      actions: `<button id="retry-extract" class="btn btn--accent">Try again</button>`,
    });
    document.getElementById("retry-extract")?.addEventListener("click", () => extractStaged());
  }
}

function extractRawFromMessage(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  const m = msg.match(/--- raw ---\n([\s\S]+)$/);
  return m?.[1];
}

/* -------------------------------------------------------------------------- */
/*  Panel detail                                                              */
/* -------------------------------------------------------------------------- */

async function renderPanelDetail(id: number): Promise<void> {
  const panel = await getPanel(id);
  if (!panel) { location.hash = "#/labs"; return; }
  const profile = await getProfile();
  const masth = await masthead("#/labs");

  const unmatched: ExtractedRow[] =
    JSON.parse(sessionStorage.getItem(`unmatched-${id}`) || "[]");

  const grouped = new Map<string, Result[]>();
  for (const r of panel.results) {
    const m = findMarker(r.markerKey);
    const cat = m?.category ?? "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(r);
  }

  const groupsHtml = Array.from(grouped.entries()).map(([cat, rows]) => `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">${esc(cat)}</div>
      <div class="results">${rows.map(resultRow).join("")}</div>
    </section>
  `).join("");

  const unmatchedHtml = unmatched.length ? renderUnmatchedSection(unmatched, profile?.sex) : "";

  const pageCount = panel.fileBlobs?.length ?? 0;
  const sourceLabel = panel.source === "manual"
    ? "Manual entry"
    : pageCount > 1 ? `${pageCount} pages (${panel.source})` : panel.source;

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div style="margin-bottom: 1rem;"><a href="#/labs" style="font-family:var(--body);font-size:0.78rem;color:var(--ink-faint);letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">← Back to labs</a></div>

        <div class="eyebrow">${esc(panel.drawnAt)}${panel.labName ? ` · ${esc(panel.labName)}` : ""} · ${esc(sourceLabel)}</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          <em>${panel.results.length}</em> markers, drawn ${esc(panel.drawnAt)}.
        </h1>

        ${groupsHtml || `<div class="quiet">No matched results.</div>`}
        ${unmatchedHtml}

        <div style="margin-top: 3rem; display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="#/plan" class="btn btn--accent">Generate or update the plan</a>
          <button id="delete" class="btn btn--ghost" style="border-color: var(--oxblood); color: var(--oxblood);">Delete this panel</button>
        </div>
      </section>
      ${foot("ii")}
    </div>
  `);

  mount(frag);

  document.getElementById("delete")?.addEventListener("click", async () => {
    if (!confirm("Delete this panel and its results? This cannot be undone.")) return;
    await deletePanel(id);
    location.hash = "#/labs";
  });

  wireUnmatchedHandlers(id);
}

/* -------------------------------------------------------------------------- */
/*  Unrecognized-rows UI: show top suggestions + full picker per group        */
/* -------------------------------------------------------------------------- */

function renderUnmatchedSection(unmatched: ExtractedRow[], sex?: string): string {
  // Group rows by rawName so a 4-page report with 4 'RBC' rows shows ONE
  // card with a "Match all 4" action, not four separate cards.
  const groups = new Map<string, ExtractedRow[]>();
  for (const row of unmatched) {
    const k = row.rawName;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  }

  const items = Array.from(groups.entries()).map(([rawName, rows]) => {
    const matches = findBestMatches(rawName, sex, 3);

    const valuesPreview = rows.map(r =>
      `<span class="unmatched__val">${esc(r.value)} ${esc(r.unit ?? "")}</span>`,
    ).join("");

    const suggestionsHtml = matches.length === 0
      ? `<div class="unmatched__nomatch">No close matches in the database.</div>`
      : `<div class="unmatched__suggests">
          ${matches.map((m, i) => `
            <button class="unmatched__suggest ${i === 0 ? "is-best" : ""}"
                    data-action="match"
                    data-rawname="${esc(rawName)}"
                    data-key="${esc(m.marker.key)}">
              <span class="unmatched__name">${esc(m.marker.shortName ?? m.marker.name)}</span>
              <span class="unmatched__score">${Math.round(m.score * 100)}%</span>
            </button>
          `).join("")}
        </div>`;

    // Full marker picker — for the rare case the top 3 are wrong.
    // We exclude markers from the wrong sex.
    const visible = MARKERS.filter(m => !m.sex || !sex || sex === "unspecified" || m.sex === sex);
    const pickerHtml = `
      <div class="unmatched__picker">
        <select class="unmatched__select" data-rawname="${esc(rawName)}">
          <option value="">— pick a different marker —</option>
          ${visible.map(m => `<option value="${esc(m.key)}">${esc(m.shortName ?? m.name)} · ${esc(m.unit)}</option>`).join("")}
        </select>
        <button class="btn btn--ghost unmatched__pick-btn"
                data-action="pick"
                data-rawname="${esc(rawName)}">Match selected</button>
      </div>
    `;

    return `
      <article class="unmatched-card" data-rawname="${esc(rawName)}">
        <header class="unmatched__head">
          <div>
            <div class="unmatched__rawname">${esc(rawName)}</div>
            <div class="unmatched__values">${valuesPreview}</div>
          </div>
          <div class="unmatched__count">${rows.length === 1 ? "1 row" : `${rows.length} rows`}</div>
        </header>
        ${suggestionsHtml}
        ${pickerHtml}
        <div class="unmatched__skip">
          <button class="unmatched__skip-btn" data-action="skip" data-rawname="${esc(rawName)}">
            Skip ${rows.length === 1 ? "this row" : `all ${rows.length}`}
          </button>
        </div>
      </article>
    `;
  }).join("");

  return `
    <section style="margin-top: 2.6rem;">
      <div class="section-mark" style="color: var(--ink-faint);">Unrecognized rows · ${unmatched.length}</div>
      <p class="hint" style="max-width: 64ch; margin-bottom: 1.2rem;">
        These appeared on the report but didn't auto-match. Pick a marker and they'll be folded into your results — the plan generator only sees matched rows.
      </p>
      <div class="unmatched-list">${items}</div>
    </section>
  `;
}

/**
 * Wire the unmatched-section actions: tap a top-3 button to match all rows
 * with that rawName to the chosen marker; or pick from the dropdown then
 * "Match selected"; or "Skip" to drop the rows entirely.
 */
function wireUnmatchedHandlers(panelId: number): void {
  const root = document.querySelector(".unmatched-list");
  if (!root) return;

  root.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!btn) return;
    const action  = btn.dataset.action!;
    const rawName = btn.dataset.rawname!;
    if (!rawName) return;

    if (action === "match") {
      const key = btn.dataset.key!;
      await matchRowsByName(panelId, rawName, key);
    } else if (action === "pick") {
      const sel = root.querySelector<HTMLSelectElement>(
        `select.unmatched__select[data-rawname="${cssEscape(rawName)}"]`,
      );
      const key = sel?.value;
      if (!key) { alert("Pick a marker from the dropdown first."); return; }
      await matchRowsByName(panelId, rawName, key);
    } else if (action === "skip") {
      await skipRowsByName(panelId, rawName);
    }
  });
}

/** Match every unmatched row whose rawName equals `rawName` to `markerKey`. */
async function matchRowsByName(panelId: number, rawName: string, markerKey: string): Promise<void> {
  const m = findMarker(markerKey);
  if (!m) return;

  const panel = await getPanel(panelId);
  if (!panel) return;

  const stored: ExtractedRow[] =
    JSON.parse(sessionStorage.getItem(`unmatched-${panelId}`) || "[]");

  const remaining: ExtractedRow[] = [];
  const newResults: Result[] = panel.results.slice();

  for (const row of stored) {
    if (row.rawName !== rawName) { remaining.push(row); continue; }

    let value = row.value;
    let unit  = row.unit;
    if (unit && unit.toLowerCase() !== m.unit.toLowerCase()) {
      const alt = (m.altUnits ?? []).find(a => a.unit.toLowerCase() === unit.toLowerCase());
      if (alt) {
        value = row.value * alt.toCanonical;
        unit  = m.unit;
      }
    }
    const labRange = row.labRange ?? m.labRange;
    const optimal  = m.optimalRange;
    const flag     = flagFor(value, optimal, labRange);

    newResults.push({
      markerKey: m.key,
      rawName: row.rawName,
      value,
      unit,
      ...(labRange ? { labRange } : {}),
      ...(optimal  ? { optimalRange: optimal } : {}),
      flag,
    });
  }

  await updatePanel(panelId, { results: newResults });
  sessionStorage.setItem(`unmatched-${panelId}`, JSON.stringify(remaining));
  await renderPanelDetail(panelId);
}

async function skipRowsByName(panelId: number, rawName: string): Promise<void> {
  const stored: ExtractedRow[] =
    JSON.parse(sessionStorage.getItem(`unmatched-${panelId}`) || "[]");
  const remaining = stored.filter(r => r.rawName !== rawName);
  sessionStorage.setItem(`unmatched-${panelId}`, JSON.stringify(remaining));
  await renderPanelDetail(panelId);
}

/** Tiny CSS.escape polyfill for attribute selectors. */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return s.replace(/["'\\\]\[]/g, "\\$&");
}

function resultRow(r: Result): string {
  const m = findMarker(r.markerKey);
  const name = m?.shortName ?? m?.name ?? r.markerKey;
  const lab     = r.labRange     ? rangeStr(r.labRange,     r.unit) : "—";
  const optimal = r.optimalRange ? rangeStr(r.optimalRange, r.unit) : "—";
  const flag = r.flag ?? "";

  return `
    <div class="result">
      <div class="result__name">${esc(name)}</div>
      <div class="result__value">
        <span class="result__num">${esc(r.value)}</span>
        <span class="result__unit">${esc(r.unit)}</span>
      </div>
      <div class="result__ranges">
        <div><span class="result__rangelabel">lab</span><span>${esc(lab)}</span></div>
        <div><span class="result__rangelabel">functional</span><span>${esc(optimal)}</span></div>
      </div>
      <div class="result__flag flag--${esc(flag)}">${esc(flag)}</div>
    </div>
  `;
}

function rangeStr(r: { low?: number; high?: number }, unit: string): string {
  if (r.low != null && r.high != null) return `${r.low}–${r.high} ${unit}`;
  if (r.low != null)  return `≥ ${r.low} ${unit}`;
  if (r.high != null) return `≤ ${r.high} ${unit}`;
  return `— ${unit}`;
}

/* -------------------------------------------------------------------------- */
/*  Manual entry                                                              */
/* -------------------------------------------------------------------------- */

async function renderManualEntry(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }
  const masth = await masthead("#/labs");

  const visibleMarkers = MARKERS.filter(m => !m.sex || m.sex === profile.sex);

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div style="margin-bottom: 1rem;"><a href="#/labs" style="font-family:var(--body);font-size:0.78rem;color:var(--ink-faint);letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">← Back to labs</a></div>

        <div class="eyebrow">Manual entry</div>
        <h1 class="headline" style="margin-top: 0.4rem;">Type the values <em>by hand</em>.</h1>
        <p class="lede" style="max-width: 60ch; margin-top: 0.8rem;">Fill the markers you have — leave the rest blank.</p>

        <form id="manual" style="margin-top: 2.2rem;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
            <div class="field">
              <label for="drawnAt">Date drawn</label>
              <input id="drawnAt" name="drawnAt" type="date" required />
            </div>
            <div class="field">
              <label for="labName">Lab (optional)</label>
              <input id="labName" name="labName" type="text" placeholder="Quest, LabCorp, etc." />
            </div>
          </div>

          <div class="manual-grid" style="margin-top: 1.2rem;">
            ${visibleMarkers.map(m => `
              <div class="manual-row" data-key="${esc(m.key)}">
                <div class="manual-row__name">
                  <strong>${esc(m.shortName ?? m.name)}</strong>
                  <span class="manual-row__hint">${esc(m.unit)} · functional ${esc(rangeStr(m.optimalRange, m.unit))}</span>
                </div>
                <input class="manual-row__input" type="number" step="any" placeholder="value" data-key="${esc(m.key)}" />
              </div>
            `).join("")}
          </div>

          <div style="display: flex; gap: 1rem; margin-top: 2rem; flex-wrap: wrap;">
            <button type="submit" class="btn btn--accent">Save panel</button>
            <a href="#/labs" class="btn btn--ghost">Cancel</a>
          </div>
        </form>
      </section>
      ${foot("ii")}
    </div>
  `);

  mount(frag);

  document.getElementById("manual")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const fd = new FormData(f);
    const drawnAt = String(fd.get("drawnAt") ?? "");
    const labName = String(fd.get("labName") ?? "").trim() || undefined;

    const results: Result[] = [];
    for (const inputEl of f.querySelectorAll(".manual-row__input")) {
      const el = inputEl as HTMLInputElement;
      const v = el.value.trim();
      if (!v) continue;
      const num = Number(v);
      if (!Number.isFinite(num)) continue;
      const key = el.dataset.key!;
      const m = findMarker(key);
      if (!m) continue;
      const flag = flagFor(num, m.optimalRange, m.labRange);
      results.push({
        markerKey: key,
        value: num,
        unit: m.unit,
        ...(m.labRange     ? { labRange: m.labRange }         : {}),
        ...(m.optimalRange ? { optimalRange: m.optimalRange } : {}),
        flag,
      });
    }

    if (!results.length) { alert("Fill at least one marker before saving."); return; }

    const id = await addPanel({
      drawnAt,
      ...(labName ? { labName } : {}),
      source: "manual",
      results,
    });
    location.hash = `#/labs?id=${id}`;
  });
}

void updatePanel;

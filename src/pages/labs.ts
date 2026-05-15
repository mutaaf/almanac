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
import { panelsFromFiles, type ExtractedRow } from "../extractor";
import { MARKERS, findMarker, flagFor, findBestMatches } from "../data/markers";
import { listUserMarkers, addUserMarker, getAllMarkers } from "../data/userMarkers";
import { route } from "../main";
import type { MarkerCategory, MarkerDef, Panel, Result } from "../types";

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
  const pageCount = p.fileNames?.length ?? p.fileBlobs?.length ?? (p.source === "manual" ? 0 : 1);
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
    const { panels, unmatched } = await panelsFromFiles(files, profile);

    setStatus(panels.length === 1 ? "Saving…" : `Saving ${panels.length} panels…`);
    const ids: number[] = [];
    for (const p of panels) {
      ids.push(await addPanel(p));
    }
    const newestId = ids[ids.length - 1];
    if (newestId == null) {
      // Defensive — `panelsFromFiles` already throws when extraction
      // yielded zero panels, but TS strict can't see that and a future
      // change shouldn't silently strand the user.
      throw new Error("Extraction returned no panels.");
    }

    // Unmatched rows from the WHOLE upload session land on the newest
    // (last-saved) panel's review screen — the one the user is most
    // likely to come back to.
    if (unmatched.length) {
      sessionStorage.setItem(`unmatched-${newestId}`, JSON.stringify(unmatched));
    }
    staged = [];

    // Same WebKit-timing fix as plan.ts compose(): poll past WebKit's IDB
    // read-after-write delay before re-rendering.
    await waitForPanelCommit(newestId);

    if (ids.length === 1) {
      // Single-panel upload — keep the existing "land on detail" behavior.
      location.hash = `#/labs?id=${newestId}`;
    } else {
      // Multi-panel split — land on the labs index so the user sees all
      // N new panels at the top, dated.
      location.hash = "#/labs";
    }
    await route();
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

  // Fetch user-defined markers up front; we need them to look up grouping
  // categories AND to surface them in the unrecognized-row dropdown.
  const userMarkers = await listUserMarkers();
  const extras: MarkerDef[] = userMarkers;

  const grouped = new Map<string, Result[]>();
  for (const r of panel.results) {
    const m = findMarker(r.markerKey, extras);
    const cat = m?.category ?? "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(r);
  }

  const groupsHtml = Array.from(grouped.entries()).map(([cat, rows]) => `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">${esc(cat)}</div>
      <div class="results">${rows.map(r => resultRow(r, extras)).join("")}</div>
    </section>
  `).join("");

  const userMarkerKeys = new Set(extras.map(m => m.key));
  const unmatchedHtml = unmatched.length
    ? renderUnmatchedSection(unmatched, profile?.sex, extras, userMarkerKeys)
    : "";

  const pageCount = panel.fileNames?.length ?? panel.fileBlobs?.length ?? 0;
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

function renderUnmatchedSection(
  unmatched: ExtractedRow[],
  sex: string | undefined,
  extras: MarkerDef[],
  userMarkerKeys: Set<string>,
): string {
  // Group rows by rawName so a 4-page report with 4 'RBC' rows shows ONE
  // card with a "Match all 4" action, not four separate cards.
  const groups = new Map<string, ExtractedRow[]>();
  for (const row of unmatched) {
    const k = row.rawName;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(row);
  }

  const items = Array.from(groups.entries()).map(([rawName, rows]) => {
    const matches = findBestMatches(rawName, sex, 3, extras);

    const valuesPreview = rows.map(r =>
      `<span class="unmatched__val">${esc(r.value)} ${esc(r.unit ?? "")}</span>`,
    ).join("");

    const suggestionsHtml = matches.length === 0
      ? `<div class="unmatched__nomatch">No close matches in the database.</div>`
      : `<div class="unmatched__suggests">
          ${matches.map((m, i) => {
            const isYours = userMarkerKeys.has(m.marker.key);
            return `
              <button class="unmatched__suggest ${i === 0 ? "is-best" : ""}"
                      data-action="match"
                      data-rawname="${esc(rawName)}"
                      data-key="${esc(m.marker.key)}">
                <span class="unmatched__name">${esc(m.marker.shortName ?? m.marker.name)}</span>
                ${isYours ? `<span class="unmatched__pill">yours</span>` : ""}
                <span class="unmatched__score">${Math.round(m.score * 100)}%</span>
              </button>
            `;
          }).join("")}
        </div>`;

    // Full marker picker — for the rare case the top 3 are wrong. User
    // markers appear first (prepended) and carry a (yours) label so the
    // user can tell them apart from the seed catalog.
    const seedVisible = MARKERS.filter(m => !m.sex || !sex || sex === "unspecified" || m.sex === sex);
    const userVisible = extras.filter(m => !m.sex || !sex || sex === "unspecified" || m.sex === sex);
    const pickerHtml = `
      <div class="unmatched__picker">
        <select class="unmatched__select" data-rawname="${esc(rawName)}">
          <option value="">— pick a different marker —</option>
          ${userVisible.map(m =>
            `<option value="${esc(m.key)}">${esc(m.shortName ?? m.name)} · ${esc(m.unit)} (yours)</option>`,
          ).join("")}
          ${seedVisible.map(m =>
            `<option value="${esc(m.key)}">${esc(m.shortName ?? m.name)} · ${esc(m.unit)}</option>`,
          ).join("")}
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
        <div class="unmatched__actions">
          <button class="unmatched__define-btn"
                  data-action="define"
                  data-rawname="${esc(rawName)}">Define this marker</button>
          <button class="unmatched__skip-btn" data-action="skip" data-rawname="${esc(rawName)}">
            Skip ${rows.length === 1 ? "this row" : `all ${rows.length}`}
          </button>
        </div>
        <div class="define-marker-slot" data-rawname="${esc(rawName)}"></div>
      </article>
    `;
  }).join("");

  return `
    <section style="margin-top: 2.6rem;">
      <div class="section-mark" style="color: var(--ink-faint);">Unrecognized rows · ${unmatched.length}</div>
      <p class="hint" style="max-width: 64ch; margin-bottom: 1.2rem;">
        These appeared on the report but didn't auto-match. Pick a marker — or define a new one if the report uses a specialty marker we don't ship with — and the rows will fold into your results.
      </p>
      <div class="unmatched-list">${items}</div>
    </section>
  `;
}

/**
 * Wire the unmatched-section actions: tap a top-3 button to match all rows
 * with that rawName to the chosen marker; or pick from the dropdown then
 * "Match selected"; or "Skip" to drop the rows entirely; or "Define this
 * marker" to spawn the inline form that captures a brand-new MarkerDef
 * and immediately binds matching rows on save.
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
    } else if (action === "define") {
      openDefineForm(rawName);
    } else if (action === "cancel-define") {
      closeDefineForm(rawName);
    }
  });
}

/** The categories the form lets a user assign — kept tight to the existing
 *  enum so seed and user markers behave identically downstream. */
const CATEGORIES: MarkerCategory[] = [
  "metabolic", "lipids", "thyroid", "hormones",
  "vitamins", "minerals", "inflammation", "kidney",
  "liver", "blood", "iron", "cardio", "other",
];

/**
 * Render the inline define-marker form into the slot for `rawName`. Pre-fills
 * the canonical name and unit from the extracted row so a "save without
 * editing" path is two clicks. Wires the form's submit to actually persist.
 */
function openDefineForm(rawName: string): void {
  const card = document.querySelector(`.unmatched-card[data-rawname="${cssEscape(rawName)}"]`);
  const slot = card?.querySelector<HTMLElement>(`.define-marker-slot`);
  if (!slot) return;
  // If already open, do nothing.
  if (slot.querySelector(".define-marker-form")) return;

  // Pull the first row for this rawName to pre-fill unit + lab range.
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  const panelIdStr = params.get("id");
  const panelId = panelIdStr ? Number(panelIdStr) : NaN;
  const stored: ExtractedRow[] = Number.isFinite(panelId)
    ? JSON.parse(sessionStorage.getItem(`unmatched-${panelId}`) || "[]")
    : [];
  const first = stored.find(r => r.rawName === rawName);
  const prefillUnit  = first?.unit ?? "";
  const prefillLow   = first?.labRange?.low  ?? "";
  const prefillHigh  = first?.labRange?.high ?? "";

  slot.innerHTML = `
    <form class="define-marker-form" data-rawname="${esc(rawName)}">
      <div class="define-form__title">Define <em>${esc(rawName)}</em></div>

      <div class="define-form__grid">
        <label class="define-form__field define-form__field--wide">
          <span class="define-form__label">Canonical name</span>
          <input name="name" type="text" required value="${esc(rawName)}" />
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Short name (optional)</span>
          <input name="shortName" type="text" />
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Category</span>
          <select name="category" required>
            ${CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
          </select>
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Unit</span>
          <input name="unit" type="text" required value="${esc(prefillUnit)}" />
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Sex (optional)</span>
          <select name="sex">
            <option value="">— any —</option>
            <option value="male">male</option>
            <option value="female">female</option>
            <option value="intersex">intersex</option>
          </select>
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Lab range low</span>
          <input name="labLow" type="number" step="any" value="${esc(String(prefillLow))}" />
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Lab range high</span>
          <input name="labHigh" type="number" step="any" value="${esc(String(prefillHigh))}" />
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Functional low</span>
          <input name="optimalLow" type="number" step="any" />
        </label>
        <label class="define-form__field">
          <span class="define-form__label">Functional high</span>
          <input name="optimalHigh" type="number" step="any" />
        </label>
        <label class="define-form__field define-form__field--wide">
          <span class="define-form__label">Description</span>
          <textarea name="description" rows="2" required></textarea>
        </label>
      </div>

      <div class="define-form__actions">
        <button type="submit" class="btn btn--accent">Save marker &amp; bind rows</button>
        <button type="button" class="btn btn--ghost" data-action="cancel-define" data-rawname="${esc(rawName)}">Cancel</button>
      </div>
      <div class="define-form__hint">
        At least one of lab range or functional range must be filled — that's what makes the in-range / out-of-range flag meaningful.
      </div>
    </form>
  `;

  const form = slot.querySelector<HTMLFormElement>(".define-marker-form");
  if (form) wireDefineFormSubmit(form);
  // Scroll the form into view on slow viewports.
  slot.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeDefineForm(rawName: string): void {
  const card = document.querySelector(`.unmatched-card[data-rawname="${cssEscape(rawName)}"]`);
  const slot = card?.querySelector<HTMLElement>(`.define-marker-slot`);
  if (slot) slot.innerHTML = "";
}

/** Submit-handler that turns the form fields into a UserMarker and binds
 *  matching unrecognized rows on the current panel to it. */
function wireDefineFormSubmit(form: HTMLFormElement): void {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawName = form.dataset.rawname ?? "";

    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const shortName = String(fd.get("shortName") ?? "").trim() || undefined;
    const category = String(fd.get("category") ?? "other") as MarkerCategory;
    const unit = String(fd.get("unit") ?? "").trim();
    const sexRaw = String(fd.get("sex") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();

    const labLow      = numOrUndef(fd.get("labLow"));
    const labHigh     = numOrUndef(fd.get("labHigh"));
    const optimalLow  = numOrUndef(fd.get("optimalLow"));
    const optimalHigh = numOrUndef(fd.get("optimalHigh"));

    if (!name || !unit || !description) {
      alert("Name, unit, and description are required.");
      return;
    }
    const hasLab     = labLow !== undefined || labHigh !== undefined;
    const hasOptimal = optimalLow !== undefined || optimalHigh !== undefined;
    if (!hasLab && !hasOptimal) {
      alert("Fill at least one of lab range or functional range so we can flag in-range / out-of-range correctly.");
      return;
    }

    // Canonical key: deterministic snake_case slug, prefixed `user_` to
    // sidestep accidental collisions with seed keys.
    const key = `user_${slugify(name)}`;

    const marker: MarkerDef = {
      key,
      name,
      ...(shortName ? { shortName } : {}),
      category,
      unit,
      aliases: [rawName].filter(Boolean),
      description,
      ...(hasLab     ? { labRange:     { ...(labLow     !== undefined ? { low: labLow }     : {}), ...(labHigh     !== undefined ? { high: labHigh }     : {}) } } : {}),
      optimalRange:
        hasOptimal
          ? { ...(optimalLow  !== undefined ? { low: optimalLow }  : {}), ...(optimalHigh  !== undefined ? { high: optimalHigh }  : {}) }
          // If the user supplied only lab range, mirror it as optimal so the
          // flag computation has SOMETHING to score against. The plan
          // generator still presents lab-vs-functional honestly.
          : { ...(labLow      !== undefined ? { low: labLow }      : {}), ...(labHigh      !== undefined ? { high: labHigh }      : {}) },
      ...(sexRaw === "male" || sexRaw === "female" || sexRaw === "intersex"
        ? { sex: sexRaw }
        : {}),
    };

    await addUserMarker(marker);

    // Immediately bind matching rows on this panel — the ticket calls this
    // out explicitly. The user shouldn't have to re-trigger matching.
    const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
    const panelId = Number(params.get("id") ?? "");
    if (Number.isFinite(panelId)) {
      await matchRowsByName(panelId, rawName, key);
    }
  });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Match every unmatched row whose rawName equals `rawName` to `markerKey`.
 *  Considers user markers (seed + user; user wins on conflicts). */
async function matchRowsByName(panelId: number, rawName: string, markerKey: string): Promise<void> {
  const extras = await listUserMarkers();
  const m = findMarker(markerKey, extras);
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

function resultRow(r: Result, extras: MarkerDef[] = []): string {
  const m = findMarker(r.markerKey, extras);
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
    // See plan.ts compose() — same fix.
    await waitForPanelCommit(id);
    location.hash = `#/labs?id=${id}`;
    await route();
  });
}

/**
 * Poll `getPanel(id)` until the row we just saved is visible. WebKit's
 * IndexedDB on iOS Safari and headless Linux occasionally lags the indexed
 * read behind the resolved write; bounded to 2s so a real failure surfaces.
 */
async function waitForPanelCommit(id: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = await getPanel(id);
    if (p) return;
    await new Promise(r => setTimeout(r, 20));
  }
}

void updatePanel;

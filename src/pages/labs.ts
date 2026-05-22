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
  latestPlan, recentCheckIns, saveProjections,
} from "../db";
import { panelsFromFiles, panelsFromText, hashStagedFiles, type ExtractedRow } from "../extractor";
import { MARKERS, findMarker, flagFor, findBestMatches } from "../data/markers";
import { listUserMarkers, addUserMarker, getAllMarkers } from "../data/userMarkers";
import { computeProjection } from "../progress/projection";
import { computeMovementReceipt, moveSentence } from "../labs/movement-receipt";
import { computeReportCard, reportCardSentence, reportClassFor, resolveResultFlag } from "../labs/report-card";
import { route } from "../main";
import { isSharedView } from "../share/shared-state";
import { isTour } from "../sample/state";
import { getCachedExtraction } from "../db";
import { ANTHROPIC_HOST } from "../claude";
import type { MarkerCategory, MarkerDef, MarkerMove, Panel, ProjectionSnapshot, ReportCard, Result } from "../types";

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
  // Shared-view (ticket 0017): labs were not part of the shared payload.
  // Render the editorial empty state and return.
  if (isSharedView()) {
    return paintSharedNotIncluded();
  }

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

        <div id="egress-receipt"></div>

        <div id="actions" style="margin-top: 1rem; display: none; flex-wrap: wrap; gap: 1rem; align-items: center;">
          <button id="extract" class="btn btn--accent">Extract</button>
          <button id="clear"   class="btn btn--ghost">Clear</button>
        </div>

        <div class="labs-paste-text">
          <div class="labs-paste-text__title">Paste your results as text</div>
          <p class="labs-paste-text__hint">
            Copy the values from your portal and paste them here — we parse them into a dated panel.
          </p>
          <textarea class="labs-paste-text__input"
                    rows="5"
                    placeholder="Paste the results block from MyChart, LabCorp, or Quest"></textarea>
          <div class="labs-paste-text__actions">
            <button type="button" class="btn btn--accent labs-paste-text__extract">Extract from text</button>
          </div>
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
      return;   // an image/file paste is never also a text paste
    }

    // Text branch (ticket 0046) — mutually exclusive with the image path: only
    // when the clipboard carried NO file item. A pasted block of portal text
    // (text/plain) routes straight to text extraction instead of being ignored.
    // We never read clipboardData.files here, preserving the single-source rule
    // the image path documents.
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
      return;   // let a paste INTO the textarea fill it normally, no auto-extract
    }
    const text = e.clipboardData.getData("text/plain");
    if (text.trim()) {
      e.preventDefault();
      void extractText(text);
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

  // Text affordance (ticket 0046) — the explicit "Extract from text" button.
  document.querySelector(".labs-paste-text__extract")?.addEventListener("click", () => {
    const ta = document.querySelector<HTMLTextAreaElement>(".labs-paste-text__input");
    const text = ta?.value ?? "";
    if (text.trim()) void extractText(text);
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
    renderEgressReceipt(staged);
    return;
  }

  renderEgressReceipt(staged);

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

/* -------------------------------------------------------------------------- */
/*  Egress receipt (ticket 0025)                                              */
/* -------------------------------------------------------------------------- */
/*
 * A render-time, zero-network "what leaves this device" statement painted at
 * the extraction trigger whenever files are staged. It names where the bytes
 * go (ANTHROPIC_HOST, the same constant the privacy allow-list enforces), what
 * travels (the staged pages), and what stays (everything else). The host is
 * shown verbatim, in body weight — informational, not navigable.
 *
 * The receipt is computed entirely from `staged` + a constant: no network call
 * paints it. The optional cache-replay line reads `getCachedExtraction()` off
 * the SAME hash the extraction cache uses (`hashStagedFiles`), which is a
 * local-only IndexedDB lookup — it adds a fact, not an egress. We paint the
 * base receipt synchronously so it shows instantly on a flaky connection, then
 * fold in the cache fact when the local lookup resolves.
 */
function renderEgressReceipt(files: File[]): void {
  const slot = document.getElementById("egress-receipt");
  if (!slot) return;

  if (!files.length) {
    slot.innerHTML = "";
    return;
  }

  const n = files.length;
  const noun = n === 1 ? "page" : "pages";

  // Tour mode (ticket 0014): the upload screen is live but extraction is
  // simulated — nothing actually leaves. The receipt says so plainly and
  // omits the host (the sample sends nowhere).
  if (isTour()) {
    slot.innerHTML = `
      <div class="egress-receipt" role="note">
        <p class="egress-receipt__summary">In this sample, nothing is sent — extraction is simulated.</p>
      </div>
    `;
    return;
  }

  const names = files.map((f) => f.name);
  const summary =
    `${n} ${noun} will be sent to ${ANTHROPIC_HOST} with your key, for extraction only. ` +
    `Your profile, your prior panels, and these files stay on this device.`;

  slot.innerHTML = `
    <div class="egress-receipt" role="note">
      <p class="egress-receipt__summary"><span class="egress-receipt__summary-text">${esc(summary)}</span><span class="egress-receipt__cache" hidden></span></p>
      <button type="button" class="egress-receipt__disclosure" role="button" aria-expanded="false">what travels →</button>
      <div class="egress-receipt__detail" hidden>
        <div class="egress-receipt__row egress-receipt__row--travels"><span class="egress-receipt__rowlabel">Travels:</span> ${esc(names.join(", "))}</div>
        <div class="egress-receipt__row egress-receipt__row--destination"><span class="egress-receipt__rowlabel">Destination:</span> ${esc(ANTHROPIC_HOST)}</div>
        <div class="egress-receipt__row egress-receipt__row--stays"><span class="egress-receipt__rowlabel">Stays:</span> your profile, your prior panels, and the original files.</div>
      </div>
    </div>
  `;

  // The disclosure toggles the inline detail panel. ink eyebrow link; no URL
  // change, no network — pure DOM.
  const disclosure = slot.querySelector<HTMLButtonElement>(".egress-receipt__disclosure");
  const detail = slot.querySelector<HTMLElement>(".egress-receipt__detail");
  disclosure?.addEventListener("click", () => {
    if (!detail) return;
    const open = detail.hasAttribute("hidden");
    if (open) detail.removeAttribute("hidden");
    else detail.setAttribute("hidden", "");
    disclosure.setAttribute("aria-expanded", String(open));
  });

  // Fold in the cached-replay fact when the local cache lookup resolves. Guard
  // against a stale async resolution (the user cleared/changed the stage in the
  // meantime) by re-confirming the slot still holds the same file count.
  void surfaceCacheFact(files, slot);
}

/**
 * If the staged set's hash matches a prior extraction in the local cache, add
 * the cached-replay line to the receipt's summary. Pure-local: hashes the files
 * and reads IndexedDB, never the network. No-op in tour mode (no real cache).
 */
async function surfaceCacheFact(files: File[], slot: HTMLElement): Promise<void> {
  if (isTour()) return;
  let hash: string;
  try { hash = await hashStagedFiles(files); }
  catch { return; }
  const cached = await getCachedExtraction(hash);
  if (!cached) return;

  // Re-confirm the stage hasn't changed under us before painting.
  const cacheEl = slot.querySelector<HTMLElement>(".egress-receipt__cache");
  if (!cacheEl) return;
  if (files.length !== staged.length) return;

  cacheEl.textContent =
    " These files were already extracted — re-running replays the cached result at no cost and sends nothing.";
  cacheEl.hidden = false;
}

/**
 * Render the "This was not shared with you" empty state for Labs under
 * shared-view (ticket 0017). Lab data was never part of the shared
 * payload; the recipient's IndexedDB is also bypassed.
 */
async function paintSharedNotIncluded(): Promise<void> {
  const masth = await masthead("#/labs");
  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Labs</div>
        <div class="shared-empty" role="status">
          <h2 class="shared-empty__title">This was not shared with you.</h2>
          <p class="shared-empty__body">
            Lab panels were not part of the shared link — they are the most personal data Almanac carries, and the share artifact never includes them. Open Plan or Meals above to read what was shared.
          </p>
        </div>
      </section>
      ${foot("ii")}
    </div>
  `);
  mount(frag);
}

async function extractStaged(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;

  const { setStatus, fail } = statusHandles();

  try {
    setStatus(`Extracting from ${staged.length} page${staged.length === 1 ? "" : "s"}…`);
    const files = staged.slice();
    const { panels, unmatched } = await panelsFromFiles(files, profile);
    staged = [];
    await commitPanelsAndNavigate(panels, unmatched, setStatus);
  } catch (err: any) {
    fail(err, () => extractStaged());
  }
}

/**
 * Extract from pasted results text (ticket 0046). The text-input sibling of
 * `extractStaged`: it runs `panelsFromText` then the SAME save + navigate path,
 * so a paste converges on the identical review screen the file path produces.
 * An empty / whitespace-only paste is a no-op (the callers guard before calling,
 * but we re-guard defensively so a direct call never fires an empty extraction).
 */
async function extractText(text: string): Promise<void> {
  if (!text.trim()) return;
  const profile = await getProfile();
  if (!profile) return;

  const { setStatus, fail } = statusHandles();

  try {
    setStatus("Extracting from pasted text…");
    const { panels, unmatched } = await panelsFromText(text, profile);
    await commitPanelsAndNavigate(panels, unmatched, setStatus);
  } catch (err: any) {
    fail(err, () => extractText(text));
  }
}

/** The shared status-line handles for the extraction surfaces. */
function statusHandles() {
  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };
  const fail = (err: any, retry: () => void) => {
    if (!status) return;
    status.style.display = "block";
    const raw = extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Extraction failed",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
      actions: `<button id="retry-extract" class="btn btn--accent">Try again</button>`,
    });
    document.getElementById("retry-extract")?.addEventListener("click", retry);
  };
  return { setStatus, fail };
}

/**
 * Persist a freshly-extracted set of panels and navigate to the review screen —
 * the step the file path (`extractStaged`) and the text path (`extractText`)
 * share so both converge on the identical post-extraction behavior: one panel
 * lands on its detail; a multi-date split lands on the labs index. Projection
 * snapshotting (0012) runs per panel and is best-effort.
 */
async function commitPanelsAndNavigate(
  panels: Omit<Panel, "id" | "createdAt">[],
  unmatched: ExtractedRow[],
  setStatus: (msg: string) => void,
): Promise<void> {
  setStatus(panels.length === 1 ? "Saving…" : `Saving ${panels.length} panels…`);
  const ids: number[] = [];
  for (const p of panels) {
    ids.push(await addPanel(p));
    // Per ticket 0012 — every new panel materializes a projection snapshot
    // for the markers on the PRIOR latest panel that have a curated
    // responsiveness entry AND for which adherence cleared the threshold.
    // Failure here must never block the save; log and continue so a bug
    // in projection math doesn't strand the user with no panel persisted.
    try { await materializeProjectionsForPriorPanel(ids[ids.length - 1]!); }
    catch { /* projection snapshotting is best-effort */ }
  }
  const newestId = ids[ids.length - 1];
  if (newestId == null) {
    // Defensive — `panelsFrom*` already throws when extraction yielded zero
    // panels, but TS strict can't see that and a future change shouldn't
    // silently strand the user.
    throw new Error("Extraction returned no panels.");
  }

  // Unmatched rows from the WHOLE extraction land on the newest (last-saved)
  // panel's review screen — the one the user is most likely to come back to.
  if (unmatched.length) {
    sessionStorage.setItem(`unmatched-${newestId}`, JSON.stringify(unmatched));
  }

  // Same WebKit-timing fix as plan.ts compose(): poll past WebKit's IDB
  // read-after-write delay before re-rendering.
  await waitForPanelCommit(newestId);

  if (ids.length === 1) {
    // Single panel — keep the existing "land on detail" behavior.
    location.hash = `#/labs?id=${newestId}`;
  } else {
    // Multi-panel split — land on the labs index so the user sees all
    // N new panels at the top, dated.
    location.hash = "#/labs";
  }
  await route();
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

  // Report card (ticket 0036) — "Against the optimum," the at-rest tally of how
  // this panel's markers stack up against the FUNCTIONAL optimum. Pure,
  // zero-network: it reduces the panel's already-flagged results (with
  // `flagFor()` as fallback) over the resolved marker ranges. Renders nothing
  // when no marker is classifiable (a panel of only range-less rows). It sits
  // ABOVE the movement receipt — the at-rest picture comes first, then the
  // movement context.
  const reportCard = computeReportCard(panel, extras);
  const reportCardHtml = reportCard.total > 0 ? renderReportCard(reportCard) : "";

  // Movement receipt (ticket 0032) — "Since your last draw," one calm dated
  // line per marker that also has an earlier draw. Pure, zero-network: it reads
  // this panel + every prior panel already loaded from IndexedDB. Renders
  // nothing on a first-ever panel (no marker has a prior to compare against).
  const priorPanels = (await allPanels()).filter(p => p.id !== id);
  const moves = computeMovementReceipt(panel, priorPanels, extras);
  const movementHtml = moves.length ? renderMovementReceipt(moves) : "";

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

        ${reportCardHtml}
        ${groupsHtml || `<div class="quiet">No matched results.</div>`}
        ${movementHtml}
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
  wireReportCard();
}

/* -------------------------------------------------------------------------- */
/*  Movement receipt (ticket 0032)                                            */
/* -------------------------------------------------------------------------- */
/*
 * Render the "Since your last draw" section: one editorial line per marker that
 * moved relative to its most recent prior draw. The into-range crossing gets no
 * special color (ink, not oxblood and not a green) — the satisfaction is in the
 * copy. Long marker names wrap rather than overflow (the `min-width: 0` fix on
 * the row grid). The caller only invokes this when `moves` is non-empty, so the
 * eyebrow is absent on a fresh first panel.
 */
function renderMovementReceipt(moves: MarkerMove[]): string {
  const lines = moves.map(m => `
    <p class="movement-receipt__row" data-state="${esc(m.state)}">${esc(moveSentence(m))}</p>
  `).join("");

  return `
    <section class="movement-receipt" aria-label="Since your last draw">
      <div class="section-mark movement-receipt__eyebrow">Since your last draw</div>
      <div class="movement-receipt__lines">${lines}</div>
    </section>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Report card (ticket 0036)                                                  */
/* -------------------------------------------------------------------------- */
/*
 * Render the "Against the optimum" section: one editorial sentence over a small
 * tally of class chips. The sentence carries only the non-zero clauses; the
 * chips are ≥44×44 css-px tap targets that scroll + highlight the matching rows.
 * No celebratory or alarmist color — ink and ink-soft only; the satisfaction and
 * the seriousness both live in the copy. The caller only invokes this when the
 * card has at least one classifiable marker (`total > 0`).
 */
function renderReportCard(card: ReportCard): string {
  // Each chip names a class, its count, and a label. Optimal is always shown
  // (it's the denominator the user came to read); suboptimal + out-of-range
  // chips appear only when non-zero so a clean panel reads as reassurance.
  const chips: string[] = [
    chip("optimal", card.optimal, "optimal"),
  ];
  if (card.suboptimal > 0) {
    chips.push(chip("suboptimal", card.suboptimal, "below optimum"));
  }
  if (card.outOfLabRange > 0) {
    chips.push(chip("outOfLabRange", card.outOfLabRange, "out of lab range"));
  }

  return `
    <section class="report-card" aria-label="Against the optimum">
      <div class="section-mark report-card__eyebrow">Against the optimum</div>
      <p class="report-card__line">${esc(reportCardSentence(card))}</p>
      <div class="report-card__counts">${chips.join("")}</div>
    </section>
  `;
}

/** One report-card class chip — a tap target that scrolls to its rows. */
function chip(cls: "optimal" | "suboptimal" | "outOfLabRange", count: number, label: string): string {
  return `
    <button type="button" class="report-card__count" data-class="${esc(cls)}">
      <span class="report-card__count-num">${count}</span>
      <span class="report-card__count-label">${esc(label)}</span>
    </button>
  `;
}

/**
 * Wire the report-card chips: tapping a chip scrolls the first row of that class
 * into view and adds a transient highlight to every row in the class. Pure DOM —
 * no URL change, no network. The rows carry `data-report-class` (assigned by
 * `resultRow` via the same flag resolution the card counted with), so a chip tap
 * selects exactly the rows it tallied.
 */
function wireReportCard(): void {
  const card = document.querySelector(".report-card");
  if (!card) return;

  for (const btn of card.querySelectorAll<HTMLButtonElement>(".report-card__count")) {
    btn.addEventListener("click", () => {
      const cls = btn.dataset.class;
      if (!cls) return;

      // Clear any prior highlight so repeated taps don't accumulate.
      for (const prev of document.querySelectorAll(".result.is-report-highlight")) {
        prev.classList.remove("is-report-highlight");
      }

      const rows = document.querySelectorAll<HTMLElement>(`.result[data-report-class="${cls}"]`);
      if (!rows.length) return;
      for (const row of rows) row.classList.add("is-report-highlight");
      rows[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
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

  // The report card (ticket 0036) scrolls + highlights the rows in a class by
  // selecting on `data-report-class`. Resolve the flag the same way the card
  // does — stored flag first, `flagFor()` fallback — so a chip tap finds exactly
  // the rows the chip counted.
  const reportClass = reportClassFor(resolveResultFlag(r, extras));

  return `
    <div class="result"${reportClass ? ` data-report-class="${esc(reportClass)}"` : ""} data-marker-key="${esc(r.markerKey)}">
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

        <div class="egress-receipt egress-receipt--manual" role="note" style="margin-top: 1.4rem;">
          <p class="egress-receipt__summary">Manual entry sends nothing — these values are typed straight into this device.</p>
        </div>

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
    // Ticket 0012 — materialize projection snapshots against the prior
    // latest panel so the Progress page can render the evaluation row on
    // the next visit. Best-effort; never blocks the navigation.
    try { await materializeProjectionsForPriorPanel(id); }
    catch { /* projection snapshotting is best-effort */ }
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

/**
 * Materialize a projection snapshot per qualifying marker on the PRIOR
 * latest panel — the panel that was newest BEFORE `newPanelId` arrived
 * (ticket 0012). The next visit to `#/progress` joins these snapshots
 * against the just-arrived panel's values to render the evaluation row.
 *
 * No-op when:
 *   - there's no prior panel (this is the first upload ever)
 *   - there's no active plan (adherence has nothing to score against)
 *
 * Every newly-inserted panel triggers this. We call it once per `addPanel`
 * call site (extraction flow + manual flow) so the persistence stays
 * deterministic regardless of which surface created the panel.
 */
async function materializeProjectionsForPriorPanel(newPanelId: number): Promise<void> {
  const panels = await allPanels();      // newest-first by drawnAt
  // Identify the prior panel: the panel that was newest before this upload.
  // `allPanels()` returns newest-first by drawnAt, so the panel ordering
  // here is:
  //   index 0 — the newly-arrived panel IF it has the newest drawnAt
  //   index 1 — the prior panel
  // If the user back-dated this draw, the new panel might not be at index 0.
  // Filter out the new panel and take whatever's newest among the rest.
  const others = panels.filter(p => p.id !== newPanelId);
  const prior  = others[0];   // newest of "everything but the new panel"
  if (!prior?.id) return;

  const plan = await latestPlan();
  if (!plan) return;
  const checkins = await recentCheckIns(14);

  const snapshots: ProjectionSnapshot[] = [];
  const now = Date.now();
  for (const r of prior.results) {
    const m = findMarker(r.markerKey);
    if (!m?.responsiveness) continue;
    const band = computeProjection(m, r, checkins, plan);
    if (!band) continue;   // adherence below threshold → no snapshot
    snapshots.push({
      markerKey: r.markerKey,
      panelId: prior.id,
      low: band.low,
      high: band.high,
      weeksOut: band.weeksOut,
      createdAt: now,
    });
  }
  if (snapshots.length) await saveProjections(snapshots);
}

void updatePanel;

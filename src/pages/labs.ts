// Labs screen — upload PDFs / photos, manual entry, and the list of all panels.
//
// Layout:
//   #/labs                → list + upload affordance
//   #/labs?id=N           → review a single panel's results
//   #/labs?manual=1       → manual entry form

import { mount, h, esc } from "../ui";
import { masthead, foot } from "../chrome";
import {
  getProfile, allPanels, addPanel, getPanel, deletePanel, updatePanel,
} from "../db";
import { panelFromFile } from "../extractor";
import { MARKERS, findMarker, flagFor } from "../data/markers";
import type { Panel, Result } from "../types";

export async function renderLabs(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
  if (params.get("manual") === "1") return renderManualEntry();
  const idStr = params.get("id");
  if (idStr) return renderPanelDetail(Number(idStr));

  const panels = await allPanels();
  const masth = await masthead("#/labs");

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Labs</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          The <em>raw biology</em>.
        </h1>
        <p class="lede" style="max-width: 60ch; margin-top: 0.8rem;">
          Drop a PDF or a photo of your last lab report. The editor will extract every numeric marker and reconcile it against functional ranges.
        </p>

        <div id="drop" class="dropzone" style="margin-top: 2.2rem;">
          <input id="file" type="file" accept="application/pdf,image/*" style="display:none;" />
          <div class="dropzone__title">Drop a lab report here</div>
          <div class="dropzone__hint">PDF, JPG, PNG — or <a id="pickfile" href="#">choose a file</a>. Original stays on this device.</div>
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
  wireDropzone();
}

function panelRow(p: Panel, idx: number): string {
  const counts = countByFlag(p.results);
  const pieces = [
    counts.optimal     ? `${counts.optimal} optimal`         : "",
    counts.suboptimal  ? `${counts.suboptimal} suboptimal`   : "",
    counts.low + counts.high ? `${counts.low + counts.high} out of range` : "",
  ].filter(Boolean).join(" · ");
  return `
    <a class="entry-row" href="#/labs?id=${p.id}">
      <div class="date">${esc(p.drawnAt)}</div>
      <div class="title">${esc(p.labName ?? "Lab panel")} <span style="color:var(--ink-faint);font-style:normal;font-size:0.85em;">— ${p.results.length} markers · ${esc(pieces || "—")}</span></div>
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
/*  Drop / upload                                                             */
/* -------------------------------------------------------------------------- */

function wireDropzone(): void {
  const drop  = document.getElementById("drop");
  const input = document.getElementById("file") as HTMLInputElement | null;
  const pick  = document.getElementById("pickfile");
  if (!drop || !input) return;

  pick?.addEventListener("click", (e) => { e.preventDefault(); input.click(); });
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-over");
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) handleFile(f);
  });
}

async function handleFile(file: File): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;

  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus(`Extracting from ${file.name}…`);
    const { panel, unmatched } = await panelFromFile(file, profile);

    setStatus("Saving…");
    const id = await addPanel(panel);

    if (unmatched.length) {
      sessionStorage.setItem(`unmatched-${id}`, JSON.stringify(unmatched));
    }
    location.hash = `#/labs?id=${id}`;
  } catch (err: any) {
    if (status) {
      status.style.display = "block";
      status.innerHTML = `<strong style="color: var(--oxblood)">Extraction failed.</strong><br/>${esc(err.message ?? String(err))}`;
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Panel detail                                                              */
/* -------------------------------------------------------------------------- */

async function renderPanelDetail(id: number): Promise<void> {
  const panel = await getPanel(id);
  if (!panel) { location.hash = "#/labs"; return; }
  const masth = await masthead("#/labs");

  const unmatched = JSON.parse(sessionStorage.getItem(`unmatched-${id}`) || "[]");

  // Group results by category for readability.
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
      <div class="results">
        ${rows.map(resultRow).join("")}
      </div>
    </section>
  `).join("");

  const unmatchedHtml = unmatched.length ? `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark" style="color: var(--ink-faint);">Unrecognized rows · ${unmatched.length}</div>
      <p class="hint" style="max-width: 60ch;">These appeared on the report but didn't match any marker in the database. They'll be ignored by the plan generator until matched.</p>
      <ul style="font-family: var(--mono); font-size: 0.82rem; color: var(--ink-soft);">
        ${unmatched.map((u: any) => `<li>${esc(u.rawName)} — ${esc(u.value)} ${esc(u.unit ?? "")}</li>`).join("")}
      </ul>
    </section>
  ` : "";

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div style="margin-bottom: 1rem;"><a href="#/labs" style="font-family:var(--body);font-size:0.78rem;color:var(--ink-faint);letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">← Back to labs</a></div>

        <div class="eyebrow">${esc(panel.drawnAt)}${panel.labName ? ` · ${esc(panel.labName)}` : ""}</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          <em>${panel.results.length}</em> markers, drawn ${esc(panel.drawnAt)}.
        </h1>

        ${groupsHtml || `<div class="quiet">No matched results.</div>`}

        ${unmatchedHtml}

        <div style="margin-top: 3rem; display: flex; gap: 1rem;">
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
        <div><span class="result__rangelabel">lab</span> ${esc(lab)}</div>
        <div><span class="result__rangelabel">functional</span> ${esc(optimal)}</div>
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

  // Show only markers relevant to the user's sex.
  const visibleMarkers = MARKERS.filter(m => !m.sex || m.sex === profile.sex);

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div style="margin-bottom: 1rem;"><a href="#/labs" style="font-family:var(--body);font-size:0.78rem;color:var(--ink-faint);letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;">← Back to labs</a></div>

        <div class="eyebrow">Manual entry</div>
        <h1 class="headline" style="margin-top: 0.4rem;">Type the values <em>by hand</em>.</h1>
        <p class="lede" style="max-width: 60ch; margin-top: 0.8rem;">Fill the markers you have — leave the rest blank. Skip the upload entirely.</p>

        <form id="manual" style="margin-top: 2.2rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
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

          <div style="display: flex; gap: 1rem; margin-top: 2rem;">
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

// quiet linting
void updatePanel;

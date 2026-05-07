// Settings — edit profile, key, model. Export / import / wipe.

import { mount, h, esc } from "../ui";
import { masthead, foot } from "../chrome";
import { getProfile, saveProfile, exportAll, importAll, wipeAll } from "../db";
import type { AlmanacExport } from "../db";
import type { Sex } from "../types";

export async function renderSettings(): Promise<void> {
  const p = await getProfile();
  if (!p) { location.hash = "#/onboarding"; return; }
  const masth = await masthead("#/settings");

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        <div class="eyebrow">Settings</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          The <em>imprint</em>.
        </h1>

        <form id="set" style="max-width: 60ch; margin-top: 2.2rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="field">
              <label for="name">Your name</label>
              <input id="name" name="name" type="text" required value="${esc(p.ownerName)}" />
            </div>
            <div class="field">
              <label for="birthDate">Date of birth</label>
              <input id="birthDate" name="birthDate" type="date" value="${esc(p.birthDate ?? "")}" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
            <div class="field">
              <label for="sex">Sex</label>
              <select id="sex" name="sex">
                ${(["male","female","intersex","unspecified"] as Sex[]).map(s => `
                  <option value="${s}" ${p.sex === s ? "selected" : ""}>${s[0]!.toUpperCase()+s.slice(1)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label for="heightCm">Height (cm)</label>
              <input id="heightCm" name="heightCm" type="number" step="0.5" value="${p.heightCm ?? ""}" />
            </div>
            <div class="field">
              <label for="weightKg">Weight (kg)</label>
              <input id="weightKg" name="weightKg" type="number" step="0.1" value="${p.weightKg ?? ""}" />
            </div>
          </div>

          <div class="field">
            <label for="goals">Goals</label>
            <textarea id="goals" name="goals">${esc(p.goals)}</textarea>
          </div>
          <div class="field">
            <label for="conditions">Conditions / medications / allergies</label>
            <textarea id="conditions" name="conditions">${esc(p.conditions)}</textarea>
          </div>
          <div class="field">
            <label for="key">Anthropic API key</label>
            <input id="key" name="key" type="password" value="${esc(p.anthropicKey)}" autocomplete="off" />
          </div>
          <div class="field">
            <label for="model">Model</label>
            <select id="model" name="model">
              <option value="claude-sonnet-4-6" ${p.model === "claude-sonnet-4-6" ? "selected" : ""}>claude-sonnet-4-6</option>
              <option value="claude-opus-4-7" ${p.model === "claude-opus-4-7" ? "selected" : ""}>claude-opus-4-7</option>
              <option value="claude-haiku-4-5-20251001" ${p.model === "claude-haiku-4-5-20251001" ? "selected" : ""}>claude-haiku-4-5</option>
            </select>
          </div>

          <div style="display: flex; gap: 1rem; margin-top: 1.6rem;">
            <button type="submit" class="btn btn--accent">Save</button>
          </div>
          <div id="set-status" class="quiet" style="padding: 0.6rem 0; font-size: 0.95rem;"></div>
        </form>

        <div style="margin-top: 3.6rem;">
          <div class="section-mark">Backup &amp; restore</div>
          <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
            <button id="export" class="btn">Export the almanac</button>
            <label class="btn btn--ghost" style="cursor: pointer;">
              Import a backup
              <input id="import-file" type="file" accept="application/json,.json" style="display: none;" />
            </label>
            <span id="io-status" class="quiet" style="padding: 0; font-size: 0.95rem;"></span>
          </div>
          <p class="hint" style="margin-top: 1rem; max-width: 56ch;">
            Export writes a single <code>.almanac.json</code> to your Downloads folder. Lab PDFs/images are not included by default; the JSON has every panel, plan, and check-in.
          </p>
        </div>

        <div style="margin-top: 3rem;">
          <div class="section-mark" style="color: var(--oxblood);">Danger</div>
          <button id="wipe" class="btn" style="border-color: var(--oxblood); color: var(--oxblood);">
            Burn the almanac
          </button>
          <p class="hint" style="margin-top: 0.8rem; max-width: 56ch;">
            Wipes every panel, plan, check-in, and your profile from this device. There is no undo. Export first.
          </p>
        </div>
      </section>
      ${foot("v")}
    </div>
  `);

  mount(frag);

  document.getElementById("set")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const fd = new FormData(f);
    await saveProfile({
      ownerName:    String(fd.get("name") ?? "").trim(),
      birthDate:    String(fd.get("birthDate") ?? "") || undefined,
      sex:          (String(fd.get("sex") ?? "unspecified") as Sex),
      heightCm:     numOrUndef(fd.get("heightCm")),
      weightKg:     numOrUndef(fd.get("weightKg")),
      goals:        String(fd.get("goals") ?? "").trim(),
      conditions:   String(fd.get("conditions") ?? "").trim(),
      anthropicKey: String(fd.get("key") ?? "").trim(),
      model:        String(fd.get("model") ?? "claude-sonnet-4-6"),
    });
    const st = document.getElementById("set-status"); if (st) st.textContent = "Saved.";
  });

  document.getElementById("export")?.addEventListener("click", async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${new Date().toISOString().slice(0,10)}.almanac.json`; a.click();
    URL.revokeObjectURL(url);
    const st = document.getElementById("io-status"); if (st) st.textContent = "Exported.";
  });

  document.getElementById("import-file")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text) as AlmanacExport;
      await importAll(data, "merge");
      const st = document.getElementById("io-status"); if (st) st.textContent = "Imported. Reload to see it.";
    } catch (err: any) {
      const st = document.getElementById("io-status"); if (st) st.textContent = `Import failed: ${err.message ?? err}`;
    }
  });

  document.getElementById("wipe")?.addEventListener("click", async () => {
    if (!confirm("Burn the almanac? Every panel, plan, check-in, and your profile will be erased from this device. No undo.")) return;
    await wipeAll();
    location.hash = "#/onboarding";
  });
}

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v); return Number.isFinite(n) ? n : undefined;
}

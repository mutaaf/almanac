// Settings: edit identity, key, model. Toggle structured signals.
// Export and import the whole almanac. Wipe everything.

import { mount, h, esc } from "../ui";
import { masthead, foot } from "../chrome";
import { getSettings, saveSettings, exportAll, importAll, wipeAll } from "../db";
import type { AlmanacExport } from "../db";

const ALL_SIGNALS: { key: string; label: string }[] = [
  { key: "sleepHours", label: "Sleep (hours)" },
  { key: "weight",     label: "Weight" },
  { key: "mood",       label: "Mood (1–5)" },
  { key: "energy",     label: "Energy (1–5)" },
];

export async function renderSettings(): Promise<void> {
  const s = await getSettings();
  if (!s) { location.hash = "#/onboarding"; return; }

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
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" type="text" value="${esc(s.ownerName)}" />
          </div>
          <div class="field">
            <label for="intent">Intent</label>
            <textarea id="intent" name="intent">${esc(s.intent)}</textarea>
          </div>
          <div class="field">
            <label for="key">Anthropic API key</label>
            <input id="key" name="key" type="password" value="${esc(s.anthropicKey)}" autocomplete="off" />
          </div>
          <div class="field">
            <label for="model">Model</label>
            <select id="model" name="model">
              <option value="claude-sonnet-4-6" ${s.model === "claude-sonnet-4-6" ? "selected" : ""}>claude-sonnet-4-6</option>
              <option value="claude-opus-4-7" ${s.model === "claude-opus-4-7" ? "selected" : ""}>claude-opus-4-7</option>
              <option value="claude-haiku-4-5-20251001" ${s.model === "claude-haiku-4-5-20251001" ? "selected" : ""}>claude-haiku-4-5</option>
            </select>
          </div>
          <div class="field">
            <label>Structured signals to track</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.6rem;">
              ${ALL_SIGNALS.map(sig => `
                <label style="display: flex; gap: 0.5rem; align-items: center; font-family: var(--display); font-size: 1.05rem;">
                  <input type="checkbox" name="sig" value="${esc(sig.key)}" ${s.enabledSignals.includes(sig.key) ? "checked" : ""} />
                  ${esc(sig.label)}
                </label>
              `).join("")}
            </div>
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
            Export writes a single <code>.almanac.json</code> to your downloads.
            That file is the entire almanac. Keep it somewhere you trust.
          </p>
        </div>

        <div style="margin-top: 3rem;">
          <div class="section-mark" style="color: var(--oxblood);">Danger</div>
          <button id="wipe" class="btn" style="border-color: var(--oxblood); color: var(--oxblood);">
            Burn the almanac
          </button>
          <p class="hint" style="margin-top: 0.8rem; max-width: 56ch;">
            Wipes every entry, page, summary, and setting from this device.
            There is no undo. Export first.
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
    const enabled = (fd.getAll("sig") as string[]);
    await saveSettings({
      ownerName: String(fd.get("name") ?? "").trim(),
      intent: String(fd.get("intent") ?? "").trim(),
      anthropicKey: String(fd.get("key") ?? "").trim(),
      model: String(fd.get("model") ?? "claude-sonnet-4-6"),
      enabledSignals: enabled,
    });
    const st = document.getElementById("set-status");
    if (st) st.textContent = "Saved.";
  });

  document.getElementById("export")?.addEventListener("click", async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${new Date().toISOString().slice(0,10)}.almanac.json`;
    a.click();
    URL.revokeObjectURL(url);
    const st = document.getElementById("io-status");
    if (st) st.textContent = "Exported.";
  });

  document.getElementById("import-file")?.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text) as AlmanacExport;
      await importAll(data, "merge");
      const st = document.getElementById("io-status");
      if (st) st.textContent = "Imported. Reload to see it.";
    } catch (err: any) {
      const st = document.getElementById("io-status");
      if (st) st.textContent = `Import failed: ${err.message ?? err}`;
    }
  });

  document.getElementById("wipe")?.addEventListener("click", async () => {
    const ok = confirm("Burn the almanac? All entries, pages, summaries, and your key will be erased from this device. There is no undo.");
    if (!ok) return;
    await wipeAll();
    location.hash = "#/onboarding";
  });
}

// First-run screen. Three things and we're done: name, intent, key.
// No tutorial, no welcome video, no "what is Almanac" pitch — the page itself
// is the pitch.

import { mount, h, esc } from "../ui";
import { saveSettings, getSettings } from "../db";

export async function renderOnboarding(): Promise<void> {
  const existing = await getSettings();

  const frag = h(`
    <div>
      <header class="masthead">
        <div>
          <div class="dateline">A new edition</div>
          <div class="wordmark">Almanac<span class="amp">.</span></div>
        </div>
      </header>

      <section class="page">
        <div class="ornament"><span class="dot"></span></div>

        <h1 class="headline" style="max-width: 22ch;">
          A daily page, <em>printed</em><br/>only on this device.
        </h1>

        <p class="lede" style="max-width: 56ch; margin-top: 1.4rem;">
          Tell it three things and it begins.
          Your data stays on this machine. The only egress is your own
          Anthropic key, used once a day to draft the page.
        </p>

        <form id="onb" style="max-width: 56ch; margin-top: 2.4rem;">
          <div class="field">
            <label for="name">Your name</label>
            <input id="name" name="name" type="text" required
                   value="${esc(existing?.ownerName ?? "")}"
                   placeholder="Mutaaf" />
            <div class="hint">How the page should address you.</div>
          </div>

          <div class="field">
            <label for="intent">What is this almanac for?</label>
            <textarea id="intent" name="intent" required
                      placeholder="To track sleep, training, and how my mood drifts. To get one quiet recommendation each morning. To notice patterns I'd otherwise miss.">${esc(existing?.intent ?? "")}</textarea>
            <div class="hint">A few sentences. The editor reads this every morning.</div>
          </div>

          <div class="field">
            <label for="key">Anthropic API key</label>
            <input id="key" name="key" type="password" required
                   value="${esc(existing?.anthropicKey ?? "")}"
                   placeholder="sk-ant-..." autocomplete="off" />
            <div class="hint">
              Stored in this browser's IndexedDB. Sent only to api.anthropic.com,
              and only when generating a page.
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Get one →</a>
            </div>
          </div>

          <div class="field">
            <label for="model">Model</label>
            <select id="model" name="model">
              <option value="claude-sonnet-4-6" ${(existing?.model ?? "claude-sonnet-4-6") === "claude-sonnet-4-6" ? "selected" : ""}>claude-sonnet-4-6 (recommended)</option>
              <option value="claude-opus-4-7" ${existing?.model === "claude-opus-4-7" ? "selected" : ""}>claude-opus-4-7 (richer, slower, costlier)</option>
              <option value="claude-haiku-4-5-20251001" ${existing?.model === "claude-haiku-4-5-20251001" ? "selected" : ""}>claude-haiku-4-5 (fastest, lightest)</option>
            </select>
          </div>

          <div style="display: flex; gap: 1rem; margin-top: 2rem;">
            <button type="submit" class="btn btn--accent">Begin the almanac</button>
          </div>
        </form>
      </section>

      <footer class="foot">
        <span class="colophon">Printed quietly, on this device.</span>
        <span>i</span>
      </footer>
    </div>
  `);

  mount(frag);

  document.getElementById("onb")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const fd = new FormData(f);
    await saveSettings({
      ownerName: String(fd.get("name") ?? "").trim(),
      intent: String(fd.get("intent") ?? "").trim(),
      anthropicKey: String(fd.get("key") ?? "").trim(),
      model: String(fd.get("model") ?? "claude-sonnet-4-6"),
      enabledSignals: existing?.enabledSignals ?? ["sleepHours", "mood", "energy"],
    });
    location.hash = "#/today";
  });
}

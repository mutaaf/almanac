// First-run onboarding. Just enough to make a useful first Plan.

import { mount, h, esc } from "../ui";
import { saveProfile, getProfile } from "../db";
import type { Sex } from "../types";

export async function renderOnboarding(): Promise<void> {
  const existing = await getProfile();

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

        <h1 class="headline" style="max-width: 26ch;">
          Your <em>biology</em>, translated<br/>into a plan you can keep.
        </h1>

        <p class="lede" style="max-width: 60ch; margin-top: 1.4rem;">
          Tell it the basics. Upload your last lab report. Get a snapshot,
          a small daily habit stack, and a clear protocol — all on this device.
        </p>

        <form id="onb" style="max-width: 60ch; margin-top: 2.6rem;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
            <div class="field">
              <label for="name">Your name</label>
              <input id="name" name="name" type="text" required value="${esc(existing?.ownerName ?? "")}" />
            </div>
            <div class="field">
              <label for="birthDate">Date of birth</label>
              <input id="birthDate" name="birthDate" type="date" required value="${esc(existing?.birthDate ?? "")}" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
            <div class="field">
              <label for="sex">Sex (for ranges)</label>
              <select id="sex" name="sex" required>
                ${(["male","female","intersex","unspecified"] as Sex[]).map(s => `
                  <option value="${s}" ${(existing?.sex ?? "unspecified") === s ? "selected" : ""}>${s[0]!.toUpperCase()+s.slice(1)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label for="heightIn">Height (inches)</label>
              <input id="heightIn" name="heightIn" type="number" step="0.5" placeholder="e.g. 70 = 5'10&quot;" value="${existing?.heightIn ?? ""}" />
            </div>
            <div class="field">
              <label for="weightLb">Weight (lb)</label>
              <input id="weightLb" name="weightLb" type="number" step="0.1" value="${existing?.weightLb ?? ""}" />
            </div>
          </div>

          <div class="field">
            <label for="goals">What are you optimizing for?</label>
            <textarea id="goals" name="goals" required placeholder="Energy through the afternoon. Lower hsCRP. Get triglycerides under 100. Hold lifts twice a week.">${esc(existing?.goals ?? "")}</textarea>
            <div class="hint">Two or three sentences. The plan is written against this.</div>
          </div>

          <div class="field">
            <label for="conditions">Existing conditions, medications, allergies</label>
            <textarea id="conditions" name="conditions" placeholder="Hashimoto's; levothyroxine 88mcg. NKDA. Family history of T2D.">${esc(existing?.conditions ?? "")}</textarea>
            <div class="hint">Optional, but it sharpens recommendations and keeps them safe.</div>
          </div>

          <div class="field">
            <label for="dietPattern">Dietary pattern</label>
            <textarea id="dietPattern" name="dietPattern" required placeholder="Halal, mostly pescatarian, love South Asian and Mediterranean cuisines. No shellfish (allergy). Cook real meals 3 weeknights, batch on Sunday, assemble the rest. Up for one ambitious cook on weekends.">${esc(existing?.dietPattern ?? "")}</textarea>
            <div class="hint">Halal/kosher/vegan/keto, cuisines you cook, dislikes, allergies, and how much you actually cook. The meal plan is built against this.</div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
            <div class="field">
              <label for="householdSize">Household size (for grocery)</label>
              <input id="householdSize" name="householdSize" type="number" min="1" max="12" value="${existing?.householdSize ?? 1}" />
            </div>
          </div>

          <div class="field">
            <label for="key">Anthropic API key</label>
            <input id="key" name="key" type="password" required value="${esc(existing?.anthropicKey ?? "")}" placeholder="sk-ant-..." autocomplete="off" />
            <div class="hint">
              Stored only in this browser. Used to extract labs (PDF/photo) and compose your plan.
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
            <button type="submit" class="btn btn--accent">Begin</button>
          </div>
        </form>
      </section>

      <footer class="foot">
        <span class="colophon">Informational, not medical advice.</span>
        <span>i</span>
      </footer>
    </div>
  `);

  mount(frag);

  document.getElementById("onb")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement;
    const fd = new FormData(f);
    await saveProfile({
      ownerName:    String(fd.get("name") ?? "").trim(),
      birthDate:    String(fd.get("birthDate") ?? "") || undefined,
      sex:          (String(fd.get("sex") ?? "unspecified") as Sex),
      heightIn:     numOrUndef(fd.get("heightIn")),
      weightLb:     numOrUndef(fd.get("weightLb")),
      goals:        String(fd.get("goals") ?? "").trim(),
      conditions:   String(fd.get("conditions") ?? "").trim(),
      dietPattern:  String(fd.get("dietPattern") ?? "").trim(),
      householdSize: numOrUndef(fd.get("householdSize")) ?? 1,
      anthropicKey: String(fd.get("key") ?? "").trim(),
      model:        String(fd.get("model") ?? "claude-sonnet-4-6"),
    });
    location.hash = "#/labs";   // straight to "upload your first labs"
  });
}

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v); return Number.isFinite(n) ? n : undefined;
}

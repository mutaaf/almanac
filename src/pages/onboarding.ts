// First-run onboarding. Just enough to make a useful first Plan.

import { mount, h, esc } from "../ui";
import { saveProfile, getProfile } from "../db";
import { readAdoptSeed, clearAdoptSeed } from "../share/adopt-seed";
import { keyCheckMarkup, wireKeyCheck } from "../onboarding/key-check";
import {
  readResolvableSandboxRows, clearSandboxRows, stageManualPrefill,
} from "./sandbox-handoff";
import type { Sex } from "../types";

export async function renderOnboarding(): Promise<void> {
  const existing = await getProfile();

  // Bring your sandbox numbers in (ticket 0049). When the prospect came from the
  // pre-key sandbox (#/try) and typed marker values that still resolve, offer —
  // ONCE — to seed those as a first manual panel. The affordance renders only
  // here, inside the gated onboarding (so a pre-consent visitor never sees it),
  // and the session payload is consumed exactly once on accept or decline. With
  // no resolvable session values the block is empty and onboarding is unchanged.
  const sandboxRows = readResolvableSandboxRows();
  const handoffBlock = sandboxRows.length
    ? `
      <div class="sandbox-handoff" role="note">
        <p class="sandbox-handoff__copy">${esc(
          `You scored ${sandboxRows.length} marker${sandboxRows.length === 1 ? "" : "s"} `
          + `in the sandbox — add them as your first panel?`,
        )}</p>
        <div class="sandbox-handoff__actions">
          <button type="button" class="btn btn--accent sandbox-handoff__accept">Add them</button>
          <button type="button" class="btn btn--ghost sandbox-handoff__decline">Start fresh</button>
        </div>
      </div>`
    : "";

  // Adopt-and-adapt prefix (ticket 0020). When the recipient adopted a friend's
  // protocol, surface the carried-over pattern as a small italicized prefix
  // ABOVE the editable goals textarea — never inside it, so keystroke editing
  // of the user's own answer never collides with the seed. The seed is read
  // here but cleared on submit, after it moves onto the persisted Profile.
  const adoptSeed = readAdoptSeed();
  const adoptPrefix = adoptSeed
    ? `<p class="adopt-prefix">${esc(
        `A friend's protocol leaned on: ${adoptSeed.habitTitles.join(", ")} · `
        + `${adoptSeed.topEatFoods.join(", ")}. Edit below to add your own.`,
      )}</p>`
    : "";

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

        ${handoffBlock}

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
            ${adoptPrefix}
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
            ${keyCheckMarkup()}
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

  // Verify-before-commit (ticket 0024). The key check is wired here, after
  // mount, reading the live #key + #model values at click time. It is entirely
  // independent of the submit handler below — submit is unchanged whether or
  // not the check is ever tapped.
  const form = document.getElementById("onb");
  if (form) {
    wireKeyCheck(
      form,
      () => (document.getElementById("key") as HTMLInputElement | null)?.value ?? "",
      () => (document.getElementById("model") as HTMLSelectElement | null)?.value ?? "claude-sonnet-4-6",
    );
  }

  document.getElementById("onb")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await persistProfile(e.target as HTMLFormElement);
    // Ticket 0007 — hand the user off to the plan page, which renders the
    // first-compose state ("Compose from intake" primary, "I have labs —
    // upload first" secondary). The intake answers above are enough to
    // write a real first protocol; labs become an upgrade, not a prereq.
    location.hash = "#/plan";
  });

  // Bring your sandbox numbers in (ticket 0049). Accept saves the profile (the
  // same path the Begin button takes), stages the resolved sandbox values for
  // the existing manual-entry review, clears the session payload (single-
  // consume), and routes to `#/labs?manual=1` where the review pre-populates.
  // It reuses the form's own validity so a half-filled profile can't slip a
  // panel in ahead of a real profile.
  document.querySelector(".sandbox-handoff__accept")?.addEventListener("click", async () => {
    const f = document.getElementById("onb") as HTMLFormElement | null;
    if (!f) return;
    if (!f.reportValidity()) return;       // surfaces the same required-field UI
    // Re-read the resolvable rows at click time (not the render-time snapshot)
    // so a refresh between render and click can't desync.
    const rows = readResolvableSandboxRows();
    clearSandboxRows();                    // consumed exactly once, on accept
    if (rows.length) stageManualPrefill(rows);
    await persistProfile(f);
    location.hash = rows.length ? "#/labs?manual=1" : "#/plan";
  });

  // Decline: clear the session payload (single-consume) and remove the
  // affordance so it does not re-offer; onboarding is otherwise unchanged.
  document.querySelector(".sandbox-handoff__decline")?.addEventListener("click", () => {
    clearSandboxRows();
    document.querySelector(".sandbox-handoff")?.remove();
  });
}

/**
 * Persist the onboarding profile from the form (ticket 0007 / 0020 logic,
 * factored so both the Begin submit and the sandbox-handoff accept share one
 * write path — ticket 0049). Reads the adopt seed fresh at call time and clears
 * it once it has moved onto the persisted Profile.
 */
async function persistProfile(f: HTMLFormElement): Promise<void> {
  const fd = new FormData(f);
  // Move the adopt seed (ticket 0020) from localStorage onto the persisted
  // Profile, then clear the localStorage entry — the seed now lives in the
  // persistent timeline (Dexie), single source of truth.
  const seedToCarry = readAdoptSeed();
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
    ...(seedToCarry ? { adoptSeed: seedToCarry } : {}),
  });
  if (seedToCarry) clearAdoptSeed();
}

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v); return Number.isFinite(n) ? n : undefined;
}

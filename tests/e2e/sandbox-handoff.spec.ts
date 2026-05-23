// Bring your sandbox numbers in (ticket 0049).
//
// The pre-key sandbox (#/try, ticket 0040) holds its typed marker values in a
// per-tab session payload (sessionStorage["almanac.sandbox.rows"]) — never
// IndexedDB, never localStorage. After consent, onboarding offers ONCE to seed a
// first manual panel from those values via the existing manual-entry path. This
// spec maps each acceptance-criteria checkbox to a test.
//
// The handoff is purely additive and respects the gate: no IndexedDB write
// before consent, zero network calls in the handoff, the BYOK key never
// involved, and the sandbox + manual-entry surfaces are otherwise unchanged.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import {
  acknowledgeConsent, onboard, addManualPanel, enterTour,
  enterSharedViewWithAdopt, seedSandboxSession, readSandboxSession,
} from "../helpers/flows";

const SESSION_KEY = "almanac.sandbox.rows";

/**
 * Acknowledge consent from the welcome page WITHOUT an extra page.goto (which
 * would reload the document). Assumes the page is already on the welcome gate
 * (the unconsented landing) — used by the single-consume tests that seed the
 * session payload on the live page and must not re-navigate before consenting.
 */
async function ackConsentInline(page: Page): Promise<void> {
  await expect(page).toHaveURL(/#\/welcome$/);
  await page.locator("#consent").check();
  await page.getByRole("button", { name: /continue to onboarding/i }).click();
  await expect(page).toHaveURL(/#\/onboarding$/);
}

/** Count panels in the `almanac` IndexedDB (0 if the store/db doesn't exist). */
async function panelCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    return new Promise<number>((resolve) => {
      const req = indexedDB.open("almanac");
      req.onerror   = () => resolve(0);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("panels")) { db.close(); resolve(0); return; }
        const tx = db.transaction("panels", "readonly");
        const all = tx.objectStore("panels").getAll();
        all.onerror   = () => { db.close(); resolve(0); };
        all.onsuccess = () => { db.close(); resolve((all.result as unknown[]).length); };
      };
    });
  });
}

test.describe("Sandbox-to-first-panel handoff (ticket 0049)", () => {
  // ---- AC1: the sandbox writes to sessionStorage, not IndexedDB ----------- //
  test("the sandbox writes typed rows to sessionStorage and never to IndexedDB", async ({ page }) => {
    await installMocks(page);
    await page.goto("/#/try");
    await page.locator(".try").waitFor();

    for (const [key, value] of [["fasting_insulin", 8], ["apo_b", 110]] as const) {
      await page.selectOption("#try-marker", key);
      await page.fill("#try-value", String(value));
      await page.locator("#try-add").click();
    }
    await expect(page.locator(".try__row")).toHaveCount(2);

    // The typed rows live in the per-tab session payload, as { key, value }[].
    const raw = await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Array<{ key: string; value: number }>;
    expect(parsed).toEqual([
      { key: "fasting_insulin", value: 8 },
      { key: "apo_b", value: 110 },
    ]);

    // Not localStorage, not IndexedDB.
    const local = await page.evaluate((k) => localStorage.getItem(k), SESSION_KEY);
    expect(local).toBeNull();
    expect(await panelCount(page)).toBe(0);
  });

  // ---- AC1 reconciliation: #/try still reads empty on a hard reload ------- //
  test("a hard reload of #/try reads empty (0040's no-persist-on-reload holds)", async ({ page }) => {
    await installMocks(page);
    await page.goto("/#/try");
    await page.locator(".try").waitFor();
    await page.selectOption("#try-marker", "apo_b");
    await page.fill("#try-value", "110");
    await page.locator("#try-add").click();
    await expect(page.locator(".try__row")).toHaveCount(1);

    await page.reload();
    await page.locator(".try").waitFor();
    // The page renders empty: the sandbox cleared the session payload on a fresh
    // navigation to #/try, so a reload shows no carried-over rows.
    await expect(page.locator(".try__row")).toHaveCount(0);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)).toBeNull();
  });

  // ---- AC2: the affordance appears post-consent only with values ---------- //
  test("the affordance renders after consent when session values exist", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [
      { key: "fasting_insulin", value: 8 },
      { key: "apo_b", value: 110 },
      { key: "hs_crp", value: 2 },
    ], { via: "init" });
    await acknowledgeConsent(page);

    await expect(page.locator(".sandbox-handoff")).toBeVisible();
    await expect(page.locator(".sandbox-handoff")).toContainText("You scored 3 markers in the sandbox");
    await expect(page.locator(".sandbox-handoff__accept")).toBeVisible();
    await expect(page.locator(".sandbox-handoff__decline")).toBeVisible();
  });

  test("the affordance is absent when there are no session values", async ({ page }) => {
    await installMocks(page);
    await acknowledgeConsent(page);
    await expect(page.locator("#onb")).toBeVisible();
    await expect(page.locator(".sandbox-handoff")).toHaveCount(0);
  });

  // ---- AC3: accept seeds an editable first panel via the manual path ------ //
  test("accepting seeds an editable first manual panel pre-populated with the values", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [
      { key: "fasting_insulin", value: 8 },
      { key: "apo_b", value: 110 },
    ], { via: "init" });
    await acknowledgeConsent(page);

    // Fill the profile (the affordance carries forward AFTER the profile saves,
    // through the existing onboarding submit), then accept the handoff.
    await page.fill("#name", "Test User");
    await page.fill("#birthDate", "1990-01-15");
    await page.selectOption("#sex", "male");
    await page.fill("#goals", "Lower ApoB.");
    await page.fill("#dietPattern", "Pescatarian.");
    await page.fill("#key", "sk-ant-test-fake-key");
    await page.locator(".sandbox-handoff__accept").click();

    // Lands on the existing manual-entry review with the values pre-populated and
    // editable — NOT a silent commit.
    await expect(page).toHaveURL(/#\/labs\?manual=1/);
    await expect(page.locator("#manual")).toBeVisible();
    await expect(page.locator(".manual-row__input[data-key='fasting_insulin']")).toHaveValue("8");
    await expect(page.locator(".manual-row__input[data-key='apo_b']")).toHaveValue("110");

    // No panel is committed yet — the prospect confirms in the review first.
    expect(await panelCount(page)).toBe(0);

    // The values are editable: change one, save, and the panel commits with the
    // edited value through the existing manual `addPanel` path.
    await page.fill("#drawnAt", "2026-05-01");
    await page.fill(".manual-row__input[data-key='apo_b']", "100");
    await page.getByRole("button", { name: /^save panel$/i }).click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
    await expect(page.locator(".result__name").first()).toBeVisible();
    expect(await panelCount(page)).toBe(1);
  });

  // ---- AC4: declining seeds nothing and clears the values ----------------- //
  test("declining proceeds with onboarding unchanged, seeds nothing, and clears the values", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [{ key: "apo_b", value: 110 }], { via: "init" });
    await acknowledgeConsent(page);

    await page.locator(".sandbox-handoff__decline").click();
    // Onboarding form is unchanged and the affordance is gone.
    await expect(page.locator("#onb")).toBeVisible();
    await expect(page.locator(".sandbox-handoff")).toHaveCount(0);
    // No panel seeded, and the session payload is cleared.
    expect(await panelCount(page)).toBe(0);
    expect(await readSandboxSession(page)).toBeNull();
  });

  // ---- AC5: single-consume — no re-prompt after accept -------------------- //
  test("the values are consumed once — no re-prompt after accept", async ({ page }) => {
    await installMocks(page);
    // Seed via the LIVE page (not an init script) so the revisit reload below
    // tests true single-consume: sessionStorage persists across reloads, so the
    // affordance would re-offer if the value were not actually cleared on accept.
    await page.goto("/");
    await seedSandboxSession(page, [{ key: "apo_b", value: 110 }]);
    await ackConsentInline(page);

    // A genuine accept saves the profile (the same path the Begin button takes),
    // so fill the required fields before tapping "Add them".
    await page.fill("#name", "Test User");
    await page.fill("#birthDate", "1990-01-15");
    await page.selectOption("#sex", "male");
    await page.fill("#goals", "Lower ApoB.");
    await page.fill("#dietPattern", "Pescatarian.");
    await page.fill("#key", "sk-ant-test-fake-key");
    await page.locator(".sandbox-handoff__accept").click();
    await expect(page).toHaveURL(/#\/labs\?manual=1/);
    expect(await readSandboxSession(page)).toBeNull();

    // Revisit onboarding — the affordance does not re-offer (the profile now
    // exists, so onboarding renders its edit form with no handoff block).
    await page.goto("/#/onboarding");
    await expect(page.locator("#onb")).toBeVisible();
    await expect(page.locator(".sandbox-handoff")).toHaveCount(0);
  });

  test("the values are consumed once — no re-prompt after decline", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await seedSandboxSession(page, [{ key: "apo_b", value: 110 }]);
    await ackConsentInline(page);

    await page.locator(".sandbox-handoff__decline").click();
    // sessionStorage survives a reload — so this verifies the decline actually
    // cleared the value (otherwise the affordance would re-offer on reload).
    await page.goto("/#/onboarding");
    await expect(page.locator("#onb")).toBeVisible();
    await expect(page.locator(".sandbox-handoff")).toHaveCount(0);
    expect(await readSandboxSession(page)).toBeNull();
  });

  // ---- AC6: no IndexedDB write before consent ----------------------------- //
  test("no IndexedDB panel write occurs before consent is acknowledged", async ({ page }) => {
    await installMocks(page);
    await page.goto("/#/try");
    await page.locator(".try").waitFor();
    for (const [key, value] of [["apo_b", 110], ["fasting_insulin", 8]] as const) {
      await page.selectOption("#try-marker", key);
      await page.fill("#try-value", String(value));
      await page.locator("#try-add").click();
    }
    // Walk the sandbox → welcome route (no consent yet).
    await page.locator(".try__start-link").click();
    await expect(page).toHaveURL(/#\/welcome$/);
    expect(await panelCount(page)).toBe(0);

    // Acknowledge consent → onboarding affordance present, still no panel.
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page.locator(".sandbox-handoff")).toBeVisible();
    expect(await panelCount(page)).toBe(0);
  });

  // ---- AC7: stale (unresolvable) keys are skipped on seed ----------------- //
  test("session keys that no longer resolve are skipped on seed; the rest populate", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [
      { key: "apo_b", value: 110 },
      { key: "not_a_real_marker", value: 42 },
      { key: "fasting_insulin", value: 8 },
    ], { via: "init" });
    await acknowledgeConsent(page);

    await page.fill("#name", "Test User");
    await page.fill("#birthDate", "1990-01-15");
    await page.selectOption("#sex", "male");
    await page.fill("#goals", "Lower ApoB.");
    await page.fill("#dietPattern", "Pescatarian.");
    await page.fill("#key", "sk-ant-test-fake-key");
    await page.locator(".sandbox-handoff__accept").click();

    await expect(page).toHaveURL(/#\/labs\?manual=1/);
    await expect(page.locator(".manual-row__input[data-key='apo_b']")).toHaveValue("110");
    await expect(page.locator(".manual-row__input[data-key='fasting_insulin']")).toHaveValue("8");
    // The unresolvable key never produced a row — no input carries 42.
    const fortyTwos = await page.locator(".manual-row__input").evaluateAll(
      (els) => els.filter((e) => (e as HTMLInputElement).value === "42").length,
    );
    expect(fortyTwos).toBe(0);
  });

  // ---- AC8 + AC9: zero network calls, key never involved ------------------ //
  test("the handoff fires zero network calls and never references the key", async ({ page }) => {
    const stats = await installMocks(page);
    await seedSandboxSession(page, [
      { key: "apo_b", value: 110 },
      { key: "fasting_insulin", value: 8 },
    ], { via: "init" });
    await acknowledgeConsent(page);
    await page.fill("#name", "Test User");
    await page.fill("#birthDate", "1990-01-15");
    await page.selectOption("#sex", "male");
    await page.fill("#goals", "Lower ApoB.");
    await page.fill("#dietPattern", "Pescatarian.");
    await page.fill("#key", "sk-ant-canary-HANDOFF-49000");

    const before = stats.outboundUrls.length;
    await page.locator(".sandbox-handoff__accept").click();
    await expect(page).toHaveURL(/#\/labs\?manual=1/);
    await expect(page.locator(".manual-row__input[data-key='apo_b']")).toHaveValue("110");

    // Not a single Anthropic call fired during the handoff (manual entry never
    // calls Claude).
    const anthropic = stats.outboundUrls.slice(before).filter((u) => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);

    // The key never appears in the affordance copy or the seeded review surface.
    const html = await page.content();
    expect(html).not.toContain("sk-ant-canary-HANDOFF-49000");
  });

  // ---- AC10: the consent gate is intact ----------------------------------- //
  test("the affordance is unreachable until consent is acknowledged", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [{ key: "apo_b", value: 110 }], { via: "init" });
    // Pre-consent: deep-linking to onboarding bounces back to the welcome gate.
    await page.goto("/#/onboarding");
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(page.locator(".sandbox-handoff")).toHaveCount(0);

    // Only after acknowledging consent does the affordance appear.
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page.locator(".sandbox-handoff")).toBeVisible();
  });

  // ---- AC11: mobile touch targets + clean wrap ---------------------------- //
  test("the accept/decline controls are >=44px touch targets and wrap cleanly", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [{ key: "apo_b", value: 110 }], { via: "init" });
    await acknowledgeConsent(page);

    for (const sel of [".sandbox-handoff__accept", ".sandbox-handoff__decline"]) {
      const box = await page.locator(sel).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      // The affordance must not overflow the viewport horizontally.
      expect(box!.x).toBeGreaterThanOrEqual(0);
    }
    const handoff = await page.locator(".sandbox-handoff").boundingBox();
    const viewport = page.viewportSize();
    if (viewport) expect(handoff!.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  // ---- AC12: sandbox + manual-entry path otherwise unchanged -------------- //
  test("the sandbox flow (0040) still scores and tallies as before", async ({ page }) => {
    await installMocks(page);
    await page.goto("/#/try");
    await page.locator(".try").waitFor();
    for (const [key, value] of [["fasting_insulin", 8], ["apo_b", 110]] as const) {
      await page.selectOption("#try-marker", key);
      await page.fill("#try-value", String(value));
      await page.locator("#try-add").click();
    }
    await expect(page.locator(".try__row")).toHaveCount(2);
    await expect(page.locator(".report-card__line")).toBeVisible();
  });

  test("the standard manual-entry flow is unchanged", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
    expect(await panelCount(page)).toBe(1);
  });

  // ---- AC13: tour + shared-view modes never see the affordance ------------ //
  test("the sample tour (0014) never carries sandbox values into a real onboarding", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [{ key: "apo_b", value: 110 }], { via: "init" });
    await enterTour(page);
    // The tour bypasses consent + profile; it must never render the affordance.
    await expect(page.locator(".sandbox-handoff")).toHaveCount(0);
  });

  test("shared-view (0017) never renders the sandbox affordance", async ({ page }) => {
    await installMocks(page);
    await seedSandboxSession(page, [{ key: "apo_b", value: 110 }], { via: "init" });
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });
    await expect(page.locator(".sandbox-handoff")).toHaveCount(0);
  });
});

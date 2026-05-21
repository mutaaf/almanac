// Verify-before-commit (ticket 0024). A "Check this key" affordance beside the
// onboarding + settings key fields fires one minimal probe to api.anthropic.com
// and renders, in the editorial voice, whether the key authenticated, whether
// the chosen model is reachable, or the one specific reason it failed — so the
// user learns the key works BEFORE pasting a lab PDF, not after.
//
// The probe is advisory: it never gates Save, never echoes the key, and re-uses
// the local telemetry log so every call we make is accountable. Each acceptance
// bullet maps 1:1 to a test or expectation block below.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { acknowledgeConsent, onboard, enterTour } from "../helpers/flows";

const SENTINEL_KEY = "sk-ant-SENTINEL-DO-NOT-LEAK";

/** Reach the onboarding form with consent acknowledged and the form painted. */
async function gotoOnboarding(page: Page): Promise<void> {
  await acknowledgeConsent(page);
  await expect(page).toHaveURL(/#\/onboarding/);
  await page.locator("#key").waitFor({ state: "visible" });
}

/** Tap "Check this key" and wait for the result line to settle. */
async function runKeyCheck(page: Page): Promise<void> {
  await page.locator(".key-check__action").click();
  await expect(page.locator(".key-check__ok, .key-check__fail")).toBeVisible();
}

test.describe("Key verify-before-commit (ticket 0024)", () => {
  test("the affordance is disabled on an empty key and enabled once text is present", async ({ page }) => {
    await installMocks(page);
    await gotoOnboarding(page);

    const action = page.locator(".key-check__action");
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("aria-disabled", "true");

    await page.fill("#key", "   ");          // whitespace only — still disabled
    await expect(action).toHaveAttribute("aria-disabled", "true");

    await page.fill("#key", "sk-ant-something");
    await expect(action).toHaveAttribute("aria-disabled", "false");
  });

  test("tapping fires exactly one min-token probe with no system prompt", async ({ page }) => {
    const stats = await installMocks(page);
    await gotoOnboarding(page);
    await page.fill("#key", "sk-ant-real-key");

    await runKeyCheck(page);

    expect(stats.keyCheckCalls).toBe(1);
    expect(stats.lastKeyCheckMaxTokens).toBe(1);
    expect(stats.lastKeyCheckHadSystem).toBe(false);
  });

  test("a 200 renders the editorial confirmation with the selected model id", async ({ page }) => {
    const stats = await installMocks(page);
    stats.setKeyCheckOutcome("ok");
    await gotoOnboarding(page);
    await page.fill("#key", "sk-ant-real-key");
    await page.selectOption("#model", "claude-opus-4-7");

    await runKeyCheck(page);

    const ok = page.locator(".key-check__ok");
    await expect(ok).toBeVisible();
    await expect(ok).toContainText("Key works.");
    await expect(ok).toContainText("claude-opus-4-7 is reachable.");
    await expect(page.locator(".key-check__fail")).toHaveCount(0);
  });

  test("a 401 renders the auth-failure copy in the failure register", async ({ page }) => {
    const stats = await installMocks(page);
    stats.setKeyCheckOutcome("auth");
    await gotoOnboarding(page);
    await page.fill("#key", "sk-ant-bad");

    await runKeyCheck(page);

    const fail = page.locator(".key-check__fail");
    await expect(fail).toBeVisible();
    await expect(fail).toHaveText(
      "That key did not authenticate. Re-copy it from console.anthropic.com — the key starts with sk-ant- and is one long string.",
    );
  });

  test("a model_not_found renders the model-unreachable copy", async ({ page }) => {
    const stats = await installMocks(page);
    stats.setKeyCheckOutcome("model");
    await gotoOnboarding(page);
    await page.fill("#key", "sk-ant-real-key");

    await runKeyCheck(page);

    await expect(page.locator(".key-check__fail")).toHaveText(
      "Your key works, but the selected model is not reachable on this account. Pick a different model.",
    );
  });

  test("a billing error renders the no-credit copy", async ({ page }) => {
    const stats = await installMocks(page);
    stats.setKeyCheckOutcome("billing");
    await gotoOnboarding(page);
    await page.fill("#key", "sk-ant-real-key");

    await runKeyCheck(page);

    await expect(page.locator(".key-check__fail")).toHaveText(
      "Your key works, but the account has no credit. Add credit at console.anthropic.com, then check again.",
    );
  });

  test("a network failure renders the fallback and never throws to the console", async ({ page }) => {
    const stats = await installMocks(page);
    stats.setKeyCheckOutcome("network");
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

    await gotoOnboarding(page);
    await page.fill("#key", "sk-ant-real-key");

    await runKeyCheck(page);

    await expect(page.locator(".key-check__fail")).toHaveText(
      "Could not reach Anthropic. Check your connection and try again.",
    );
    // The probe must catch its own failure — no unhandled rejection / console error.
    expect(errors).toEqual([]);
  });

  test("the key value never appears in the DOM or the console", async ({ page }) => {
    const stats = await installMocks(page);
    stats.setKeyCheckOutcome("ok");
    const consoleMessages: string[] = [];
    page.on("console", (msg) => consoleMessages.push(msg.text()));
    page.on("pageerror", (err) => consoleMessages.push(String(err)));

    await gotoOnboarding(page);
    await page.fill("#key", SENTINEL_KEY);

    await runKeyCheck(page);
    await expect(page.locator(".key-check__ok")).toBeVisible();

    // The sentinel must not appear in any rendered text node (the password
    // input's *value* is exempt — it's how the user typed it — but it must
    // never be reflected into the key-check slot or any visible markup).
    const slotText = await page.locator(".key-check").innerText();
    expect(slotText).not.toContain("SENTINEL");

    const renderedText = await page.evaluate(() => document.body.innerText);
    expect(renderedText).not.toContain("SENTINEL");

    expect(consoleMessages.join("\n")).not.toContain("SENTINEL");
  });

  test("the check is advisory — it never gates Save, and submit is unchanged when the check is never tapped", async ({ page }) => {
    await installMocks(page);
    // Onboard normally WITHOUT ever tapping the key check. The saved profile
    // must be byte-for-byte the today behavior (onboard() asserts the plan
    // first-compose state, proving submit succeeded untouched).
    await onboard(page, { key: "sk-ant-test-fake-key" });

    const saved = await page.evaluate(() => {
      return new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("profile", "readonly");
          const all = tx.objectStore("profile").getAll();
          all.onsuccess = () => { db.close(); resolve((all.result?.[0] as Record<string, unknown>) ?? null); };
          all.onerror   = () => { db.close(); resolve(null); };
        };
      });
    });
    expect(saved).not.toBeNull();
    expect(saved!.anthropicKey).toBe("sk-ant-test-fake-key");
    expect(saved!.ownerName).toBe("Test User");
  });

  test("the Settings key field has the same affordance with the same three-outcome rendering", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page, { key: "sk-ant-test-fake-key" });
    await page.goto("/#/settings");
    await page.locator("#key").waitFor({ state: "visible" });

    const action = page.locator(".key-check__action");
    await expect(action).toBeVisible();
    // The saved key is already in the field, so the affordance is enabled.
    await expect(action).toHaveAttribute("aria-disabled", "false");

    stats.setKeyCheckOutcome("ok");
    await runKeyCheck(page);
    await expect(page.locator(".key-check__ok")).toContainText("claude-sonnet-4-6 is reachable.");

    stats.setKeyCheckOutcome("auth");
    await page.locator(".key-check__action").click();
    await expect(page.locator(".key-check__fail")).toContainText("did not authenticate");
  });

  test("a successful check increments the local telemetry log by exactly one", async ({ page }) => {
    const stats = await installMocks(page);
    stats.setKeyCheckOutcome("ok");
    await gotoOnboarding(page);
    await page.fill("#key", "sk-ant-real-key");

    const before = await page.evaluate(() => {
      try { return (JSON.parse(localStorage.getItem("almanac.telemetry.v1") || "[]") as unknown[]).length; }
      catch { return 0; }
    });

    await runKeyCheck(page);
    await expect(page.locator(".key-check__ok")).toBeVisible();

    const after = await page.evaluate(() => {
      try { return (JSON.parse(localStorage.getItem("almanac.telemetry.v1") || "[]") as unknown[]).length; }
      catch { return 0; }
    });
    expect(after).toBe(before + 1);
  });

  test("tour mode does not render the key check (no real key field, no billable probe)", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    // Visit every tour-reachable page; none renders a key field, so the
    // affordance must be absent everywhere on the tour.
    for (const route of ["#/today", "#/plan", "#/meals", "#/settings"]) {
      await page.goto(`/${route}`);
      await page.locator(".wordmark, .headline").first().waitFor();
      await expect(page.locator(".key-check__action")).toHaveCount(0);
    }
  });
});

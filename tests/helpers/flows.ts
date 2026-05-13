// Reusable test flows. Composable — each flow is responsible for putting
// the page in a known state and verifying the navigation happened.
//
// Every flow assumes a fresh browser context (Playwright's default).

import { expect, type Page } from "@playwright/test";

/**
 * Acknowledge the consent splash. Always starts from "/", always ends on
 * "#/onboarding". Idempotent (a no-op if consent is already acknowledged).
 */
export async function acknowledgeConsent(page: Page): Promise<void> {
  await page.goto("/");
  // If consent is already acknowledged, the welcome gate sends us to
  // /onboarding (or wherever we tried to deep-link). Detect by URL.
  if (page.url().includes("#/welcome")) {
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
  }
  await expect(page).toHaveURL(/#\/(onboarding|today|labs|plan|meals|progress|settings)/);
}

interface OnboardOverrides {
  name?: string;
  birthDate?: string;
  sex?: "male" | "female" | "intersex" | "unspecified";
  heightIn?: number;
  weightLb?: number;
  goals?: string;
  conditions?: string;
  dietPattern?: string;
  key?: string;
  model?: string;
}

/**
 * Fill onboarding with a halal-pescatarian profile. Always starts from "/",
 * always ends on "#/labs". Acknowledges consent along the way.
 */
export async function onboard(page: Page, overrides: OnboardOverrides = {}): Promise<void> {
  await acknowledgeConsent(page);

  // If we already onboarded earlier in the test (unlikely with fresh context
  // but defensive), there's nothing to fill.
  if (!page.url().includes("#/onboarding")) return;

  const d = {
    name: "Test User",
    birthDate: "1990-01-15",
    sex: "male" as const,
    heightIn: 70,
    weightLb: 175,
    goals: "Lower cholesterol, more afternoon energy, hold easy habits.",
    conditions: "None.",
    dietPattern: "Halal, pescatarian-leaning. South Asian + Mediterranean. Cook 3 nights, batch on Sunday.",
    key: "sk-ant-test-fake-key",
    model: "claude-sonnet-4-6",
    ...overrides,
  };

  await page.locator("#name").waitFor({ state: "visible" });
  await page.fill("#name", d.name);
  await page.fill("#birthDate", d.birthDate);
  await page.selectOption("#sex", d.sex);
  await page.fill("#heightIn", String(d.heightIn));
  await page.fill("#weightLb", String(d.weightLb));
  await page.fill("#goals", d.goals);
  await page.fill("#conditions", d.conditions);
  await page.fill("#dietPattern", d.dietPattern);
  await page.fill("#key", d.key);
  await page.selectOption("#model", d.model);

  await page.getByRole("button", { name: /^begin$/i }).click();
  await expect(page).toHaveURL(/#\/labs$/);
  // Wait for the labs page to actually finish rendering before returning;
  // the post-onboarding flow on mobile-webkit can race the next page action.
  await expect(page.locator(".dropzone, .archive, .quiet").first()).toBeVisible();
}

/**
 * Add a panel via manual entry. Fills three markers and saves. Leaves the
 * page on the panel detail.
 */
export async function addManualPanel(page: Page): Promise<void> {
  await page.goto("/#/labs?manual=1");
  await page.locator("#drawnAt").waitFor({ state: "visible" });
  await page.fill("#drawnAt", "2026-05-01");
  await page.fill("#labName", "Test Lab");
  await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("244");
  await page.locator(".manual-row__input[data-key='triglycerides']").fill("165");
  await page.locator(".manual-row__input[data-key='vit_d_25oh']").fill("32");
  await page.getByRole("button", { name: /^save panel$/i }).click();
  await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
}

/**
 * Compose the plan. Mocks must already be installed. Leaves the page on /plan.
 *
 * After clicking Compose, we wait for the spinner to clear and then RELOAD —
 * this dodges a WebKit-only race where setting location.hash to the same
 * value the page is already on doesn't fire `hashchange`, so the explicit
 * `renderPlan()` re-run in the compose handler can race with the in-flight
 * paint. A reload reads from IndexedDB cleanly.
 */
export async function composePlan(page: Page): Promise<void> {
  await page.goto("/#/plan");
  const composeBtn = page.getByRole("button", { name: /^compose the plan$/i });
  if (await composeBtn.isVisible().catch(() => false)) {
    await composeBtn.click();
    // Wait until the spinner is gone or the dashboard is up.
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      const stillLoading = !!status?.querySelector(".spinner");
      const rendered = !!document.querySelector(".dash-snapshot, .prose");
      return !stillLoading || rendered;
    }, undefined, { timeout: 30_000 });
    await page.reload();
  }
  await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });
}

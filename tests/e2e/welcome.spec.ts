// The consent splash is the legal + privacy gate. Every other route is
// blocked until it's acknowledged.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";

test.describe("Welcome / consent splash", () => {
  // Each test gets a fresh BrowserContext by default — no manual reset needed.

  test("redirects to #/welcome on first visit", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(page.getByRole("heading", { name: /before we begin/i })).toBeVisible();
  });

  test("blocks all other routes until consent is given", async ({ page }) => {
    await installMocks(page);
    for (const route of ["#/today", "#/plan", "#/labs", "#/meals", "#/settings", "#/onboarding"]) {
      await page.goto(`/${route}`);
      await expect(page).toHaveURL(/#\/welcome$/);
    }
  });

  test("continue button is disabled until checkbox is checked", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    const btn = page.getByRole("button", { name: /continue to onboarding/i });
    await expect(btn).toBeDisabled();
    await page.locator("#consent").check();
    await expect(btn).toBeEnabled();
  });

  test("checking consent and continuing lands on onboarding and persists", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);

    // Reload — should land on onboarding, not back on welcome.
    await page.reload();
    await expect(page).toHaveURL(/#\/onboarding$/);
  });

  test("contains the three required disclosures", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    // Each phrase appears in both a title and body paragraph — use .first()
    // for the assertion since we only care that the phrase is visible at all.
    await expect(page.getByText(/not medical advice/i).first()).toBeVisible();
    await expect(page.getByText(/all your data stays on this device/i).first()).toBeVisible();
    await expect(page.getByText(/your anthropic key/i).first()).toBeVisible();
  });
});

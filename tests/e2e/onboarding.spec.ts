// Onboarding captures the profile that every downstream surface reads from.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { acknowledgeConsent, onboard } from "../helpers/flows";

test.describe("Onboarding", () => {
  test.beforeEach(async ({ context }) => {
  });

  test("captures all required fields and lands on the plan first-compose state", async ({ page }) => {
    await installMocks(page);
    await acknowledgeConsent(page);

    await page.fill("#name", "Mutaaf Test");
    await page.fill("#birthDate", "1991-06-12");
    await page.selectOption("#sex", "male");
    await page.fill("#heightIn", "70");
    await page.fill("#weightLb", "175");
    await page.fill("#goals", "Lower triglycerides, more energy.");
    await page.fill("#dietPattern", "Halal pescatarian, South Asian + Mediterranean.");
    await page.fill("#key", "sk-ant-test-fake");

    await page.getByRole("button", { name: /^begin$/i }).click();
    // After ticket 0007: post-onboarding hand-off is to the plan page, which
    // renders the two-path "compose from intake | upload labs first" state.
    await expect(page).toHaveURL(/#\/plan$/);
    await expect(page.getByRole("button", { name: /compose from intake/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /i have labs.*upload first/i })).toBeVisible();

    // Masthead shows the new dateline/wordmark, not the onboarding chrome.
    await expect(page.locator(".masthead .wordmark")).toBeVisible();
  });

  test("uses imperial inputs (inches + pounds)", async ({ page }) => {
    await installMocks(page);
    await acknowledgeConsent(page);
    await expect(page.locator('label[for="heightIn"]')).toContainText(/inches/i);
    await expect(page.locator('label[for="weightLb"]')).toContainText(/lb/);
  });

  test("captures dietary pattern with free-form text", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { dietPattern: "Halal, no shellfish allergy, prefer South Asian." });

    // Settings should round-trip it.
    await page.goto("/#/settings");
    await expect(page.locator("#dietPattern")).toHaveValue(/halal.*shellfish.*south asian/i);
  });

  test("blocks app routes until profile exists", async ({ page }) => {
    await installMocks(page);
    await acknowledgeConsent(page);
    // From #/onboarding, jumping to #/today should redirect back.
    await page.goto("/#/today");
    await expect(page).toHaveURL(/#\/onboarding$/);
  });
});

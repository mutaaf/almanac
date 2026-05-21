// "Since your last plan" — the plan-to-plan delta (ticket 0029).
//
// Recomposing produces a complete new Plan that replaces the prior one on the
// page. This surface renders a short, deterministic, zero-network account of
// what changed between the two most recent plans, above the snapshot. Every
// test below maps to one acceptance-criteria checkbox.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import {
  onboard, addManualPanel, composePlan, seedPlan, enterTour, enterSharedViewWithAdopt,
} from "../helpers/flows";

/** Wipe consent + profile + the local DB so the welcome gate / tour entry works. */
async function resetDevice(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    return new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("almanac");
      req.onsuccess = () => resolve();
      req.onerror   = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

/**
 * Open the Plan page on a freshly-loaded document so the router reads the
 * just-seeded rows. `page.goto` to a same-origin hash does not reload, so we
 * reload explicitly (the documented read-after-write pattern).
 */
async function openPlan(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/#/plan");
  await page.reload();
  await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("Plan delta — since your last plan", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("absent on the first plan, present once a prior exists", async ({ page }) => {
    // One plan only — nothing to diff. The summary must not appear and the
    // page is the same dashboard it is today. Compose a real first plan
    // (a panel is needed so the panels-first compose button is present).
    await addManualPanel(page);
    await composePlan(page);
    await expect(page.locator(".plan-delta")).toHaveCount(0);
    await expect(page.locator(".dash-snapshot")).toBeVisible();

    // Seed a second (newer) plan so a prior now exists, then reload.
    await seedPlan(page, { generatedDaysAgo: 90, clearFirst: true, eatList: [{ food: "Salmon", frequency: "2x per week" }] });
    await seedPlan(page, { generatedDaysAgo: 0, eatList: [{ food: "Salmon", frequency: "3x per week" }] });
    await openPlan(page);
    await expect(page.locator(".plan-delta")).toBeVisible();
  });

  test("the eyebrow reads 'Since your last plan' and carries the elapsed span", async ({ page }) => {
    // Prior 84 days ago (12 weeks ≈ three months), current today.
    await seedPlan(page, { generatedDaysAgo: 84, clearFirst: true, eatList: [{ food: "Salmon", frequency: "2x per week" }] });
    await seedPlan(page, { generatedDaysAgo: 0, eatList: [{ food: "Salmon", frequency: "3x per week" }] });
    await openPlan(page);

    const eyebrow = page.locator(".plan-delta__eyebrow");
    await expect(eyebrow).toContainText("Since your last plan");
    await expect(eyebrow).toContainText("three months ago");
  });

  test("eat-list frequency change, removal, and addition render the right copy", async ({ page }) => {
    await seedPlan(page, {
      generatedDaysAgo: 30, clearFirst: true,
      eatList: [
        { food: "Salmon", frequency: "2x per week" },
        { food: "Lentils", frequency: "3x per week" },   // will be removed
      ],
    });
    await seedPlan(page, {
      generatedDaysAgo: 0,
      eatList: [
        { food: "Salmon", frequency: "3x per week" },     // changed
        { food: "Walnuts", frequency: "daily" },          // added
      ],
    });
    await openPlan(page);

    const body = page.locator(".plan-delta");
    await expect(body).toContainText("Salmon moved from 2x per week to 3x per week");
    await expect(body).toContainText("Lentils retired from the eat list");
    await expect(body).toContainText("Walnuts was added — daily");
  });

  test("habit add and retire render the right copy", async ({ page }) => {
    await seedPlan(page, {
      generatedDaysAgo: 30, clearFirst: true,
      habits: [
        { title: "Iron-rich greens at lunch" },   // will retire
        { title: "Walk after dinner" },            // held
      ],
    });
    await seedPlan(page, {
      generatedDaysAgo: 0,
      habits: [
        { title: "Walk after dinner" },            // held
        { title: "Ten-minute morning sun" },       // added
      ],
    });
    await openPlan(page);

    const body = page.locator(".plan-delta");
    await expect(body).toContainText("Iron-rich greens at lunch retired");
    await expect(body).toContainText("Ten-minute morning sun was added");
  });

  test("insight newly-noted and resolved render under their lines", async ({ page }) => {
    await seedPlan(page, {
      generatedDaysAgo: 30, clearFirst: true,
      insights: [
        { title: "Iron-restricted erythropoiesis" },   // will resolve
        { title: "Lipid load is high" },                // persists
      ],
    });
    await seedPlan(page, {
      generatedDaysAgo: 0,
      insights: [
        { title: "Lipid load is high" },                // persists
        { title: "Inflammation triad emerging" },       // newly noted
      ],
    });
    await openPlan(page);

    const body = page.locator(".plan-delta");
    await expect(body).toContainText("Newly noted");
    await expect(body).toContainText("Inflammation triad emerging");
    await expect(body).toContainText("Iron-restricted erythropoiesis — resolved");
  });

  test("identical consecutive plans render the honest no-change line", async ({ page }) => {
    const sections = {
      eatList: [{ food: "Salmon", frequency: "2x per week" }],
      habits: [{ title: "Walk after dinner" }],
      insights: [{ title: "Lipid load is high" }],
      avoidList: [{ food: "Seed oils" }],
    };
    await seedPlan(page, { generatedDaysAgo: 30, clearFirst: true, ...sections });
    await seedPlan(page, { generatedDaysAgo: 0, ...sections });
    await openPlan(page);

    await expect(page.locator(".plan-delta")).toBeVisible();
    await expect(page.locator(".plan-delta")).toContainText(
      "Nothing changed since your last plan — your inputs were the same.",
    );
  });

  test("diffs only the newest pair when three plans exist", async ({ page }) => {
    // Oldest (third) plan carries a food that exists in neither newer plan.
    // If it leaked into the diff it would render an "added/retired" line for it.
    await seedPlan(page, { generatedDaysAgo: 180, clearFirst: true, eatList: [{ food: "Sardines", frequency: "1x per week" }] });
    await seedPlan(page, { generatedDaysAgo: 90, eatList: [{ food: "Salmon", frequency: "2x per week" }] });
    await seedPlan(page, { generatedDaysAgo: 0, eatList: [{ food: "Salmon", frequency: "3x per week" }] });
    await openPlan(page);

    const body = page.locator(".plan-delta");
    await expect(body).toContainText("Salmon moved from 2x per week to 3x per week");
    // The third, older plan's "Sardines" never contributes a line.
    await expect(body).not.toContainText("Sardines");
  });

  test("marker-tied copy resolves human marker names via findMarker()", async ({ page }) => {
    await seedPlan(page, {
      generatedDaysAgo: 30, clearFirst: true,
      eatList: [{ food: "Salmon", frequency: "2x per week", markerKeys: ["omega_3_index"] }],
    });
    await seedPlan(page, {
      generatedDaysAgo: 0,
      eatList: [{ food: "Salmon", frequency: "3x per week", markerKeys: ["omega_3_index"] }],
    });
    await openPlan(page);

    const body = page.locator(".plan-delta");
    // The resolved human name appears, not the raw key.
    await expect(body).toContainText("Omega-3 Index");
    await expect(body).not.toContainText("omega_3_index");
  });

  test("the summary renders with zero network calls", async ({ page }) => {
    const stats = await installMocks(page);
    await seedPlan(page, { generatedDaysAgo: 30, clearFirst: true, eatList: [{ food: "Salmon", frequency: "2x per week" }] });
    await seedPlan(page, { generatedDaysAgo: 0, eatList: [{ food: "Salmon", frequency: "3x per week" }] });

    const before = stats.outboundUrls.length;
    await openPlan(page);
    await expect(page.locator(".plan-delta")).toBeVisible();

    // No inference call fired while the local-only summary computed + rendered.
    const anthropic = stats.outboundUrls.slice(before).filter((u) => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  test("tour mode does not fabricate a summary (single-plan fixture)", async ({ page }) => {
    // The tour fixture carries exactly one plan, so there is no prior to diff —
    // the summary must be absent, never fabricated. Touring requires a clean
    // device (no prior consent/profile from the beforeEach onboard).
    await resetDevice(page);
    await enterTour(page);
    await page.goto("/#/plan");
    await page.locator(".dash-snapshot, .prose").first().waitFor();
    await expect(page.locator(".plan-delta")).toHaveCount(0);
  });

  test("shared-view never renders the summary", async ({ page }) => {
    // A shared payload carries one protocol, not a history. Even though the
    // recipient opens the Plan page, no delta summary appears.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      return new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("almanac");
        req.onsuccess = () => resolve();
        req.onerror   = () => resolve();
        req.onblocked = () => resolve();
      });
    });
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });

    await page.goto("/#/plan");
    await page.locator(".section-mark").first().waitFor();
    await expect(page.locator(".plan-delta")).toHaveCount(0);
  });

  test("renders cleanly at the 390px viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlan(page, {
      generatedDaysAgo: 30, clearFirst: true,
      eatList: [{ food: "Fatty fish (salmon, sardines, mackerel) — a long descriptive food name", frequency: "2x per week" }],
      habits: [{ title: "A deliberately long habit title that should wrap rather than overflow the narrow viewport" }],
    });
    await seedPlan(page, {
      generatedDaysAgo: 0,
      eatList: [{ food: "Fatty fish (salmon, sardines, mackerel) — a long descriptive food name", frequency: "3x per week" }],
      habits: [{ title: "A different long habit title that was added this time and also must wrap on a phone screen" }],
    });
    await openPlan(page);

    const delta = page.locator(".plan-delta");
    await expect(delta).toBeVisible();
    // No horizontal overflow: the summary's scroll width fits the viewport.
    const overflow = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".plan-delta");
      if (!el) return 0;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

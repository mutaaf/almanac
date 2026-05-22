// The protocol-on-the-fridge card (ticket 0033).
//
// On the Plan page, when a composed plan exists, a "Save the card" affordance
// renders one phone-shaped editorial PNG entirely on-device: the dateline
// header ("Almanac — week of <month day>"), the habit-stack titles (≤5), the
// top eat foods with frequency (≤5), and the top avoid items with their swap
// (≤3), in the almanac's own type and cream/ink palette with a single small
// "Almanac" wordmark and no URL.
//
// It is the glanceable sibling of the marker-hero card (0011) and the
// improvement card (0047): the same render-and-download mechanism (canvas 2D →
// toBlob → shareOrDownload), a second layout on the proven stack, no new
// rendering dependency. 0011 ships a single marker's delta; 0047 ships the
// most-improved timeline; this ships the protocol itself — what to eat, what to
// skip, the handful of habits — for the fridge or the lock screen.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.
//
// Test browsers:
//   - chromium      : full path — affordance presence/absence, download +
//                     filename + PNG header, composed-text content (dateline,
//                     habit/eat/avoid caps + content, swap rendering), wordmark
//                     with no URL, key-never-appears sentinel, zero-network
//                     during render, tour presence, shared-view absence.
//   - mobile-webkit : the affordance is visible + a ≥44×44 tap target, and the
//                     card Blob is verified through the same module call 0011 /
//                     0047 use for byte-free verification (composeProtocolCardText
//                     + renderProtocolCard) rather than a programmatic download,
//                     which Mobile Safari blocks. The path asserted per project
//                     is noted at each test.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { onboard, seedPlan, enterTour, enterSharedViewWithAdopt } from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

const SENTINEL_KEY = "sk-ant-PROTOCOL-CARD-SENTINEL-33333";

/** Navigate to the Plan page and wait for either the dashboard or prose to paint. */
async function gotoPlan(page: Page): Promise<void> {
  await page.goto("/#/plan");
  await page.reload();
  await page.locator(".dash-snapshot, .prose, .headline").first().waitFor();
}

/**
 * Compose the card's deterministic text (dateline + wordmark + habit/eat/avoid
 * lines) for the live plan + profile through the module. The PNG is deflate-
 * compressed so glyph strings never survive into the bytes; the composed-text
 * function is the honest surface to grep the wordmark, the caps, the swap
 * formatting, the absence of a URL, and the absence of the key — exactly the
 * way 0011 / 0047's specs assert filename + header rather than rendered glyphs.
 */
async function readComposedText(page: Page): Promise<null | {
  wordmark: string;
  dateline: string;
  habits: string[];
  eat: string[];
  avoid: string[];
}> {
  return page.evaluate(async () => {
    const dbMod = await import("/src/db.ts");
    const card = await import("/src/plan/protocol-card.ts");
    const plan = await dbMod.latestPlan();
    const profile = await dbMod.getProfile();
    if (!plan || !profile) return null;
    return card.composeProtocolCardText(plan, profile);
  });
}

/** Render the card to a Blob through the module and report its size + type. */
async function renderCardSize(page: Page, w: number, h: number): Promise<{ size: number; type: string }> {
  return page.evaluate(async (dims) => {
    const dbMod = await import("/src/db.ts");
    const card = await import("/src/plan/protocol-card.ts");
    const plan = await dbMod.latestPlan();
    const profile = await dbMod.getProfile();
    const blob = await card.renderProtocolCard(plan!, profile!, { width: dims.w, height: dims.h });
    return { size: blob.size, type: blob.type };
  }, { w, h });
}

/**
 * Stub `navigator.share` / `navigator.canShare` so the download branch is
 * deterministic (same approach as 0011 / 0047's specs). Must run AFTER the
 * page settles — addInitScript only fires on a new document and our nav is
 * hash-only.
 */
async function stubNoShare(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: () => false });
    Object.defineProperty(navigator, "share",    { configurable: true, writable: true, value: async () => undefined });
  });
}

/** A realistic protocol plan: 6 habits, 6 eat items, 4 avoid (mixed swap). */
const RICH_PLAN = {
  generatedDaysAgo: 0,
  clearFirst: true,
  snapshot: "A seeded protocol for the fridge-card test.",
  eatList: [
    { id: "fatty-fish", food: "Fatty fish", frequency: "3x per week", markerKeys: ["triglycerides"] },
    { id: "leafy", food: "Leafy greens", frequency: "Daily" },
    { id: "lentils", food: "Lentils with vitamin C", frequency: "3x per week" },
    { id: "oats", food: "Steel-cut oats", frequency: "Daily" },
    { id: "berries", food: "Mixed berries", frequency: "5x per week" },
    { id: "walnuts", food: "Walnuts", frequency: "Daily" },  // 6th — must NOT render
  ],
  avoidList: [
    { id: "seed-oils", food: "Industrial seed oils", swap: "olive oil" },
    { id: "soda", food: "Sugar-sweetened soda", swap: "sparkling water" },
    { id: "white-bread", food: "Refined white bread" },       // no swap → name alone
    { id: "deli", food: "Processed deli meat", swap: "roast chicken" }, // 4th — must NOT render
  ],
  habits: [
    { id: "h1", title: "10-min walk after dinner" },
    { id: "h2", title: "Vitamin-C produce with lentils" },
    { id: "h3", title: "One fatty-fish dinner" },
    { id: "h4", title: "Lights out by 11" },
    { id: "h5", title: "Two resistance sessions" },
    { id: "h6", title: "Morning sunlight ten minutes" },      // 6th — must NOT render
  ],
};

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("The protocol-on-the-fridge card (ticket 0033)", () => {
  let stats: MockStats;

  test.beforeEach(async ({ page }) => {
    stats = await installMocks(page);
  });

  /* ---- the module renders a non-empty PNG blob at the requested size ------- */

  test("renderProtocolCard produces a non-empty PNG of the requested dimensions", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "module-render assertion runs once on chromium");
    await onboard(page, { name: "Dana Reed", key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);

    const blob = await renderCardSize(page, 1080, 1920);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(3_000);
  });

  /* ---- the action triggers a .png download with the owner-slug filename ---- */

  test("tapping 'Save the card' downloads a PNG with the owner-slug filename", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "programmatic download is intercepted on chromium only");
    await onboard(page, { name: "Dana Reed", key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);
    await stubNoShare(page);

    const action = page.locator(".protocol-card-save");
    await expect(action).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      action.click(),
    ]);
    expect(download.suggestedFilename()).toBe("dana-reed-protocol.png");

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs/promises");
    const bytes = await fs.readFile(path!);
    // PNG header: 89 50 4E 47
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4E);
    expect(bytes[3]).toBe(0x47);
    expect(bytes.length).toBeGreaterThan(3_000);
  });

  /* ---- filename falls back to almanac-protocol.png with no name ------------ */

  test("the filename falls back to 'almanac-protocol.png' when the owner has no name", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "download assertion runs on chromium");
    await onboard(page, { name: "Temp", key: SENTINEL_KEY });
    await page.evaluate(async () => {
      const dbMod = await import("/src/db.ts");
      await dbMod.saveProfile({ ownerName: "" });
    });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);
    await stubNoShare(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".protocol-card-save").click(),
    ]);
    expect(download.suggestedFilename()).toBe("almanac-protocol.png");
  });

  /* ---- habit titles render verbatim, capped at the first 5 in order -------- */

  test("the card renders exactly the first 5 habit titles verbatim, in stored order", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.habits).toEqual([
      "10-min walk after dinner",
      "Vitamin-C produce with lentils",
      "One fatty-fish dinner",
      "Lights out by 11",
      "Two resistance sessions",
    ]);
    // The 6th habit is dropped — the cap is exactly 5.
    expect(text!.habits).not.toContain("Morning sunlight ten minutes");
  });

  /* ---- eat foods render with frequency, capped at the first 5 in order ----- */

  test("the card renders the top 5 eat foods with their frequency, in stored order", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.eat).toEqual([
      "Fatty fish — 3x per week",
      "Leafy greens — Daily",
      "Lentils with vitamin C — 3x per week",
      "Steel-cut oats — Daily",
      "Mixed berries — 5x per week",
    ]);
    // The 6th eat item is dropped — the cap is exactly 5.
    expect(text!.eat.join("\n")).not.toContain("Walnuts");
  });

  /* ---- avoid items render with swap where present, capped at first 3 ------- */

  test("the card renders the top 3 avoid items with their swap, name-alone when absent", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.avoid).toEqual([
      "Industrial seed oils → olive oil",
      "Sugar-sweetened soda → sparkling water",
      "Refined white bread",  // no swap → the food name alone
    ]);
    // The 4th avoid item is dropped — the cap is exactly 3.
    expect(text!.avoid.join("\n")).not.toContain("Processed deli meat");
  });

  /* ---- editorial dateline + wordmark, no URL, no tracking parameter -------- */

  test("the card carries the 'Almanac — week of' dateline + wordmark and no URL / tracking", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.wordmark.toLowerCase()).toContain("almanac");
    // The dateline reads "Almanac — week of <month day>".
    expect(text!.dateline).toMatch(/^Almanac — week of /);
    // No URL or tracking parameter is drawn anywhere on the composed text.
    const all = [text!.wordmark, text!.dateline, ...text!.habits, ...text!.eat, ...text!.avoid].join("\n");
    expect(all).not.toMatch(/https?/i);
    expect(all).not.toContain("?");
    // No emoji on the card.
    expect(all).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  /* ---- the key sentinel never appears in any composed string -------------- */

  test("the Anthropic key never appears in the card's composed text (sentinel)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "sentinel assertion runs on chromium");
    await onboard(page, { key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    const all = [
      text!.wordmark, text!.dateline,
      ...text!.habits, ...text!.eat, ...text!.avoid,
    ].join("\n");
    expect(all).not.toContain(SENTINEL_KEY);
  });

  /* ---- zero-network during render ----------------------------------------- */

  test("saving the card fires zero network and zero Anthropic calls", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "network-counter assertion runs on chromium");
    await onboard(page, { key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);
    await stubNoShare(page);

    const beforeCount = stats.outboundUrls.length;
    const beforeAnthro = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".protocol-card-save").click(),
    ]);
    await download.path();

    const afterAnthro = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;
    expect(afterAnthro).toBe(beforeAnthro);

    const newUrls = stats.outboundUrls.slice(beforeCount).filter(u => u.startsWith("http"));
    const ALLOWED = ["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com", "api.anthropic.com"];
    const offending = newUrls.filter(u => {
      try {
        const h = new URL(u).hostname;
        return !ALLOWED.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
    // Specifically: nothing hit Anthropic.
    const anthropic = newUrls.filter(u => {
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  /* ---- affordance ABSENT on a fresh profile with no plan ------------------- */

  test("the affordance is ABSENT when no plan exists", async ({ page }) => {
    await onboard(page, { key: SENTINEL_KEY });
    // A fresh profile with no plan lands on the Plan first-compose empty state.
    await page.goto("/#/plan");
    await page.locator(".eyebrow").first().waitFor();
    await expect(page.locator(".protocol-card-save")).toHaveCount(0);
  });

  /* ---- mobile path: visible + ≥44 tap target + Blob verified via module --- */

  test("mobile: the affordance is a ≥44×44 tap target and the card Blob renders at the requested size", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "this assertion is the mobile counterpart");
    await onboard(page, { key: SENTINEL_KEY });
    await seedPlan(page, RICH_PLAN);
    await gotoPlan(page);

    const action = page.locator(".protocol-card-save");
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // WebKit blocks programmatic downloads; verify the card via the same module
    // call the chromium path uses, so the render is still proven on mobile.
    const blob = await renderCardSize(page, 1080, 1920);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(3_000);
  });

  /* ---- tour mode (0014) offers the affordance against the fixture plan ----- */

  test("tour mode offers 'Save the card' against the sample plan", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "tour-presence assertion runs on chromium");
    await enterTour(page);
    await page.goto("/#/plan");
    await page.locator(".dash-snapshot, .prose, .headline").first().waitFor();
    // The tour fixture carries a full plan (eat / avoid / habits) so the
    // affordance must render — a prospect can feel the artifact.
    await expect(page.locator(".protocol-card-save")).toBeVisible();
    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.habits.length).toBeGreaterThan(0);
  });

  /* ---- shared-view (0017) does NOT render the affordance ------------------- */

  test("shared-view does NOT render the affordance (the recipient is not composing)", async ({ page }) => {
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [{ id: "a", food: "Soda", why: "x", swap: "water" }],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });
    await page.goto("/#/plan");
    await page.locator(".headline").first().waitFor();
    // The shared protocol is read-only; only the existing share-view surfaces
    // are offered, never the save-card affordance.
    await expect(page.locator(".protocol-card-save")).toHaveCount(0);
  });
});

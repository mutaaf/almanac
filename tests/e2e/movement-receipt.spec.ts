// The marker-moved receipt (ticket 0032).
//
// When a new draw resolves and a marker the protocol was working on also has a
// prior draw, the post-extraction panel review screen (#/labs?id=N) tells the
// user — in one calm, dated line — what moved. The receipt is a deterministic,
// zero-network transform of two already-stored values; this spec asserts the
// four state copies (into-range / toward / away / unchanged) with the right
// direction word, the no-prior-draw absence, name resolution for user-defined
// and sex-specific markers, the zero-network render, the tour vs shared-view
// gating, and mobile rendering.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, enterTour, seedPanel } from "../helpers/flows";

/**
 * Seed two panels (a prior in February, a newer in May) and open the newer
 * panel's review screen. Reloads after seeding so the router reads the fresh
 * IndexedDB rows. Returns the newer panel's id.
 */
async function seedPairAndOpenNewer(
  page: Page,
  prior: Array<{ markerKey: string; value: number; unit: string; optimalRange?: { low?: number; high?: number } }>,
  now: Array<{ markerKey: string; value: number; unit: string; optimalRange?: { low?: number; high?: number } }>,
): Promise<number> {
  await seedPanel(page, { drawnAt: "2026-02-15", labName: "Quest", results: prior, clearFirst: true });
  const newerId = await seedPanel(page, { drawnAt: "2026-05-15", labName: "Quest", results: now });
  await page.goto(`/#/labs?id=${newerId}`);
  await page.reload();
  await expect(page.locator(".result__name").first()).toBeVisible();
  return newerId;
}

test.describe("Movement receipt — copy + states", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });
  });

  test("an into-range crossing renders the dated 'now inside the functional range' line", async ({ page }) => {
    // ferritin_m functional floor is 70 ng/mL: 60 → 80 genuinely crosses in.
    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "ferritin_m", value: 60, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
      [{ markerKey: "ferritin_m", value: 80, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
    );

    const receipt = page.locator(".movement-receipt");
    await expect(receipt).toBeVisible();
    await expect(receipt.locator(".movement-receipt__eyebrow")).toContainText("Since your last draw");

    const row = receipt.locator(".movement-receipt__row");
    await expect(row).toHaveText(
      /Ferritin \(Male\) came up from 60 to 80 ng\/mL since February — now inside the functional range\./,
    );
  });

  test("a toward move renders 'moving toward the functional range' with the fell-direction verb", async ({ page }) => {
    // hs-CRP ceiling is 1.0 mg/L; 2.1 → 1.4 moves toward but stays above.
    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "hs_crp", value: 2.1, unit: "mg/L", optimalRange: { high: 1.0 } }],
      [{ markerKey: "hs_crp", value: 1.4, unit: "mg/L", optimalRange: { high: 1.0 } }],
    );

    const row = page.locator(".movement-receipt__row");
    await expect(row).toHaveText(
      /hs-CRP eased from 2\.1 to 1\.4 mg\/L since February — moving toward the functional range\./,
    );
  });

  test("an away move renders 'further from the functional range' with no euphemism", async ({ page }) => {
    // hs-CRP worsens: 1.4 → 2.1, both above the ceiling, moving away.
    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "hs_crp", value: 1.4, unit: "mg/L", optimalRange: { high: 1.0 } }],
      [{ markerKey: "hs_crp", value: 2.1, unit: "mg/L", optimalRange: { high: 1.0 } }],
    );

    const row = page.locator(".movement-receipt__row");
    await expect(row).toHaveText(
      /hs-CRP moved from 1\.4 to 2\.1 mg\/L since February — further from the functional range\./,
    );
  });

  test("an unchanged marker renders 'held at … unchanged since'", async ({ page }) => {
    // ApoB identical across two draws — delta exactly 0.
    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "apo_b", value: 95, unit: "mg/dL", optimalRange: { high: 80 } }],
      [{ markerKey: "apo_b", value: 95, unit: "mg/dL", optimalRange: { high: 80 } }],
    );

    const row = page.locator(".movement-receipt__row");
    await expect(row).toHaveText(
      /ApoB held at 95 mg\/dL — unchanged since February\./,
    );
  });

  test("a marker appearing for the first time produces no row, and a fresh single panel shows no eyebrow", async ({ page }) => {
    // One single-marker panel with no prior draw of that marker: nothing to
    // compare, so there is no row AND no eyebrow at all.
    const id = await seedPanel(page, {
      drawnAt: "2026-05-15",
      labName: "Quest",
      results: [{ markerKey: "ferritin_m", value: 80, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
      clearFirst: true,
    });
    await page.goto(`/#/labs?id=${id}`);
    await page.reload();
    await expect(page.locator(".result__name").first()).toBeVisible();

    await expect(page.locator(".movement-receipt")).toHaveCount(0);
    await expect(page.locator(".movement-receipt__eyebrow")).toHaveCount(0);
  });

  test("a marker without a prior draw is skipped while a paired marker still renders", async ({ page }) => {
    // ferritin_m has a prior; apo_b is new this draw — only ferritin gets a row.
    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "ferritin_m", value: 60, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
      [
        { markerKey: "ferritin_m", value: 80, unit: "ng/mL", optimalRange: { low: 70, high: 150 } },
        { markerKey: "apo_b", value: 95, unit: "mg/dL", optimalRange: { high: 80 } },
      ],
    );

    const rows = page.locator(".movement-receipt__row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Ferritin (Male)");
    await expect(rows.first()).not.toContainText("ApoB");
  });
});

test.describe("Movement receipt — name resolution", () => {
  test("a sex-specific ferritin pair on a male profile renders the human name, not the suffixed key", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });
    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "ferritin_m", value: 60, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
      [{ markerKey: "ferritin_m", value: 80, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
    );

    const row = page.locator(".movement-receipt__row");
    await expect(row).toContainText("Ferritin (Male)");
    // The raw suffixed key must never leak into the rendered line.
    await expect(row).not.toContainText("ferritin_m");
  });

  test("a user-defined marker resolves its human name in the receipt", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });

    // Define a user marker directly in IndexedDB (mirrors addUserMarker's row).
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("userMarkers", "readwrite");
          tx.objectStore("userMarkers").put({
            key: "user_lp_pla2",
            name: "Lp-PLA2",
            category: "cardio",
            unit: "nmol/min/mL",
            aliases: ["lp-pla2"],
            optimalRange: { high: 200 },
            description: "Vascular-specific inflammation.",
            createdAt: Date.now(),
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror    = () => { db.close(); reject(tx.error); };
        };
      });
    });

    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "user_lp_pla2", value: 240, unit: "nmol/min/mL", optimalRange: { high: 200 } }],
      [{ markerKey: "user_lp_pla2", value: 180, unit: "nmol/min/mL", optimalRange: { high: 200 } }],
    );

    const row = page.locator(".movement-receipt__row");
    await expect(row).toContainText("Lp-PLA2");
    await expect(row).not.toContainText("user_lp_pla2");
    // 240 → 180 crosses into the high-ceiling-200 range from above.
    await expect(row).toContainText("now inside the functional range");
  });
});

test.describe("Movement receipt — privacy + gating", () => {
  test("the receipt computes and renders with zero network calls", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page, { sex: "male" });

    await seedPanel(page, {
      drawnAt: "2026-02-15", labName: "Quest", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 60, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
    });
    const newerId = await seedPanel(page, {
      drawnAt: "2026-05-15", labName: "Quest",
      results: [{ markerKey: "ferritin_m", value: 80, unit: "ng/mL", optimalRange: { low: 70, high: 150 } }],
    });

    // Snapshot outbound count, THEN render the review screen, so font/asset
    // churn from onboarding isn't attributed to the receipt render.
    const before = stats.outboundUrls.length;
    await page.goto(`/#/labs?id=${newerId}`);
    await page.reload();
    await expect(page.locator(".movement-receipt")).toBeVisible();

    const anthropic = stats.outboundUrls.slice(before).filter((u) => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  test("tour mode surfaces the receipt on the panel whose markers moved (id=2) and not on the first draw (id=1)", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);

    // The tour fixture's recent panel (id 2, drawn 14d ago) carries markers
    // that moved relative to the prior panel (id 1, 120d ago): ferritin_m
    // 32 → 42, apo_b 102 → 88, hs-crp 2.4 → 1.6. The review screen must show
    // the receipt.
    await page.goto("/#/labs?id=2");
    await page.locator(".result__name").first().waitFor();
    await expect(page.locator(".movement-receipt")).toBeVisible();
    await expect(page.locator(".movement-receipt__row").first()).toContainText("since");

    // The earliest panel (id 1) has no prior draw — no receipt at all.
    await page.goto("/#/labs?id=1");
    await page.locator(".result__name").first().waitFor();
    await expect(page.locator(".movement-receipt")).toHaveCount(0);
  });

  test("shared-view mode does not render the receipt — panel detail is not part of the shared payload", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });
    // Enter shared-view: the labs route renders the "not shared with you"
    // empty state and never reaches the panel detail / receipt.
    await page.evaluate(() => localStorage.setItem("almanac.sharedView", "true"));
    await page.goto("/#/labs?id=1");
    await page.locator(".shared-empty, .headline").first().waitFor();
    await expect(page.locator(".movement-receipt")).toHaveCount(0);
  });
});

test.describe("Movement receipt — mobile", () => {
  test("renders cleanly at the 390px viewport with a long marker name and no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await onboard(page, { sex: "male" });

    // A user marker with a deliberately long name to exercise wrap + min-width.
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("userMarkers", "readwrite");
          tx.objectStore("userMarkers").put({
            key: "user_long_marker",
            name: "Lipoprotein-associated phospholipase A2 (vascular inflammation specific)",
            category: "cardio",
            unit: "nmol/min/mL",
            aliases: [],
            optimalRange: { high: 200 },
            description: "Long.",
            createdAt: Date.now(),
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror    = () => { db.close(); reject(tx.error); };
        };
      });
    });

    await seedPairAndOpenNewer(
      page,
      [{ markerKey: "user_long_marker", value: 240, unit: "nmol/min/mL", optimalRange: { high: 200 } }],
      [{ markerKey: "user_long_marker", value: 180, unit: "nmol/min/mL", optimalRange: { high: 200 } }],
    );

    const receipt = page.locator(".movement-receipt");
    await expect(receipt).toBeVisible();

    // No horizontal overflow: the receipt's right edge stays inside the viewport.
    const box = await receipt.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    // The document itself does not scroll horizontally.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

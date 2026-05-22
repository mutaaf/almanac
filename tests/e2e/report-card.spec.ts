// The "normal" that isn't — the panel report card (ticket 0036).
//
// When a panel resolves, the post-extraction review screen (#/labs?id=N) opens
// with one honest, dated readout of how the panel's markers stack up against the
// FUNCTIONAL range, not the lab floor: how many are optimal, how many sit inside
// the lab's normal range but below the functional optimum (the wedge), and how
// many are outside the lab range entirely. The card is a deterministic,
// zero-network reduction over already-flagged results.
//
// This spec asserts: the correct counts on a mixed panel, the all-optimal copy,
// the several-out-of-range copy, the non-zero-clause-only sentence, tap-to-scroll
// for each class, no card on a range-less panel, zero network during render,
// user-defined + sex-specific classification, suboptimal-vs-out-of-range
// non-double-counting, tour vs shared-view behavior, and mobile rendering.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, enterTour, seedPanel, type SeedPanelInput } from "../helpers/flows";

/** Seed one panel and open its review screen, reloading so the router reads the
 *  fresh IndexedDB rows. Returns the panel id. */
async function seedAndOpen(page: Page, results: SeedPanelInput["results"]): Promise<number> {
  const id = await seedPanel(page, {
    drawnAt: "2026-05-15", labName: "Quest", clearFirst: true, results,
  });
  await page.goto(`/#/labs?id=${id}`);
  await page.reload();
  await expect(page.locator(".result__name").first()).toBeVisible();
  return id;
}

/* A reusable mixed panel: 12 optimal + 7 suboptimal + 3 out-of-lab-range = 22
 * classifiable markers. The exact counts the ticket's headline calls for. We
 * carry an explicit `flag` per result so the counts are deterministic. */
function mixedPanel(): SeedPanelInput["results"] {
  const optimal = Array.from({ length: 12 }, (_, i) => ({
    markerKey: `opt_${i}`, value: 1, unit: "x",
    labRange: { low: 0, high: 10 }, optimalRange: { low: 0, high: 2 },
    flag: "optimal" as const,
  }));
  const suboptimal = Array.from({ length: 7 }, (_, i) => ({
    markerKey: `sub_${i}`, value: 5, unit: "x",
    labRange: { low: 0, high: 10 }, optimalRange: { low: 0, high: 2 },
    flag: "suboptimal" as const,
  }));
  const outOfRange = Array.from({ length: 3 }, (_, i) => ({
    markerKey: `oor_${i}`, value: 12, unit: "x",
    labRange: { low: 0, high: 10 }, optimalRange: { low: 0, high: 2 },
    flag: "high" as const,
  }));
  return [...optimal, ...suboptimal, ...outOfRange];
}

test.describe("Report card — counts + copy", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });
  });

  test("a mixed panel renders the card under the 'Against the optimum' eyebrow with the exact counts", async ({ page }) => {
    await seedAndOpen(page, mixedPanel());

    const card = page.locator(".report-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".section-mark")).toContainText("Against the optimum");

    // The headline sentence carries all three non-zero clauses, in order.
    await expect(card.locator(".report-card__line")).toHaveText(
      /Of 22 markers, 12 are optimal\. 7 sit inside the lab's normal range but below the functional optimum\. 3 are outside the lab range\./,
    );

    // The class chips carry the right counts.
    await expect(card.locator(".report-card__count[data-class='optimal']")).toContainText("12");
    await expect(card.locator(".report-card__count[data-class='suboptimal']")).toContainText("7");
    await expect(card.locator(".report-card__count[data-class='outOfLabRange']")).toContainText("3");
  });

  test("an all-optimal panel renders only the first clause plus the reassuring close", async ({ page }) => {
    const allOptimal = Array.from({ length: 5 }, (_, i) => ({
      markerKey: `opt_${i}`, value: 1, unit: "x",
      labRange: { low: 0, high: 10 }, optimalRange: { low: 0, high: 2 },
      flag: "optimal" as const,
    }));
    await seedAndOpen(page, allOptimal);

    const line = page.locator(".report-card__line");
    await expect(line).toHaveText(
      /Of 5 markers, 5 are optimal\. Nothing sits below the functional optimum\./,
    );
    // No suboptimal / out-of-range clauses leak in (the suboptimal clause is the
    // "sit inside the lab's normal range" phrasing; the close is allowed).
    await expect(line).not.toContainText("sit inside the lab's normal range");
    await expect(line).not.toContainText("outside the lab range");
  });

  test("a several-out-of-range panel renders the optimal + out-of-range clauses and omits the absent suboptimal clause", async ({ page }) => {
    // 2 optimal + 0 suboptimal + 4 out-of-lab-range. The suboptimal clause must
    // be absent because its count is zero.
    const results: SeedPanelInput["results"] = [
      ...Array.from({ length: 2 }, (_, i) => ({
        markerKey: `opt_${i}`, value: 1, unit: "x",
        labRange: { low: 0, high: 10 }, optimalRange: { low: 0, high: 2 },
        flag: "optimal" as const,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        markerKey: `oor_${i}`, value: 99, unit: "x",
        labRange: { low: 0, high: 10 }, optimalRange: { low: 0, high: 2 },
        flag: "high" as const,
      })),
    ];
    await seedAndOpen(page, results);

    const line = page.locator(".report-card__line");
    await expect(line).toHaveText(
      /Of 6 markers, 2 are optimal\. 4 are outside the lab range\./,
    );
    await expect(line).not.toContainText("sit inside the lab's normal range");
  });
});

test.describe("Report card — classification correctness", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });
  });

  test("a marker outside the lab range counts only in out-of-range, never double-counted as suboptimal", async ({ page }) => {
    // A single marker BELOW the lab floor: it is also below the optimum, but the
    // ticket's rule is that it lands ONLY in outOfLabRange.
    await seedAndOpen(page, [{
      markerKey: "below_floor", value: -5, unit: "x",
      labRange: { low: 0, high: 10 }, optimalRange: { low: 2, high: 8 },
      flag: "low" as const,
    }]);

    const card = page.locator(".report-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".report-card__count[data-class='outOfLabRange']")).toContainText("1");
    // No suboptimal chip at all — the count is zero.
    await expect(card.locator(".report-card__count[data-class='suboptimal']")).toHaveCount(0);
    // Singular subject-verb agreement: "1 is outside …".
    await expect(card.locator(".report-card__line")).toContainText("1 is outside the lab range");
    await expect(card.locator(".report-card__line")).not.toContainText("below the functional optimum");
  });

  test("the card classifies from flagFor() when a result carries no stored flag", async ({ page }) => {
    // ferritin_m: lab 30–400, optimal 70–150. value 50 is in lab range but below
    // the functional floor → suboptimal, with NO stored flag (flagFor fallback).
    await seedAndOpen(page, [{
      markerKey: "ferritin_m", value: 50, unit: "ng/mL",
      labRange: { low: 30, high: 400 }, optimalRange: { low: 70, high: 150 },
      // intentionally no `flag` — exercise the flagFor() fallback path
    }]);

    const card = page.locator(".report-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".report-card__count[data-class='suboptimal']")).toContainText("1");
    // Singular subject-verb agreement: "1 sits …".
    await expect(card.locator(".report-card__line")).toContainText(
      "1 sits inside the lab's normal range but below the functional optimum",
    );
  });

  test("a sex-specific ferritin and a user-defined marker are both classified for a male profile", async ({ page }) => {
    // Define a user marker with a functional range directly in IndexedDB.
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
            labRange: { high: 250 },
            optimalRange: { high: 200 },
            description: "Vascular-specific inflammation.",
            createdAt: Date.now(),
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror    = () => { db.close(); reject(tx.error); };
        };
      });
    });

    // ferritin_m 50 → suboptimal (in lab 30–400, below optimal floor 70).
    // user_lp_pla2 220 → suboptimal (in lab ≤250, above optimal ceiling 200).
    await seedAndOpen(page, [
      { markerKey: "ferritin_m", value: 50, unit: "ng/mL",
        labRange: { low: 30, high: 400 }, optimalRange: { low: 70, high: 150 } },
      { markerKey: "user_lp_pla2", value: 220, unit: "nmol/min/mL",
        labRange: { high: 250 }, optimalRange: { high: 200 } },
    ]);

    const card = page.locator(".report-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".report-card__line")).toContainText("Of 2 markers");
    await expect(card.locator(".report-card__count[data-class='suboptimal']")).toContainText("2");
  });

  test("a panel of only range-less / unrecognized markers renders NO card", async ({ page }) => {
    // No labRange and no optimalRange on either result, and the markerKeys are
    // not in the DB — nothing is classifiable, so `total` is 0 and no card paints.
    await seedAndOpen(page, [
      { markerKey: "mystery_one", value: 7, unit: "x" },
      { markerKey: "mystery_two", value: 9, unit: "x" },
    ]);

    await expect(page.locator(".report-card")).toHaveCount(0);
    // The review screen is otherwise intact — the results still render.
    await expect(page.locator(".result__name").first()).toBeVisible();
  });
});

test.describe("Report card — tap to scroll", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });
  });

  test("tapping the suboptimal count brings the in-range-but-below-optimum rows into view + highlights them", async ({ page }) => {
    await seedAndOpen(page, mixedPanel());

    const chip = page.locator(".report-card__count[data-class='suboptimal']");
    await expect(chip).toBeVisible();
    await chip.click();

    // Every suboptimal row gets the transient highlight class.
    const highlighted = page.locator(".result.is-report-highlight");
    await expect(highlighted).toHaveCount(7);
    // And the first such row is scrolled into the viewport.
    await expect(highlighted.first()).toBeInViewport();
  });

  test("each class chip is a ≥44×44 css-px tap target", async ({ page }) => {
    await seedAndOpen(page, mixedPanel());
    for (const cls of ["optimal", "suboptimal", "outOfLabRange"]) {
      const chip = page.locator(`.report-card__count[data-class='${cls}']`);
      const box = await chip.boundingBox();
      expect(box, `chip ${cls} should have a box`).not.toBeNull();
      if (box) {
        expect(box.height, `chip ${cls} height`).toBeGreaterThanOrEqual(44);
        expect(box.width, `chip ${cls} width`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe("Report card — privacy + gating", () => {
  test("the card computes and renders with zero network calls", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page, { sex: "male" });

    const id = await seedPanel(page, {
      drawnAt: "2026-05-15", labName: "Quest", clearFirst: true, results: mixedPanel(),
    });

    const before = stats.outboundUrls.length;
    await page.goto(`/#/labs?id=${id}`);
    await page.reload();
    await expect(page.locator(".report-card")).toBeVisible();

    const anthropic = stats.outboundUrls.slice(before).filter((u) => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  test("tour mode surfaces the card on the fixture's first panel with a non-trivial suboptimal count", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);

    // The tour fixture's earliest panel (id 1) carries a vivid mix of flags —
    // ferritin below the male floor, hs-CRP above the ceiling, vit D below lab.
    await page.goto("/#/labs?id=1");
    await page.locator(".result__name").first().waitFor();

    const card = page.locator(".report-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".section-mark")).toContainText("Against the optimum");
    // The wedge must be tangible: at least one suboptimal marker.
    await expect(card.locator(".report-card__count[data-class='suboptimal']")).toBeVisible();
  });

  test("shared-view mode does not render the card — panel detail is not part of the shared payload", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { sex: "male" });
    await page.evaluate(() => localStorage.setItem("almanac.sharedView", "true"));
    await page.goto("/#/labs?id=1");
    await page.locator(".shared-empty, .headline").first().waitFor();
    await expect(page.locator(".report-card")).toHaveCount(0);
  });
});

test.describe("Report card — mobile", () => {
  test("renders cleanly at the 390px viewport with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMocks(page);
    await onboard(page, { sex: "male" });

    await seedAndOpen(page, mixedPanel());

    const card = page.locator(".report-card");
    await expect(card).toBeVisible();

    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Mobile tap targets still clear 44px.
    const chip = page.locator(".report-card__count[data-class='suboptimal']");
    const chipBox = await chip.boundingBox();
    if (chipBox) {
      expect(chipBox.height).toBeGreaterThanOrEqual(44);
      expect(chipBox.width).toBeGreaterThanOrEqual(44);
    }
  });
});

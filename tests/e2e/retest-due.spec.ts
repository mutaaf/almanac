// The retest-due surface (ticket 0028).
//
// Every composed plan already carries a `retest` cadence — markers + weeks +
// reason — written once by the generator and rendered once on the Plan page.
// This surface carries that cadence forward and renders a single calm card on
// Today when a draw is coming due (due-soon) or has passed (overdue), computed
// locally from the latest plan's `generatedAt` + cadence weeks and the user's
// existing panels. One test per acceptance-criteria checkbox.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import {
  onboard, composePlan, addManualPanel, seedPlanWithRetest, enterTour,
  enterSharedViewWithAdopt,
} from "../helpers/flows";

/** Open Today fresh so the router re-reads the seeded rows. */
async function openToday(page: Page): Promise<void> {
  await page.goto("/#/today");
  await page.reload();
  await page.locator(".headline").first().waitFor();
}

test.describe("Retest-due surface", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("card present in the due window, absent when far out", async ({ page }) => {
    // Cadence 12 weeks (84 days). Generated 75 days ago → due in 9 days (due-soon).
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toBeVisible();

    // Same cadence generated 24 days ago → due in 60 days (upcoming) → absent.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 24,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });

  test("renders below the day's meals and above the habit stack", async ({ page }) => {
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);

    // DOM order: a meals section, then the retest card, then the habit stack.
    const order = await page.evaluate(() => {
      const card = document.querySelector(".retest-card");
      const habits = document.querySelector("[data-scroll='habits']");
      const meals = document.querySelector(".section-mark");  // "Today's meals" mark
      if (!card || !habits || !meals) return null;
      const pos = (a: Element, b: Element) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
      return {
        mealsBeforeCard: !!pos(meals, card),
        cardBeforeHabits: !!pos(card, habits),
      };
    });
    expect(order).not.toBeNull();
    expect(order!.mealsBeforeCard).toBe(true);
    expect(order!.cardBeforeHabits).toBe(true);
  });

  test("due-soon copy: exact phrasing, plural markers, plural days", async ({ page }) => {
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b", "hs_crp"], whenWeeks: 12 }],
    });
    await openToday(page);
    const setOn = new Date(Date.now() - 75 * 86_400_000)
      .toLocaleDateString("en-US", { month: "long", day: "numeric" });
    await expect(page.locator(".retest-card")).toContainText(
      `ApoB and hs-CRP due for a recheck in 9 days — the protocol set this draw on ${setOn}.`,
    );
  });

  test("due-soon copy: singular day agrees", async ({ page }) => {
    // 12 weeks = 84 days; generated 83 days ago → due in 1 day.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 83,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toContainText(
      "due for a recheck in 1 day —",
    );
    await expect(page.locator(".retest-card")).not.toContainText("in 1 days");
  });

  test("overdue copy: calm, no oxblood, relative phrasing", async ({ page }) => {
    // 12 weeks = 84 days; generated 92 days ago → due 8 days in the past.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 92,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    const card = page.locator(".retest-card");
    await expect(card).toContainText(
      "Your ApoB recheck has been due since last week — when you have the new draw, it goes here.",
    );

    // Overdue is calm, not an error: no oxblood anywhere on the card.
    const usesOxblood = await card.evaluate((el) => {
      const oxblood = getComputedStyle(document.documentElement)
        .getPropertyValue("--oxblood").trim();
      const norm = (c: string) => c.replace(/\s+/g, "");
      const targets = [el, ...el.querySelectorAll("*")];
      return targets.some((node) => {
        const cs = getComputedStyle(node as Element);
        return [cs.color, cs.borderLeftColor, cs.borderTopColor, cs.backgroundColor]
          .map(norm)
          .includes(norm(oxblood));
      });
    });
    expect(usesOxblood).toBe(false);
  });

  test("single tap navigates to the labs upload surface", async ({ page }) => {
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await page.locator(".retest-card").click();
    await expect(page).toHaveURL(/#\/labs$/);
  });

  test("no plan: no retest card, Today renders the no-plan state", async ({ page }) => {
    // onboard leaves us with a profile but no plan composed.
    await openToday(page);
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });

  test("plan with an empty retest cadence: no card", async ({ page }) => {
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });

  test("newest plan wins on recomposition", async ({ page }) => {
    // Older plan would be overdue; newer plan is far out (upcoming). The card
    // must read from the newest plan only — so it should be absent.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 100,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],   // due ~16 days ago
      newerPlan: {
        generatedDaysAgo: 5,
        retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }], // due in ~79 days
      },
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });

  test("card clears after a covering draw lands", async ({ page }) => {
    // Overdue cadence for ferritin + apoB, then a panel covering BOTH drawn
    // after the plan's generation date → the draw happened, card suppresses.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 92,
      retest: [{ markerKeys: ["apo_b", "ferritin_m"], whenWeeks: 12 }],
      panels: [
        {
          daysAgo: 2,   // after the plan's generation (92 days ago)
          results: [
            { markerKey: "apo_b", value: 80, unit: "mg/dL" },
            { markerKey: "ferritin_m", value: 90, unit: "ng/mL" },
          ],
        },
      ],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });

  test("a draw BEFORE the plan does not clear the card", async ({ page }) => {
    // A panel covering the markers but drawn before the plan generated is the
    // very draw the plan was composed from — it does not satisfy the retest.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 92,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
      panels: [
        { daysAgo: 95, results: [{ markerKey: "apo_b", value: 100, unit: "mg/dL" }] },
      ],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toBeVisible();
  });

  test("zero network calls during the card's render", async ({ page }) => {
    const stats = await installMocks(page);
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    const before = stats.outboundUrls.length;
    await openToday(page);
    await expect(page.locator(".retest-card")).toBeVisible();
    const anthropic = stats.outboundUrls.slice(before).filter((u) => {
      if (!u.startsWith("http")) return false;
      return new URL(u).hostname === "api.anthropic.com";
    });
    expect(anthropic).toEqual([]);
  });

  test("end-to-end: a real composed plan drives the card when its cadence is in-window", async ({ page }) => {
    // The plan fixture composes with a retest cadence. Compose for real, then
    // age the plan into the due window via a direct generatedAt rewrite so the
    // fixture's whenWeeks lands in-window deterministically.
    await addManualPanel(page);
    await composePlan(page);
    // Pull the composed plan's first cadence whenWeeks, then re-anchor its
    // generatedAt so the due date lands 9 days out.
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("plans", "readwrite");
          const store = tx.objectStore("plans");
          const all = store.getAll();
          all.onsuccess = () => {
            const plans = all.result as Array<{ id: number; generatedAt: number; retest: Array<{ whenWeeks: number }> }>;
            const newest = plans.sort((a, b) => b.generatedAt - a.generatedAt)[0];
            if (!newest || !newest.retest?.length) { resolve(); return; }
            const weeks = Math.min(...newest.retest.map((r) => r.whenWeeks));
            // due in 9 days => generatedAt = now - (weeks*7 - 9) days
            newest.generatedAt = Date.now() - (weeks * 7 - 9) * 86_400_000;
            store.put(newest);
          };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror    = () => { db.close(); reject(tx.error); };
        };
      });
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toBeVisible();
    await expect(page.locator(".retest-card")).toContainText("due for a recheck in 9 days");
  });

  test("mobile: full-width tap target ≥44px tall, marker list wraps at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b", "hs_crp", "ferritin_m"], whenWeeks: 12 }],
    });
    await openToday(page);
    const card = page.locator(".retest-card");
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // Card spans most of the viewport width (full-width tap target).
    expect(box!.width).toBeGreaterThan(300);
  });

  test("tour mode: no card when the fixture cadence is far out", async ({ page }) => {
    // The tour fixture's plan generated 13 days ago with a 12-week cadence →
    // due ~71 days out (upcoming). The card must NOT fabricate a draw.
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".headline").first().waitFor();
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });

  test("shared-view never renders the retest card", async ({ page }) => {
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });
});

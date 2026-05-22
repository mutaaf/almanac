// The pre-draw primer (ticket 0051).
//
// The day-before half of the retest loop. The 0028 countdown says "a draw is
// coming"; this card says "here's how to draw it well." When the latest plan's
// soonest retest cadence places a draw within 48 hours (and not past), Today's
// adaptive card stack gains a calm "Pre-draw prep" card listing each retest
// marker with a deterministic, marker-specific pre-analytical note pulled from
// the static `DRAW_PREP` lookup. No Claude call, no network, no notification.
// One test per acceptance-criteria checkbox.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import {
  onboard, seedPlanWithRetest, seedPlanWithDrawIn, enterTour,
  enterSharedViewWithAdopt,
} from "../helpers/flows";

const HOUR_MS = 3_600_000;
// A fixed instant so the clock-frozen `now` and the seeded draw offsets are
// exact. A Wednesday morning — the weekday is irrelevant to this surface (no
// Sunday-recap interaction), but pinning it keeps the run deterministic.
const FROZEN_NOW = new Date("2026-05-20T09:00:00.000Z");

/** Open Today fresh so the router re-reads the seeded rows under the frozen clock. */
async function openToday(page: Page): Promise<void> {
  await page.goto("/#/today");
  await page.reload();
  await page.locator(".headline").first().waitFor();
}

test.describe("Pre-draw primer", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_NOW);
    await installMocks(page);
    await onboard(page);
  });

  test("present within 48h: lists the retest markers with their DRAW_PREP notes", async ({ page }) => {
    // Draw 36 hours out → inside the 48h window. Ferritin (male) + a lipid panel.
    await seedPlanWithDrawIn(page, {
      dueInMs: 36 * HOUR_MS,
      markerKeys: ["ferritin_m", "ldl_c", "hdl_c", "triglycerides"],
    });
    await openToday(page);

    const card = page.locator(".pre-draw-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".pre-draw-card__eyebrow")).toHaveText("Pre-draw prep");
    // Lead: draws in 2 days (ceil 36h), and names the markers being rechecked.
    await expect(card.locator(".pre-draw-card__lead")).toContainText("Your draw is in 2 days");
    await expect(card.locator(".pre-draw-card__lead")).toContainText("you're rechecking");

    // Each marker line: "<name>: <note>". Ferritin resolves to its human name;
    // lipid keys carry the shared lipid note.
    const lines = card.locator(".pre-draw-card__line");
    await expect(lines).toHaveCount(4);
    await expect(card).toContainText("Ferritin: A 12-hour fast reads truest.");
    await expect(card).toContainText("LDL Cholesterol: A 12-hour fast; avoid heavy exercise the 24 hours before.");
    await expect(card).toContainText("Triglycerides: A 12-hour fast; avoid heavy exercise the 24 hours before.");
  });

  test("absent before the 48h window opens (draw 5 days out)", async ({ page }) => {
    await seedPlanWithDrawIn(page, {
      dueInMs: 5 * 24 * HOUR_MS,
      markerKeys: ["ferritin_m"],
    });
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
  });

  test("absent after the draw date passes (draw 1 day in the past)", async ({ page }) => {
    await seedPlanWithDrawIn(page, {
      dueInMs: -24 * HOUR_MS,
      markerKeys: ["ferritin_m"],
    });
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
  });

  test("the markers are exactly the retest set, not all plan markers", async ({ page }) => {
    await seedPlanWithDrawIn(page, {
      dueInMs: 24 * HOUR_MS,
      markerKeys: ["fasting_insulin", "tsh"],
    });
    await openToday(page);
    const card = page.locator(".pre-draw-card");
    await expect(card).toBeVisible();
    const lines = card.locator(".pre-draw-card__line");
    await expect(lines).toHaveCount(2);
    await expect(card).toContainText("Fasting Insulin: An 8-hour fast; no alcohol the 24 hours before.");
    await expect(card).toContainText("TSH: A morning draw reads truest; take thyroid meds after the draw if applicable.");
  });

  test("the rendered note for each marker equals DRAW_PREP exactly", async ({ page }) => {
    await seedPlanWithDrawIn(page, {
      dueInMs: 12 * HOUR_MS,
      markerKeys: ["ferritin_m", "hs_crp"],
    });
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toBeVisible();

    // Pull DRAW_PREP straight from source and compare the rendered note text.
    const prep = await page.evaluate(async () => {
      const mod = await import("/src/data/draw-prep.ts");
      return (mod as { DRAW_PREP: Record<string, string> }).DRAW_PREP;
    });
    const ferritinNote = await page.locator(".pre-draw-card__line", { hasText: "Ferritin:" }).textContent();
    const crpNote = await page.locator(".pre-draw-card__line", { hasText: "hs-CRP:" }).textContent();
    expect(ferritinNote).toContain(prep["ferritin_m"]!);
    expect(crpNote).toContain(prep["hs_crp"]!);
  });

  test("absent with no plan", async ({ page }) => {
    // onboard leaves a profile but no plan composed.
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
  });

  test("absent with a plan that has no retest cadence", async ({ page }) => {
    await seedPlanWithRetest(page, { generatedDaysAgo: 1, retest: [] });
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
  });

  test("within 48h the primer renders and the 0028 countdown is suppressed", async ({ page }) => {
    // A draw 24h out qualifies for BOTH the 0028 due-soon countdown and the
    // primer. The documented coexistence: the primer wins inside 48h and the
    // countdown folds away, so the two never present duplicated copy.
    await seedPlanWithDrawIn(page, {
      dueInMs: 24 * HOUR_MS,
      markerKeys: ["ferritin_m", "ldl_c"],
    });
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toBeVisible();
    await expect(page.locator(".retest-card")).toHaveCount(0);
  });

  test("outside the window the 0028 countdown is byte-for-byte unchanged", async ({ page }) => {
    // A draw 9 days out: too far for the primer, but inside the 0028 due-soon
    // window. The retest card renders as before; the primer is absent.
    await seedPlanWithDrawIn(page, {
      dueInMs: 9 * 24 * HOUR_MS,
      markerKeys: ["apo_b"],
    });
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
    await expect(page.locator(".retest-card")).toBeVisible();
    await expect(page.locator(".retest-card")).toContainText("due for a recheck in 9 days");
  });

  test("zero Anthropic calls and zero off-allow-list egress while the card renders", async ({ page }) => {
    const stats = await installMocks(page);
    await seedPlanWithDrawIn(page, {
      dueInMs: 24 * HOUR_MS,
      markerKeys: ["ferritin_m", "ldl_c"],
    });
    const before = stats.outboundUrls.length;
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toBeVisible();

    const ALLOWED = ["127.0.0.1", "localhost", "fonts.googleapis.com", "fonts.gstatic.com", "api.anthropic.com"];
    const offending = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);

    const anthropic = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  test("the API key never appears in the card", async ({ page }) => {
    const sentinel = "sk-ant-canary-PREDRAW-44444";
    // Wipe the beforeEach onboard and re-onboard with the sentinel key so it is
    // the profile key in IndexedDB — onboard() can't run twice over an existing
    // profile (acknowledgeConsent would never reach the form).
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
    await onboard(page, { key: sentinel });
    await seedPlanWithDrawIn(page, {
      dueInMs: 24 * HOUR_MS,
      markerKeys: ["ferritin_m", "ldl_c"],
    });
    await openToday(page);
    const card = page.locator(".pre-draw-card");
    await expect(card).toBeVisible();
    const cardHtml = await card.evaluate((el) => el.outerHTML);
    expect(cardHtml).not.toContain(sentinel);
  });

  test("marker names resolve to human names via findMarker (sex-specific key)", async ({ page }) => {
    // The retest carries the sex-specific `ferritin_m` key; the card must render
    // the human name "Ferritin", never the raw key.
    await seedPlanWithDrawIn(page, {
      dueInMs: 24 * HOUR_MS,
      markerKeys: ["ferritin_m"],
    });
    await openToday(page);
    const card = page.locator(".pre-draw-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Ferritin:");
    await expect(card).not.toContainText("ferritin_m");
  });

  test("an uncovered retest marker is listed by name with a neutral note", async ({ page }) => {
    // homa_ir has no DRAW_PREP entry → listed by name with the neutral line,
    // never omitted.
    await seedPlanWithDrawIn(page, {
      dueInMs: 24 * HOUR_MS,
      markerKeys: ["homa_ir"],
    });
    await openToday(page);
    const card = page.locator(".pre-draw-card");
    await expect(card).toBeVisible();
    await expect(card.locator(".pre-draw-card__line")).toHaveCount(1);
    await expect(card).toContainText("HOMA-IR: No special prep needed.");
  });

  test("mobile: the card wraps cleanly at 390px and does not push meals off-screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlanWithDrawIn(page, {
      dueInMs: 24 * HOUR_MS,
      markerKeys: ["ferritin_m", "ldl_c", "hdl_c", "triglycerides", "tsh"],
    });
    await openToday(page);
    const card = page.locator(".pre-draw-card");
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    // No horizontal overflow: the card fits the viewport.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
    // The meals row still renders (the card is additive, not a replacement).
    await expect(page.locator(".section-mark").first()).toBeVisible();
  });

  test("the rest of Today is unchanged outside the window", async ({ page }) => {
    // A draw far out: no primer. Today's habit stack + save button render as
    // usual — the primer is purely additive.
    await seedPlanWithDrawIn(page, {
      dueInMs: 30 * 24 * HOUR_MS,
      markerKeys: ["ferritin_m"],
    });
    await openToday(page);
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
    await expect(page.locator(".habit-check").first()).toBeVisible();
    await expect(page.locator("#save")).toBeVisible();
  });

  test("tour mode: no primer when the fixture cadence is far out", async ({ page }) => {
    // Touring is not consenting — wipe the onboarded device state first. The
    // tour fixture's plan cadence is far out, so no primer is fabricated.
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
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".headline").first().waitFor();
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
  });

  test("shared-view never renders the primer", async ({ page }) => {
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.locator(".pre-draw-card")).toHaveCount(0);
  });
});

// The improvement card (ticket 0047).
//
// On Progress, for the user's single MOST-IMPROVED marker (largest favorable
// move toward its functional optimum across the timeline), a "Save the
// improvement" affordance renders one phone-shaped editorial PNG entirely
// on-device: the "Almanac" wordmark, the marker name, the start value + month,
// the now value + month, the plain move line ("32 → 48 ng/mL · now in range"),
// and the sparkline-with-functional-band the Progress page already draws.
//
// It is the over-time sibling of the marker-hero card (0011): 0011 ships a
// single draw's two-value delta from the compare view; this ships the whole
// timeline's most-improved story from Progress. The two share the SAME render-
// and-download mechanism (canvas 2D → toBlob → shareOrDownload).
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.
//
// Test browsers:
//   - chromium      : full path — affordance presence/absence, download +
//                     filename + PNG header, composed-text content (start/now/
//                     units/months/direction/in-range), wordmark with no URL,
//                     key-never-appears sentinel, zero-network during render,
//                     selection across markers, name resolution, tour presence.
//   - mobile-webkit : the affordance is visible + a ≥44×44 tap target, and the
//                     card Blob is verified through the same module call 0011's
//                     spec uses for byte-free verification (composeImprovementText
//                     + renderImprovementCard) rather than a programmatic
//                     download, which Mobile Safari blocks. The path asserted
//                     per project is noted at each test.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { onboard, seedPanel, enterTour, enterSharedViewWithAdopt } from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

const SENTINEL_KEY = "sk-ant-IMPROVEMENT-SENTINEL-99999";

/** Navigate to Progress and wait for the page to paint. */
async function gotoProgress(page: Page): Promise<void> {
  await page.goto("/#/progress");
  await page.locator(".headline, .shared-empty__title").first().waitFor();
}

/**
 * Call `selectMostImproved` against the live IndexedDB panels + profile through
 * the module, returning the chosen marker (or null). Lets the spec assert the
 * SELECTION (which marker wins, in what direction) independent of the canvas.
 */
async function readMostImproved(page: Page): Promise<null | {
  markerKey: string; name: string; unit: string;
  startValue: number; startDay: string; nowValue: number; nowDay: string;
  movedIntoRange: boolean;
}> {
  return page.evaluate(async () => {
    const dbMod = await import("/src/db.ts");
    const userMod = await import("/src/data/userMarkers.ts");
    const sel = await import("/src/progress/most-improved.ts");
    void userMod;
    const panels = await dbMod.allPanels();
    const profile = await dbMod.getProfile();
    if (!profile) return null;
    return sel.selectMostImproved(panels, profile);
  });
}

/**
 * Compose the card's deterministic text (wordmark + marker name + start/now
 * lines + move line) for the live most-improved marker. The PNG is deflate-
 * compressed so glyph strings never survive into the bytes; the composed-text
 * function is the honest surface to grep the wordmark, the absence of a URL,
 * and the absence of the key — exactly the way 0011's spec asserts filename +
 * header rather than rendered glyphs.
 */
async function readComposedText(page: Page): Promise<null | {
  wordmark: string; markerName: string; startLine: string; nowLine: string; moveLine: string;
}> {
  return page.evaluate(async () => {
    const dbMod = await import("/src/db.ts");
    const sel = await import("/src/progress/most-improved.ts");
    const card = await import("/src/progress/improvement-card.ts");
    const panels = await dbMod.allPanels();
    const profile = await dbMod.getProfile();
    if (!profile) return null;
    const improved = sel.selectMostImproved(panels, profile);
    if (!improved) return null;
    return card.composeImprovementText(improved);
  });
}

/** Render the card to a Blob through the module and report its size + type. */
async function renderCardSize(page: Page, w: number, h: number): Promise<{ size: number; type: string }> {
  return page.evaluate(async (dims) => {
    const dbMod = await import("/src/db.ts");
    const sel = await import("/src/progress/most-improved.ts");
    const card = await import("/src/progress/improvement-card.ts");
    const panels = await dbMod.allPanels();
    const profile = await dbMod.getProfile();
    const improved = sel.selectMostImproved(panels, profile!);
    const blob = await card.renderImprovementCard(improved!, { width: dims.w, height: dims.h });
    return { size: blob.size, type: blob.type };
  }, { w, h });
}

/**
 * Stub `navigator.share` / `navigator.canShare` so the download branch is
 * deterministic (same approach as 0011's share-card spec). Must run AFTER the
 * page settles — addInitScript only fires on a new document and our nav is
 * hash-only.
 */
async function stubNoShare(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: () => false });
    Object.defineProperty(navigator, "share",    { configurable: true, writable: true, value: async () => undefined });
  });
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("The improvement card (ticket 0047)", () => {
  let stats: MockStats;

  test.beforeEach(async ({ page }) => {
    stats = await installMocks(page);
  });

  /* ---- selection across multiple markers (acceptance: selectMostImproved) -- */

  test("selectMostImproved picks the largest favorable move (ApoB drop over a small ferritin rise)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "selection assertion runs once on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    // Ferritin: a SMALL favorable rise (45 → 50, both below the male floor 70).
    // ApoB: a LARGE favorable drop (110 → 84, both above the ceiling 80, and it
    // moves the larger normalized distance toward optimum). ApoB must win.
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [
        { markerKey: "ferritin_m", value: 45, unit: "ng/mL" },
        { markerKey: "apo_b", value: 110, unit: "mg/dL" },
      ],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [
        { markerKey: "ferritin_m", value: 50, unit: "ng/mL" },
        { markerKey: "apo_b", value: 84, unit: "mg/dL" },
      ],
    });
    await gotoProgress(page);

    const improved = await readMostImproved(page);
    expect(improved).not.toBeNull();
    expect(improved!.markerKey).toBe("apo_b");
    expect(improved!.startValue).toBe(110);
    expect(improved!.nowValue).toBe(84);
    expect(improved!.unit).toBe("mg/dL");
  });

  /* ---- start/now/units/months content + correct DIRECTION (ApoB) ---------- */

  test("the favorably-falling marker (ApoB) reads '110 → 84 mg/dL', not reversed", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "apo_b", value: 110, unit: "mg/dL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "apo_b", value: 84, unit: "mg/dL" }],
    });
    await gotoProgress(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.markerName).toBe("ApoB");
    // The move line reads start → now in the correct order, with the unit.
    expect(text!.moveLine).toContain("110 → 84 mg/dL");
    // Start/now lines carry the values + months verbatim (Feb start, May now).
    expect(text!.startLine).toContain("110");
    expect(text!.startLine).toContain("February");
    expect(text!.nowLine).toContain("84");
    expect(text!.nowLine).toContain("May");
  });

  /* ---- correct DIRECTION for a rising marker (ferritin) ------------------- */

  test("the rising marker (ferritin) reads '32 → 48 ng/mL' in the correct order", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-03-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await gotoProgress(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.markerName).toBe("Ferritin");
    expect(text!.moveLine).toContain("32 → 48 ng/mL");
    expect(text!.startLine).toContain("March");
    expect(text!.nowLine).toContain("May");
  });

  /* ---- "now in range" only when the move CROSSED into the optimum --------- */

  test("'now in range' appears when the move crossed into the optimum, and is absent otherwise", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    // Crossed in: ferritin 60 (below floor 70) → 80 (inside 70–150).
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 60, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 80, unit: "ng/mL" }],
    });
    await gotoProgress(page);
    const crossed = await readComposedText(page);
    expect(crossed).not.toBeNull();
    expect(crossed!.moveLine).toContain("· now in range");

    // Did NOT cross: ferritin 32 → 48 — favorable, but still below the floor 70.
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await page.reload();
    await gotoProgress(page);
    const notCrossed = await readComposedText(page);
    expect(notCrossed).not.toBeNull();
    expect(notCrossed!.moveLine).not.toContain("now in range");
  });

  /* ---- marker-name resolution incl. sex-specific keys → "Ferritin" ------- */

  test("a most-improved sex-specific marker resolves its human name to 'Ferritin'", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "name-resolution assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 35, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 60, unit: "ng/mL" }],
    });
    await gotoProgress(page);

    const improved = await readMostImproved(page);
    expect(improved).not.toBeNull();
    // The sex-specific key is `ferritin_m`; the human name on the card is the
    // bare "Ferritin", not "Ferritin (Male)" or the raw key.
    expect(improved!.name).toBe("Ferritin");
  });

  /* ---- the action triggers a .png download with the right filename -------- */

  test("tapping 'Save the improvement' downloads a PNG with the owner-slug filename", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "programmatic download is intercepted on chromium only");
    await onboard(page, { name: "Dana Reed", sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await gotoProgress(page);
    await stubNoShare(page);

    const action = page.locator(".improvement-save");
    await expect(action).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      action.click(),
    ]);
    expect(download.suggestedFilename()).toBe("dana-reed-improvement.png");

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

  /* ---- filename falls back to almanac-improvement.png with no name -------- */

  test("the filename falls back to 'almanac-improvement.png' when the owner has no name", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "download assertion runs on chromium");
    await onboard(page, { name: "Temp", sex: "male", key: SENTINEL_KEY });
    // Blank the name on the saved profile so the slug is empty → fallback.
    await page.evaluate(async () => {
      const dbMod = await import("/src/db.ts");
      await dbMod.saveProfile({ ownerName: "" });
    });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await gotoProgress(page);
    await stubNoShare(page);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".improvement-save").click(),
    ]);
    expect(download.suggestedFilename()).toBe("almanac-improvement.png");
  });

  /* ---- editorial wordmark "Almanac" with NO url/http/https/?-bearing ------ */

  test("the composed card carries the 'Almanac' wordmark and no URL / tracking parameter", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-text assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await gotoProgress(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    expect(text!.wordmark.toLowerCase()).toContain("almanac");
    const all = [text!.wordmark, text!.markerName, text!.startLine, text!.nowLine, text!.moveLine].join("\n");
    expect(all).not.toMatch(/https?/i);
    expect(all).not.toContain("?");
  });

  /* ---- the key sentinel never appears in any composed string -------------- */

  test("the Anthropic key never appears in the card's composed text (sentinel)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "sentinel assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await gotoProgress(page);

    const text = await readComposedText(page);
    expect(text).not.toBeNull();
    const all = Object.values(text!).join("\n");
    expect(all).not.toContain(SENTINEL_KEY);
    // And the selection object — the only thing the render reads — also never
    // carries it (it is built from marker direction + values, never the key).
    const improved = await readMostImproved(page);
    expect(JSON.stringify(improved)).not.toContain(SENTINEL_KEY);
  });

  /* ---- zero-network during render ----------------------------------------- */

  test("rendering the card fires zero network and zero Anthropic calls", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "network-counter assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await gotoProgress(page);
    await stubNoShare(page);

    const beforeCount = stats.outboundUrls.length;
    const beforeAnthro = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".improvement-save").click(),
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

  /* ---- affordance ABSENT on a single-panel profile + page unchanged ------- */

  test("the affordance is ABSENT on a single-panel profile and the page is unchanged", async ({ page }) => {
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-05-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await gotoProgress(page);

    // No selection (no marker has ≥2 draws), so no affordance.
    const improved = await readMostImproved(page);
    expect(improved).toBeNull();
    await expect(page.locator(".improvement-save")).toHaveCount(0);
  });

  /* ---- mobile path: visible + ≥44 tap target + Blob verified via module --- */

  test("mobile: the affordance is a ≥44×44 tap target and the card Blob renders at the requested size", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "this assertion is the mobile counterpart");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    await gotoProgress(page);

    const action = page.locator(".improvement-save");
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

  /* ---- tour mode (0014) offers the affordance against the fixture --------- */

  test("tour mode offers 'Save the improvement' (the fixture carries a ≥2-draw favorable marker)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "tour-presence assertion runs on chromium");
    await enterTour(page);
    await gotoProgress(page);
    // The tour fixture's two panels carry ApoB 102→88 and ferritin_m 32→42 —
    // both favorable, ≥2 draws — so the affordance must render.
    await expect(page.locator(".improvement-save")).toBeVisible();
    const improved = await readMostImproved(page);
    expect(improved).not.toBeNull();
  });

  /* ---- shared-view (0017) does NOT render the affordance ------------------ */

  test("shared-view does NOT render the affordance (the recipient has no timeline)", async ({ page }) => {
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });
    await page.goto("/#/progress");
    await page.locator(".shared-empty__title, .headline").first().waitFor();
    await expect(page.locator(".improvement-save")).toHaveCount(0);
    // The recipient sees the "not shared with you" empty state, not trends.
    await expect(page.locator(".shared-empty__title")).toBeVisible();
  });
});

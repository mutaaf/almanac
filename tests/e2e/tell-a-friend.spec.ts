// Tell a friend (ticket 0050).
//
// On Plan, beside the existing plan actions, a "Share with a friend" affordance
// pre-composes a pure-ASCII recommendation from data already on the device: the
// product wordmark, the user's top eat-list item + its frequency, the user's
// most-improved marker if one exists (reusing 0047's `selectMostImproved`
// verbatim, so the claim is honest by construction and gracefully omitted when
// there is no favorable move), a no-pressure invitation, and the canonical
// sample-tour path `#/try`. On a phone it opens `navigator.share({ text })`; on
// desktop (or when share throws) it falls back to `navigator.clipboard.writeText`
// + a transient "Copied." confirmation. Zero network, zero Anthropic, zero key.
//
// It is the text-recommendation sibling of the image cards (0011/0033/0047) and
// the share link (0017): the share link sends the live tappable protocol; this
// sends a sentence a person actually sends.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.
//
// Test browsers:
//   - chromium      : full path — composed-message content (wordmark/top food/
//                     marker line/#/try/pure-ASCII/no-tracking), marker line
//                     present-only-when-non-null, navigator.share called when
//                     present, clipboard fallback when share is stubbed absent,
//                     zero Anthropic during share, key-never-appears sentinel,
//                     affordance absent on a no-plan profile, sex-specific name
//                     resolution, banned-word-free copy, tour presence,
//                     shared-view absence.
//   - mobile-webkit : the affordance is visible + a ≥44×44 tap target, and the
//                     clipboard-fallback path is exercised (where navigator.share
//                     behavior differs from chromium). The path asserted per
//                     project is noted at each test.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import {
  onboard, seedPanel, seedPlan, enterTour, enterSharedViewWithAdopt,
} from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Harness                                                                    */
/* -------------------------------------------------------------------------- */

const SENTINEL_KEY = "sk-ant-TELLAFRIEND-SENTINEL-44444";

/**
 * Seed a composed plan straight into IndexedDB with a known top eat item, so the
 * share message's top-food line is deterministic without paying the slow,
 * flake-prone onboard→compose round-trip (the dominant flake source under
 * parallel load — see docs/LESSONS.md). "Fatty fish" 3x per week mirrors the
 * plan fixture's first eat item.
 */
async function seedComposedPlan(page: Page): Promise<void> {
  await seedPlan(page, {
    generatedDaysAgo: 1, clearFirst: true,
    snapshot: "A seeded plan for the tell-a-friend test.",
    eatList: [
      { id: "fatty-fish", food: "Fatty fish (salmon, sardines, mackerel)", frequency: "3x per week", portion: "~4 oz", why: "Omega-3s.", markerKeys: ["triglycerides"] },
      { id: "soluble-fiber", food: "Soluble fiber (oats, beans)", frequency: "daily", portion: "1/2 cup", why: "Cholesterol.", markerKeys: ["total_cholesterol"] },
    ],
    habits: [{ id: "h-oats", title: "1/2 cup oats with breakfast" }],
  });
}

/** Navigate to Plan and wait for the dashboard / editorial body to paint. */
async function gotoPlan(page: Page): Promise<void> {
  await page.goto("/#/plan");
  await page.reload();
  await page.locator(".dash-snapshot, .prose, #compose").first().waitFor();
}

/**
 * Compose the share message through the module against the live IndexedDB plan +
 * panels + most-improved selection, mirroring exactly what the page does on tap.
 * This is the honest surface to grep the wordmark, the top food, the marker
 * claim, `#/try`, the pure-ASCII / no-tracking invariant, and the absence of the
 * API key — pure assembly, no DOM, no clipboard.
 */
async function readShareMessage(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const dbMod = await import("/src/db.ts");
    const sel = await import("/src/progress/most-improved.ts");
    const share = await import("/src/plan/share-message.ts");
    const plan = await dbMod.latestPlan();
    const profile = await dbMod.getProfile();
    if (!plan || !profile) return null;
    const panels = await dbMod.allPanels();
    const improved = sel.selectMostImproved(panels, profile);
    return share.composeShareMessage(plan, profile, improved);
  });
}

/**
 * Stub `navigator.share` to capture its argument so the "present" branch is
 * asserted. Must run AFTER the page settles — addInitScript only fires on a new
 * document and our nav is hash-only. The captured text lands on a window global
 * the test reads back.
 */
async function stubCapturingShare(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __sharedText?: string }).__sharedText = undefined;
    Object.defineProperty(navigator, "share", {
      configurable: true, writable: true,
      value: async (data: { text?: string }) => {
        (window as unknown as { __sharedText?: string }).__sharedText = data.text ?? "";
      },
    });
  });
}

/** Stub `navigator.share` absent so the clipboard fallback fires (desktop). */
async function stubNoShare(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, writable: true, value: undefined });
  });
}

/**
 * Force the clipboard write to be observable: replace `navigator.clipboard.
 * writeText` with a capture so the fallback path can be asserted on every
 * project (mobile-webkit blocks real clipboard access under test). The captured
 * text lands on a window global.
 */
async function stubCapturingClipboard(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __copiedText?: string }).__copiedText = undefined;
    const writeText = async (t: string) => {
      (window as unknown as { __copiedText?: string }).__copiedText = t;
    };
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText },
      });
    } catch {
      // Some engines expose a non-configurable clipboard; patch the method only.
      try { (navigator.clipboard as unknown as { writeText: typeof writeText }).writeText = writeText; }
      catch { /* last resort handled by the page's own try/catch */ }
    }
  });
}

/** Seed two dated draws of one marker with a favorable rise → non-null improved. */
async function seedFavorableMove(page: Page): Promise<void> {
  await seedPanel(page, {
    drawnAt: "2026-02-01", clearFirst: true,
    results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }],
  });
  await seedPanel(page, {
    drawnAt: "2026-05-01",
    results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
  });
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("Tell a friend (ticket 0050)", () => {
  let stats: MockStats;

  test.beforeEach(async ({ page }) => {
    stats = await installMocks(page);
  });

  /* ---- composed message: wordmark + top food + marker claim + #/try ------- */

  test("the composed message carries the wordmark, the top food, the marker claim, and #/try", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "composed-message assertion runs once on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);

    const msg = await readShareMessage(page);
    expect(msg).not.toBeNull();
    // Wordmark.
    expect(msg!).toContain("Almanac");
    // Top eat item from the plan fixture: "Fatty fish ..." 3x per week.
    expect(msg!).toContain("Fatty fish");
    expect(msg!.toLowerCase()).toContain("3x per week");
    // The marker claim (ferritin 32 → 48, crossing nothing here — but present).
    expect(msg!).toContain("Ferritin");
    expect(msg!).toContain("32");
    expect(msg!).toContain("48");
    // The only link token is the canonical tour path.
    expect(msg!).toContain("#/try");
  });

  /* ---- marker line present ONLY when selectMostImproved is non-null -------- */

  test("the marker line is present when there is a favorable move and absent (still coherent) when there is not", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "marker-line assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);

    // Non-null branch: two favorable draws → the marker line appears.
    await seedFavorableMove(page);
    const withMove = await readShareMessage(page);
    expect(withMove).not.toBeNull();
    expect(withMove!).toContain("Ferritin");
    expect(withMove!).toMatch(/\b32\b/);
    expect(withMove!).toMatch(/\b48\b/);

    // Null branch: a single panel (no marker has ≥2 draws) → no marker line, but
    // the message is still a complete recommendation (wordmark, food, #/try).
    await seedPanel(page, {
      drawnAt: "2026-05-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }],
    });
    const noMove = await readShareMessage(page);
    expect(noMove).not.toBeNull();
    expect(noMove!).not.toContain("Ferritin");
    // Still grammatical + complete.
    expect(noMove!).toContain("Almanac");
    expect(noMove!).toContain("Fatty fish");
    expect(noMove!).toContain("#/try");
  });

  /* ---- pure ASCII, no http/https, no tracking parameter ------------------- */

  test("the composed message is pure ASCII with #/try and no http/?/utm", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "no-tracking assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);

    const msg = await readShareMessage(page);
    expect(msg).not.toBeNull();
    // Pure ASCII.
    expect(msg!).toMatch(/^[\x00-\x7F]*$/);
    // The only link-like token is #/try.
    expect(msg!).toContain("#/try");
    // No URL, no query string, no UTM.
    expect(msg!.toLowerCase()).not.toContain("http");
    expect(msg!).not.toContain("?");
    expect(msg!.toLowerCase()).not.toContain("utm");
  });

  /* ---- navigator.share called on chromium when available ------------------ */

  test("tapping the action calls navigator.share with the composed text when share is available", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "the share-present branch is asserted on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);
    await gotoPlan(page);
    await stubCapturingShare(page);

    const expected = await readShareMessage(page);
    expect(expected).not.toBeNull();

    const action = page.locator(".tell-friend__btn");
    await expect(action).toBeVisible();
    await action.click();

    await expect.poll(async () =>
      page.evaluate(() => (window as unknown as { __sharedText?: string }).__sharedText),
    ).toBe(expected);
  });

  /* ---- clipboard fallback (chromium with share stubbed absent) ------------ */

  test("the action falls back to the clipboard + a transient 'Copied.' when share is absent (chromium)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "this is the chromium share-absent branch; the mobile branch is below");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);
    await gotoPlan(page);
    await stubNoShare(page);
    await stubCapturingClipboard(page);

    const expected = await readShareMessage(page);
    expect(expected).not.toBeNull();

    await page.locator(".tell-friend__btn").click();

    // The same composed text reaches the clipboard.
    await expect.poll(async () =>
      page.evaluate(() => (window as unknown as { __copiedText?: string }).__copiedText),
    ).toBe(expected);
    // And a transient confirmation renders in the editorial register.
    await expect(page.locator(".tell-friend__confirm")).toHaveText("Copied.");
  });

  /* ---- clipboard fallback asserted on mobile-webkit ----------------------- */

  test("mobile: the action is a ≥44×44 tap target and the clipboard fallback copies the composed text", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "this assertion is the mobile counterpart");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);
    await gotoPlan(page);
    // Drive the clipboard branch deterministically on WebKit.
    await stubNoShare(page);
    await stubCapturingClipboard(page);

    const action = page.locator(".tell-friend__btn");
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const expected = await readShareMessage(page);
    expect(expected).not.toBeNull();

    await action.click();
    await expect.poll(async () =>
      page.evaluate(() => (window as unknown as { __copiedText?: string }).__copiedText),
    ).toBe(expected);
    await expect(page.locator(".tell-friend__confirm")).toHaveText("Copied.");
  });

  /* ---- zero Anthropic calls during share ---------------------------------- */

  test("sharing fires zero Anthropic calls (the message is a pure local transform)", async ({ page }) => {
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);
    await gotoPlan(page);
    await stubNoShare(page);
    await stubCapturingClipboard(page);

    const beforeAnthro = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;
    await page.locator(".tell-friend__btn").click();
    await expect(page.locator(".tell-friend__confirm")).toHaveText("Copied.");
    const afterAnthro = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;
    expect(afterAnthro).toBe(beforeAnthro);
  });

  /* ---- the key never appears in the composed message ---------------------- */

  test("the Anthropic key never appears in the composed message (sentinel)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "sentinel assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);

    const msg = await readShareMessage(page);
    expect(msg).not.toBeNull();
    expect(msg!).not.toContain(SENTINEL_KEY);
  });

  /* ---- affordance ABSENT on a no-plan profile ----------------------------- */

  test("the affordance is ABSENT on a no-plan profile", async ({ page }) => {
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    // No composePlan — the plan page paints the first-compose empty state.
    await gotoPlan(page);
    await expect(page.locator("#compose-from-intake, #compose").first()).toBeVisible();
    await expect(page.locator(".tell-friend__btn")).toHaveCount(0);
  });

  /* ---- sex-specific marker name resolves to "Ferritin" -------------------- */

  test("a most-improved sex-specific marker resolves its human name to 'Ferritin' in the message", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "name-resolution assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    // Sex-specific key `ferritin_m`; the message must read "Ferritin", not the raw key.
    await seedPanel(page, {
      drawnAt: "2026-02-01", clearFirst: true,
      results: [{ markerKey: "ferritin_m", value: 35, unit: "ng/mL" }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-01",
      results: [{ markerKey: "ferritin_m", value: 60, unit: "ng/mL" }],
    });

    const msg = await readShareMessage(page);
    expect(msg).not.toBeNull();
    expect(msg!).toContain("Ferritin");
    expect(msg!).not.toContain("ferritin_m");
    expect(msg!).not.toContain("(Male)");
  });

  /* ---- banned-word-free copy + no emoji + no exclamation ------------------ */

  test("the composed copy honors the voice spec — no banned words, no emoji, no exclamation", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "voice-spec assertion runs on chromium");
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await seedFavorableMove(page);

    const msg = await readShareMessage(page);
    expect(msg).not.toBeNull();
    const lower = msg!.toLowerCase();
    for (const banned of ["journey", "amazing", "exciting", "great"]) {
      expect(lower).not.toContain(banned);
    }
    // No exclamation marks; the recommendation is stated plainly.
    expect(msg!).not.toContain("!");
    // No emoji (already covered by the ASCII assertion, but explicit here).
    expect(msg!).toMatch(/^[\x00-\x7F]*$/);
  });

  /* ---- the existing Plan actions are unchanged ---------------------------- */

  test("the existing Plan actions (view toggle, print/share, share-protocol link) are unchanged", async ({ page }) => {
    await onboard(page, { sex: "male", key: SENTINEL_KEY });
    await seedComposedPlan(page);
    await gotoPlan(page);

    // The view toggle still works.
    await expect(page.locator(".view-toggle")).toBeVisible();
    // The 0010 print/share + 0017 share-protocol affordances are still present.
    await expect(page.locator(".print-share__btn").first()).toBeVisible();
    await expect(page.locator("[data-action='share-protocol']")).toBeVisible();
    // The share-protocol modal still opens.
    await page.locator("[data-action='share-protocol']").click();
    await expect(page.locator(".share-modal")).toBeVisible();
  });

  /* ---- tour mode (0014) offers the affordance against the fixture plan ----- */

  test("tour mode offers 'Share with a friend' built from the sample plan (marker line present)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "tour-presence assertion runs on chromium");
    await enterTour(page);
    await gotoPlan(page);

    await expect(page.locator(".tell-friend__btn")).toBeVisible();
    const msg = await readShareMessage(page);
    expect(msg).not.toBeNull();
    // Built from the sample plan's top eat item.
    expect(msg!).toContain("Lean red meat");
    // The fixture carries ApoB 102 → 88 (a ≥2-draw favorable move) so the marker
    // line appears.
    expect(msg!).toContain("ApoB");
    expect(msg!).toContain("#/try");
  });

  /* ---- shared-view (0017) does NOT render the affordance ------------------ */

  test("shared-view does NOT render the affordance (the recipient is viewing a shared protocol)", async ({ page }) => {
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });
    await page.goto("/#/plan");
    await page.locator(".headline").first().waitFor();
    await expect(page.locator(".tell-friend__btn")).toHaveCount(0);
    // The recipient still sees the shared protocol body.
    await expect(page.locator(".section-mark").first()).toBeVisible();
  });
});

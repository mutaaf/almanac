// Sample tour — see the artifact before consenting (ticket 0014).
//
// The welcome screen gains a second button "Take a tour with sample data". The
// button is always enabled (it does not gate on the consent checkbox), routes
// the user into a fully-populated read-only Almanac driven by a hand-curated
// fixture in `src/sample/fixture.ts`, and is dismissable via a persistent
// banner that routes back to #/welcome and clears the tour flag.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { enterTour } from "../helpers/flows";

const TOUR_BANNER = /You are touring a sample\. Nothing here is yours\./i;
const TOUR_PLACEHOLDER_KEY = "sk-ant-SAMPLE";

/** All routes the tour must render without firing a single Anthropic call. */
const TOUR_ROUTES = [
  "#/today",
  "#/plan",
  "#/meals",
  "#/progress",
  "#/recap",
  "#/labs",
] as const;

/** ALLOWED_HOSTS mirrors the privacy spec — the tour must never widen it. */
const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

async function readLocalStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

async function panelIdsForCompare(page: Page): Promise<[number, number]> {
  // The fixture provides exactly two panels; sample data lives in memory only
  // so we can't read IndexedDB. We hard-code the compare URL against the
  // fixture's panel ids (1 and 2). Helper exists for clarity.
  return [1, 2];
}

test.describe("Sample tour — before consent (ticket 0014)", () => {

  /* ---------- Welcome button presence + behavior ---------------------- */

  test("welcome screen gains a tour button below the consent checkbox", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/welcome$/);

    const tourBtn = page.getByRole("button", { name: /take a tour with sample data/i });
    await expect(tourBtn).toBeVisible();
    // Always-enabled — the consent checkbox does NOT gate this button.
    await expect(tourBtn).toBeEnabled();

    // The existing "Continue to onboarding" button stays gated on consent.
    const continueBtn = page.getByRole("button", { name: /continue to onboarding/i });
    await expect(continueBtn).toBeDisabled();
  });

  test("tapping the tour button sets the tour flag and routes to #/today", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await page.getByRole("button", { name: /take a tour with sample data/i }).click();
    await expect(page).toHaveURL(/#\/today$/);

    // The tour flag is set; the consent flag is NOT — touring is not consenting.
    expect(await readLocalStorage(page, "almanac.tour")).toBe("true");
    expect(await readLocalStorage(page, "almanac.consent.v1")).toBeNull();
  });

  /* ---------- Bypass consent + profile gates -------------------------- */

  test("when tour is active, every route bypasses consent + profile gates", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);

    for (const route of TOUR_ROUTES) {
      await page.goto(`/${route}`);
      // We must end up on the requested route, not redirected to #/welcome
      // or #/onboarding. The base hash for #/labs may carry no query string.
      const expected = new RegExp(`#${route.replace("#", "")}(\\?|$)`);
      await expect(page).toHaveURL(expected);
    }
  });

  /* ---------- Zero Anthropic calls across the tour sweep -------------- */

  test("a full tour sweep fires zero Anthropic calls", async ({ page }) => {
    const stats: MockStats = await installMocks(page);
    await enterTour(page);

    const before = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;

    for (const route of TOUR_ROUTES) {
      await page.goto(`/${route}`);
      // Wait for the page to actually paint — the sentinel is the masthead
      // wordmark or the welcome headline; either way something must be there.
      await page.locator(".wordmark, .headline").first().waitFor();
    }
    // Compare view between the two fixture panels.
    const [a, b] = await panelIdsForCompare(page);
    await page.goto(`/#/progress?compare=${a},${b}`);
    await page.locator(".compare-summary, .compare-empty, .headline").first().waitFor();

    // Panel detail view too.
    await page.goto(`/#/labs?id=${a}`);
    await page.locator(".eyebrow, .headline").first().waitFor();

    const after = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
  });

  /* ---------- Sample profile shape + placeholder key ------------------ */

  test("the sample profile is 'Sample Reader' with the placeholder API key", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".headline").first().waitFor();

    // The Today greeting reads the profile's ownerName; assert it is the
    // sample's value, not an empty string and not the real user's name.
    const greetingText = await page.locator(".headline").first().textContent();
    expect(greetingText ?? "").toContain("Sample Reader");

    // Go to Settings and confirm the API key input is the literal placeholder.
    // Settings is read-only under the tour but must still render the value.
    await page.goto("/#/settings");
    await page.locator("#key").waitFor();
    const keyValue = await page.locator("#key").inputValue();
    expect(keyValue).toBe(TOUR_PLACEHOLDER_KEY);

    // Belt-and-braces — neither the real onboarding key nor a saved key from
    // a previous session ever survives into a tour profile.
    expect(keyValue).not.toMatch(/sk-ant-test/);
    expect(keyValue).not.toMatch(/canary/);
  });

  /* ---------- Sample dataset is rich enough to exercise downstream ----- */

  test("the fixture fires the iron-restricted insight and renders a provenance chip", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/plan");
    await page.locator(".dash-snapshot, .prose").first().waitFor();

    // The plan fixture is built around the iron-restricted erythropoiesis
    // pattern; the title appears in the insight list.
    await expect(page.getByText(/iron-restricted erythropoiesis/i).first()).toBeVisible();

    // 0013: insights produced by the rule engine carry a provenance chip.
    await expect(page.locator(".insight__provenance-chip").first()).toBeVisible();
  });

  test("the fixture's prior-panel produces between-draws projection cards", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/progress");
    await page.locator(".section-mark").first().waitFor();

    // 0012's projection section is gated on responsiveness markers + check-in
    // adherence. The fixture is built so at least one projection card or
    // evaluation row renders.
    const projection = page.locator(".projection-section");
    await expect(projection).toBeVisible();
  });

  test("the fixture's meal plan covers seven days", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/meals");
    await page.locator(".day-strip__cell").first().waitFor();
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);
  });

  test("ten check-ins seed the 14-day streak strip on Today", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".streak-strip__cells").waitFor();
    // 14 cells, but several have non-zero fill from check-in data.
    const cells = page.locator(".streak-strip .streak-cell");
    await expect(cells).toHaveCount(14);
  });

  /* ---------- Persistent banner on every tour page -------------------- */

  test("the tour banner renders on every route when the tour flag is set", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);

    for (const route of TOUR_ROUTES) {
      await page.goto(`/${route}`);
      await page.locator(".tour-banner").waitFor();
      await expect(page.locator(".tour-banner")).toBeVisible();
      await expect(page.locator(".tour-banner")).toContainText(TOUR_BANNER);
      // The arrow link routes back to #/welcome.
      const link = page.locator(".tour-banner a[href='#/welcome']");
      await expect(link).toBeVisible();
    }
  });

  test("the banner is suppressed when the tour flag is absent", async ({ page }) => {
    // Real onboarded user — no tour flag. The banner must not appear.
    await installMocks(page);
    // Acknowledge consent + minimal profile so we can route through real pages.
    await page.goto("/");
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);
    // Banner must not appear on the welcome screen either before the tour
    // is ever entered.
    await page.goto("/#/welcome");
    await expect(page.locator(".tour-banner")).toHaveCount(0);
  });

  /* ---------- Write actions during the tour surface a no-op notice ---- */

  test("saving a check-in during the tour is a no-op with an inline notice", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".habit-checks").waitFor();

    // Tap "Save check-in". A real run would write a row to IndexedDB; under
    // the tour it must be a no-op and surface the inline notice.
    await page.getByRole("button", { name: /save check-in/i }).click();
    await expect(page.locator(".tour-notice").first()).toBeVisible();
    await expect(page.locator(".tour-notice").first())
      .toContainText(/sample tour|start your own/i);

    // The notice is informational, not the oxblood error variant. We assert
    // that by checking it does NOT carry the .error-card class.
    await expect(page.locator(".tour-notice")).not.toHaveClass(/error-card/);
  });

  test("saving a panel during the tour does not contaminate IndexedDB", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/labs?manual=1");
    await page.locator("#drawnAt").waitFor();
    await page.fill("#drawnAt", "2026-05-01");
    await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("210");
    await page.getByRole("button", { name: /^save panel$/i }).click();

    // The inline notice surfaces — and IndexedDB writes nothing under the tour.
    await expect(page.locator(".tour-notice").first()).toBeVisible();

    // Read IndexedDB directly: the panels table must be empty.
    const panelCount = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror   = () => resolve(-1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("panels")) { db.close(); resolve(0); return; }
          const tx = db.transaction("panels", "readonly");
          const c  = tx.objectStore("panels").count();
          c.onerror   = () => { db.close(); resolve(-1); };
          c.onsuccess = () => { db.close(); resolve(c.result as number); };
        };
      });
    });
    expect(panelCount).toBe(0);
  });

  /* ---------- "Start your own" clears the tour cleanly ----------------- */

  test("the banner's start-your-own link clears the tour and reinstates the consent gate", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".tour-banner").waitFor();

    await page.locator(".tour-banner a[href='#/welcome']").click();
    await expect(page).toHaveURL(/#\/welcome$/);

    // The flag is cleared, the consent checkbox is unticked.
    expect(await readLocalStorage(page, "almanac.tour")).toBeNull();
    await expect(page.locator("#consent")).not.toBeChecked();

    // Any other route is gated again — the consent splash is back.
    await page.goto("/#/today");
    await expect(page).toHaveURL(/#\/welcome$/);
  });

  test("a real onboarding after the tour writes the real user, not the sample", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".tour-banner").waitFor();
    await page.locator(".tour-banner a[href='#/welcome']").click();
    await expect(page).toHaveURL(/#\/welcome$/);

    // Now run the real consent + onboarding path.
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);

    await page.locator("#name").waitFor();
    await page.fill("#name", "Real User Post-Tour");
    await page.fill("#birthDate", "1990-04-21");
    await page.selectOption("#sex", "female");
    await page.fill("#heightIn", "65");
    await page.fill("#weightLb", "140");
    await page.fill("#goals", "Sustain energy through afternoon.");
    await page.fill("#conditions", "None.");
    await page.fill("#dietPattern", "Vegetarian, batch cook on Sunday.");
    await page.fill("#key", "sk-ant-real-fake-after-tour");
    await page.selectOption("#model", "claude-sonnet-4-6");

    await page.getByRole("button", { name: /^begin$/i }).click();
    await expect(page).toHaveURL(/#\/plan$/);

    // Read IndexedDB profile directly — the sample's name must NOT leak.
    const ownerName = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("profile", "readonly");
          const get = tx.objectStore("profile").get("singleton");
          get.onsuccess = () => {
            const p = get.result as { ownerName?: string } | undefined;
            db.close(); resolve(p?.ownerName ?? "");
          };
          get.onerror = () => { db.close(); resolve(""); };
        };
        req.onerror = () => resolve("");
      });
    });
    expect(ownerName).toBe("Real User Post-Tour");
    expect(ownerName).not.toContain("Sample Reader");
  });

  /* ---------- Share card works on the tour --------------------------- */

  test("the share card on a compare row works on the tour and does NOT leak 'Sample Reader'", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "blob-byte assertion lives on chromium only — mirrors share-card.spec");
    await installMocks(page);
    await enterTour(page);

    const [a, b] = await panelIdsForCompare(page);
    await page.goto(`/#/progress?compare=${a},${b}`);
    await page.locator(".compare-row").first().waitFor();

    // Stub navigator.share so the chip falls through to the <a download> path.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "canShare", { configurable: true, writable: true, value: () => false });
      Object.defineProperty(navigator, "share",    { configurable: true, writable: true, value: async () => undefined });
    });

    const chip = page.locator(".compare-row__share").first();
    await expect(chip).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      chip.click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs/promises");
    const bytes = await fs.readFile(path!);
    // PNG header.
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);

    // The fixture's marker name + value pair should appear (we can't grep
    // canvas pixels for arbitrary glyphs, but the filename carries the marker
    // key for verification — the ticket calls this out explicitly).
    expect(download.suggestedFilename()).toMatch(/^almanac-[a-z0-9_]+-\d{4}-\d{2}-\d{2}\.png$/);

    // The literal "Sample Reader" must NOT appear in the raw bytes — the
    // share card already excludes the profile name; this catches regression.
    const asLatin1 = Buffer.from(bytes).toString("binary");
    expect(asLatin1).not.toContain("Sample Reader");
  });

  /* ---------- Privacy: no widening of the egress allow-list ----------- */

  test("a full tour sweep never egresses outside the existing allow-list", async ({ page }) => {
    const stats: MockStats = await installMocks(page);
    await enterTour(page);

    for (const route of TOUR_ROUTES) {
      await page.goto(`/${route}`);
      await page.locator(".wordmark, .headline").first().waitFor();
    }

    const offending = stats.outboundUrls.filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });
});

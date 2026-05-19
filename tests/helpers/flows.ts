// Reusable test flows. Composable — each flow is responsible for putting
// the page in a known state and verifying the navigation happened.
//
// Every flow assumes a fresh browser context (Playwright's default).

import { expect, type Page } from "@playwright/test";

/**
 * Acknowledge the consent splash. Always starts from "/", always ends on
 * "#/onboarding". Idempotent (a no-op if consent is already acknowledged).
 */
export async function acknowledgeConsent(page: Page): Promise<void> {
  await page.goto("/");
  // If consent is already acknowledged, the welcome gate sends us to
  // /onboarding (or wherever we tried to deep-link). Detect by URL.
  if (page.url().includes("#/welcome")) {
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
  }
  await expect(page).toHaveURL(/#\/(onboarding|today|labs|plan|meals|progress|settings)/);
}

interface OnboardOverrides {
  name?: string;
  birthDate?: string;
  sex?: "male" | "female" | "intersex" | "unspecified";
  heightIn?: number;
  weightLb?: number;
  goals?: string;
  conditions?: string;
  dietPattern?: string;
  key?: string;
  model?: string;
}

/**
 * Fill onboarding with a halal-pescatarian profile. Always starts from "/",
 * always ends on the plan first-compose state at "#/plan" (ticket 0007 —
 * after saving the intake form, the user lands on the plan page so the
 * first-compose-from-intake CTA is the first thing they see).
 * Acknowledges consent along the way.
 */
export async function onboard(page: Page, overrides: OnboardOverrides = {}): Promise<void> {
  await acknowledgeConsent(page);

  // If we already onboarded earlier in the test (unlikely with fresh context
  // but defensive), there's nothing to fill.
  if (!page.url().includes("#/onboarding")) return;

  const d = {
    name: "Test User",
    birthDate: "1990-01-15",
    sex: "male" as const,
    heightIn: 70,
    weightLb: 175,
    goals: "Lower cholesterol, more afternoon energy, hold easy habits.",
    conditions: "None.",
    dietPattern: "Halal, pescatarian-leaning. South Asian + Mediterranean. Cook 3 nights, batch on Sunday.",
    key: "sk-ant-test-fake-key",
    model: "claude-sonnet-4-6",
    ...overrides,
  };

  await page.locator("#name").waitFor({ state: "visible" });
  await page.fill("#name", d.name);
  await page.fill("#birthDate", d.birthDate);
  await page.selectOption("#sex", d.sex);
  await page.fill("#heightIn", String(d.heightIn));
  await page.fill("#weightLb", String(d.weightLb));
  await page.fill("#goals", d.goals);
  await page.fill("#conditions", d.conditions);
  await page.fill("#dietPattern", d.dietPattern);
  await page.fill("#key", d.key);
  await page.selectOption("#model", d.model);

  await page.getByRole("button", { name: /^begin$/i }).click();
  await expect(page).toHaveURL(/#\/plan$/);
  // Wait for the plan first-compose state to actually paint before returning;
  // mobile-webkit can race the next page action on initial render.
  await expect(page.locator(".eyebrow, .dash-snapshot, .prose").first()).toBeVisible();
}

/**
 * Add a panel via manual entry. Fills three markers and saves. Leaves the
 * page on the panel detail.
 */
export async function addManualPanel(page: Page): Promise<void> {
  await page.goto("/#/labs?manual=1");
  await page.locator("#drawnAt").waitFor({ state: "visible" });
  await page.fill("#drawnAt", "2026-05-01");
  await page.fill("#labName", "Test Lab");
  await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("244");
  await page.locator(".manual-row__input[data-key='triglycerides']").fill("165");
  await page.locator(".manual-row__input[data-key='vit_d_25oh']").fill("32");
  await page.getByRole("button", { name: /^save panel$/i }).click();
  await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
  // Wait for the panel detail to actually paint — the URL change beats the
  // render under Mobile WebKit load.
  await expect(page.locator(".result__name").first()).toBeVisible();
}

/**
 * Poll an IndexedDB store inside the page until a predicate passes (or the
 * timeout expires). WebKit on iOS occasionally delays the commit of a Dexie
 * write past the resolution of the awaiting promise; tests that expect a row
 * immediately after the write would otherwise read empty.
 *
 * `pred` lets a caller assert "at least 2 rows" or "row with planId X"
 * instead of just "anything"; default is "at least one row exists".
 */
export async function waitForDb(
  page: Page,
  store: "plans" | "mealPlans" | "panels" | "checkins",
  pred: (rowCount: number) => boolean = (n) => n > 0,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs  = opts.timeoutMs  ?? 10_000;
  const intervalMs = opts.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;

  // Read by opening a fresh connection to "almanac" — the same database the
  // SPA's Dexie instance uses, so we see the same rows once they've committed.
  while (Date.now() < deadline) {
    const count = await page.evaluate<number, string>((storeName) => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror   = () => resolve(0);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(0); return; }
          const tx = db.transaction(storeName, "readonly");
          const c  = tx.objectStore(storeName).count();
          c.onerror   = () => { db.close(); resolve(0); };
          c.onsuccess = () => { db.close(); resolve(c.result as number); };
        };
      });
    }, store);

    if (pred(count)) return;
    await page.waitForTimeout(intervalMs);
  }
  throw new Error(`waitForDb timed out after ${timeoutMs}ms waiting on "${store}"`);
}

/**
 * Enter the sample tour (ticket 0014). Starts from "/", taps the welcome
 * page's "Take a tour with sample data" button, and waits for the masthead
 * to settle on #/today. The tour flag (`localStorage["almanac.tour"]`) is
 * set as a side effect; the consent flag is NOT — touring is not consenting.
 *
 * Used by the sample-tour spec and the privacy-spec extension. Does not
 * touch IndexedDB; the tour reads from a hand-curated fixture.
 */
export async function enterTour(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveURL(/#\/welcome$/);
  await page.getByRole("button", { name: /take a tour with sample data/i }).click();
  await expect(page).toHaveURL(/#\/today$/);
  // Wait for the tour banner — it's the deterministic sentinel that the
  // tour-flag-aware router has actually painted, not just that the hash
  // changed.
  await page.locator(".tour-banner").waitFor();
}

/**
 * Exit the sample tour by clicking the banner's "Start your own" link.
 * Leaves the page on #/welcome with the consent checkbox unticked. Counterpart
 * to `enterTour`. Idempotent — if the banner isn't visible, it just visits
 * /welcome and returns.
 */
export async function exitTour(page: Page): Promise<void> {
  const banner = page.locator(".tour-banner a[href='#/welcome']");
  if (await banner.isVisible().catch(() => false)) {
    await banner.click();
    await expect(page).toHaveURL(/#\/welcome$/);
    return;
  }
  await page.goto("/#/welcome");
}

/**
 * Compose the plan. Mocks must already be installed. Leaves the page on /plan.
 *
 * The previous version of this helper had a `page.reload()` to dodge a
 * WebKit-only race where the post-compose render read latestPlan() before
 * IndexedDB had committed. The real fix lives in src/pages/plan.ts
 * (compose() now polls `latestPlan()` after the save and `await route()`s
 * the re-render). This helper waits for the page to settle into one of two
 * shapes — empty state with the Compose button, or dashboard with a plan —
 * before deciding what to do. `isVisible()` is an instantaneous snapshot
 * and would race the page's initial render on Mobile WebKit, which is why
 * this used to swallow the click on a slow boot.
 */
export async function composePlan(page: Page): Promise<void> {
  await page.goto("/#/plan");
  // Wait for the plan page to actually paint into one of its two shapes.
  // On Mobile WebKit the bootstrap can lag behind Playwright's `load` event
  // by 200–400ms; without this wait the next `isVisible()` is a coin flip.
  await page.locator(".dash-snapshot, .prose, #compose").first().waitFor();

  const composeBtn = page.locator("#compose");
  if (await composeBtn.isVisible().catch(() => false)) {
    await composeBtn.click();
    // The save has to complete (1 row in `plans`) before the dashboard
    // can paint. Polling the row count is robust to Mobile Safari's
    // slightly-delayed commit visibility under parallel load.
    await waitForDb(page, "plans", (n) => n >= 1, { timeoutMs: 30_000 });
  }
  await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });
}

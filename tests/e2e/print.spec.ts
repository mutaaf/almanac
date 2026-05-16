// Printable one-page protocol (ticket 0010).
//
// The Plan page exposes a "Print or share" affordance that mounts an inline
// panel with two audience options (doctor / friend) and a Generate button.
// Generating builds a `.print-sheet[data-audience]` into the live DOM, sets
// the suggested filename (via document.title) to `almanac-plan-YYYY-MM-DD`,
// and fires `window.print()`. The doctor variant carries panel data and
// marker-grounded reasoning; the friend variant strips labs and personal
// narrative. Generation is fully on-device — zero new network calls.
//
// Every acceptance-criteria checkbox on the ticket maps to a test below.
//
// Test browsers:
//   - chromium      : full path including print() invocation + filename.
//   - mobile-webkit : asserts UI render + share affordance is wired. The
//                     window.print() path itself is gated off webkit because
//                     Mobile Safari's print() opens a system dialog that
//                     Playwright cannot dismiss deterministically; that is
//                     a test-tooling limitation, not a product gap.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

/* -------------------------------------------------------------------------- */
/*  Common harness                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Stub `window.print` BEFORE any user-driven generation so the print dialog
 * never actually fires in the test browser. Records each invocation against
 * a global `__printCount`; tests read it to confirm the generate path got
 * all the way to the print step.
 */
async function stubPrint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as any).__printCount = 0;
    (window as any).__printTitleAtFire = null;
    const origPrint = window.print.bind(window);
    void origPrint;  // discard — we never call the real print in tests
    window.print = () => {
      (window as any).__printCount = ((window as any).__printCount ?? 0) + 1;
      (window as any).__printTitleAtFire = document.title;
    };
  });
}

async function readPrintCount(page: Page): Promise<number> {
  return page.evaluate(() => ((window as any).__printCount as number | undefined) ?? 0);
}

async function readPrintTitle(page: Page): Promise<string | null> {
  return page.evaluate(() => ((window as any).__printTitleAtFire as string | null) ?? null);
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Plan — print or share (ticket 0010)", () => {
  let stats: MockStats;

  test.beforeEach(async ({ page }) => {
    await stubPrint(page);
    stats = await installMocks(page);
    await onboard(page, {
      name: "Jane Doe",
      goals: "PRIVATE_GOAL_TOKEN: keep this out of the friend PDF.",
      conditions: "PRIVATE_CONDITION_TOKEN: also kept out of the friend PDF.",
      key: "sk-ant-canary-PRINT-12345",
    });
    await addManualPanel(page);
    await composePlan(page);
  });

  /* ----- the affordance ---------------------------------------------------- */

  test("a 'Print or share' control appears in the plan header in dashboard mode", async ({ page }) => {
    const btn = page.getByRole("button", { name: /print or share/i });
    await expect(btn).toBeVisible();
  });

  test("the 'Print or share' control is also present in Read mode", async ({ page }) => {
    await page.getByRole("button", { name: /^read$/i }).click();
    await expect(page.locator(".prose").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /print or share/i })).toBeVisible();
  });

  test("tapping the control opens an inline panel with audience options and a Generate button", async ({ page }) => {
    await page.getByRole("button", { name: /print or share/i }).click();
    const panel = page.locator(".print-share-panel");
    await expect(panel).toBeVisible();

    // Two audience options; default is doctor.
    const doctor = page.getByRole("radio", { name: /for my doctor/i });
    const friend = page.getByRole("radio", { name: /for a friend/i });
    await expect(doctor).toBeChecked();
    await expect(friend).not.toBeChecked();

    // The generate button.
    await expect(page.getByRole("button", { name: /generate pdf/i })).toBeVisible();
  });

  test("opening the panel does not change the route", async ({ page }) => {
    const hashBefore = await page.evaluate(() => location.hash);
    await page.getByRole("button", { name: /print or share/i }).click();
    await expect(page.locator(".print-share-panel")).toBeVisible();
    const hashAfter = await page.evaluate(() => location.hash);
    expect(hashAfter).toBe(hashBefore);
  });

  /* ----- generate (chromium only — see file header) ----------------------- */

  test("doctor PDF includes panels summary, insight marker refs, and the user's display name", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("radio", { name: /for my doctor/i }).check();
    await page.getByRole("button", { name: /generate pdf/i }).click();

    const sheet = page.locator(".print-sheet[data-audience='doctor']");
    await expect(sheet).toBeAttached();

    // Display name appears.
    await expect(sheet).toContainText("Jane Doe");
    // Snapshot text from the fixture plan.
    await expect(sheet).toContainText(/total cholesterol and triglycerides/i);
    // Insight text + marker references.
    await expect(sheet).toContainText(/soluble fiber, plant sterols/i);
    // Eat list including the "why" (markerKeys-aware reasoning).
    await expect(sheet).toContainText(/fatty fish/i);
    await expect(sheet).toContainText(/bile-acid binding/i);
    // Avoid list with the why.
    await expect(sheet).toContainText(/industrial seed oils/i);
    // Habit stack.
    await expect(sheet).toContainText(/1\/2 cup oats with breakfast/i);
    // Retest schedule.
    await expect(sheet).toContainText(/lipid response to food/i);
    // Panel summary block: most recent draw date + at least one out-of-range marker value.
    await expect(sheet).toContainText("2026-05-01");
    await expect(sheet).toContainText("244");  // total cholesterol value
  });

  test("doctor PDF excludes goals, conditions, household, API key, and meal-plan content", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("radio", { name: /for my doctor/i }).check();
    await page.getByRole("button", { name: /generate pdf/i }).click();

    const sheet = page.locator(".print-sheet[data-audience='doctor']");
    const html = (await sheet.innerHTML()).toLowerCase();

    expect(html).not.toContain("private_goal_token");
    expect(html).not.toContain("private_condition_token");
    expect(html).not.toContain("sk-ant-canary-print-12345");
    // No meal-plan content. (Habit cues legitimately contain words like
    // "breakfast" so we look for meal-plan-specific structure markers:
    // a grocery section heading, a meals-of-the-week strip, the standard
    // section headings that only the meal renderer emits.)
    expect(html).not.toContain("grocery");
    expect(html).not.toContain("this week's meals");
    expect(html).not.toContain("day-strip");
    expect(html).not.toContain("meal-tile");
  });

  test("friend PDF strips panel data, marker values, retest, and marker-keyed insight detail", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("radio", { name: /for a friend/i }).check();
    await page.getByRole("button", { name: /generate pdf/i }).click();

    const sheet = page.locator(".print-sheet[data-audience='friend']");
    await expect(sheet).toBeAttached();
    const text = (await sheet.textContent()) ?? "";

    // Has the user's display name.
    expect(text).toContain("Jane Doe");
    // Snapshot stays.
    expect(text).toMatch(/total cholesterol and triglycerides/i);
    // Eat list: titles + portions only — no "Why" lab-grounded copy.
    expect(text).toMatch(/fatty fish/i);
    expect(text).toMatch(/~4 oz cooked/i);
    expect(text.toLowerCase()).not.toContain("bile-acid binding");
    // Avoid list: titles + swap only — no "Why".
    expect(text).toMatch(/industrial seed oils/i);
    expect(text).toMatch(/olive oil/i);
    expect(text.toLowerCase()).not.toContain("pro-inflammatory");
    // Habit stack stays.
    expect(text).toMatch(/1\/2 cup oats with breakfast/i);
    // No panel data, no marker values, no retest cadence.
    expect(text).not.toContain("2026-05-01");
    expect(text).not.toContain("244");
    expect(text.toLowerCase()).not.toContain("retest");
    // The snapshot itself is included verbatim per the ticket; it may
    // legitimately use phrasing like "functional range / functional floor"
    // as part of the editorial summary. What must NOT appear is the
    // per-marker insight detail that quotes specific value anchors — the
    // numeric "244 mg/dL", "165 mg/dL", "32 ng/mL", "65 ng/mL" come from
    // `Insight.detail` strings, which the friend variant strips.
    expect(text.toLowerCase()).not.toContain("mg/dl");
    expect(text.toLowerCase()).not.toContain("ng/ml");
    // No personal narrative either.
    expect(text.toLowerCase()).not.toContain("private_goal_token");
    expect(text.toLowerCase()).not.toContain("private_condition_token");
  });

  test("friend PDF replaces the name with 'A user' when the hide-name toggle is checked", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("radio", { name: /for a friend/i }).check();
    await page.getByRole("checkbox", { name: /hide.*name/i }).check();
    await page.getByRole("button", { name: /generate pdf/i }).click();

    const sheet = page.locator(".print-sheet[data-audience='friend']");
    await expect(sheet).toBeAttached();
    const text = (await sheet.textContent()) ?? "";
    expect(text).not.toContain("Jane Doe");
    expect(text).toContain("A user");
  });

  test("generating fires window.print and sets the suggested filename to almanac-plan-YYYY-MM-DD", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("button", { name: /generate pdf/i }).click();

    await expect.poll(() => readPrintCount(page)).toBeGreaterThanOrEqual(1);
    const titleAtFire = await readPrintTitle(page);
    expect(titleAtFire).not.toBeNull();
    expect(titleAtFire!).toMatch(/^almanac-plan-\d{4}-\d{2}-\d{2}$/);
  });

  /* ----- privacy / no network -------------------------------------------- */

  test("generating fires zero new Anthropic calls", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    const before = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("button", { name: /generate pdf/i }).click();
    await expect(page.locator(".print-sheet")).toBeAttached();
    // Print fires synchronously after sheet mount; even so, give the page
    // a tick to fire any stray side-effects the implementation might add.
    await page.waitForTimeout(150);
    const after = stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
  });

  test("generating produces zero off-allow-list egress (no new hostnames)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    const ALLOWED = [
      "127.0.0.1", "localhost",
      "fonts.googleapis.com", "fonts.gstatic.com",
      "api.anthropic.com",
    ];
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("button", { name: /generate pdf/i }).click();
    await expect(page.locator(".print-sheet")).toBeAttached();

    const offending = stats.outboundUrls.filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("the API key is NEVER present in the print-sheet DOM (either audience)", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "window.print path asserted on chromium only");
    const SECRET = "sk-ant-canary-PRINT-12345";

    // Doctor variant.
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("button", { name: /generate pdf/i }).click();
    let html = await page.locator(".print-sheet[data-audience='doctor']").innerHTML();
    expect(html).not.toContain(SECRET);

    // Friend variant.
    await page.getByRole("button", { name: /print or share/i }).click();
    await page.getByRole("radio", { name: /for a friend/i }).check();
    await page.getByRole("button", { name: /generate pdf/i }).click();
    html = await page.locator(".print-sheet[data-audience='friend']").innerHTML();
    expect(html).not.toContain(SECRET);
  });

  /* ----- mobile parity --------------------------------------------------- */

  test("mobile: the share UI renders and the generate button is wired", async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "webkit", "this assertion is the mobile counterpart");
    // The panel opens.
    await page.getByRole("button", { name: /print or share/i }).click();
    await expect(page.locator(".print-share-panel")).toBeVisible();
    // Both audience options are present.
    await expect(page.getByRole("radio", { name: /for my doctor/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /for a friend/i })).toBeVisible();
    // Generate button is rendered and is not disabled.
    const gen = page.getByRole("button", { name: /generate pdf/i });
    await expect(gen).toBeVisible();
    await expect(gen).toBeEnabled();
    // The print-sheet template is reachable; verify by clicking generate and
    // confirming the sheet is mounted. (window.print is stubbed in beforeEach
    // so no system dialog appears.)
    await gen.click();
    await expect(page.locator(".print-sheet")).toBeAttached();
  });
});

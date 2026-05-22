// Try it with your numbers — the pre-key sandbox (ticket 0040).
//
// A gate-bypassed `#/try` route a skeptical prospect reaches from the welcome
// screen WITHOUT acknowledging consent or building a profile. They pick a
// marker from the curated seed, type a value they already know, and a row
// resolves instantly: the value, the unit, the lab range, the functional
// optimum, and the same `flag` the labs page computes via `flagFor()`. Once two
// or more rows exist, the 0036 report-card tally renders above them. Pure
// client-side render over MARKERS[] / findMarker() / flagFor() /
// computeReportCard() — no key, no upload, no Anthropic call, no IndexedDB.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard } from "../helpers/flows";

/** ALLOWED_HOSTS mirrors the privacy spec — the sandbox must never widen it. */
const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

/** Visit `#/try` directly and wait for the sandbox to paint. */
async function openTry(page: Page): Promise<void> {
  await page.goto("/#/try");
  await page.locator(".try").waitFor();
}

/** Pick a marker by its option value (the marker key), type a value, add it. */
async function addRow(page: Page, markerKey: string, value: number): Promise<void> {
  const before = await page.locator(".try__row").count();
  await page.selectOption("#try-marker", markerKey);
  await page.fill("#try-value", String(value));
  await page.locator("#try-add").click();
  await expect(page.locator(".try__row")).toHaveCount(before + 1);
}

test.describe("Try it with your numbers — pre-key sandbox (ticket 0040)", () => {

  /* ---------- Reachability before consent + profile -------------------- */

  test("#/try renders on a fresh browser with no consent and no profile", async ({ page }) => {
    await installMocks(page);
    // A first-time visitor — no consent flag, no IndexedDB profile.
    await page.goto("/#/try");
    await expect(page).toHaveURL(/#\/try$/);
    await expect(page.locator(".try")).toBeVisible();
    await expect(page.locator(".try .eyebrow")).toContainText(/try it with your numbers/i);
    await expect(page.locator("#try-marker")).toBeVisible();
    await expect(page.locator("#try-value")).toBeVisible();
  });

  /* ---------- A typed marker resolves to ranges + flag ----------------- */

  test("fasting insulin 8 resolves to lab 2–25, functional 2–5, suboptimal", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await addRow(page, "fasting_insulin", 8);

    const row = page.locator(".try__row").first();
    await expect(row.locator(".try__name")).toContainText("Fasting Insulin");
    await expect(row.locator(".try__num")).toContainText("8");
    await expect(row.locator(".try__unit")).toContainText("uIU/mL");
    await expect(row.locator(".try__ranges")).toContainText("2–25 uIU/mL");
    await expect(row.locator(".try__ranges")).toContainText("2–5 uIU/mL");
    await expect(row.locator(".try__flag")).toHaveText(/suboptimal/i);
    await expect(row.locator(".try__flag")).toHaveClass(/flag--suboptimal/);
  });

  /* ---------- All four flag classes ----------------------------------- */

  test("one marker, four typed values, one per flag class", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    // Fasting insulin: lab 2–25, optimal 2–5.
    //   1   below lab floor      → low
    //   30  above lab ceiling    → high
    //   8   in lab, above opt    → suboptimal
    //   3   in optimal range     → optimal
    const cases: Array<[number, RegExp]> = [
      [1, /flag--low/],
      [30, /flag--high/],
      [8, /flag--suboptimal/],
      [3, /flag--optimal/],
    ];
    for (let i = 0; i < cases.length; i += 1) {
      const [value] = cases[i]!;
      await addRow(page, "fasting_insulin", value);
    }
    const flags = page.locator(".try__row .try__flag");
    await expect(flags).toHaveCount(4);
    for (let i = 0; i < cases.length; i += 1) {
      const [, cls] = cases[i]!;
      await expect(flags.nth(i)).toHaveClass(cls);
    }
  });

  /* ---------- The report-card tally over 2+ rows ---------------------- */

  test("no tally with a single row; tally appears at two rows", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await addRow(page, "fasting_insulin", 3);          // optimal
    await expect(page.locator(".report-card")).toHaveCount(0);
    await addRow(page, "apo_b", 120);                  // high (lab ceiling 100)
    await expect(page.locator(".report-card")).toBeVisible();
  });

  test("the report card counts 1 optimal + 1 suboptimal + 1 out-of-range", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await addRow(page, "fasting_insulin", 3);   // optimal   (opt 2–5)
    await addRow(page, "apo_b", 90);            // suboptimal (lab ≤100, opt ≤80)
    await addRow(page, "hs_crp", 5);            // high      (lab ≤3)

    const line = page.locator(".report-card__line");
    await expect(line).toHaveText(
      /Of 3 markers, 1 is optimal\. 1 sits inside the lab's normal range but below the functional optimum\. 1 is outside the lab range\./,
    );
  });

  /* ---------- Row removal recomputes the tally ----------------------- */

  test("removing a row recomputes the tally and hides it below two rows", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await addRow(page, "fasting_insulin", 3);   // optimal
    await addRow(page, "apo_b", 90);            // suboptimal
    await addRow(page, "hs_crp", 5);            // out of range
    await expect(page.locator(".report-card__line")).toContainText("Of 3 markers");

    // Remove the out-of-range row (the third). The tally recomputes to 2.
    await page.locator(".try__row").nth(2).locator(".try__remove").click();
    await expect(page.locator(".try__row")).toHaveCount(2);
    await expect(page.locator(".report-card__line")).toContainText("Of 2 markers");

    // Remove another — below two rows the tally disappears entirely.
    await page.locator(".try__row").nth(1).locator(".try__remove").click();
    await expect(page.locator(".try__row")).toHaveCount(1);
    await expect(page.locator(".report-card")).toHaveCount(0);
  });

  /* ---------- Nothing persists across reload ------------------------- */

  test("typed values are gone on reload — nothing is persisted", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await addRow(page, "fasting_insulin", 8);
    await addRow(page, "apo_b", 90);
    await expect(page.locator(".try__row")).toHaveCount(2);

    await page.reload();
    await page.locator(".try").waitFor();
    await expect(page.locator(".try__row")).toHaveCount(0);
  });

  /* ---------- Identical render with/without a profile (no DB read) --- */

  test("renders identically whether or not a profile exists in IndexedDB", async ({ page }) => {
    await installMocks(page);
    // Pre-profile render: marker option count.
    await openTry(page);
    const optionsBefore = await page.locator("#try-marker option[value]").count();
    expect(optionsBefore).toBeGreaterThan(0);

    // Build a real profile in IndexedDB, then revisit the sandbox.
    await onboard(page, { sex: "female" });
    await openTry(page);
    const optionsAfter = await page.locator("#try-marker option[value]").count();
    // Same curated seed regardless of profile — the page reads no IndexedDB,
    // so a female profile does not filter the picker by sex.
    expect(optionsAfter).toBe(optionsBefore);
    // And it still resolves a row the same way with a profile present.
    await addRow(page, "fasting_insulin", 8);
    await expect(page.locator(".try__row .try__flag").first()).toHaveClass(/flag--suboptimal/);
  });

  /* ---------- No key / upload / compose control --------------------- */

  test("exposes only the sandbox controls — no key, upload, or compose", async ({ page }) => {
    await installMocks(page);
    await openTry(page);

    // The pieces that SHOULD exist.
    await expect(page.locator("#try-marker")).toBeVisible();
    await expect(page.locator("#try-value")).toBeVisible();
    await expect(page.locator("#try-add")).toBeVisible();
    await expect(page.getByRole("link", { name: /start your own/i })).toBeVisible();

    // The pieces that MUST NOT exist anywhere on the page.
    await expect(page.locator("#key")).toHaveCount(0);
    await expect(page.locator("input[type='password']")).toHaveCount(0);
    await expect(page.locator("input[type='file']")).toHaveCount(0);
    await expect(page.locator(".dropzone")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /compose|generate/i })).toHaveCount(0);
  });

  /* ---------- Zero network beyond the shell ------------------------- */

  test("the full type-and-resolve flow fires zero off-allow-list egress", async ({ page }) => {
    const stats = await installMocks(page);
    await openTry(page);
    const before = stats.outboundUrls.length;

    await addRow(page, "fasting_insulin", 8);
    await addRow(page, "apo_b", 90);
    await addRow(page, "hs_crp", 5);
    await expect(page.locator(".report-card__line")).toBeVisible();

    const after = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(after).toEqual([]);

    // And specifically: no inference call to api.anthropic.com fired.
    const anthropic = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  /* ---------- Open / closed range formatting ------------------------ */

  test("open-high, open-low, and closed ranges render honestly", async ({ page }) => {
    await installMocks(page);
    await openTry(page);

    // hs-CRP: lab high-only (≤ 3.0), optimal high-only (≤ 1.0).
    await addRow(page, "hs_crp", 0.8);
    const crp = page.locator(".try__row").first();
    await expect(crp.locator(".try__ranges")).toContainText("≤ 3 mg/L");
    await expect(crp.locator(".try__ranges")).toContainText("≤ 1 mg/L");

    // Omega-3 Index: lab low-only (≥ 4), optimal low-only (≥ 8).
    await addRow(page, "omega_3_index", 6);
    const omega = page.locator(".try__row").nth(1);
    await expect(omega.locator(".try__ranges")).toContainText("≥ 4 %");
    await expect(omega.locator(".try__ranges")).toContainText("≥ 8 %");

    // Fasting insulin: closed lab (2–25) and closed optimal (2–5).
    await addRow(page, "fasting_insulin", 8);
    const ins = page.locator(".try__row").nth(2);
    await expect(ins.locator(".try__ranges")).toContainText("2–25 uIU/mL");
    await expect(ins.locator(".try__ranges")).toContainText("2–5 uIU/mL");
  });

  /* ---------- The standing disclaimer ------------------------------- */

  test("carries the informational-not-medical-advice disclaimer", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await expect(page.locator(".colophon")).toContainText(/informational, not medical advice/i);
  });

  /* ---------- The welcome link routes here -------------------------- */

  test("the welcome screen carries a 'Try it with your numbers' link that routes to #/try", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/welcome$/);
    const link = page.getByRole("link", { name: /try it with your numbers/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#\/try$/);
    await expect(page.locator(".try")).toBeVisible();
    // The sample-tour entry point still works and is unchanged.
    await page.goto("/");
    await expect(page.getByRole("button", { name: /take a tour with sample data/i })).toBeVisible();
  });

  /* ---------- 'Start your own' routes back to the gate -------------- */

  test("'Start your own' routes to #/welcome", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await page.getByRole("link", { name: /start your own/i }).click();
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(page.locator(".welcome")).toBeVisible();
  });

  /* ---------- Mobile rendering + tap targets ------------------------ */

  test("renders cleanly at 390px with tap targets ≥44px and no overflow", async ({ page }) => {
    await installMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openTry(page);
    await addRow(page, "fasting_insulin", 8);

    // The value input and add control are ≥44×44 css px tap targets.
    const valueBox = await page.locator("#try-value").boundingBox();
    const addBox = await page.locator("#try-add").boundingBox();
    expect(valueBox!.height).toBeGreaterThanOrEqual(44);
    expect(addBox!.height).toBeGreaterThanOrEqual(44);
    expect(addBox!.width).toBeGreaterThanOrEqual(44);

    // The resolved row does not overflow the viewport horizontally.
    const rowBox = await page.locator(".try__row").first().boundingBox();
    expect(rowBox!.x).toBeGreaterThanOrEqual(0);
    expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390 + 1);
  });
});

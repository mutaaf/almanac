// The functional-range reference — read the marker library before the gate (ticket 0038).
//
// A read-only, gate-bypassed `#/reference` route a precision-health-literate
// prospect reaches WITHOUT acknowledging consent or building a profile. It
// renders the static `MARKERS[]` seed grouped by category, each row showing
// name/shortName, unit, lab range, functional/optimal range, and the marker's
// curated description. Pure render of static bundle data: no Dexie, no key, no
// network. The single off-page affordance is "Start your own" → `#/welcome`.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard } from "../helpers/flows";

/** ALLOWED_HOSTS mirrors the privacy spec — the reference must never widen it. */
const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

/** Visit `#/reference` directly and wait for the page to paint. */
async function openReference(page: Page): Promise<void> {
  await page.goto("/#/reference");
  await page.locator(".reference").waitFor();
}

/** Seed a user-defined marker (ticket 0002) into IndexedDB. */
async function seedUserMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("almanac");
      req.onerror = () => reject(req.error ?? new Error("open failed"));
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("markers")) { db.close(); resolve(); return; }
        const tx = db.transaction("markers", "readwrite");
        tx.objectStore("markers").put({
          key: "user_zonulin",
          name: "Zonulin (user-defined)",
          category: "other",
          unit: "ng/mL",
          aliases: ["zonulin"],
          optimalRange: { high: 30 },
          description: "A user-authored marker that must never appear on the public reference.",
          createdAt: Date.now(),
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("tx failed")); };
      };
    });
  });
}

test.describe("The functional-range reference — pre-gate marker library (ticket 0038)", () => {

  /* ---------- Reachable pre-consent + pre-profile ---------------------- */

  test("#/reference renders on a fresh browser with no consent and no profile", async ({ page }) => {
    await installMocks(page);
    // A first-time visitor — no consent flag, no IndexedDB profile.
    await page.goto("/#/reference");
    await expect(page).toHaveURL(/#\/reference$/);
    await expect(page.locator(".reference")).toBeVisible();
    await expect(page.locator(".reference .eyebrow")).toContainText(/the marker reference/i);
    // The library renders sections and rows from the static seed.
    expect(await page.locator(".reference__section").count()).toBeGreaterThan(1);
    expect(await page.locator(".reference__row").count()).toBeGreaterThan(10);
  });

  /* ---------- A known marker shows name/unit/both-ranges/description --- */

  test("fasting insulin shows unit, lab 2–25, functional 2–5, and its description", async ({ page }) => {
    await installMocks(page);
    await openReference(page);

    const row = page.locator(".reference__row[data-key='fasting_insulin']");
    await expect(row).toHaveCount(1);
    await expect(row.locator(".reference__name")).toContainText("Fasting Insulin");
    await expect(row.locator(".reference__unit")).toContainText("uIU/mL");
    await expect(row.locator(".reference__lab")).toContainText("2–25");
    await expect(row.locator(".reference__functional")).toContainText("2–5");
    await expect(row.locator(".reference__desc")).toContainText(/functional optimum is 2–5/i);
  });

  /* ---------- Open / closed range formatting render honestly ----------- */

  test("open-high, open-low, and closed ranges render honestly", async ({ page }) => {
    await installMocks(page);
    await openReference(page);

    // HbA1c: lab high-only (≤ 5.6%), functional closed (4.6–5.3).
    const a1c = page.locator(".reference__row[data-key='hba1c']");
    await expect(a1c.locator(".reference__lab")).toContainText("≤ 5.6");
    await expect(a1c.locator(".reference__functional")).toContainText("4.6–5.3");

    // Omega-3 Index: lab low-only (≥ 4), functional low-only (≥ 8).
    const omega = page.locator(".reference__row[data-key='omega_3_index']");
    await expect(omega.locator(".reference__lab")).toContainText("≥ 4");
    await expect(omega.locator(".reference__functional")).toContainText("≥ 8");

    // Fasting insulin: closed lab (2–25) and closed functional (2–5).
    const ins = page.locator(".reference__row[data-key='fasting_insulin']");
    await expect(ins.locator(".reference__lab")).toContainText("2–25");
    await expect(ins.locator(".reference__functional")).toContainText("2–5");
  });

  /* ---------- Markers grouped by category ----------------------------- */

  test("markers are grouped under their category sections", async ({ page }) => {
    await installMocks(page);
    await openReference(page);

    // Metabolic carries fasting insulin; lipids carries ApoB; cardio carries
    // the omega-3 index — each row lives under its category's section.
    const metabolic = page.locator(".reference__section[data-category='metabolic']");
    await expect(metabolic).toHaveCount(1);
    await expect(metabolic.locator(".reference__row[data-key='fasting_insulin']")).toHaveCount(1);

    const lipids = page.locator(".reference__section[data-category='lipids']");
    await expect(lipids.locator(".reference__row[data-key='apo_b']")).toHaveCount(1);

    const cardio = page.locator(".reference__section[data-category='cardio']");
    await expect(cardio.locator(".reference__row[data-key='omega_3_index']")).toHaveCount(1);

    // Every section carries a visible heading.
    await expect(metabolic.locator(".reference__heading")).toBeVisible();
  });

  /* ---------- The welcome link routes here ---------------------------- */

  test("the welcome screen carries a 'Read the marker reference' link that routes to #/reference", async ({ page }) => {
    await installMocks(page);
    await page.goto("/");
    await expect(page).toHaveURL(/#\/welcome$/);
    const link = page.getByRole("link", { name: /read the marker reference/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/#\/reference$/);
    await expect(page.locator(".reference")).toBeVisible();
    // The sample-tour and try entry points still work and are unchanged.
    await page.goto("/");
    await expect(page.getByRole("button", { name: /take a tour with sample data/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /try it with your numbers/i })).toBeVisible();
  });

  /* ---------- 'Start your own' routes back to the gate ---------------- */

  test("'Start your own' routes to #/welcome and reinstates the gate", async ({ page }) => {
    await installMocks(page);
    await openReference(page);
    await page.getByRole("link", { name: /start your own/i }).click();
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(page.locator(".welcome")).toBeVisible();
  });

  /* ---------- No write / compose / key / upload control --------------- */

  test("exposes only the read content + 'Start your own' — no key, upload, or compose", async ({ page }) => {
    await installMocks(page);
    await openReference(page);

    // The pieces that SHOULD exist.
    await expect(page.locator(".reference__section").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /start your own/i })).toBeVisible();

    // The pieces that MUST NOT exist anywhere on the page.
    await expect(page.locator("#key")).toHaveCount(0);
    await expect(page.locator("input[type='password']")).toHaveCount(0);
    await expect(page.locator("input[type='file']")).toHaveCount(0);
    await expect(page.locator(".dropzone")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /compose|generate|upload|save/i })).toHaveCount(0);
  });

  /* ---------- Identical render with/without a profile (no DB read) ---- */

  test("renders identically whether or not a profile exists in IndexedDB", async ({ page }) => {
    await installMocks(page);
    // Pre-profile render: capture the rendered library markup.
    await openReference(page);
    const before = await page.locator(".reference__list").innerHTML();
    const rowsBefore = await page.locator(".reference__row").count();
    expect(rowsBefore).toBeGreaterThan(10);

    // Build a real (female) profile in IndexedDB, then revisit the reference.
    await onboard(page, { sex: "female" });
    await openReference(page);
    const after = await page.locator(".reference__list").innerHTML();
    const rowsAfter = await page.locator(".reference__row").count();

    // Byte-identical: the reference reads no IndexedDB, so a female profile
    // does not filter the library by sex — it is the same for everyone.
    expect(rowsAfter).toBe(rowsBefore);
    expect(after).toBe(before);
  });

  /* ---------- User-defined markers absent ----------------------------- */

  test("a user-defined marker does NOT appear on the reference", async ({ page }) => {
    await installMocks(page);
    // Onboard so the markers store exists, then seed a user marker.
    await onboard(page, { sex: "male" });
    await seedUserMarker(page);

    await openReference(page);
    // The user marker key is never rendered — the reference is the curated seed.
    await expect(page.locator(".reference__row[data-key='user_zonulin']")).toHaveCount(0);
    await expect(page.locator(".reference")).not.toContainText("Zonulin (user-defined)");
    // The built-in seed still renders fully.
    await expect(page.locator(".reference__row[data-key='fasting_insulin']")).toHaveCount(1);
  });

  /* ---------- The standing disclaimer -------------------------------- */

  test("carries the informational-not-medical-advice disclaimer", async ({ page }) => {
    await installMocks(page);
    await openReference(page);
    await expect(page.locator(".colophon")).toContainText(/informational, not medical advice/i);
  });

  /* ---------- Zero network beyond the shell -------------------------- */

  test("rendering the reference fires zero off-allow-list egress and no inference call", async ({ page }) => {
    const stats = await installMocks(page);
    const before = stats.outboundUrls.length;
    await openReference(page);
    await expect(page.locator(".reference__row").first()).toBeVisible();

    const offending = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);

    // And specifically: no inference call to api.anthropic.com fired.
    const anthropic = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  /* ---------- Mobile rendering — no horizontal overflow --------------- */

  test("renders cleanly at 390px with no horizontal overflow", async ({ page }) => {
    await installMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openReference(page);

    // The first marker row fits inside the viewport (long names + descriptions
    // respect min-width: 0, the documented overflow fix).
    const rowBox = await page.locator(".reference__row").first().boundingBox();
    expect(rowBox!.x).toBeGreaterThanOrEqual(0);
    expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390 + 1);

    // The document itself does not scroll horizontally.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

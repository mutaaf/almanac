// Paste your labs into the sandbox — the pre-key paste-and-score path (ticket 0055).
//
// The typed-marker sandbox (#/try, ticket 0040) gains a restrained "Or paste
// your report" affordance: a textarea + "Score it" action. A skeptical prospect
// who has their patient-portal report open in another tab pastes the raw blob;
// a pure, deterministic, no-LLM recognizer (`parsePastedLabText`, reusing the
// alias-match layer in src/data/markers.ts) pulls out the markers it recognizes
// and drops each into the SAME resolved-row + 0036 report-card render a typed
// row produces. Unrecognized lines are silently skipped. No key, no upload, no
// Anthropic call, NO IndexedDB read or write — the pasted text and parsed rows
// live only in page memory and are gone on reload.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard } from "../helpers/flows";

/** ALLOWED_HOSTS mirrors the privacy spec — the paste path must never widen it. */
const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

/** A realistic patient-portal blob: four recognizable markers, mixed units,
 *  the messy "Marker value unit" line shape a portal exports. */
const FOUR_MARKER_BLOB = [
  "MyChart — Comprehensive Panel · drawn 2026-05-01",
  "Apolipoprotein B (ApoB)   110 mg/dL",
  "Fasting Insulin           8 uIU/mL",
  "Vitamin D, 25-Hydroxy     32 ng/mL",
  "hs-CRP                    0.8 mg/L",
].join("\n");

/** Three recognizable markers buried in ten lines of CBC noise, the lab's
 *  address, and free prose — the recognizer must skip all the noise. */
const NOISE_BLOB = [
  "Quest Diagnostics, 123 Main St, Anytown, CA 90210",
  "Patient: Jane Q. Public   DOB: 01/01/1990",
  "Specimen collected: 2026-05-01 07:42",
  "Apolipoprotein B   110 mg/dL",
  "Color: Yellow   Clarity: Clear",
  "Please discuss these results with your physician.",
  "Fasting Insulin   8 uIU/mL",
  "RBC morphology: Normocytic, normochromic",
  "This report is confidential and intended only for the named patient.",
  "Hemoglobin and hematocrit within reference limits.",
  "hs-CRP   0.8 mg/L",
  "Account #: 0098-2231-XX   Ordering provider: Dr. Smith",
  "Notes: fasting 12 hours prior to draw.",
].join("\n");

/** Visit `#/try` directly and wait for the sandbox to paint. */
async function openTry(page: Page): Promise<void> {
  await page.goto("/#/try");
  await page.locator(".try").waitFor();
}

/** Fill the paste textarea and tap "Score it". */
async function pasteAndScore(page: Page, text: string): Promise<void> {
  await page.locator(".try__paste-input").fill(text);
  await page.locator(".try__paste-score").click();
}

test.describe("Paste your labs into the sandbox (ticket 0055)", () => {

  /* ---------- AC: the paste affordance renders pre-consent --------------- */

  test("#/try shows BOTH the marker picker and the paste affordance pre-consent", async ({ page }) => {
    await installMocks(page);
    // A first-time visitor — no consent flag, no IndexedDB profile.
    await page.goto("/#/try");
    await expect(page).toHaveURL(/#\/try$/);
    // The existing picker path is present and unchanged.
    await expect(page.locator("#try-marker")).toBeVisible();
    await expect(page.locator("#try-value")).toBeVisible();
    await expect(page.locator("#try-add")).toBeVisible();
    // The new paste affordance is present.
    await expect(page.locator(".try__paste-input")).toBeVisible();
    await expect(page.locator(".try__paste-score")).toBeVisible();
  });

  /* ---------- AC: parsePastedLabText is a pure deterministic parse ------ */

  test("parsePastedLabText returns one {key,value} per recognized line, in order", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    // Exercise the pure exported function directly — no DOM, no network.
    const parsed = await page.evaluate(async (blob) => {
      const mod = await import("/src/sandbox/parse-pasted.ts");
      return mod.parsePastedLabText(blob);
    }, NOISE_BLOB);

    // Exactly the three recognized markers parse, in the order encountered;
    // every noise line is skipped.
    expect(parsed).toEqual([
      { key: "apo_b", value: 110 },
      { key: "fasting_insulin", value: 8 },
      { key: "hs_crp", value: 0.8 },
    ]);
  });

  test("parsePastedLabText collapses a duplicate key to one entry (last value wins)", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    const parsed = await page.evaluate(async () => {
      const mod = await import("/src/sandbox/parse-pasted.ts");
      return mod.parsePastedLabText("Apolipoprotein B 95 mg/dL\nApolipoprotein B 130 mg/dL");
    });
    expect(parsed).toEqual([{ key: "apo_b", value: 130 }]);
  });

  test("parsePastedLabText returns [] for prose with no recognizable markers", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    const parsed = await page.evaluate(async () => {
      const mod = await import("/src/sandbox/parse-pasted.ts");
      return mod.parsePastedLabText("Thank you for your visit. Call the office with questions.");
    });
    expect(parsed).toEqual([]);
  });

  /* ---------- AC: a portal blob parses to recognized rows with flags ---- */

  test("pasting a 4-marker blob renders 4 resolved rows with the correct flags", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await pasteAndScore(page, FOUR_MARKER_BLOB);

    await expect(page.locator(".try__row")).toHaveCount(4);

    // ApoB 110 → lab ≤100 → high (out of range).
    const apob = page.locator(".try__row").nth(0);
    await expect(apob.locator(".try__name")).toContainText("ApoB");
    await expect(apob.locator(".try__num")).toContainText("110");
    await expect(apob.locator(".try__unit")).toContainText("mg/dL");
    await expect(apob.locator(".try__flag")).toHaveClass(/flag--high/);

    // Fasting insulin 8 → lab 2–25, opt 2–5 → suboptimal.
    const insulin = page.locator(".try__row").nth(1);
    await expect(insulin.locator(".try__name")).toContainText("Fasting Insulin");
    await expect(insulin.locator(".try__num")).toContainText("8");
    await expect(insulin.locator(".try__flag")).toHaveClass(/flag--suboptimal/);

    // Vitamin D 32 → lab 30–100, opt 50–80 → suboptimal.
    const vitd = page.locator(".try__row").nth(2);
    await expect(vitd.locator(".try__name")).toContainText("Vitamin D");
    await expect(vitd.locator(".try__num")).toContainText("32");
    await expect(vitd.locator(".try__flag")).toHaveClass(/flag--suboptimal/);

    // hs-CRP 0.8 → lab ≤3, opt ≤1 → optimal.
    const crp = page.locator(".try__row").nth(3);
    await expect(crp.locator(".try__name")).toContainText("hs-CRP");
    await expect(crp.locator(".try__num")).toContainText("0.8");
    await expect(crp.locator(".try__flag")).toHaveClass(/flag--optimal/);

    // The textarea is cleared after a successful parse.
    await expect(page.locator(".try__paste-input")).toHaveValue("");
  });

  /* ---------- AC: pasted rows render identically to typed rows ---------- */

  test("a pasted row is byte-identical in render to a typed row", async ({ page }) => {
    await installMocks(page);
    await openTry(page);

    // Type a fasting insulin 8 row.
    await page.selectOption("#try-marker", "fasting_insulin");
    await page.fill("#try-value", "8");
    await page.locator("#try-add").click();
    const typedHtml = await page.locator(".try__row").first().innerHTML();

    // Reload to clear, then paste the same marker+value.
    await page.reload();
    await page.locator(".try").waitFor();
    await pasteAndScore(page, "Fasting Insulin 8 uIU/mL");
    const pastedHtml = await page.locator(".try__row").first().innerHTML();

    // The two render the same name/value/ranges/flag/remove markup (modulo the
    // remove button's data-index, which is identical at index 0 for both).
    expect(pastedHtml).toBe(typedHtml);
  });

  /* ---------- AC: unrecognized lines are silently skipped --------------- */

  test("a blob of 3 markers + 10 noise lines renders exactly 3 rows, no error", async ({ page }) => {
    await installMocks(page);
    await openTry(page);

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await pasteAndScore(page, NOISE_BLOB);
    await expect(page.locator(".try__row")).toHaveCount(3);
    // The address, account #, prose, and CBC noise produced no rows and no throw.
    expect(errors).toEqual([]);
  });

  /* ---------- AC: the report-card tally renders over 2+ pasted rows ----- */

  test("the tally counts 1 optimal + 1 suboptimal + 1 out-of-range from a paste", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    // hs-CRP 0.8 → optimal; Vitamin D 32 → suboptimal; ApoB 110 → out of range.
    await pasteAndScore(page, [
      "hs-CRP 0.8 mg/L",
      "Vitamin D, 25-Hydroxy 32 ng/mL",
      "Apolipoprotein B 110 mg/dL",
    ].join("\n"));

    await expect(page.locator(".try__row")).toHaveCount(3);
    await expect(page.locator(".report-card__line")).toHaveText(
      /Of 3 markers, 1 is optimal\. 1 sits inside the lab's normal range but below the functional optimum\. 1 is outside the lab range\./,
    );
  });

  /* ---------- AC: duplicate reconciliation — one row, last value wins --- */

  test("two ApoB lines in one paste reconcile to a single row (last value wins)", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await pasteAndScore(page, [
      "Apolipoprotein B 95 mg/dL",
      "Apolipoprotein B 130 mg/dL",
    ].join("\n"));

    await expect(page.locator(".try__row")).toHaveCount(1);
    // Last value (130) wins.
    await expect(page.locator(".try__row").first().locator(".try__num")).toContainText("130");
  });

  test("a pasted marker already present as a typed row updates that row, not a duplicate", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    // Type ApoB 95.
    await page.selectOption("#try-marker", "apo_b");
    await page.fill("#try-value", "95");
    await page.locator("#try-add").click();
    await expect(page.locator(".try__row")).toHaveCount(1);

    // Paste ApoB 130 — same key — reconciles to one row, last value wins.
    await pasteAndScore(page, "Apolipoprotein B 130 mg/dL");
    await expect(page.locator(".try__row")).toHaveCount(1);
    await expect(page.locator(".try__row").first().locator(".try__num")).toContainText("130");
  });

  /* ---------- AC: no recognized markers → a calm empty note ------------- */

  test("pasting pure prose shows the empty note and adds no rows", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await pasteAndScore(page,
      "Thank you for visiting. Your results are being reviewed by the care team. " +
      "Please call the office with any questions about your visit.");

    await expect(page.locator(".try__row")).toHaveCount(0);
    await expect(page.locator(".try__paste-note")).toBeVisible();
    await expect(page.locator(".try__paste-note")).toContainText(
      /No markers we recognize yet/i,
    );
  });

  /* ---------- AC: nothing persists across reload ------------------------ */

  test("pasted rows are gone on reload — nothing is persisted", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await pasteAndScore(page, FOUR_MARKER_BLOB);
    await expect(page.locator(".try__row")).toHaveCount(4);

    await page.reload();
    await page.locator(".try").waitFor();
    await expect(page.locator(".try__row")).toHaveCount(0);
    await expect(page.locator(".try__paste-input")).toHaveValue("");
  });

  /* ---------- AC: identical render with/without a profile (no DB read) -- */

  test("the paste path renders identically whether or not a profile exists", async ({ page }) => {
    await installMocks(page);
    // Pre-profile: paste resolves these markers.
    await openTry(page);
    await pasteAndScore(page, FOUR_MARKER_BLOB);
    const before = await page.locator(".try__row").count();
    expect(before).toBe(4);

    // Build a real profile in IndexedDB, then revisit and paste the same blob.
    await onboard(page, { sex: "female" });
    await openTry(page);
    await pasteAndScore(page, FOUR_MARKER_BLOB);
    const after = await page.locator(".try__row").count();
    // Same recognized count regardless of profile — the page reads no IndexedDB,
    // so a female profile does not change which lines parse.
    expect(after).toBe(before);
  });

  /* ---------- AC: no key / upload / compose control on the page --------- */

  test("the paste path adds no key, upload, or compose control", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await pasteAndScore(page, FOUR_MARKER_BLOB);

    // The paste affordance + existing sandbox controls SHOULD exist.
    await expect(page.locator(".try__paste-input")).toBeVisible();
    await expect(page.locator(".try__paste-score")).toBeVisible();
    await expect(page.locator("#try-marker")).toBeVisible();
    await expect(page.getByRole("link", { name: /start your own/i })).toBeVisible();

    // No key / upload / compose control anywhere on the page.
    await expect(page.locator("#key")).toHaveCount(0);
    await expect(page.locator("input[type='password']")).toHaveCount(0);
    await expect(page.locator("input[type='file']")).toHaveCount(0);
    await expect(page.locator(".dropzone")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /compose|generate|extract/i })).toHaveCount(0);
  });

  /* ---------- AC: zero Anthropic + zero off-allow-list network ---------- */

  test("the full paste-and-score flow fires zero off-allow-list egress and zero inference", async ({ page }) => {
    const stats = await installMocks(page);
    await openTry(page);
    const before = stats.outboundUrls.length;

    await pasteAndScore(page, FOUR_MARKER_BLOB);
    await expect(page.locator(".try__row")).toHaveCount(4);
    await expect(page.locator(".report-card__line")).toBeVisible();

    const offending = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);

    // No inference call to api.anthropic.com fired — the parse is deterministic.
    const anthropic = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  test("the paste-and-score flow writes no IndexedDB panel", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await pasteAndScore(page, FOUR_MARKER_BLOB);
    await expect(page.locator(".try__row")).toHaveCount(4);

    // No panels written — the prospect never consented; nothing persisted.
    const panelCount = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror   = () => resolve(0);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("panels")) { db.close(); resolve(0); return; }
          const tx = db.transaction("panels", "readonly");
          const all = tx.objectStore("panels").getAll();
          all.onerror   = () => { db.close(); resolve(0); };
          all.onsuccess = () => { db.close(); resolve((all.result as unknown[]).length); };
        };
      });
    });
    expect(panelCount).toBe(0);
  });

  /* ---------- AC: the key/sentinel never appears anywhere ---------------- */

  test("a sentinel in the pasted text never surfaces in a row, the tally, or stored state", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    const SENTINEL = "sk-ant-canary-PASTE-55000";
    // The sentinel is pasted as free prose alongside real markers.
    await pasteAndScore(page, [
      `Patient key on file: ${SENTINEL}`,
      "Apolipoprotein B 110 mg/dL",
      "Fasting Insulin 8 uIU/mL",
    ].join("\n"));

    await expect(page.locator(".try__row")).toHaveCount(2);
    // The sentinel appears nowhere in the rendered surface.
    const html = await page.content();
    expect(html).not.toContain(SENTINEL);
    // And nowhere in the carried sandbox session payload either.
    const session = await page.evaluate(() => sessionStorage.getItem("almanac.sandbox.rows"));
    expect(session ?? "").not.toContain(SENTINEL);
  });

  /* ---------- AC: the typed sandbox (0040) is unchanged ----------------- */

  test("the typed-marker sandbox path is unchanged by the paste addition", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    // The 0040 flow: pick a marker, type, score — still resolves a row + tally.
    await page.selectOption("#try-marker", "fasting_insulin");
    await page.fill("#try-value", "8");
    await page.locator("#try-add").click();
    await expect(page.locator(".try__row")).toHaveCount(1);
    await expect(page.locator(".try__row").first().locator(".try__flag")).toHaveClass(/flag--suboptimal/);
    await expect(page.locator(".report-card")).toHaveCount(0);

    await page.selectOption("#try-marker", "apo_b");
    await page.fill("#try-value", "120");
    await page.locator("#try-add").click();
    await expect(page.locator(".try__row")).toHaveCount(2);
    await expect(page.locator(".report-card")).toBeVisible();

    // Typed values still vanish on reload (0040's no-persist contract).
    await page.reload();
    await page.locator(".try").waitFor();
    await expect(page.locator(".try__row")).toHaveCount(0);
  });

  /* ---------- AC: pasted rows participate in the 0049 handoff ----------- */

  test("pasted rows carry into the 0049 sandbox-to-first-panel handoff", async ({ page }) => {
    // 0049 (sandbox-to-first-panel handoff) HAS shipped on main, so pasted rows
    // must participate exactly as typed rows do: the sessionStorage seed carries
    // them, and the post-consent onboarding offers them.
    await installMocks(page);
    await openTry(page);
    // Paste two recognized markers — these become the carried session rows.
    await pasteAndScore(page, [
      "Apolipoprotein B 110 mg/dL",
      "Fasting Insulin 8 uIU/mL",
    ].join("\n"));
    await expect(page.locator(".try__row")).toHaveCount(2);

    // Navigate away to the gate and through consent → onboarding. The handoff
    // offer reads the LAST-written session payload (which holds the pasted rows).
    await page.getByRole("link", { name: /start your own/i }).click();
    await expect(page).toHaveURL(/#\/welcome$/);
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);

    // The handoff block offers the two pasted markers.
    await expect(page.locator(".sandbox-handoff")).toBeVisible();
    await expect(page.locator(".sandbox-handoff__copy")).toContainText("2 markers");
  });

  /* ---------- AC: the standing disclaimer ------------------------------- */

  test("carries the informational-not-medical-advice disclaimer", async ({ page }) => {
    await installMocks(page);
    await openTry(page);
    await expect(page.locator(".colophon")).toContainText(/informational, not medical advice/i);
  });

  /* ---------- AC: mobile rendering + tap targets ------------------------ */

  test("renders cleanly at 390px with the paste tap target ≥44px and no overflow", async ({ page }) => {
    await installMocks(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openTry(page);
    await pasteAndScore(page, FOUR_MARKER_BLOB);

    // The "Score it" action is a ≥44×44 css px tap target.
    const scoreBox = await page.locator(".try__paste-score").boundingBox();
    expect(scoreBox!.height).toBeGreaterThanOrEqual(44);
    expect(scoreBox!.width).toBeGreaterThanOrEqual(44);

    // The textarea does not push the picker off-screen — both are within the
    // viewport horizontally.
    const taBox = await page.locator(".try__paste-input").boundingBox();
    expect(taBox!.x).toBeGreaterThanOrEqual(0);
    expect(taBox!.x + taBox!.width).toBeLessThanOrEqual(390 + 1);

    // A long-marker-name resolved row wraps cleanly within the viewport.
    const rowBox = await page.locator(".try__row").first().boundingBox();
    expect(rowBox!.x).toBeGreaterThanOrEqual(0);
    expect(rowBox!.x + rowBox!.width).toBeLessThanOrEqual(390 + 1);
  });
});

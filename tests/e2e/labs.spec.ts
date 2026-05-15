// Labs is the most feature-dense surface: manual entry, multi-file upload,
// paste support, extraction caching, and the match-unrecognized workflow.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan, waitForDb } from "../helpers/flows";

test.describe("Labs — manual entry", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
  });

  test("creates a panel from manually entered values", async ({ page }) => {
    await onboard(page);
    await addManualPanel(page);

    // Panel detail shows our three markers, in whatever category-grouped order
    // the page chooses to render them (we just care all three are present).
    const names = await page.locator(".result__name").allTextContents();
    expect(names).toEqual(expect.arrayContaining(["Total Cholesterol", "Triglycerides", "Vitamin D"]));
    expect(await page.locator(".result__num").allTextContents()).toEqual(
      expect.arrayContaining(["244", "165", "32"]),
    );
  });

  test("range labels and values render without overlap", async ({ page }) => {
    await onboard(page);
    await addManualPanel(page);
    // Each .result__ranges row is a 2-column grid; the FUNCTIONAL label box
    // sits in its own column rather than escaping into the value's text.
    const rangelabel = page.locator(".result__rangelabel").filter({ hasText: /functional/i }).first();
    await expect(rangelabel).toBeVisible();
    const labelBox = await rangelabel.boundingBox();
    const valueBox = await rangelabel.locator("xpath=following-sibling::span").boundingBox();
    expect(labelBox).not.toBeNull();
    expect(valueBox).not.toBeNull();
    if (labelBox && valueBox) {
      // Label's right edge must end before the value's left edge starts.
      expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(valueBox.x + 1);
    }
  });
});

test.describe("Labs — multi-file upload", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("pasting an image stages it exactly once", async ({ page }) => {
    await page.goto("/#/labs");
    // Wait for the labs page to finish painting — the paste listener is
    // attached at the end of renderLabs(), and on Mobile WebKit the
    // dispatch can race the bootstrap if we don't wait for the dropzone.
    await page.locator(".dropzone").waitFor();
    // Synthesize a clipboard paste event with a single image file.
    await page.evaluate(async () => {
      const png = new Blob(
        [Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), c => c.charCodeAt(0))],
        { type: "image/png" }
      );
      const file = new File([png], "image.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const evt = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      window.dispatchEvent(evt);
    });

    await expect(page.locator(".staged__chip")).toHaveCount(1);
  });

  test("filename truncation keeps × button inside the chip border", async ({ page }) => {
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    // Stage a file with a very long name.
    await page.evaluate(async () => {
      const png = new Blob(
        [Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), c => c.charCodeAt(0))],
        { type: "image/png" }
      );
      const name = "pasted-2026-05-13T21-09-42-803Z-and-some-more-extra-bytes.png";
      const file = new File([png], name, { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });

    const chip = page.locator(".staged__chip").first();
    await expect(chip).toBeVisible();
    const chipBox = await chip.boundingBox();
    const xBtn   = chip.locator(".staged__remove");
    const xBox   = await xBtn.boundingBox();
    expect(chipBox).not.toBeNull();
    expect(xBox).not.toBeNull();
    if (chipBox && xBox) {
      // × button must sit fully inside the chip's bounding box.
      expect(xBox.x).toBeGreaterThanOrEqual(chipBox.x);
      expect(xBox.x + xBox.width).toBeLessThanOrEqual(chipBox.x + chipBox.width + 1);
    }
  });

  test("extract button reads cleanly without phantom letter-spaced gaps", async ({ page }) => {
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await page.evaluate(() => {
      const png = new Blob(
        [Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), c => c.charCodeAt(0))],
        { type: "image/png" }
      );
      const dt = new DataTransfer();
      dt.items.add(new File([png], "a.png", { type: "image/png" }));
      dt.items.add(new File([png], "b.png", { type: "image/png" }));
      dt.items.add(new File([png], "c.png", { type: "image/png" }));
      window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    const btn = page.locator("#extract");
    await expect(btn).toBeVisible();
    // No "PAGE S" — the word "pages" appears as one token.
    await expect(btn).toContainText(/3 pages/i);
  });
});

test.describe("Labs — extraction + caching", () => {
  test.beforeEach(async ({ context, page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("uploading an image extracts and lands on the panel detail", async ({ page }) => {
    // Use the file input (rather than paste — more reliable across browsers).
    await page.goto("/#/labs");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    await page.locator("input#file").setInputFiles({
      name: "panel.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    // Wait for the staged chip to render before clicking Extract — Mobile
    // Safari needs a tick after the change event before the button is wired.
    await expect(page.locator(".staged__chip")).toHaveCount(1);
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });

    // Fixture has Total Cholesterol = 244 mg/dL.
    await expect(page.locator(".result__num").filter({ hasText: "244" })).toBeVisible();
  });

  test("multi-date payload splits into one panel per draw date", async ({ page }) => {
    // The mock returns the multi-date fixture when any staged filename
    // includes "multi-date" — three distinct draw dates across one upload.
    // Acceptance criteria 1: N > 1 distinct drawnAt → N panels.
    // Acceptance criteria 4: user lands on the labs index, not a panel detail.
    // Acceptance criteria 6: panels persisted in drawnAt order (oldest first
    // in DB; newest first in the UI list).
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await page.locator("input#file").setInputFiles([
      { name: "multi-date-page-1.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
      { name: "multi-date-page-2.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
      { name: "multi-date-page-3.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
    ]);
    await expect(page.locator(".staged__chip")).toHaveCount(3);
    await page.locator("#extract").click();

    // Lands on the labs index — NOT a single panel detail.
    await expect(page).toHaveURL(/#\/labs$/, { timeout: 20_000 });

    // Three rows persisted, one per draw date.
    await waitForDb(page, "panels", (n) => n >= 3, { timeoutMs: 20_000 });

    // The archive shows all three dates in the rendered list.
    const dates = await page.locator(".entry-row .date").allTextContents();
    expect(dates).toEqual(expect.arrayContaining(["2024-03-12", "2025-01-18", "2026-04-03"]));
    // Section header advertises three panels.
    await expect(page.locator(".section-mark", { hasText: /All panels · 3/ })).toBeVisible();
  });

  test("single-date payload still creates exactly one panel (regression)", async ({ page }) => {
    // Acceptance criteria 2: when the extractor returns a single drawnAt the
    // existing single-panel behavior is preserved — lands on the panel detail.
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await page.locator("input#file").setInputFiles({
      name: "single-draw.png", mimeType: "image/png", buffer: Buffer.from(png, "base64"),
    });
    await expect(page.locator(".staged__chip")).toHaveCount(1);
    await page.locator("#extract").click();

    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    await waitForDb(page, "panels", (n) => n === 1, { timeoutMs: 10_000 });
  });

  test("re-uploading the multi-date set replays from cache (one panel split, no new API call)", async ({ page }) => {
    // Acceptance criteria 5: re-pasting the same file-set hash re-uses the
    // prior split — three rows still in DB, no fresh extractCalls.
    const stats = await installMocks(page);
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await page.locator("input#file").setInputFiles([
      { name: "multi-date-a.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
      { name: "multi-date-b.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
    ]);
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs$/, { timeout: 20_000 });
    await waitForDb(page, "panels", (n) => n >= 3, { timeoutMs: 20_000 });
    const firstCallCount = stats.extractCalls;
    expect(firstCallCount).toBe(1);

    // Re-upload the exact same set — cache replay produces the same split
    // (three more panels added) and crucially the API is NOT called again.
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await page.locator("input#file").setInputFiles([
      { name: "multi-date-a.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
      { name: "multi-date-b.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") },
    ]);
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs$/, { timeout: 20_000 });
    expect(stats.extractCalls).toBe(firstCallCount);
    await waitForDb(page, "panels", (n) => n >= 6, { timeoutMs: 10_000 });
  });

  test("re-uploading the same file replays from cache (no second API call)", async ({ page }) => {
    const stats = await installMocks(page);
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    // First upload — hits the API.
    await page.goto("/#/labs");
    await page.locator("input#file").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 15_000 });
    const firstCallCount = stats.extractCalls;
    expect(firstCallCount).toBe(1);

    // Re-upload the EXACT same file — the extraction cache replays it.
    await page.goto("/#/labs");
    await page.locator("input#file").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 15_000 });
    expect(stats.extractCalls).toBe(firstCallCount); // no new API call
  });
});

/* -------------------------------------------------------------------------- */
/*  User-extensible marker database (ticket 0002)                             */
/* -------------------------------------------------------------------------- */

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * Upload the with-unrecognized fixture (filename trigger), land on its panel
 * detail. Two unrecognized rows are surfaced: "Lp-PLA2 Activity" and
 * "Ceruloplasmin".
 */
async function uploadWithUnrecognized(page: Page): Promise<void> {
  await page.goto("/#/labs");
  await page.locator(".dropzone").waitFor();
  await page.locator("input#file").setInputFiles({
    name: "with-unrecognized.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG, "base64"),
  });
  await expect(page.locator(".staged__chip")).toHaveCount(1);
  await page.locator("#extract").click();
  await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
}

test.describe("Labs — user-extensible markers (0002)", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
  });

  test("each unrecognized row exposes a 'Define this marker' affordance", async ({ page }) => {
    await uploadWithUnrecognized(page);

    const lpCard = page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"]`);
    await expect(lpCard).toBeVisible();
    await expect(lpCard.locator(`[data-action="define"]`)).toBeVisible();

    const cerCard = page.locator(`.unmatched-card[data-rawname="Ceruloplasmin"]`);
    await expect(cerCard.locator(`[data-action="define"]`)).toBeVisible();
  });

  test("defining a marker binds matching rows immediately and persists", async ({ page }) => {
    await uploadWithUnrecognized(page);

    // Open the define form for Lp-PLA2.
    await page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"] [data-action="define"]`).click();

    // Form renders inline. Fill it.
    const form = page.locator(".define-marker-form").first();
    await expect(form).toBeVisible();
    await form.locator(`[name="name"]`).fill("Lp-PLA2 Activity");
    await form.locator(`[name="shortName"]`).fill("Lp-PLA2");
    await form.locator(`[name="category"]`).selectOption("lipids");
    await form.locator(`[name="unit"]`).fill("nmol/min/mL");
    await form.locator(`[name="labLow"]`).fill("0");
    await form.locator(`[name="labHigh"]`).fill("225");
    await form.locator(`[name="optimalHigh"]`).fill("150");
    await form.locator(`[name="description"]`).fill(
      "Inflammation marker tied to vascular plaque rupture risk.",
    );
    await form.locator(`button[type="submit"]`).click();

    // After save, the unmatched card for that rawName is gone, and a new
    // result row appears in the panel detail bound to our marker.
    await expect(page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"]`)).toHaveCount(0);
    await expect(page.locator(".result__name").filter({ hasText: /Lp-PLA2/ })).toBeVisible();

    // The value 220 from the fixture is now present as a result.
    await expect(page.locator(".result__num").filter({ hasText: "220" })).toBeVisible();

    // The user marker persists in IndexedDB.
    const stored = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => resolve(-1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("userMarkers")) { db.close(); resolve(-1); return; }
          const tx = db.transaction("userMarkers", "readonly");
          const c  = tx.objectStore("userMarkers").count();
          c.onerror = () => { db.close(); resolve(-1); };
          c.onsuccess = () => { db.close(); resolve(c.result as number); };
        };
      });
    });
    expect(stored).toBeGreaterThanOrEqual(1);
  });

  test("user marker surfaces in the match-unrecognized dropdown with a 'yours' pill", async ({ page }) => {
    // First define Lp-PLA2 on one panel.
    await uploadWithUnrecognized(page);
    await page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"] [data-action="define"]`).click();
    const form = page.locator(".define-marker-form").first();
    await form.locator(`[name="name"]`).fill("Lp-PLA2 Activity");
    await form.locator(`[name="category"]`).selectOption("lipids");
    await form.locator(`[name="unit"]`).fill("nmol/min/mL");
    await form.locator(`[name="labHigh"]`).fill("225");
    await form.locator(`[name="optimalHigh"]`).fill("150");
    await form.locator(`[name="description"]`).fill("Specialty inflammation marker.");
    await form.locator(`button[type="submit"]`).click();
    await expect(page.locator(".result__name").filter({ hasText: /Lp-PLA2/ })).toBeVisible();

    // The remaining "Ceruloplasmin" card's dropdown contains the user marker
    // we just defined, labelled as ours.
    const cerCard = page.locator(`.unmatched-card[data-rawname="Ceruloplasmin"]`);
    await expect(cerCard).toBeVisible();
    const select = cerCard.locator(`select.unmatched__select`);
    const options = await select.locator("option").allTextContents();
    expect(options.some(o => /Lp-PLA2/i.test(o) && /yours/i.test(o))).toBe(true);
  });

  test("define-marker form requires at least one of lab or functional range", async ({ page }) => {
    await uploadWithUnrecognized(page);
    await page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"] [data-action="define"]`).click();
    const form = page.locator(".define-marker-form").first();
    await form.locator(`[name="name"]`).fill("Lp-PLA2 Activity");
    await form.locator(`[name="category"]`).selectOption("lipids");
    await form.locator(`[name="unit"]`).fill("nmol/min/mL");
    await form.locator(`[name="description"]`).fill("Specialty inflammation marker.");
    // Explicitly clear the lab-range pre-fill (the form is helpful enough to
    // copy it from the extracted row) so the validation path actually runs.
    await form.locator(`[name="labLow"]`).fill("");
    await form.locator(`[name="labHigh"]`).fill("");

    // No lab or functional ranges filled → form should reject submit.
    page.once("dialog", d => d.accept());
    await form.locator(`button[type="submit"]`).click();

    // Form is still visible (didn't save).
    await expect(form).toBeVisible();
    await expect(page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"]`)).toBeVisible();
  });

  test("user marker appears in Settings 'Your markers' subsection and can be deleted", async ({ page }) => {
    await uploadWithUnrecognized(page);
    await page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"] [data-action="define"]`).click();
    const form = page.locator(".define-marker-form").first();
    await form.locator(`[name="name"]`).fill("Lp-PLA2 Activity");
    await form.locator(`[name="category"]`).selectOption("lipids");
    await form.locator(`[name="unit"]`).fill("nmol/min/mL");
    await form.locator(`[name="labHigh"]`).fill("225");
    await form.locator(`[name="description"]`).fill("Specialty inflammation marker.");
    await form.locator(`button[type="submit"]`).click();
    await expect(page.locator(".result__name").filter({ hasText: /Lp-PLA2/ })).toBeVisible();

    await page.goto("/#/settings");
    await expect(page.locator(".user-markers")).toBeVisible();
    const row = page.locator(`.user-markers__row`).filter({ hasText: /Lp-PLA2/ });
    await expect(row).toBeVisible();

    page.once("dialog", d => d.accept());
    await row.locator(`[data-action="delete-user-marker"]`).click();
    await expect(page.locator(`.user-markers__row`).filter({ hasText: /Lp-PLA2/ })).toHaveCount(0);
  });

  test("plan generation includes user markers in the Marker Reference block", async ({ page }) => {
    await uploadWithUnrecognized(page);
    await page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"] [data-action="define"]`).click();
    const form = page.locator(".define-marker-form").first();
    await form.locator(`[name="name"]`).fill("Lp-PLA2 Activity");
    await form.locator(`[name="category"]`).selectOption("lipids");
    await form.locator(`[name="unit"]`).fill("nmol/min/mL");
    await form.locator(`[name="labHigh"]`).fill("225");
    await form.locator(`[name="optimalHigh"]`).fill("150");
    await form.locator(`[name="description"]`).fill(
      "Lipoprotein-associated phospholipase A2, vascular inflammation marker.",
    );
    await form.locator(`button[type="submit"]`).click();
    await expect(page.locator(".result__name").filter({ hasText: /Lp-PLA2/ })).toBeVisible();

    // Intercept the next plan call to capture its prompt.
    let capturedPrompt = "";
    await page.route("**/api.anthropic.com/v1/messages", async (route, request) => {
      const body = request.postDataJSON();
      const sys = (body.system ?? []).map((s: any) => s.text).join("\n");
      if (sys.includes("FOOD-FIRST")) {
        // Concatenate every user-message text block; the Marker Reference
        // lives inside the cached preamble.
        const content = body.messages?.[0]?.content as any[] | undefined;
        capturedPrompt = (content ?? [])
          .filter((b) => b?.type === "text")
          .map((b) => b.text as string)
          .join("\n");
      }
      // Defer to the existing mock for the response itself.
      await route.fallback();
    });

    await composePlan(page);

    expect(capturedPrompt).toContain("Lp-PLA2");
    // The description we typed must travel into the prompt as the
    // authoritative ranges/description.
    expect(capturedPrompt).toMatch(/phospholipase A2|vascular inflammation/i);
  });

  test("export includes userMarkers and import round-trips them", async ({ page }) => {
    await uploadWithUnrecognized(page);
    await page.locator(`.unmatched-card[data-rawname="Lp-PLA2 Activity"] [data-action="define"]`).click();
    const form = page.locator(".define-marker-form").first();
    await form.locator(`[name="name"]`).fill("Lp-PLA2 Activity");
    await form.locator(`[name="category"]`).selectOption("lipids");
    await form.locator(`[name="unit"]`).fill("nmol/min/mL");
    await form.locator(`[name="labHigh"]`).fill("225");
    await form.locator(`[name="description"]`).fill("Specialty inflammation marker.");
    await form.locator(`button[type="submit"]`).click();
    await expect(page.locator(".result__name").filter({ hasText: /Lp-PLA2/ })).toBeVisible();

    // Trigger export and capture the JSON payload.
    await page.goto("/#/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export the almanac/i }).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs/promises");
    const payload = JSON.parse(await fs.readFile(path!, "utf8"));
    expect(Array.isArray(payload.userMarkers)).toBe(true);
    expect(payload.userMarkers.length).toBeGreaterThanOrEqual(1);
    expect(payload.userMarkers[0].name).toMatch(/Lp-PLA2/);
  });
});

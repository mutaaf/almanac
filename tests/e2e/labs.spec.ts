// Labs is the most feature-dense surface: manual entry, multi-file upload,
// paste support, extraction caching, and the match-unrecognized workflow.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, addManualPanel } from "../helpers/flows";

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

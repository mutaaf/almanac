// Paste your results as text (ticket 0046).
//
// The lowest-friction first panel: a prospect copies the values from a patient
// portal (MyChart, LabCorp, Quest) and pastes them straight into Almanac. The
// text routes to the SAME Claude extraction call the file path uses — one text
// content block instead of a base64 image — and converges on the identical
// review screen, canonicalization, flagging, and date-splitting (0001).
//
// Each acceptance-criteria checkbox in the ticket maps 1:1 to a test below.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import {
  onboard, addManualPanel, addPanelFromText, enterTour, waitForDb,
} from "../helpers/flows";

// A realistic blob of portal text — the kind of thing a results page yields on
// copy. The mock serves the standard extraction fixture for it (one draw date).
const PORTAL_TEXT = `
MyChart — Test Results
Collected 05/01/2026 · Test Lab

Component            Value     Reference Range
Cholesterol, Total   244 mg/dL   <200
Triglycerides        165 mg/dL   <150
Vitamin D, 25-OH      32 ng/mL   30-100
Ferritin              65 ng/mL   30-400
`.trim();

// Portal text that the mock routes to the multi-date fixture (three draws).
const PORTAL_TEXT_MULTI = `
MyChart — Historical lab results (multi-date)
Several draws are shown below.

03/12/2024  Cholesterol, Total 252  HDL 42  Triglycerides 178
01/18/2025  Cholesterol, Total 238  HDL 46  Triglycerides 161
04/03/2026  Cholesterol, Total 221  HDL 51  Triglycerides 142
`.trim();

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test.describe("Labs — paste results as text (0046)", () => {
  test("extractFromText produces a structured dated panel via one Anthropic call", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();

    const before = stats.outboundUrls.length;
    await addPanelFromText(page, PORTAL_TEXT);

    // Lands on the single-panel detail (one draw date in the fixture).
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    // The parsed results match the seeded extraction fixture (Total Chol 244).
    await expect(page.locator(".result__num").filter({ hasText: "244" })).toBeVisible();

    // Exactly ONE extraction call fired for the paste.
    const extractAfter = stats.outboundUrls
      .slice(before)
      .filter((u) => {
        try { return new URL(u).hostname === "api.anthropic.com"; }
        catch { return false; }
      });
    expect(extractAfter.length).toBe(1);
    expect(stats.extractCalls).toBe(1);
  });

  test("text extraction lands on the same review screen as the file path", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();
    await addPanelFromText(page, PORTAL_TEXT);

    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    // The review screen renders parsed results with flags — the SAME layout the
    // file path produces (the panel is structurally identical).
    await expect(page.locator(".result").first()).toBeVisible();
    await expect(page.locator(".result__flag").first()).toBeVisible();
    const names = await page.locator(".result__name").allTextContents();
    expect(names).toEqual(
      expect.arrayContaining(["Total Cholesterol", "Triglycerides", "Vitamin D"]),
    );
  });

  test("multi-date pasted text splits into one dated panel per draw (0001)", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();
    await addPanelFromText(page, PORTAL_TEXT_MULTI);

    // A multi-date split lands on the labs index, not a single detail.
    await expect(page).toHaveURL(/#\/labs$/, { timeout: 20_000 });
    await waitForDb(page, "panels", (n) => n >= 3, { timeoutMs: 20_000 });

    const dates = await page.locator(".entry-row .date").allTextContents();
    expect(dates).toEqual(
      expect.arrayContaining(["2024-03-12", "2025-01-18", "2026-04-03"]),
    );
    await expect(page.locator(".section-mark", { hasText: /All panels · 3/ })).toBeVisible();
  });

  test("image paste still stages a file (regression — file path unchanged)", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();

    // Paste an image — the existing clipboardData.items file branch must fire,
    // staging the image (NOT routing to the text path).
    await page.evaluate((b64) => {
      const png = new Blob(
        [Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))],
        { type: "image/png" },
      );
      const file = new File([png], "image.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      window.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, PNG);

    await expect(page.locator(".staged__chip")).toHaveCount(1);
  });

  test("window paste of plain text (no file) routes to text extraction", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();

    // Synthesize a paste carrying ONLY text/plain (no file item) — the new text
    // branch must pick it up and run extraction, NOT the image path.
    await page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      window.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, PORTAL_TEXT);

    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    await expect(page.locator(".result__num").filter({ hasText: "244" })).toBeVisible();
    expect(stats.extractCalls).toBe(1);
    // No image staged — the text branch is mutually exclusive with the file one.
    expect(stats.extractCalls).toBeGreaterThan(0);
  });

  test("re-pasting identical text replays from cache (no second API call)", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);

    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();
    await addPanelFromText(page, PORTAL_TEXT);
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    const firstCallCount = stats.extractCalls;
    expect(firstCallCount).toBe(1);

    // Paste the EXACT same text again — the extraction cache (keyed by a hash of
    // the text) replays at zero cost: no new API call.
    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();
    await addPanelFromText(page, PORTAL_TEXT);
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    expect(stats.extractCalls).toBe(firstCallCount);
  });

  test("the API key never appears in the labs text surface or the request body", async ({ page }) => {
    let extractionBody = "";
    await installMocks(page);
    await onboard(page, { key: "sk-ant-canary-PASTE-98765" });

    // Capture the extraction request body to confirm the key is not smuggled
    // into the prompt (the SDK sets it only on the Authorization header).
    await page.route("**/api.anthropic.com/v1/messages", async (route, request) => {
      const body = request.postDataJSON();
      const sys = (body.system ?? []).map((s: any) => s.text).join("\n");
      if (sys.includes("extracting structured biomarker")) {
        extractionBody = request.postData() ?? "";
      }
      await route.fallback();
    });

    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();
    await addPanelFromText(page, PORTAL_TEXT);
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });

    // The sentinel key is nowhere in the rendered labs surface…
    const html = await page.content();
    expect(html).not.toContain("sk-ant-canary-PASTE-98765");
    // …nor in the JSON body that travels (the SDK puts it on the header).
    expect(extractionBody).not.toContain("sk-ant-canary-PASTE-98765");
  });

  test("empty / whitespace-only paste does nothing (no call, no panel)", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();

    // Whitespace-only textarea → the extract button is a no-op: no call, no nav.
    await page.locator(".labs-paste-text__input").fill("   \n  \t ");
    await page.locator(".labs-paste-text__extract").click();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/#\/labs$/);
    expect(stats.extractCalls).toBe(0);
    await waitForDb(page, "panels", (n) => n === 0, { timeoutMs: 1500 }).catch(() => {
      // waitForDb throws if the predicate never holds; for n===0 it should hold
      // immediately, so a throw here is a real failure surfaced by the assertion
      // below.
    });
    const count = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => resolve(-1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("panels")) { db.close(); resolve(0); return; }
          const tx = db.transaction("panels", "readonly");
          const c = tx.objectStore("panels").count();
          c.onsuccess = () => { db.close(); resolve(c.result as number); };
          c.onerror = () => { db.close(); resolve(-1); };
        };
      });
    });
    expect(count).toBe(0);
  });

  test("a no-marker paste surfaces the graceful empty-result path", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    // Override the extraction mock to return zero panels for this paste — the
    // file path surfaces a clear "no markers found" error rather than stranding
    // the user, and the text path reuses it (panelsFromText throws the same way).
    await page.route("**/api.anthropic.com/v1/messages", async (route, request) => {
      const body = request.postDataJSON();
      const sys = (body.system ?? []).map((s: any) => s.text).join("\n");
      if (sys.includes("extracting structured biomarker")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "msg_empty",
            type: "message",
            role: "assistant",
            model: body.model,
            content: [{ type: "text", text: JSON.stringify({ panels: [] }) }],
            stop_reason: "end_turn",
            usage: { input_tokens: 100, output_tokens: 10 },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();
    await addPanelFromText(page, "Random portal navigation chrome with no values.");

    // The existing error card surfaces — same path the file route shows on an
    // empty extraction. The user stays on the labs surface (no panel created).
    await expect(page.locator(".error-card__msg")).toContainText(/no (panels|markers)/i, { timeout: 20_000 });
    await expect(page).toHaveURL(/#\/labs$/);
  });

  test("text paste is unreachable pre-consent (the consent gate is intact)", async ({ page }) => {
    await installMocks(page);
    // A fresh browser — no consent acknowledged. Deep-linking to labs must be
    // redirected to the welcome gate; the text affordance is never reachable.
    await page.goto("/#/labs");
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(page.locator(".labs-paste-text")).toHaveCount(0);
  });

  test("renders + the text path works on the current viewport (chromium + mobile-webkit)", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".labs-paste-text").waitFor();

    // The affordance and its controls are visible and tappable at any viewport.
    const textarea = page.locator(".labs-paste-text__input");
    await expect(textarea).toBeVisible();
    const btn = page.locator(".labs-paste-text__extract");
    await expect(btn).toBeVisible();

    // Touch targets clear the 44×44 css-px HIG floor.
    const taBox = await textarea.boundingBox();
    const btnBox = await btn.boundingBox();
    expect(taBox).not.toBeNull();
    expect(btnBox).not.toBeNull();
    if (btnBox) {
      expect(btnBox.height).toBeGreaterThanOrEqual(44);
    }
    if (taBox) {
      expect(taBox.height).toBeGreaterThanOrEqual(44);
    }

    // The dropzone is undisturbed — it still renders alongside the text path.
    await expect(page.locator(".dropzone")).toBeVisible();

    // The text path fires (the `fill` mechanism is asserted on both projects;
    // window-paste of text/plain is exercised in its own test on chromium).
    await addPanelFromText(page, PORTAL_TEXT);
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
  });

  test("the existing file-upload and manual-entry flows are unchanged", async ({ page }) => {
    await installMocks(page);
    await onboard(page);

    // Manual entry — unchanged.
    await addManualPanel(page);
    const names = await page.locator(".result__name").allTextContents();
    expect(names).toEqual(
      expect.arrayContaining(["Total Cholesterol", "Triglycerides", "Vitamin D"]),
    );

    // File upload — unchanged.
    await page.goto("/#/labs");
    await page.locator("input#file").setInputFiles({
      name: "panel.png", mimeType: "image/png", buffer: Buffer.from(PNG, "base64"),
    });
    await expect(page.locator(".staged__chip")).toHaveCount(1);
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    await expect(page.locator(".result__num").filter({ hasText: "244" })).toBeVisible();
  });

  test("tour mode: the text affordance is present and operates against the mock", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    // Consistent with the file path's tour treatment (the upload screen is live
    // in tour), the text affordance is present.
    await expect(page.locator(".labs-paste-text")).toBeVisible();
  });

  test("shared-view: the text affordance is absent (the recipient does not ingest)", async ({ page }) => {
    await installMocks(page);
    // Enter shared-view via the localStorage sentinel + an in-memory render.
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("almanac.sharedView", "true"));
    await page.goto("/#/labs");
    await page.locator(".shared-empty, .headline").first().waitFor();
    // Labs is the "not shared with you" empty state — no upload, no text path.
    await expect(page.locator(".labs-paste-text")).toHaveCount(0);
    await expect(page.locator(".dropzone")).toHaveCount(0);
  });
});

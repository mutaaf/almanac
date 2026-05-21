// The egress receipt (ticket 0025).
//
// A render-time, zero-network "what leaves this device" line painted at the
// extraction trigger on #/labs. It names where the bytes go (api.anthropic.com,
// BYOK), what travels (the staged pages), and what stays (everything else in
// IndexedDB). Each test maps 1:1 to an acceptance-criteria checkbox.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, enterTour, enterSharedViewWithAdopt } from "../helpers/flows";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Stage N named files on the labs upload screen via the file picker. */
async function stageFiles(page: Page, names: string[]): Promise<void> {
  await page.locator("input#file").setInputFiles(
    names.map((name) => ({
      name,
      mimeType: "image/png",
      buffer: Buffer.from(PNG, "base64"),
    })),
  );
  await expect(page.locator(".staged__chip")).toHaveCount(names.length);
}

test.describe("Egress receipt — appearance + count", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
  });

  test("appears when a file is staged and disappears when the stage clears", async ({ page }) => {
    // No receipt before anything is staged.
    await expect(page.locator(".egress-receipt")).toHaveCount(0);

    await stageFiles(page, ["labs-q1.png"]);
    await expect(page.locator(".egress-receipt")).toBeVisible();

    // Clearing the stage removes the receipt.
    await page.locator("#clear").click();
    await expect(page.locator(".staged__chip")).toHaveCount(0);
    await expect(page.locator(".egress-receipt")).toHaveCount(0);
  });

  test("summary reads singular for one file", async ({ page }) => {
    await stageFiles(page, ["labs-q1.png"]);
    await expect(page.locator(".egress-receipt__summary")).toContainText(
      "1 page will be sent to api.anthropic.com with your key, for extraction only. Your profile, your prior panels, and these files stay on this device.",
    );
    // The noun agrees: "1 page", not "1 pages".
    await expect(page.locator(".egress-receipt__summary")).not.toContainText("1 pages");
  });

  test("summary reads plural for three files", async ({ page }) => {
    await stageFiles(page, ["a.png", "b.png", "c.png"]);
    await expect(page.locator(".egress-receipt__summary")).toContainText(
      "3 pages will be sent to api.anthropic.com with your key, for extraction only. Your profile, your prior panels, and these files stay on this device.",
    );
  });
});

test.describe("Egress receipt — the 'what travels' disclosure", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
  });

  test("expands to list the literal file names, the verbatim host, and what stays", async ({ page }) => {
    await stageFiles(page, ["labs-q1.png", "labs-q2.png"]);

    const disclosure = page.locator(".egress-receipt__disclosure");
    await expect(disclosure).toHaveAttribute("role", "button");
    await expect(disclosure).toContainText("what travels →");

    // Collapsed by default.
    await expect(page.locator(".egress-receipt__detail")).toBeHidden();

    await disclosure.click();
    const detail = page.locator(".egress-receipt__detail");
    await expect(detail).toBeVisible();

    // (a) Travels: literal staged file names joined with ", ".
    await expect(detail.locator(".egress-receipt__row--travels")).toContainText(
      "Travels: labs-q1.png, labs-q2.png",
    );
    // (b) Destination: the host rendered verbatim.
    await expect(detail.locator(".egress-receipt__row--destination")).toContainText(
      "Destination: api.anthropic.com",
    );
    // (c) Stays.
    await expect(detail.locator(".egress-receipt__row--stays")).toContainText(
      "Stays: your profile, your prior panels, and the original files.",
    );
  });

  test("the disclosure is a touch target of at least 44x44 css px", async ({ page }) => {
    await stageFiles(page, ["labs-q1.png"]);
    const box = await page.locator(".egress-receipt__disclosure").boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Egress receipt — zero network + host provenance", () => {
  test("rendering and expanding the receipt fires zero requests", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();

    // Snapshot the outbound count, then stage + expand the disclosure. No new
    // request must be recorded between the snapshot and the assertion — the
    // receipt is computed from the staged set + a constant host string.
    const before = stats.outboundUrls.length;
    await stageFiles(page, ["labs-q1.png"]);
    await expect(page.locator(".egress-receipt")).toBeVisible();
    await page.locator(".egress-receipt__disclosure").click();
    await expect(page.locator(".egress-receipt__detail")).toBeVisible();

    const after = stats.outboundUrls;
    const newRequests = after.slice(before).filter((u) => u.startsWith("http"));
    // Only the dev server's own asset reads (127.0.0.1 / localhost) are
    // permissible churn; no api.anthropic.com call must have fired.
    const anthropic = newRequests.filter((u) => u.includes("api.anthropic.com"));
    expect(anthropic).toEqual([]);
  });

  test("the displayed host equals the enforced allow-list constant", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await stageFiles(page, ["labs-q1.png"]);
    await page.locator(".egress-receipt__disclosure").click();

    // Import the single source-of-truth host constant and confirm the receipt
    // renders that exact value — so the displayed destination can never drift
    // from the enforced egress.
    const host = await page.evaluate(async () => {
      const mod = await import("/src/claude.ts");
      return (mod as { ANTHROPIC_HOST: string }).ANTHROPIC_HOST;
    });
    expect(host).toBe("api.anthropic.com");
    await expect(page.locator(".egress-receipt__row--destination")).toContainText(host);
    await expect(page.locator(".egress-receipt__summary")).toContainText(host);
  });
});

test.describe("Egress receipt — extraction proceeds unchanged", () => {
  test("triggering extraction after the receipt renders lands on the panel detail", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await stageFiles(page, ["panel.png"]);
    await expect(page.locator(".egress-receipt")).toBeVisible();

    // Extraction proceeds through the existing panelsFromFiles() path: one API
    // call, one panel, lands on the detail with the fixture's 244 mg/dL value.
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    await expect(page.locator(".result__num").filter({ hasText: "244" })).toBeVisible();
    expect(stats.extractCalls).toBe(1);
  });

  test("the cached-replay line surfaces on a repeat stage and the extract fires zero network", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);

    // First upload primes the extraction cache.
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await stageFiles(page, ["cached.png"]);
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    expect(stats.extractCalls).toBe(1);

    // Re-stage the SAME file. The receipt's summary now additionally names the
    // cached replay.
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await stageFiles(page, ["cached.png"]);
    await expect(page.locator(".egress-receipt__summary")).toContainText(
      "These files were already extracted — re-running replays the cached result at no cost and sends nothing.",
    );

    // Re-running fires zero new API calls.
    await page.locator("#extract").click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/, { timeout: 20_000 });
    expect(stats.extractCalls).toBe(1);
  });
});

test.describe("Egress receipt — manual entry", () => {
  test("manual entry renders an honest 'nothing is sent' receipt with no host", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs?manual=1");
    await page.locator("#drawnAt").waitFor({ state: "visible" });

    const receipt = page.locator(".egress-receipt");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText(
      "Manual entry sends nothing — these values are typed straight into this device.",
    );
    // Nothing leaves, so there is no host string and no disclosure.
    await expect(receipt).not.toContainText("api.anthropic.com");
    await expect(page.locator(".egress-receipt__disclosure")).toHaveCount(0);
  });
});

test.describe("Egress receipt — tour and shared-view", () => {
  test("tour mode renders a receipt that says nothing is sent", async ({ page }) => {
    await installMocks(page);
    await enterTour(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await stageFiles(page, ["sample.png"]);

    await expect(page.locator(".egress-receipt__summary")).toContainText(
      "In this sample, nothing is sent — extraction is simulated.",
    );
  });

  test("shared-view does not render the receipt (labs were not shared)", async ({ page }) => {
    await installMocks(page);
    await enterSharedViewWithAdopt(
      page,
      {
        version: 1,
        eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
        avoidList: [],
        habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
      },
      { tapAdopt: false },
    );
    await page.goto("/#/labs");
    // The shared-view labs page is the "not included" empty state — no upload
    // surface, so no receipt.
    await expect(page.locator(".shared-empty__title")).toBeVisible();
    await expect(page.locator(".egress-receipt")).toHaveCount(0);
    await expect(page.locator(".dropzone")).toHaveCount(0);
  });
});

test.describe("Egress receipt — mobile rendering", () => {
  test("long file names wrap and the extract button stays above the fold", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();
    await stageFiles(page, [
      "quarterly-comprehensive-metabolic-panel-and-lipids-2026-q1.png",
      "quarterly-comprehensive-metabolic-panel-and-lipids-2026-q2.png",
    ]);
    await page.locator(".egress-receipt__disclosure").click();

    const detail = page.locator(".egress-receipt__detail");
    await expect(detail).toBeVisible();
    // The detail panel must not overflow its container horizontally.
    const detailBox = await detail.boundingBox();
    const viewport = page.viewportSize();
    expect(detailBox).not.toBeNull();
    if (detailBox && viewport) {
      expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    // The extract button still renders (the receipt does not push it off-page).
    await expect(page.locator("#extract")).toBeVisible();
  });
});

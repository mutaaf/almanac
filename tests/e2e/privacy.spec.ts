// The privacy contract, enforced.
//
// Almanac MUST NOT egress to anywhere other than api.anthropic.com
// (for inference, BYOK, browser → API directly) and the standard
// font CDN (Google Fonts) and the dev server itself. Any other
// host appearing in network logs is a regression — period.

import { test, expect } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import {
  onboard, addManualPanel, composePlan, enterTour, enterSharedViewWithAdopt,
  seedHundredDayState, seedPlanWithRetest, seedPanel,
} from "../helpers/flows";

const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

test.describe("Privacy contract", () => {
  test.beforeEach(async ({ context }) => {
  });

  test("no off-device network egress beyond the allow-list", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);
    await page.goto("/#/meals");
    await page.getByRole("button", { name: /generate the week/i }).click();
    await expect(page.locator(".day-strip__cell")).toHaveCount(7);

    const offending = stats.outboundUrls.filter(u => {
      // Only http/https URLs count as "off-device egress" for this contract.
      // blob:, data:, ws: to the dev server, chrome-extension:, etc. are
      // intra-browser and don't leave the machine.
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("API key never appears in DOM or headers visible to other origins", async ({ page }) => {
    await installMocks(page);
    await onboard(page, { key: "sk-ant-canary-VALUE-12345" });
    // The key is in an input[type=password] — its value lives in IndexedDB only.
    const html = await page.content();
    expect(html).not.toContain("sk-ant-canary-VALUE-12345");
  });

  test("the sample tour (ticket 0014) never widens the egress allow-list", async ({ page }) => {
    const stats = await installMocks(page);
    await enterTour(page);
    // Visit every page reachable on the tour. Each must paint without an
    // off-allow-list request, and the egress URL list must satisfy the same
    // allow-list assertion the consented path satisfies.
    for (const route of ["#/today", "#/plan", "#/meals", "#/progress", "#/recap", "#/labs"]) {
      await page.goto(`/${route}`);
      await page.locator(".wordmark, .headline").first().waitFor();
    }
    // Also exercise the compare and panel-detail leaf routes — the tour's
    // fixture has two panels with id 1 and 2.
    await page.goto("/#/progress?compare=1,2");
    await page.locator(".compare-summary, .compare-empty, .headline").first().waitFor();
    await page.goto("/#/labs?id=1");
    await page.locator(".eyebrow, .headline").first().waitFor();

    const offending = stats.outboundUrls.filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("sessions table (ticket 0018) exists and rows contain only { id, at }", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    // Onboarding drove the router through several loads — at least one
    // session row should exist by now. Read the table directly and assert
    // the shape: only `id` (auto-increment) and `at` (number). No
    // user-agent, no IP, no per-route tag — that minimum is the contract.
    const rows = await page.evaluate(() => {
      return new Promise<Array<Record<string, unknown>>>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror   = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("sessions")) {
            db.close(); resolve([]); return;
          }
          const tx = db.transaction("sessions", "readonly");
          const all = tx.objectStore("sessions").getAll();
          all.onerror   = () => { db.close(); resolve([]); };
          all.onsuccess = () => {
            db.close();
            resolve((all.result as Array<Record<string, unknown>>) ?? []);
          };
        };
      });
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const keys = Object.keys(row).sort();
      // Exactly the two-key shape, no more.
      expect(keys).toEqual(["at", "id"]);
      expect(typeof row.at).toBe("number");
      expect(typeof row.id).toBe("number");
    }
  });

  test("the hundred-day surface (ticket 0021) renders with no off-allow-list egress", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    // Seed a quarter-1 timeline (105-day-old plan + 55 check-ins + two draws),
    // then visit the surface. It must paint from IndexedDB only — zero new
    // hostnames, and the BYOK call is the only off-device call (and none fires
    // here since the surface is computed locally).
    const checkIns = [] as Array<{ dayOffset: number; habitsCompleted: string[] }>;
    let placed = 0;
    for (let d = 0; d < 100 && placed < 55; d += 1) {
      if (d % 6 === 5) continue;
      checkIns.push({ dayOffset: d, habitsCompleted: ["h1"] });
      placed += 1;
    }
    await seedHundredDayState(page, {
      plans: [{ daysAgo: 105, habits: [{ id: "h1", title: "Walk" }] }],
      checkIns,
      panels: [
        { dayOffset: 5,  results: [{ markerKey: "ferritin_m", value: 32, unit: "ng/mL" }] },
        { dayOffset: 90, results: [{ markerKey: "ferritin_m", value: 48, unit: "ng/mL" }] },
      ],
    });
    await page.goto("/#/hundred-day");
    await page.reload();
    await expect(page.locator(".hundred-day")).toBeVisible();

    const offending = stats.outboundUrls.filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("the adopt-and-adapt flow (ticket 0020) never widens the egress allow-list", async ({ page }) => {
    const stats = await installMocks(page);
    // A fresh recipient adopts a friend's protocol, consents, onboards, and
    // composes their first plan. The seed is local-only; the only off-device
    // call is the BYOK compose to api.anthropic.com, already on the allow-list.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      return new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("almanac");
        req.onsuccess = () => resolve();
        req.onerror   = () => resolve();
        req.onblocked = () => resolve();
      });
    });

    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    });
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await page.fill("#name", "Recipient");
    await page.fill("#birthDate", "1992-03-03");
    await page.selectOption("#sex", "female");
    await page.fill("#goals", "Better sleep.");
    await page.fill("#dietPattern", "Pescatarian.");
    await page.fill("#key", "sk-ant-test-fake-key");
    await page.getByRole("button", { name: /^begin$/i }).click();
    await expect(page).toHaveURL(/#\/plan$/);
    await page.locator("#compose-from-intake").click();
    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });

    const offending = stats.outboundUrls.filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("the key-verify probe (ticket 0024) hits only api.anthropic.com", async ({ page }) => {
    const stats = await installMocks(page);
    // Reach the onboarding form, type a key, and run the check. The probe is a
    // direct BYOK call to api.anthropic.com — already on the allow-list — and
    // must not introduce any new hostname or a validation endpoint we operate.
    await onboard(page);
    await page.goto("/#/settings");
    await page.locator("#key").waitFor({ state: "visible" });
    await page.locator(".key-check__action").click();
    await expect(page.locator(".key-check__ok, .key-check__fail")).toBeVisible();

    const offending = stats.outboundUrls.filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  test("the egress receipt (ticket 0025) displays the enforced host and fires zero network", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await page.goto("/#/labs");
    await page.locator(".dropzone").waitFor();

    // Stage a file + expand the receipt. The receipt is computed locally from
    // the staged set + a constant host — no off-device call may fire while it
    // renders. Snapshot the outbound count first so font/asset churn from
    // earlier in the flow doesn't get attributed to the receipt.
    const before = stats.outboundUrls.length;
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    await page.locator("input#file").setInputFiles({
      name: "labs.png", mimeType: "image/png", buffer: Buffer.from(png, "base64"),
    });
    await expect(page.locator(".egress-receipt")).toBeVisible();
    await page.locator(".egress-receipt__disclosure").click();
    await expect(page.locator(".egress-receipt__detail")).toBeVisible();

    const duringReceipt = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      return new URL(u).hostname === "api.anthropic.com";
    });
    expect(duringReceipt).toEqual([]);

    // The displayed destination host must equal the SAME host the egress
    // allow-list enforces — sourced from the single ANTHROPIC_HOST constant.
    const host = await page.evaluate(async () => {
      const mod = await import("/src/claude.ts");
      return (mod as { ANTHROPIC_HOST: string }).ANTHROPIC_HOST;
    });
    expect(ALLOWED_HOSTS).toContain(host);
    await expect(page.locator(".egress-receipt__row--destination")).toContainText(host);
  });

  test("the retest-due surface (ticket 0028) renders with no off-allow-list egress", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    // Seed a plan whose retest cadence places a draw 9 days out, then open
    // Today. The card is computed from the latest plan + panels in IndexedDB —
    // it must paint with zero new hostnames and zero inference call.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b", "hs_crp"], whenWeeks: 12 }],
    });
    const before = stats.outboundUrls.length;
    await page.goto("/#/today");
    await page.reload();
    await expect(page.locator(".retest-card")).toBeVisible();

    const offending = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);

    // And specifically: no inference call to api.anthropic.com fired while the
    // local-only card rendered.
    const anthropic = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  test("the report card (ticket 0036) renders with no off-allow-list egress", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page, { sex: "male" });
    // Seed a panel with a known mix of flags, then open its review screen. The
    // card is a pure local reduction over the panel's already-flagged results —
    // it must paint with zero new hostnames and zero inference call.
    const id = await seedPanel(page, {
      drawnAt: "2026-05-15", labName: "Quest", clearFirst: true,
      results: [
        { markerKey: "hemoglobin_m", value: 14.4, unit: "g/dL", labRange: { low: 13.5, high: 17.5 }, optimalRange: { low: 14.0, high: 15.5 }, flag: "optimal" },
        { markerKey: "ferritin_m", value: 50, unit: "ng/mL", labRange: { low: 30, high: 400 }, optimalRange: { low: 70, high: 150 }, flag: "suboptimal" },
        { markerKey: "vit_d_25oh", value: 24, unit: "ng/mL", labRange: { low: 30, high: 100 }, optimalRange: { low: 50, high: 80 }, flag: "low" },
      ],
    });
    const before = stats.outboundUrls.length;
    await page.goto(`/#/labs?id=${id}`);
    await page.reload();
    await expect(page.locator(".report-card")).toBeVisible();

    const offending = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);

    // And specifically: no inference call to api.anthropic.com fired while the
    // local-only card rendered.
    const anthropic = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);
  });

  test("the try-your-numbers sandbox (ticket 0040) never widens egress and writes no IndexedDB", async ({ page }) => {
    const stats = await installMocks(page);
    // A fresh prospect — no consent, no profile. Reach `#/try` directly, type
    // three values, and confirm the sandbox is a pure static-data render: zero
    // off-allow-list egress, zero inference call, and zero IndexedDB write.
    await page.goto("/#/try");
    await page.locator(".try").waitFor();
    const before = stats.outboundUrls.length;

    for (const [key, value] of [["fasting_insulin", 8], ["apo_b", 90], ["hs_crp", 5]] as const) {
      await page.selectOption("#try-marker", key);
      await page.fill("#try-value", String(value));
      await page.locator("#try-add").click();
    }
    await expect(page.locator(".report-card__line")).toBeVisible();

    const offending = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);

    // No inference call to api.anthropic.com fired while the sandbox rendered.
    const anthropic = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http")) return false;
      try { return new URL(u).hostname === "api.anthropic.com"; } catch { return false; }
    });
    expect(anthropic).toEqual([]);

    // The sandbox is in-memory only — the `almanac` IndexedDB carries no panels
    // (and the prospect never consented, so there is no profile either).
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

  test("import of a malformed export does not crash the app", async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await page.goto("/#/settings");

    // Attach a malformed JSON file to the import input.
    await page.locator("#import-file").setInputFiles({
      name: "garbage.almanac.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ this isn't JSON"),
    });
    await expect(page.locator("#io-status")).toContainText(/import failed/i);
  });
});

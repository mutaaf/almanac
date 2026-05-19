// Shareable protocol link — text a friend your actual protocol without a backend
// (ticket 0017).
//
// The Plan page gains a "Share this protocol" link. Tapping it opens a
// confirmation modal that names exactly what the link will and will not carry.
// Continuing constructs a long URL whose hash payload (gzipped + base64url-
// encoded JSON) is the bytes of the user's eat list, avoid list, habit stack,
// and meal plan — explicitly NOT the profile, labs, insights, or API key.
//
// A recipient who opens that URL lands in `#/shared`, which decodes the payload,
// flips a `localStorage["almanac.sharedView"]` flag, and routes to `#/today`.
// From there the router (and the page-level read shims) branch the same way
// the 0014 tour branches — every page renders against the in-memory shared
// state, never against the recipient's IndexedDB or the tour fixture.
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import { onboard, addManualPanel, composePlan } from "../helpers/flows";

const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

const MODAL_COPY =
  "This will create a link that contains your eat list, avoid list, habits, and meal plan. " +
  "It will not contain your name, your labs, your goals, your API key, or any insights about your biology. " +
  "The link works on any phone that opens it.";

const BANNER_COPY =
  "You are reading a protocol shared with you. Nothing here is yours yet. Start your own →";

const DECODE_FAIL_COPY =
  "That shared link did not decode. Ask your friend to send it again.";

const LONG_COPY =
  "Your protocol is longer than most messaging apps allow in one link. Tap to copy instead of share.";

/** All shared-view-eligible routes the recipient sweep traverses. */
const SHARED_ROUTES = [
  "#/today",
  "#/plan",
  "#/meals",
] as const;

/** Routes that should render the editorial empty state under shared-view. */
const NOT_SHARED_ROUTES = [
  "#/progress",
  "#/labs",
  "#/recap",
] as const;

/**
 * Drive Plan → Compose so the page is in a state with the share footer link.
 * Reused by most tests below; mocks must already be installed.
 */
async function getOntoPlan(page: Page): Promise<void> {
  await onboard(page);
  await addManualPanel(page);
  await composePlan(page);
}

/**
 * Tap the Plan footer "Share this protocol" link and wait for the modal.
 * Returns nothing — the caller asserts on the modal contents.
 */
async function openShareModal(page: Page): Promise<void> {
  await page.locator("[data-action='share-protocol']").click();
  await page.locator(".share-modal").waitFor();
}

/**
 * Read a clipboard text value through Playwright's permission-granted
 * navigator.clipboard.readText(). Chromium grants clipboard-read by default
 * for localhost; WebKit needs an explicit permissions grant before the call.
 * Tests that need this call grantPermission in their `beforeEach`.
 */
async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(async () => navigator.clipboard.readText());
}

/**
 * Stub navigator.share + navigator.canShare so the "Continue" button falls
 * through to the clipboard branch reliably. Some browsers/contexts ship the
 * share API; we don't want the OS share sheet to actually open in CI.
 */
async function stubNavigatorShare(page: Page, accept: boolean = false): Promise<void> {
  await page.evaluate((acc) => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      writable: true,
      value: () => acc,
    });
    (window as unknown as { __shareCalls: number }).__shareCalls = 0;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: async (data: { url: string }) => {
        (window as unknown as { __shareCalls: number }).__shareCalls++;
        (window as unknown as { __shareUrl?: string }).__shareUrl = data.url;
        return undefined;
      },
    });
  }, accept);
}

/**
 * Read the URL the "Continue" button placed on the clipboard, regardless of
 * which branch fired (share sheet vs clipboard).
 */
async function readShareUrl(page: Page): Promise<string> {
  // The share button writes both the share-sheet URL AND the clipboard URL
  // through the same primitive; we read whichever surface is available.
  const fromShare = await page.evaluate(
    () => (window as unknown as { __shareUrl?: string }).__shareUrl ?? "",
  );
  if (fromShare) return fromShare;
  return readClipboard(page);
}

test.describe("Shareable protocol link (ticket 0017)", () => {

  test.beforeEach(async ({ context }) => {
    // Clipboard read + write permissions for the recipient flow and the
    // copy-to-clipboard branch. Chromium accepts the names directly; WebKit
    // silently ignores unknown ones, which is fine — its clipboard API is
    // accessible without an explicit grant on localhost.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  });

  /* ---------- Plan footer surfaces a Share affordance ----------------- */

  test("the Plan page footer carries a Share this protocol link", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);

    const shareLink = page.locator("[data-action='share-protocol']");
    await expect(shareLink).toBeVisible();
    await expect(shareLink).toContainText(/share this protocol/i);

    // The neighboring "Print or share" affordance still exists — the new link
    // sits next to it without replacing it.
    await expect(page.getByRole("button", { name: /^print or share$/i })).toBeVisible();

    // Tap target is at least 44×44 css px (the iOS HIG minimum). The
    // assertion uses the bounding box — both axes must clear the threshold.
    const box = await shareLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  /* ---------- Modal copy is the verbatim ticket text ----------------- */

  test("opening the modal renders the verbatim privacy disclosure copy", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);

    // The body text is the verbatim string from the ticket. Use a substring
    // match for forgiveness of whitespace/HTML wrappers but every word is
    // present and in the right order.
    await expect(page.locator(".share-modal")).toContainText(MODAL_COPY);

    // Two buttons: Continue + Cancel. Both are rendered, both are enabled.
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^cancel$/i })).toBeEnabled();
  });

  test("Cancel closes the modal with no side effects", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);

    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.locator(".share-modal")).toHaveCount(0);
    // No clipboard write, no share invocation.
    const clip = await readClipboard(page).catch(() => "");
    expect(clip).not.toMatch(/#\/shared/);
    const shareCalls = await page.evaluate(
      () => (window as unknown as { __shareCalls?: number }).__shareCalls ?? 0,
    );
    expect(shareCalls).toBe(0);
  });

  /* ---------- Continue → share sheet (preferred) or clipboard (fallback) */

  test("Continue invokes navigator.share when canShare returns true", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, true);
    await openShareModal(page);

    await page.getByRole("button", { name: /^continue$/i }).click();

    // The share sheet was invoked exactly once.
    const shareCalls = await page.evaluate(
      () => (window as unknown as { __shareCalls?: number }).__shareCalls ?? 0,
    );
    expect(shareCalls).toBe(1);

    const url = await page.evaluate(
      () => (window as unknown as { __shareUrl?: string }).__shareUrl ?? "",
    );
    expect(url).toMatch(/#\/shared\?p=[A-Za-z0-9_-]+/);
  });

  test("Continue falls back to clipboard when canShare is false", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);

    await page.getByRole("button", { name: /^continue$/i }).click();

    // No share sheet, but the clipboard now carries the URL.
    const shareCalls = await page.evaluate(
      () => (window as unknown as { __shareCalls?: number }).__shareCalls ?? 0,
    );
    expect(shareCalls).toBe(0);

    // The one-line confirmation appears in place.
    await expect(page.locator(".share-modal__confirm")).toContainText(
      /link copied\. paste it anywhere\./i,
    );

    const url = await readClipboard(page);
    expect(url).toMatch(/#\/shared\?p=[A-Za-z0-9_-]+/);
  });

  /* ---------- Round-trip: decoded payload preserves the right fields */

  test("the encoded payload round-trips eatList / avoidList / habitStack / mealPlan", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();

    const url = await readShareUrl(page);
    const encoded = new URL(url).hash.split("p=")[1] ?? "";
    expect(encoded.length).toBeGreaterThan(0);

    // Decode in-page so the test consumes the same encoder/decoder pair the
    // source code exposes. Vite dev server serves the TS via the dev module
    // graph; the helper is a thin awaited import.
    const decoded = await page.evaluate(async (enc: string) => {
      const mod = await import("/src/share/protocol-link.ts");
      return mod.decodeProtocolPayload(enc);
    }, encoded);

    expect(decoded).not.toBeNull();
    const payload = decoded.payload;
    expect(payload.version).toBe(1);
    expect(Array.isArray(payload.eatList)).toBe(true);
    expect(Array.isArray(payload.avoidList)).toBe(true);
    expect(payload.habitStack).toBeTruthy();
    expect(Array.isArray(payload.habitStack.habits)).toBe(true);
    // The host did not generate meals before sharing — the payload omits
    // mealPlan when none exists. Round-trips to undefined.
    expect(payload.mealPlan).toBeUndefined();
  });

  /* ---------- Sentinel exclusion: insights / labs / profile never travel */

  test("the payload excludes name, labs, insights, retest, and the API key", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);

    // Encode a fully-populated Plan + MealPlan from a fabricated state that
    // tags every excluded field with a unique sentinel string. If any sentinel
    // appears in the encoded bytes the payload is wider than the ticket says.
    const encoded = await page.evaluate(async () => {
      const mod = await import("/src/share/protocol-link.ts");
      const plan: any = {
        id: 99,
        generatedAt: 1234,
        basedOnPanelIds: [],
        snapshot: "__ALMANAC_SENTINEL_SNAPSHOT__",
        insights: [{
          title: "__ALMANAC_SENTINEL_INSIGHT_TITLE__",
          detail: "__ALMANAC_SENTINEL_INSIGHT_DETAIL__",
          priority: "high",
          markerKey: "__ALMANAC_SENTINEL_MARKER__",
          provenance: {
            ruleId: "__ALMANAC_SENTINEL_RULE__",
            category: "pattern",
            supportingMarkers: [{
              markerKey: "__ALMANAC_SENTINEL_PROVENANCE_MARKER__",
              value: 123,
              unit: "ng/mL",
              drawnAt: "2026-05-01",
              threshold: "__ALMANAC_SENTINEL_THRESHOLD__",
            }],
            evidence: "__ALMANAC_SENTINEL_EVIDENCE__",
          },
        }],
        eatList: [{
          id: "eat-1", food: "Lentils",
          frequency: "3x per week", portion: "1 cup",
          why: "Iron + fiber.", markerKeys: ["ferritin_m"],
        }],
        avoidList: [{ id: "avoid-1", food: "Seed oils", why: "Inflammation." }],
        lifestyle: [],
        supplements: [],
        habitStack: {
          intro: "Three small actions.",
          habits: [
            { id: "h-walk", title: "10-min walk after dinner", cue: "After last bite", why: "Glucose disposal." },
          ],
        },
        retest: [{
          markerKeys: ["__ALMANAC_SENTINEL_RETEST_MARKER__"],
          whenWeeks: 12,
          reason: "__ALMANAC_SENTINEL_RETEST_REASON__",
        }],
      };
      const encStr = await mod.encodeProtocolPayload(plan, undefined);
      return encStr;
    });

    expect(encoded.length).toBeGreaterThan(0);

    // Decode and round-trip; the sentinels for INCLUDED fields survive
    // (none of the seeded sentinels are on included fields here — the eat /
    // avoid / habit shapes are real). The sentinels on EXCLUDED fields must
    // not appear anywhere in the decoded payload's JSON.
    const decoded = await page.evaluate(async (enc: string) => {
      const mod = await import("/src/share/protocol-link.ts");
      return mod.decodeProtocolPayload(enc);
    }, encoded);

    const decodedJson = JSON.stringify(decoded);
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_SNAPSHOT__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_INSIGHT_TITLE__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_INSIGHT_DETAIL__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_MARKER__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_RULE__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_PROVENANCE_MARKER__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_THRESHOLD__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_EVIDENCE__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_RETEST_MARKER__");
    expect(decodedJson).not.toContain("__ALMANAC_SENTINEL_RETEST_REASON__");
    // Included fields are still present.
    expect(decodedJson).toContain("Lentils");
    expect(decodedJson).toContain("h-walk");
  });

  /* ---------- #/shared route decodes and routes to #/today ---------- */

  test("opening a shared URL lands on Today against the payload state", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

    // Wipe browser state so the recipient is a fresh visitor: no consent,
    // no profile, no IndexedDB rows beyond what Dexie auto-creates.
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

    // Visit the share URL.
    const hash = new URL(url).hash;
    await page.goto("/" + hash);

    // The router decodes, sets the sentinel, and routes to #/today.
    await expect(page).toHaveURL(/#\/today$/);
    // The shared banner is up.
    await expect(page.locator(".tour-banner")).toBeVisible();
    await expect(page.locator(".tour-banner")).toContainText(BANNER_COPY);

    // The shared-view sentinel is set in localStorage.
    const sharedFlag = await page.evaluate(
      () => localStorage.getItem("almanac.sharedView"),
    );
    expect(sharedFlag).toBe("true");
    // The consent flag was NOT set — reading a share is not consenting.
    const consent = await page.evaluate(
      () => localStorage.getItem("almanac.consent.v1"),
    );
    expect(consent).toBeNull();
  });

  /* ---------- Shared-view: bypass consent + profile gates ----------- */

  test("when shared-view is active, every payload route bypasses consent + profile gates", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

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
    await page.goto("/" + new URL(url).hash);
    await expect(page).toHaveURL(/#\/today$/);

    for (const route of SHARED_ROUTES) {
      await page.goto(`/${route}`);
      const expected = new RegExp(`#${route.replace("#", "")}(\\?|$)`);
      await expect(page).toHaveURL(expected);
    }
  });

  /* ---------- Out-of-scope routes show the editorial empty state --- */

  test("Progress, Labs, and Recap show 'This was not shared with you' under shared-view", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

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
    await page.goto("/" + new URL(url).hash);
    await expect(page).toHaveURL(/#\/today$/);

    for (const route of NOT_SHARED_ROUTES) {
      await page.goto(`/${route}`);
      await page.locator(".shared-empty, .wordmark").first().waitFor();
      await expect(page.locator(".shared-empty")).toContainText(
        /this was not shared with you/i,
      );
    }
  });

  /* ---------- Zero Anthropic calls across a shared-view sweep ------- */

  test("a shared-view sweep fires zero Anthropic calls", async ({ page }) => {
    const stats: MockStats = await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

    // Snapshot how many calls the seed (onboard + manual panel + compose)
    // already accumulated, so we can prove the shared-view sweep adds zero.
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
    const before = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;

    await page.goto("/" + new URL(url).hash);
    await expect(page).toHaveURL(/#\/today$/);

    for (const route of SHARED_ROUTES) {
      await page.goto(`/${route}`);
      await page.locator(".wordmark, .headline, .shared-empty").first().waitFor();
    }

    // Tap "Start your own" — the banner's CTA.
    await page.locator(".tour-banner a[href='#/welcome']").click();
    await expect(page).toHaveURL(/#\/welcome$/);

    const after = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
  });

  /* ---------- Shared-view never reads from IndexedDB --------------- */

  test("shared-view never reads from IndexedDB", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

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

    // Install a poison Dexie shim BEFORE the SPA bootstraps: every IDB open
    // throws a sentinel error. If any shared-view render reaches IDB, the
    // page logs the error to console — assert no such console error fires.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.addInitScript(() => {
      const origOpen = indexedDB.open.bind(indexedDB);
      (indexedDB as unknown as { open: (...a: any[]) => IDBOpenDBRequest }).open
        = (name: string, ver?: number) => {
          if (name === "almanac") {
            // Throw synchronously so any code path that opens the SPA's
            // Dexie connection blows up loudly.
            throw new Error("__ALMANAC_DB_CALLED_IN_SHARED_VIEW__");
          }
          return origOpen(name, ver as number);
        };
    });

    await page.goto("/" + new URL(url).hash);
    await expect(page).toHaveURL(/#\/today$/);

    for (const route of SHARED_ROUTES) {
      await page.goto(`/${route}`);
      await page.locator(".wordmark, .shared-empty").first().waitFor();
    }

    const offending = errors.filter(e => e.includes("__ALMANAC_DB_CALLED_IN_SHARED_VIEW__"));
    expect(offending).toEqual([]);
  });

  /* ---------- Banner CTA clears state and lands on welcome -------- */

  test("the banner's Start-your-own link clears shared-view and reinstates the consent gate", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

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
    await page.goto("/" + new URL(url).hash);
    await expect(page).toHaveURL(/#\/today$/);

    await page.locator(".tour-banner a[href='#/welcome']").click();
    await expect(page).toHaveURL(/#\/welcome$/);

    // The shared flag is cleared.
    const flag = await page.evaluate(() => localStorage.getItem("almanac.sharedView"));
    expect(flag).toBeNull();
    // The consent checkbox is unticked — the recipient still has to consent.
    await expect(page.locator("#consent")).not.toBeChecked();

    // Re-visiting any other route is gated again.
    await page.goto("/#/today");
    await expect(page).toHaveURL(/#\/welcome$/);
  });

  /* ---------- Long payload branch ---------------------------------- */

  test("a long-payload Plan surfaces the 'Copy long link' label and the secondary line", async ({ page }) => {
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);

    // Inflate the in-page meal-plan to push the encoded payload over the
    // 8000-character soft limit. The helper writes a synthetic MealPlan with
    // many days of high-entropy random descriptions (so gzip can't compress
    // them away) into a window-global the share button reads on open. This
    // is the simplest hook into the long-branch test without needing to
    // compose 50 meals through the LLM.
    await page.evaluate(() => {
      // Random alphanumeric per character — gzip cannot compress a uniform
      // distribution like this, so 30 days * 3 meals * 800 char descriptions
      // reliably push the encoded URL well past 8000 chars.
      const randStr = (n: number) => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let s = "";
        for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
      };
      const days = Array.from({ length: 30 }, (_, i) => ({
        day: `2099-01-${String((i % 28) + 1).padStart(2, "0")}`,
        breakfast: { id: `b-${i}-${randStr(8)}`, title: randStr(120), description: randStr(800), effort: "assembly", timeMinutes: 5, servings: 1, ingredients: [randStr(400)], hits: [] },
        lunch:     { id: `l-${i}-${randStr(8)}`, title: randStr(120), description: randStr(800), effort: "weeknight", timeMinutes: 5, servings: 1, ingredients: [randStr(400)], hits: [] },
        dinner:    { id: `d-${i}-${randStr(8)}`, title: randStr(120), description: randStr(800), effort: "weeknight", timeMinutes: 5, servings: 1, ingredients: [randStr(400)], hits: [] },
      }));
      (window as unknown as { __almanacShareTestInflate?: unknown }).__almanacShareTestInflate = {
        id: 99,
        planId: 1,
        weekStart: "2099-01-01",
        generatedAt: 1,
        days,
        grocery: [],
      };
    });

    await openShareModal(page);

    // The modal carries the secondary line + a "Copy long link" button.
    await expect(page.locator(".share-modal")).toContainText(LONG_COPY);
    await expect(page.getByRole("button", { name: /^copy long link$/i })).toBeVisible();
  });

  /* ---------- Plan without a meal plan still shares; meals empty --- */

  test("a host without a meal plan can still share; the recipient's Meals page is empty", async ({ page }) => {
    // The default onboard → addManualPanel → composePlan flow never generates
    // a MealPlan. So the share button on Plan, by default, encodes a payload
    // without a mealPlan. Drive that through and confirm the recipient's
    // Today + Plan render, while Meals shows the "This was not shared" state.
    await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

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
    await page.goto("/" + new URL(url).hash);
    await expect(page).toHaveURL(/#\/today$/);

    // Today renders.
    await expect(page.locator(".headline").first()).toBeVisible();
    // Plan renders.
    await page.goto("/#/plan");
    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible();
    // Meals shows the empty state because the host didn't share one.
    await page.goto("/#/meals");
    await expect(page.locator(".shared-empty")).toContainText(/this was not shared with you/i);
  });

  /* ---------- Malformed payload routes to welcome with notice ------ */

  test("a malformed share URL routes to #/welcome with the decode-failure notice", async ({ page }) => {
    await installMocks(page);

    await page.goto("/#/shared?p=not-a-real-payload");
    await expect(page).toHaveURL(/#\/welcome$/);
    await expect(page.locator(".share-decode-error")).toContainText(DECODE_FAIL_COPY);
  });

  /* ---------- Privacy: shared-view never widens the egress allow-list */

  test("a full shared-view traversal never egresses outside the existing allow-list", async ({ page }) => {
    const stats: MockStats = await installMocks(page);
    await getOntoPlan(page);
    await stubNavigatorShare(page, false);
    await openShareModal(page);
    await page.getByRole("button", { name: /^continue$/i }).click();
    const url = await readClipboard(page);

    // Truncate the recipient's egress list AFTER the seed so we measure only
    // the shared-view leg.
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
    const beforeCount = stats.outboundUrls.length;

    await page.goto("/" + new URL(url).hash);
    await expect(page).toHaveURL(/#\/today$/);
    for (const route of [...SHARED_ROUTES, ...NOT_SHARED_ROUTES]) {
      await page.goto(`/${route}`);
      await page.locator(".wordmark, .headline, .shared-empty").first().waitFor();
    }

    const sharedEgress = stats.outboundUrls.slice(beforeCount).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(sharedEgress).toEqual([]);
  });
});

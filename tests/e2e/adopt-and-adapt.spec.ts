// Adopt-and-adapt — turn a friend's shared protocol into the seed of your own
// first plan (ticket 0020).
//
// The recipient opens a friend's `#/shared` link, reads the protocol, and taps
// a second banner CTA — "Adopt as a starting point". A small modal names what
// will and will not travel; Continue captures a tiny `AdoptSeed` (≤5 habit
// titles + ≤3 eat foods, by literal field reads), clears shared-view, and
// routes to #/welcome. The seed survives consent + onboarding, moves onto the
// saved Profile (Dexie v8), pre-fills the onboarding goals prefix, surfaces a
// plan-empty editorial line, injects a single "Referral context (not
// constraint)" block into the compose prompt, and is cleared after the first
// compose (single-use).
//
// Every assertion below maps 1:1 to an acceptance-criteria checkbox on the
// ticket so a reviewer can read the spec and the ticket side by side.

import { test, expect, type Page } from "@playwright/test";
import { installMocks, type MockStats } from "../helpers/mocks";
import {
  onboard, addManualPanel, composePlan,
  enterSharedViewWithAdopt, seedAdoptInLocalStorage,
} from "../helpers/flows";

const ALLOWED_HOSTS = [
  "127.0.0.1", "localhost",
  "fonts.googleapis.com", "fonts.gstatic.com",
  "api.anthropic.com",
];

const MODAL_COPY =
  "We will not copy your friend's labs, insights, or biology — only the pattern "
  + "of what they were already trying. You will set up your own profile, and your "
  + "first plan will be built against your own answers.";

const WELCOME_NOTICE_COPY =
  "You came in from a friend's shared protocol. We carried over what they were "
  + "already trying — nothing else.";

const PLAN_EMPTY_LINE =
  "You came in after reading a friend's protocol. Your plan will be built "
  + "against your own intake — the friend's pattern is context only.";

const ADOPT_KEY = "almanac.adoptSeed";

/**
 * A realistic shared payload — three habits, three eat foods. Used by most
 * tests. Habit titles + the eat-list `food` strings are the only things that
 * travel into the seed; everything else here is noise the seed must drop.
 */
const PAYLOAD = {
  version: 1 as const,
  eatList: [
    { id: "e-fish", food: "Fatty fish (salmon, sardines)", frequency: "3x per week", portion: "4 oz", why: "Omega-3s.", markerKeys: [] },
    { id: "e-mag", food: "Magnesium-rich greens", frequency: "daily", portion: "2 cups", why: "Sleep.", markerKeys: [] },
    { id: "e-oats", food: "Steel-cut oats", frequency: "daily", portion: "1/2 cup", why: "Fiber.", markerKeys: [] },
    { id: "e-extra", food: "Berries", frequency: "daily", portion: "1 cup", why: "Polyphenols.", markerKeys: [] },
  ],
  avoidList: [
    { id: "a-seed", food: "Seed oils", why: "Inflammation." },
  ],
  habitStack: {
    intro: "Three small actions.",
    habits: [
      { id: "h-protein", title: "Morning protein", cue: "Breakfast", why: "Energy." },
      { id: "h-mag", title: "Magnesium glycinate before bed", cue: "Bedtime", why: "Sleep." },
      { id: "h-walk", title: "Afternoon walk", cue: "After lunch", why: "Glucose." },
    ],
  },
};

/**
 * Wipe the recipient's browser to a pristine first-time visitor: no consent,
 * no profile, empty IndexedDB. Mirrors the reset in protocol-link.spec.ts.
 */
async function freshRecipient(page: Page): Promise<void> {
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
}

test.describe("Adopt-and-adapt (ticket 0020)", () => {

  /* ---------- The Adopt CTA appears next to "Start your own" ---------- */

  test("the shared-view banner gains an 'Adopt as a starting point' CTA for first-time recipients", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD, { tapAdopt: false });

    const startOwn = page.locator(".tour-banner a[href='#/welcome']");
    const adopt = page.locator(".tour-banner [data-action='adopt-protocol']");

    await expect(startOwn).toBeVisible();
    await expect(startOwn).toContainText(/start your own/i);
    await expect(adopt).toBeVisible();
    await expect(adopt).toContainText(/adopt as a starting point/i);

    // Equal visual weight: both carry the same CTA class token.
    await expect(adopt).toHaveClass(/tour-banner__cta/);
    await expect(startOwn).toHaveClass(/tour-banner__cta/);
  });

  /* ---------- Modal copy is verbatim; Cancel is a no-op -------------- */

  test("tapping Adopt opens a modal with the verbatim copy and two buttons", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD, { tapAdopt: false });

    await page.locator(".tour-banner [data-action='adopt-protocol']").click();
    await page.locator(".adopt-modal").waitFor();

    await expect(page.locator(".adopt-modal")).toContainText(MODAL_COPY);
    await expect(page.getByRole("button", { name: /^continue$/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^cancel$/i })).toBeEnabled();
  });

  test("Cancel closes the modal with zero side effects", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD, { tapAdopt: false });

    await page.locator(".tour-banner [data-action='adopt-protocol']").click();
    await page.locator(".adopt-modal").waitFor();
    await page.getByRole("button", { name: /^cancel$/i }).click();

    await expect(page.locator(".adopt-modal")).toHaveCount(0);
    // No seed written, shared-view still active.
    const seed = await page.evaluate((k) => localStorage.getItem(k), ADOPT_KEY);
    expect(seed).toBeNull();
    const shared = await page.evaluate(() => localStorage.getItem("almanac.sharedView"));
    expect(shared).toBe("true");
    await expect(page).toHaveURL(/#\/today$/);
  });

  /* ---------- Continue: seed + exitSharedView + route to welcome ----- */

  test("Continue writes the AdoptSeed, clears shared-view, and lands on welcome with the notice", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD);

    await expect(page).toHaveURL(/#\/welcome$/);

    // (1) the seed is written with the right shape + values, in order.
    const seed = await page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    }, ADOPT_KEY);
    expect(seed).not.toBeNull();
    expect(seed.version).toBe(1);
    expect(seed.habitTitles).toEqual([
      "Morning protein", "Magnesium glycinate before bed", "Afternoon walk",
    ]);
    expect(seed.topEatFoods).toEqual([
      "Fatty fish (salmon, sardines)", "Magnesium-rich greens", "Steel-cut oats",
    ]);
    expect(typeof seed.capturedAt).toBe("number");
    expect(Object.keys(seed).sort()).toEqual(["capturedAt", "habitTitles", "topEatFoods", "version"]);

    // (2) shared-view cleared.
    const shared = await page.evaluate(() => localStorage.getItem("almanac.sharedView"));
    expect(shared).toBeNull();

    // (3) welcome page: consent unticked + the inline notice.
    await expect(page.locator("#consent")).not.toBeChecked();
    await expect(page.locator(".adopt-notice")).toContainText(WELCOME_NOTICE_COPY);
  });

  /* ---------- Seed caps: ≤5 habits, ≤3 foods ------------------------- */

  test("the seed carries at most five habit titles and at most three eat foods, in order", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    const big = {
      version: 1 as const,
      eatList: Array.from({ length: 6 }, (_, i) => ({
        id: `e-${i}`, food: `Food ${i}`, frequency: "daily", portion: "1", why: "x", markerKeys: [],
      })),
      avoidList: [],
      habitStack: {
        intro: "Many.",
        habits: Array.from({ length: 7 }, (_, i) => ({
          id: `h-${i}`, title: `Habit ${i}`, cue: "c", why: "w",
        })),
      },
    };
    await enterSharedViewWithAdopt(page, big);

    const seed = await page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    }, ADOPT_KEY);
    expect(seed.habitTitles).toEqual(["Habit 0", "Habit 1", "Habit 2", "Habit 3", "Habit 4"]);
    expect(seed.topEatFoods).toEqual(["Food 0", "Food 1", "Food 2"]);
  });

  /* ---------- Sentinel exclusion: only habits + top three foods ------ */

  test("the seed excludes every field but habit titles and the top three eat foods", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    const stuffed = {
      version: 1 as const,
      eatList: [
        { id: "e-1", food: "Lentils", frequency: "__ALMANAC_SENTINEL_FREQ__", portion: "__ALMANAC_SENTINEL_PORTION__", why: "__ALMANAC_SENTINEL_WHY__", markerKeys: ["__ALMANAC_SENTINEL_EATMARKER__"] },
        { id: "e-2", food: "Greens", frequency: "daily", portion: "2c", why: "x", markerKeys: [] },
        { id: "e-3", food: "Oats", frequency: "daily", portion: "1/2c", why: "x", markerKeys: [] },
      ],
      avoidList: [
        { id: "a-1", food: "__ALMANAC_SENTINEL_AVOID__", why: "__ALMANAC_SENTINEL_AVOIDWHY__", swap: "__ALMANAC_SENTINEL_SWAP__" },
      ],
      habitStack: {
        intro: "__ALMANAC_SENTINEL_INTRO__",
        habits: [
          { id: "__ALMANAC_SENTINEL_HABITID__", title: "Walk daily", cue: "__ALMANAC_SENTINEL_CUE__", why: "__ALMANAC_SENTINEL_HABITWHY__" },
        ],
      },
      mealPlan: {
        days: [{
          day: "2099-01-01",
          breakfast: { id: "m-b", title: "__ALMANAC_SENTINEL_MEAL__", description: "d", effort: "assembly", timeMinutes: 5, servings: 1, ingredients: ["__ALMANAC_SENTINEL_INGREDIENT__"], hits: [] },
          lunch:     { id: "m-l", title: "x", description: "d", effort: "assembly", timeMinutes: 5, servings: 1, ingredients: [], hits: [] },
          dinner:    { id: "m-d", title: "x", description: "d", effort: "assembly", timeMinutes: 5, servings: 1, ingredients: [], hits: [] },
        }],
        grocery: [{ name: "__ALMANAC_SENTINEL_GROCERY__", items: [{ name: "__ALMANAC_SENTINEL_GROCERYITEM__" }] }],
      },
    };
    await enterSharedViewWithAdopt(page, stuffed);

    const raw = await page.evaluate((k) => localStorage.getItem(k), ADOPT_KEY);
    expect(raw).not.toBeNull();
    // No sentinel from any excluded field appears anywhere in the stored seed.
    for (const sentinel of [
      "__ALMANAC_SENTINEL_FREQ__", "__ALMANAC_SENTINEL_PORTION__", "__ALMANAC_SENTINEL_WHY__",
      "__ALMANAC_SENTINEL_EATMARKER__", "__ALMANAC_SENTINEL_AVOID__", "__ALMANAC_SENTINEL_AVOIDWHY__",
      "__ALMANAC_SENTINEL_SWAP__", "__ALMANAC_SENTINEL_INTRO__", "__ALMANAC_SENTINEL_HABITID__",
      "__ALMANAC_SENTINEL_CUE__", "__ALMANAC_SENTINEL_HABITWHY__", "__ALMANAC_SENTINEL_MEAL__",
      "__ALMANAC_SENTINEL_INGREDIENT__", "__ALMANAC_SENTINEL_GROCERY__", "__ALMANAC_SENTINEL_GROCERYITEM__",
    ]) {
      expect(raw).not.toContain(sentinel);
    }
    // Only the carried values are present.
    expect(raw).toContain("Walk daily");
    expect(raw).toContain("Lentils");
    expect(raw).toContain("Greens");
    expect(raw).toContain("Oats");
  });

  /* ---------- Onboarding prefix renders + persists across refresh ---- */

  test("the onboarding goals field surfaces the seeded prefix, above the editable area", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD);

    // Consent through to onboarding.
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);

    const prefix = page.locator(".adopt-prefix");
    await expect(prefix).toBeVisible();
    await expect(prefix).toContainText(
      "A friend's protocol leaned on: Morning protein, Magnesium glycinate before bed, Afternoon walk · "
      + "Fatty fish (salmon, sardines), Magnesium-rich greens, Steel-cut oats. Edit below to add your own.",
    );
    // The prefix is a sibling of the textarea, not inside it — typing never
    // collides with the seed text.
    const textareaValue = await page.locator("#goals").inputValue();
    expect(textareaValue).not.toContain("A friend's protocol leaned on");
  });

  test("the seed persists across a browser refresh during the consent + onboarding flow", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD);
    await expect(page).toHaveURL(/#\/welcome$/);

    // Force-reload on welcome — the seed must survive.
    await page.reload();
    await expect(page.locator(".adopt-notice")).toContainText(WELCOME_NOTICE_COPY);

    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);
    await expect(page.locator(".adopt-prefix")).toContainText(/a friend's protocol leaned on/i);
  });

  /* ---------- Seed moves onto the Profile + plan-empty editorial line  */

  test("on onboarding submit the seed moves to the Profile and the plan-empty state shows the editorial line", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD);

    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);

    // Fill the form (mirror of the onboard() helper) and submit.
    await page.fill("#name", "Recipient");
    await page.fill("#birthDate", "1992-03-03");
    await page.selectOption("#sex", "female");
    await page.fill("#goals", "Better sleep, steadier energy.");
    await page.fill("#dietPattern", "Pescatarian, Mediterranean.");
    await page.fill("#key", "sk-ant-test-fake-key");
    await page.getByRole("button", { name: /^begin$/i }).click();
    await expect(page).toHaveURL(/#\/plan$/);

    // The localStorage entry is cleared (single source of truth).
    const seedLs = await page.evaluate((k) => localStorage.getItem(k), ADOPT_KEY);
    expect(seedLs).toBeNull();

    // The seed now lives on the persisted Profile.
    const profileSeed = await page.evaluate(() => {
      return new Promise<unknown>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("profile", "readonly");
          const get = tx.objectStore("profile").get("singleton");
          get.onsuccess = () => { db.close(); resolve((get.result as { adoptSeed?: unknown })?.adoptSeed ?? null); };
          get.onerror   = () => { db.close(); resolve(null); };
        };
      });
    });
    expect(profileSeed).not.toBeNull();

    // The plan-empty state carries the editorial line above the intake CTA.
    await expect(page.locator(".adopt-plan-line")).toContainText(PLAN_EMPTY_LINE);
    await expect(page.locator("#compose-from-intake")).toBeVisible();
  });

  /* ---------- Compose: the referral-context prompt block fires once -- */

  test("compose with a seed appends the 'Referral context (not constraint)' block to the prompt, then clears the seed", async ({ page }) => {
    const stats = await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD);

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

    // First compose — from intake.
    await page.locator("#compose-from-intake").click();
    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });

    // The first compose prompt carried the referral block, naming the habits + foods.
    const firstPrompt = stats.lastPromptBody();
    expect(firstPrompt).toContain("Referral context (not constraint):");
    expect(firstPrompt).toContain("Morning protein");
    expect(firstPrompt).toContain("Fatty fish (salmon, sardines)");

    // The composed plan's snapshot acknowledges the referral (driven by the
    // adopt-seed fixture the mock serves on the seeded compose).
    await expect(page.locator(".dash-snapshot, .prose").first())
      .toContainText(/you came in after reading a friend's protocol/i);

    // The seed is single-use: cleared off the Profile after the first compose.
    const profileSeed = await page.evaluate(() => {
      return new Promise<unknown>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => resolve("err");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("profile", "readonly");
          const get = tx.objectStore("profile").get("singleton");
          get.onsuccess = () => { db.close(); resolve((get.result as { adoptSeed?: unknown })?.adoptSeed ?? null); };
          get.onerror   = () => { db.close(); resolve("err"); };
        };
      });
    });
    expect(profileSeed).toBeNull();

    // Second compose does NOT carry the referral block.
    await page.locator("#recompose").click();
    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible({ timeout: 20_000 });
    const secondPrompt = stats.lastPromptBody();
    expect(secondPrompt).not.toContain("Referral context (not constraint):");
  });

  /* ---------- The seed-absent prompt is byte-identical to pre-0020 --- */

  test("without a seed, the compose prompt contains no referral block", async ({ page }) => {
    const stats = await installMocks(page);
    await onboard(page);
    await addManualPanel(page);
    await composePlan(page);

    const prompt = stats.lastPromptBody();
    expect(prompt).not.toContain("Referral context");
    expect(prompt).not.toContain("the user arrived after reading a friend's protocol");
  });

  /* ---------- "Start your own" stays unchanged: no seed -------------- */

  test("the 'Start your own' CTA still works unchanged and writes no AdoptSeed", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD, { tapAdopt: false });

    await page.locator(".tour-banner a[href='#/welcome']").click();
    await expect(page).toHaveURL(/#\/welcome$/);

    const seed = await page.evaluate((k) => localStorage.getItem(k), ADOPT_KEY);
    expect(seed).toBeNull();
    // No adopt notice on the clean-slate path.
    await expect(page.locator(".adopt-notice")).toHaveCount(0);
    await expect(page.locator("#consent")).not.toBeChecked();
  });

  /* ---------- Zero network + zero recipient-data IDB reads ----------- */

  test("the full adopt flow fires zero Anthropic calls and never reads the recipient's panels/plans/checkins", async ({ page }) => {
    const stats: MockStats = await installMocks(page);
    await freshRecipient(page);

    // Poison the recipient-data reads BEFORE the SPA bootstraps. Any call to
    // db.allPanels / db.latestPlan / db.recentCheckIns during the adopt flow
    // throws a sentinel the page logs to console.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

    const before = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;

    await enterSharedViewWithAdopt(page, PAYLOAD);
    await expect(page).toHaveURL(/#\/welcome$/);
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);

    const after = stats.extractCalls + stats.planCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
    expect(errors.filter(e => e.includes("__ALMANAC"))).toEqual([]);
  });

  /* ---------- Returning user does not see the Adopt CTA -------------- */

  test("a returning user (profile + consent on device) opening a share link does not see the Adopt CTA", async ({ page }) => {
    await installMocks(page);
    // Onboard a real user first — this device now has a profile + consent.
    await onboard(page);

    // Now open a friend's share link without wiping state.
    await enterSharedViewWithAdopt(page, PAYLOAD, { tapAdopt: false, fresh: false });

    // The banner shows ONLY "Start your own →".
    await expect(page.locator(".tour-banner a[href='#/welcome']")).toBeVisible();
    await expect(page.locator(".tour-banner [data-action='adopt-protocol']")).toHaveCount(0);
  });

  /* ---------- Most-recent seed wins (one-friend-at-a-time) ----------- */

  test("opening a second share link before consent overwrites the first seed", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD);
    await expect(page).toHaveURL(/#\/welcome$/);

    // A second friend's link, different habits — adopt it too, before consenting.
    const second = {
      version: 1 as const,
      eatList: [{ id: "e2", food: "Sardines only", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h2", title: "Cold plunge", cue: "AM", why: "x" }] },
    };
    await enterSharedViewWithAdopt(page, second);
    await expect(page).toHaveURL(/#\/welcome$/);

    const seed = await page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : null;
    }, ADOPT_KEY);
    expect(seed.habitTitles).toEqual(["Cold plunge"]);
    expect(seed.topEatFoods).toEqual(["Sardines only"]);
  });

  /* ---------- Direct-seeded prefix (unit-style, skips share round-trip) */

  test("a directly-seeded localStorage AdoptSeed renders the welcome notice and onboarding prefix", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await seedAdoptInLocalStorage(page, {
      version: 1,
      habitTitles: ["Direct habit A", "Direct habit B"],
      topEatFoods: ["Direct food X"],
      capturedAt: Date.now(),
    });

    // Reload so the router re-renders welcome AFTER the seed was written — a
    // bare goto to the same #/welcome hash does not fire a re-render (the SPA
    // hash-nav gotcha from LESSONS.md). The seed survives the reload.
    await page.goto("/#/welcome");
    await page.reload();
    await expect(page.locator(".adopt-notice")).toContainText(WELCOME_NOTICE_COPY);
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page.locator(".adopt-prefix")).toContainText(
      "A friend's protocol leaned on: Direct habit A, Direct habit B · Direct food X. Edit below to add your own.",
    );
  });

  /* ---------- Privacy: the adopt flow never widens the egress list --- */

  test("the adopt flow never egresses outside the existing allow-list", async ({ page }) => {
    const stats: MockStats = await installMocks(page);
    await freshRecipient(page);
    const before = stats.outboundUrls.length;

    await enterSharedViewWithAdopt(page, PAYLOAD);
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding$/);

    const offending = stats.outboundUrls.slice(before).filter(u => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      try {
        const h = new URL(u).hostname;
        return !ALLOWED_HOSTS.some(a => h === a || h.endsWith(`.${a}`));
      } catch { return false; }
    });
    expect(offending).toEqual([]);
  });

  /* ---------- Mobile touch target on the modal ---------------------- */

  test("the Adopt CTA and modal buttons clear a 44×44 css px touch target", async ({ page }) => {
    await installMocks(page);
    await freshRecipient(page);
    await enterSharedViewWithAdopt(page, PAYLOAD, { tapAdopt: false });

    const adopt = page.locator(".tour-banner [data-action='adopt-protocol']");
    const adoptBox = await adopt.boundingBox();
    expect(adoptBox).not.toBeNull();
    expect(adoptBox!.height).toBeGreaterThanOrEqual(44);

    await adopt.click();
    await page.locator(".adopt-modal").waitFor();
    const cont = page.getByRole("button", { name: /^continue$/i });
    const contBox = await cont.boundingBox();
    expect(contBox).not.toBeNull();
    expect(contBox!.height).toBeGreaterThanOrEqual(44);
  });
});

/* ========================================================================== */
/*  AC: Dexie v7 → v8 schema migration is additive (no profile field loss)     */
/* ========================================================================== */

test.describe("Adopt-and-adapt · v7 → v8 schema migration", () => {
  test("a v7 profile survives the v8 upgrade with adoptSeed === undefined", async ({ page }) => {
    await installMocks(page);
    // Acknowledge consent so the welcome gate doesn't intercept later, then
    // tear down the DB and seed a pristine v7 schema (mirror of projection
    // .spec.ts's v5→v6 migration test).
    await page.goto("/");
    await page.locator("#consent").waitFor({ state: "visible" });
    await page.locator("#consent").check();
    await page.getByRole("button", { name: /continue to onboarding/i }).click();
    await expect(page).toHaveURL(/#\/onboarding/);

    const seedResult = await page.evaluate(async () => {
      const w = window as unknown as { __almanacDb?: { close(): void } };
      try { w.__almanacDb?.close(); } catch { /* no-op */ }

      await new Promise<void>((resolve) => {
        const del = indexedDB.deleteDatabase("almanac");
        del.onsuccess = () => resolve();
        del.onerror   = () => resolve();
        del.onblocked = () => resolve();
      });

      await new Promise<void>((resolve, reject) => {
        // Dexie scales schema versions by 10 internally — version(7) == IDB v70.
        const req = indexedDB.open("almanac", 70);
        req.onerror = () => reject(req.error ?? new Error("v7 open failed"));
        req.onupgradeneeded = () => {
          const db = req.result;
          // Match the v7 schema EXACTLY (mirror of src/db.ts version 7).
          db.createObjectStore("profile", { keyPath: "id" });
          const panels = db.createObjectStore("panels", { keyPath: "id", autoIncrement: true });
          panels.createIndex("drawnAt", "drawnAt");
          panels.createIndex("createdAt", "createdAt");
          const plans = db.createObjectStore("plans", { keyPath: "id", autoIncrement: true });
          plans.createIndex("generatedAt", "generatedAt");
          const meals = db.createObjectStore("mealPlans", { keyPath: "id", autoIncrement: true });
          meals.createIndex("planId", "planId");
          meals.createIndex("weekStart", "weekStart");
          meals.createIndex("generatedAt", "generatedAt");
          const checkins = db.createObjectStore("checkins", { keyPath: "id", autoIncrement: true });
          checkins.createIndex("day", "day", { unique: true });
          checkins.createIndex("createdAt", "createdAt");
          const ec = db.createObjectStore("extractCache", { keyPath: "hash" });
          ec.createIndex("createdAt", "createdAt");
          const um = db.createObjectStore("userMarkers", { keyPath: "key" });
          um.createIndex("createdAt", "createdAt");
          const proj = db.createObjectStore("projections", { keyPath: "id", autoIncrement: true });
          proj.createIndex("[markerKey+panelId]", ["markerKey", "panelId"], { unique: true });
          proj.createIndex("panelId", "panelId");
          proj.createIndex("markerKey", "markerKey");
          proj.createIndex("createdAt", "createdAt");
          const sessions = db.createObjectStore("sessions", { keyPath: "id", autoIncrement: true });
          sessions.createIndex("at", "at");
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("profile", "readwrite");
          tx.objectStore("profile").put({
            id: "singleton",
            ownerName: "V7 Migration Test",
            sex: "female",
            goals: "test goals",
            conditions: "none",
            dietPattern: "pescatarian",
            anthropicKey: "sk-ant-test-fake-key",
            model: "claude-sonnet-4-6",
            householdSize: 2,
            createdAt: 111,
            updatedAt: 222,
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror    = () => { db.close(); reject(tx.error ?? new Error("seed failed")); };
        };
      });

      return await new Promise<{ profile: number; version: number }>((resolve, reject) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => reject(req.error ?? new Error("verify open failed"));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("profile", "readonly");
          const prCount = tx.objectStore("profile").count();
          let profile = -1;
          prCount.onsuccess = () => { profile = prCount.result; };
          tx.oncomplete = () => { const version = db.version; db.close(); resolve({ profile, version }); };
        };
      });
    });
    expect(seedResult.version).toBe(70);
    expect(seedResult.profile).toBe(1);

    // Open the SPA at v8 — runs the additive upgrade.
    await page.goto("/#/settings");
    const openResult = await page.evaluate(async () => {
      const w = window as unknown as { __almanacDb?: { open(): Promise<unknown> } };
      try { await w.__almanacDb?.open(); return { ok: true, err: null as string | null }; }
      catch (e) { return { ok: false, err: (e as Error)?.message ?? String(e) }; }
    });
    expect(openResult, JSON.stringify(openResult)).toMatchObject({ ok: true });

    const post = await page.evaluate(() => {
      return new Promise<{ version: number; profile: Record<string, unknown> | null }>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => resolve({ version: -1, profile: null });
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("profile", "readonly");
          const get = tx.objectStore("profile").get("singleton");
          let profile: Record<string, unknown> | null = null;
          get.onsuccess = () => { profile = get.result as Record<string, unknown> ?? null; };
          tx.oncomplete = () => { const version = db.version; db.close(); resolve({ version, profile }); };
        };
      });
    });
    // Dexie v8 → IDB v80. The full chain ran iff the IDB version advanced.
    expect(post.version).toBe(80);
    expect(post.profile).not.toBeNull();
    // Every v7 profile field survived — no data loss.
    expect(post.profile!.ownerName).toBe("V7 Migration Test");
    expect(post.profile!.dietPattern).toBe("pescatarian");
    expect(post.profile!.householdSize).toBe(2);
    expect(post.profile!.createdAt).toBe(111);
    // The new optional field is simply absent on a migrated v7 row.
    expect(post.profile!.adoptSeed).toBeUndefined();
  });
});

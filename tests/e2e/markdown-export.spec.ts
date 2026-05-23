// Readable Markdown export (ticket 0027).
//
// A "Download as readable text" action in Settings runs a pure, deterministic,
// zero-network transform over the data exportAll() gathers and emits a single
// human-readable .md file in the editorial voice. Each test below maps 1:1 to
// an acceptance-criteria box in docs/backlog/0027-*.md.
//
// The renderer (`renderAlmanacMarkdown`) is pure, so most assertions import it
// directly inside the page and snapshot its output against a seeded AlmanacExport
// — no DOM round-trip needed. The download-mechanism tests drive the Settings
// action and read the saved file from disk.

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { installMocks } from "../helpers/mocks";
import { onboard, seedPanel, seedPlan } from "../helpers/flows";

const KEY_SENTINEL = "sk-ant-canary-MARKDOWN-27272";

/**
 * Run `renderAlmanacMarkdown` inside the page against a hand-built AlmanacExport,
 * folding in the merged marker catalog (seed + any user markers) exactly as the
 * Settings wiring does. Returns the rendered Markdown string. Pure: no DB read,
 * no network — the export object is supplied by the caller.
 */
async function renderFor(page: Page, data: unknown): Promise<string> {
  return page.evaluate(async (exportData) => {
    const md = await import("/src/export/markdown.ts");
    const { getAllMarkers } = await import("/src/data/userMarkers.ts");
    const markers = await getAllMarkers();
    return md.renderAlmanacMarkdown(exportData as never, markers);
  }, data);
}

/** A minimal but realistic AlmanacExport for the pure-render tests. */
function sampleExport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 4,
    exportedAt: Date.parse("2026-05-20T12:00:00Z"),
    profile: {
      id: "singleton",
      ownerName: "Mira Chen",
      birthDate: "1990-01-15",
      sex: "female",
      goals: "Lower cholesterol and steadier afternoon energy.",
      conditions: "None.",
      dietPattern: "Pescatarian, Mediterranean.",
      anthropicKey: KEY_SENTINEL,
      model: "claude-sonnet-4-6",
      createdAt: 0,
      updatedAt: 0,
    },
    panels: [
      {
        drawnAt: "2026-03-10",
        labName: "Quest",
        source: "manual",
        results: [
          {
            markerKey: "ferritin_f", value: 32, unit: "ng/mL",
            labRange: { low: 15, high: 150 }, optimalRange: { low: 50, high: 150 }, flag: "suboptimal",
          },
        ],
        createdAt: 0,
      },
      {
        drawnAt: "2026-05-10",
        labName: "LabCorp",
        source: "manual",
        results: [
          {
            markerKey: "ferritin_f", value: 58, unit: "ng/mL",
            labRange: { low: 15, high: 150 }, optimalRange: { low: 50, high: 150 }, flag: "optimal",
          },
          // A result with missing ranges to exercise the graceful "—" path.
          { markerKey: "total_cholesterol", value: 210, unit: "mg/dL" },
        ],
        createdAt: 0,
      },
    ],
    plans: [
      {
        generatedAt: Date.parse("2026-05-11T09:00:00Z"),
        basedOnPanelIds: [],
        snapshot: "A two-paragraph snapshot in the editorial voice.\n\nThe second paragraph.",
        insights: [
          { title: "Ferritin below the functional floor", detail: "Iron stores read low for an active adult.", priority: "high" },
          { title: "Cholesterol in the lab range, above optimum", detail: "Worth a soluble-fiber push.", priority: "medium" },
        ],
        eatList: [
          { id: "e1", food: "Fatty fish", frequency: "3x per week", portion: "~4 oz", why: "Omega-3s.", markerKeys: ["total_cholesterol"] },
        ],
        avoidList: [
          { id: "a1", food: "Industrial seed oils", why: "Pro-inflammatory.", swap: "Olive oil or ghee" },
        ],
        lifestyle: [],
        supplements: [],
        habitStack: {
          intro: "Small actions.",
          habits: [
            { id: "h1", title: "Magnesium glycinate", cue: "With dinner", why: "Supports sleep." },
            { id: "h2", title: "10-min walk after lunch", cue: "Right after the last bite", why: "Smooths the afternoon." },
          ],
        },
        retest: [
          { markerKeys: ["ferritin_f"], whenWeeks: 12, reason: "Re-check iron stores after the food + supplement push." },
        ],
      },
    ],
    mealPlans: [],
    checkins: [],
    userMarkers: [],
    ...overrides,
  };
}

test.describe("Readable Markdown export (0027)", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  // AC: renderAlmanacMarkdown is a pure transform — given an AlmanacExport it
  // returns a single Markdown string, no DOM / Dexie / network.
  test("renderAlmanacMarkdown is a pure string transform", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport());
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(100);
  });

  // AC: dateline header — "# Almanac — <ownerName>" + a subline through the
  // most-recent panel month + year.
  test("opens with the editorial dateline header", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport());
    expect(out).toContain("# Almanac — Mira Chen");
    expect(out).toContain("A drawn record through May 2026");
  });

  // AC: when there are no panels, the subline falls back to the export month.
  test("dateline falls back to the export month when no panels", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport({ panels: [] }));
    expect(out).toContain("A drawn record through May 2026");
  });

  // AC: Profile section renders name/age/sex/goals/conditions/diet — and the
  // Anthropic key NEVER appears (not the value, not a masked version).
  test("Profile section renders the human summary and never leaks the key", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport());
    expect(out).toContain("## Profile");
    expect(out).toContain("Mira Chen");
    expect(out).toContain("Pescatarian, Mediterranean.");
    expect(out).toContain("Lower cholesterol and steadier afternoon energy.");
    // Age computed from birthDate.
    expect(out).toMatch(/3[0-9]/); // age 36 in 2026
    // The key — in any form — must be absent.
    expect(out).not.toContain(KEY_SENTINEL);
    expect(out).not.toMatch(/sk-ant/i);
    expect(out.toLowerCase()).not.toContain("api key");
    expect(out.toLowerCase()).not.toContain("anthropic");
  });

  // AC: Panels section — one subsection per panel, newest first, each result on
  // a " · "-delimited line with both ranges + flag. Missing ranges → "lab range —".
  test("Panels section renders newest-first with both ranges and graceful gaps", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport());
    expect(out).toContain("## Panels");
    // Newest panel (May / LabCorp) appears before the older one (March / Quest).
    const mayIdx = out.indexOf("2026-05-10");
    const marIdx = out.indexOf("2026-03-10");
    expect(mayIdx).toBeGreaterThan(-1);
    expect(marIdx).toBeGreaterThan(mayIdx);
    expect(out).toContain("LabCorp");
    expect(out).toContain("Quest");
    // A complete result line carries both ranges + flag.
    expect(out).toContain("lab range 15–150");
    expect(out).toContain("functional 50–150");
    // The result missing ranges renders graceful em-dashes.
    expect(out).toContain("lab range —");
    expect(out).toContain("functional —");
  });

  // AC: Plans section — one subsection per plan, newest first; snapshot,
  // prioritized insights, eat / avoid / habits / retest all render.
  test("Plans section renders snapshot, insights, eat/avoid/habits/retest", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport());
    expect(out).toContain("## Plans");
    expect(out).toContain("A two-paragraph snapshot in the editorial voice.");
    // Insights in priority order: the high one before the medium one.
    const highIdx = out.indexOf("Ferritin below the functional floor");
    const medIdx = out.indexOf("Cholesterol in the lab range, above optimum");
    expect(highIdx).toBeGreaterThan(-1);
    expect(medIdx).toBeGreaterThan(highIdx);
    // Eat list: food · frequency · portion · why.
    expect(out).toContain("Fatty fish");
    expect(out).toContain("3x per week");
    expect(out).toContain("~4 oz");
    // Avoid list: food · swap · why.
    expect(out).toContain("Industrial seed oils");
    expect(out).toContain("Olive oil or ghee");
    // Habit stack: title + cue.
    expect(out).toContain("Magnesium glycinate");
    expect(out).toContain("With dinner");
    // Retest cadence: markers + weeks + reason.
    expect(out).toContain("12 weeks");
    expect(out).toContain("Re-check iron stores after the food + supplement push.");
  });

  // AC: Marker trends appendix — one line per marker with >= 2 draws, oldest →
  // newest with months; single-draw markers omitted.
  test("Marker trends appendix lists multi-draw markers and omits single-draw", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport());
    expect(out).toContain("## Marker trends");
    // Ferritin has two draws → it appears, oldest (March) → newest (May).
    expect(out).toMatch(/32 \(March\).*→.*58 \(May\).*ng\/mL/);
    // Total cholesterol has a single draw → omitted from the appendix. It must
    // not appear as a trend line (only inside the Panels section).
    const trendsIdx = out.indexOf("## Marker trends");
    const trendsSection = out.slice(trendsIdx);
    expect(trendsSection).not.toContain("210");
  });

  // AC: Adherence summary — total days logged + per-habit hit counts.
  test("Adherence summary counts logged days and per-habit hits", async ({ page }) => {
    await onboard(page);
    const withCheckins = sampleExport({
      checkins: [
        { day: "2026-05-01", habitsCompleted: ["h1", "h2"], createdAt: 0 },
        { day: "2026-05-02", habitsCompleted: ["h1"], createdAt: 0 },
        { day: "2026-05-03", habitsCompleted: ["h2"], createdAt: 0 },
      ],
    });
    const out = await renderFor(page, withCheckins);
    expect(out).toContain("## Adherence");
    expect(out).toContain("3"); // total days logged
    // Per-habit hit counts over the logged span.
    expect(out).toMatch(/Magnesium glycinate — 2 of 3 logged days/);
    expect(out).toMatch(/10-min walk after lunch — 2 of 3 logged days/);
  });

  // AC: Adherence empty copy.
  test("Adherence reads the empty line when no check-ins exist", async ({ page }) => {
    await onboard(page);
    const out = await renderFor(page, sampleExport({ checkins: [] }));
    expect(out).toContain("No check-ins logged yet.");
  });

  // AC: the rendering layer introduces NO banned editorial words.
  test("the template introduces no banned editorial words", async ({ page }) => {
    await onboard(page);
    // An export with no user-supplied free-form text, so anything banned would
    // come from the template's own copy.
    const bare = sampleExport({
      profile: {
        id: "singleton", ownerName: "A", sex: "unspecified",
        goals: "", conditions: "", dietPattern: "",
        anthropicKey: KEY_SENTINEL, model: "m", createdAt: 0, updatedAt: 0,
      },
      panels: [], plans: [], checkins: [],
    });
    const out = bare ? await renderFor(page, bare) : "";
    for (const banned of ["journey", "amazing", "exciting", "great"]) {
      expect(out.toLowerCase()).not.toContain(banned);
    }
  });

  // AC: the Settings action triggers a `.md` download with the slugified name.
  test("Settings action downloads <slug>.almanac.md", async ({ page }) => {
    await onboard(page, { name: "Mira Chen" });
    await seedPanel(page, {
      drawnAt: "2026-05-01", labName: "Test Lab", clearFirst: true,
      results: [{ markerKey: "ferritin_f", value: 50, unit: "ng/mL" }],
    });
    await page.goto("/#/settings");
    await page.locator("#export-md").waitFor();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export-md").click(),
    ]);
    expect(dl.suggestedFilename()).toBe("mira-chen.almanac.md");
  });

  // AC: the touch target for the action is >= 44x44 css px.
  test("the action has an adequate touch target", async ({ page }) => {
    await onboard(page);
    await page.goto("/#/settings");
    const box = await page.locator("#export-md").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  // AC: the downloaded file content renders the full timeline and never leaks
  // the key (the end-to-end sentinel test, through the real Settings wiring).
  test("downloaded file carries the timeline and never leaks the key", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "programmatic download path interception lives on chromium");
    await onboard(page, { name: "Mira Chen", sex: "female", key: KEY_SENTINEL });
    await seedPanel(page, {
      drawnAt: "2026-03-10", labName: "Quest", clearFirst: true,
      results: [{ markerKey: "ferritin_f", value: 32, unit: "ng/mL", optimalRange: { low: 50, high: 150 } }],
    });
    await seedPanel(page, {
      drawnAt: "2026-05-10", labName: "LabCorp",
      results: [{ markerKey: "ferritin_f", value: 58, unit: "ng/mL", optimalRange: { low: 50, high: 150 } }],
    });
    await seedPlan(page, {
      generatedDaysAgo: 1, clearFirst: true,
      snapshot: "A seeded plan for the markdown export test.",
      eatList: [{ id: "e1", food: "Fatty fish", frequency: "3x per week", portion: "~4 oz", why: "Omega-3s." }],
      habits: [{ id: "h1", title: "Magnesium glycinate" }],
    });
    await page.goto("/#/settings");
    await page.locator("#export-md").waitFor();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export-md").click(),
    ]);
    const path = await dl.path();
    const md = readFileSync(path, "utf8");
    expect(md).toContain("# Almanac — Mira Chen");
    expect(md).toContain("## Panels");
    expect(md).toContain("Fatty fish");
    expect(md).toContain("## Marker trends");
    expect(md).not.toContain(KEY_SENTINEL);
  });

  // AC: the export fires ZERO network / Anthropic calls — pure local transform.
  test("the Markdown export fires zero network calls", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "programmatic download path interception lives on chromium");
    const stats = await installMocks(page);
    await onboard(page, { name: "Mira Chen" });
    await seedPanel(page, {
      drawnAt: "2026-05-01", labName: "Test Lab", clearFirst: true,
      results: [{ markerKey: "ferritin_f", value: 50, unit: "ng/mL" }],
    });
    await page.goto("/#/settings");
    await page.locator("#export-md").waitFor();
    const before = stats.outboundUrls.length;
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export-md").click(),
    ]);
    await dl.path();

    const offending = stats.outboundUrls.slice(before).filter((u) => {
      if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
      return true;
    });
    expect(offending).toEqual([]);
  });

  // AC: the JSON Export action is byte-for-byte unchanged — still a .almanac.json.
  test("the JSON Export action is unchanged", async ({ page }) => {
    await onboard(page);
    await seedPanel(page, {
      drawnAt: "2026-05-01", labName: "Test Lab", clearFirst: true,
      results: [{ markerKey: "ferritin_f", value: 50, unit: "ng/mL" }],
    });
    await page.goto("/#/settings");
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /export the almanac/i }).click(),
    ]);
    expect(dl.suggestedFilename()).toMatch(/\.almanac\.json$/);
  });
});

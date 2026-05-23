// Put the draw on your calendar — a one-tap .ics export of the retest date
// (ticket 0054).
//
// The retest card from 0028 already computes the soonest-due draw locally. This
// surface adds one quiet "Add to calendar" action inside that same card that
// builds a standard iCalendar (.ics) document by hand — no dependency, no
// network, no Anthropic — from the already-computed `RetestStatus` and downloads
// it on-device as `retest.ics`. The OS then owns the reminder during the long
// quiet between draws. Each test below maps 1:1 to an acceptance-criteria box in
// docs/backlog/0054-retest-calendar-export.md.
//
// `buildRetestIcs` is pure, so the structural / privacy assertions import it
// directly inside the page and snapshot its output against a hand-built
// RetestStatus — no DOM round-trip needed. The download-mechanism tests drive
// the Today action and read the saved file from disk (chromium); on
// mobile-webkit, where programmatic download is blocked, the .ics content is
// verified through the same module call instead (noted per test).

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { installMocks } from "../helpers/mocks";
import {
  onboard, seedPlanWithRetest, enterTour, enterSharedViewWithAdopt,
} from "../helpers/flows";

const KEY_SENTINEL = "sk-ant-canary-ICS-54545454";

/** Open Today fresh so the router re-reads the seeded rows. */
async function openToday(page: Page): Promise<void> {
  await page.goto("/#/today");
  await page.reload();
  await page.locator(".headline").first().waitFor();
}

/**
 * One RetestStatus shaped exactly as `computeRetestStatus` returns. The page
 * receives `markers` already resolved to human display names, so the export's
 * SUMMARY matches the card by construction. `dueDate`/`setOn` are real Dates.
 */
interface SampleStatus {
  markers: string[];
  dueDateIso: string;          // YYYY-MM-DD, the all-day due date
  daysUntil: number;
  state: "upcoming" | "due-soon" | "overdue";
  reason: string;
}

/**
 * Run `buildRetestIcs` inside the page against a hand-built RetestStatus.
 * Returns the rendered iCalendar string. Pure: no DB read, no network.
 */
async function buildIcs(page: Page, s: SampleStatus): Promise<string> {
  return page.evaluate(async (status) => {
    const mod = await import("/src/today/retest-ics.ts");
    const due = new Date(status.dueDateIso + "T00:00:00");
    return mod.buildRetestIcs({
      markers: status.markers,
      dueDate: due,
      daysUntil: status.daysUntil,
      state: status.state as "upcoming" | "due-soon" | "overdue",
      setOn: new Date(due.getTime() - status.daysUntil * 86_400_000),
      reason: status.reason,
    } as never);
  }, s);
}

const TWO_MARKER: SampleStatus = {
  markers: ["Ferritin", "ApoB"],
  dueDateIso: "2026-08-15",
  daysUntil: 84,
  state: "due-soon",
  reason: "Re-check iron stores and ApoB after the food + supplement push.",
};

test.describe("Retest calendar export (0054)", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
  });

  /* ---- AC: a valid CRLF iCalendar document with a single all-day VEVENT ---- */
  test("buildRetestIcs returns a valid CRLF iCalendar with one all-day VEVENT", async ({ page }) => {
    await onboard(page);
    const ics = await buildIcs(page, TWO_MARKER);

    // RFC 5545: CRLF-terminated lines.
    expect(ics).toContain("\r\n");
    expect(ics).not.toMatch(/[^\r]\n/); // every LF is preceded by CR

    // The VCALENDAR envelope.
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toMatch(/PRODID:/);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);

    // Exactly one VEVENT.
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1);
    expect(ics.match(/END:VEVENT/g)?.length).toBe(1);

    // An all-day DTSTART equal to the due date (basic date form, no time).
    expect(ics).toContain("DTSTART;VALUE=DATE:20260815");

    // A stable UID and a DTSTAMP in UTC basic form.
    expect(ics).toMatch(/UID:.+/);
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);

    // The SUMMARY names the markers; the DESCRIPTION carries the reason + the
    // bring-it-back line.
    expect(ics).toContain("SUMMARY:Almanac: draw Ferritin and ApoB");
    expect(ics).toContain("Bring your results back to Almanac.");
  });

  /* ---- AC: tapping the action triggers a retest.ics download -------------- */
  test("tapping 'Add to calendar' downloads retest.ics", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "programmatic download is intercepted on chromium only");
    await onboard(page);
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await expect(page.locator(".retest-card__cal")).toBeVisible();
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".retest-card__cal").click(),
    ]);
    expect(dl.suggestedFilename()).toBe("retest.ics");
  });

  /* ---- AC: the exported DTSTART equals the card's displayed due date ------- */
  test("the .ics DTSTART matches the due date the card displays", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "download path interception lives on chromium");
    await onboard(page);
    // 12 weeks = 84 days; generated 75 days ago → due in 9 days.
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toBeVisible();

    // The due date the card computed: generatedAt + 84 days, day precision.
    const dueYmd = await page.evaluate(() => {
      const due = new Date(Date.now() - 75 * 86_400_000 + 84 * 86_400_000);
      const p = (n: number) => String(n).padStart(2, "0");
      return `${due.getFullYear()}${p(due.getMonth() + 1)}${p(due.getDate())}`;
    });

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".retest-card__cal").click(),
    ]);
    const ics = readFileSync(await dl.path(), "utf8");
    expect(ics).toContain(`DTSTART;VALUE=DATE:${dueYmd}`);
  });

  /* ---- AC: the SUMMARY markers match the card (two-marker) ---------------- */
  test("two-marker cadence: the SUMMARY marker phrase matches the card", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "download assertion runs on chromium");
    await onboard(page, { sex: "male" });
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b", "hs_crp"], whenWeeks: 12 }],
    });
    await openToday(page);
    // The card renders "ApoB and hs-CRP" — the SUMMARY must agree byte-for-byte.
    const cardText = await page.locator(".retest-card__body").innerText();
    expect(cardText).toContain("ApoB and hs-CRP");

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".retest-card__cal").click(),
    ]);
    const ics = readFileSync(await dl.path(), "utf8");
    expect(ics).toContain("SUMMARY:Almanac: draw ApoB and hs-CRP");
  });

  /* ---- AC: one-marker cadence reads 'Almanac: draw ApoB' ------------------ */
  test("one-marker cadence: SUMMARY reads 'Almanac: draw ApoB'", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "download assertion runs on chromium");
    await onboard(page);
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".retest-card__cal").click(),
    ]);
    const ics = readFileSync(await dl.path(), "utf8");
    expect(ics).toContain("SUMMARY:Almanac: draw ApoB");
    expect(ics).not.toContain(" and ");
  });

  /* ---- AC: sex-specific marker resolves to its human name, not the key ---- */
  test("a sex-specific marker resolves to its human name in the SUMMARY, not the raw key", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "name-resolution assertion runs on chromium");
    await onboard(page, { sex: "male" });
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["ferritin_m"], whenWeeks: 12 }],
    });
    await openToday(page);
    // The card resolves ferritin_m → its human name "Ferritin (Male)" via
    // findMarker — never the raw key. The SUMMARY agrees with the card.
    const cardText = await page.locator(".retest-card__body").innerText();
    expect(cardText).toContain("Ferritin");
    expect(cardText).not.toContain("ferritin_m");

    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".retest-card__cal").click(),
    ]);
    const ics = readFileSync(await dl.path(), "utf8");
    expect(ics).toContain("SUMMARY:Almanac: draw Ferritin");
    expect(ics).not.toContain("ferritin_m");
  });

  /* ---- AC: the action is ABSENT when no retest card renders --------------- */
  test("no action when the plan's retest cadence is empty", async ({ page }) => {
    await onboard(page);
    await seedPlanWithRetest(page, { generatedDaysAgo: 75, retest: [] });
    await openToday(page);
    await expect(page.locator(".retest-card")).toHaveCount(0);
    await expect(page.locator(".retest-card__cal")).toHaveCount(0);
  });

  test("no action when the draw is more than 14 days out (upcoming)", async ({ page }) => {
    await onboard(page);
    // 12 weeks = 84 days; generated 24 days ago → due in 60 days (upcoming).
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 24,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await expect(page.locator(".retest-card")).toHaveCount(0);
    await expect(page.locator(".retest-card__cal")).toHaveCount(0);
  });

  /* ---- AC: zero network + zero Anthropic during the build/download -------- */
  test("the export fires zero network and zero Anthropic calls", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "network-counter + download path lives on chromium");
    const stats = await installMocks(page);
    await onboard(page);
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    await expect(page.locator(".retest-card__cal")).toBeVisible();
    const before = stats.outboundUrls.length;
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.locator(".retest-card__cal").click(),
    ]);
    await dl.path();
    const offending = stats.outboundUrls.slice(before).filter(
      (u) => u.startsWith("http://") || u.startsWith("https://"),
    );
    expect(offending).toEqual([]);
  });

  /* ---- AC: the Anthropic key NEVER appears in the .ics -------------------- */
  test("the Anthropic key never appears in the generated .ics (sentinel)", async ({ page }) => {
    await onboard(page, { key: KEY_SENTINEL });
    const ics = await buildIcs(page, TWO_MARKER);
    expect(ics).not.toContain(KEY_SENTINEL);
    expect(ics).not.toMatch(/sk-ant/i);
  });

  /* ---- AC: nothing personal beyond markers / date / reason --------------- */
  test("the .ics carries no name, email, or tracking URL — only markers, date, reason", async ({ page }) => {
    await onboard(page, { name: "Mira Chen", key: KEY_SENTINEL });
    const status: SampleStatus = {
      ...TWO_MARKER,
      reason: "Re-check iron stores after the supplement push.",
    };
    const ics = await buildIcs(page, status);
    // No owner name / email anywhere.
    expect(ics).not.toContain("Mira Chen");
    expect(ics).not.toContain("@gmail");
    // No attendee / organizer line (those would carry an email).
    expect(ics).not.toMatch(/^ATTENDEE/m);
    expect(ics).not.toMatch(/^ORGANIZER/m);
    // No tracking URL: no http(s) link and no query-string-bearing string.
    // (The bare "Almanac" wordmark in text is allowed; a UID @almanac.local is
    // an identifier, not a URL.)
    expect(ics).not.toMatch(/https?:\/\//);
    expect(ics).not.toContain("?");
    // The allowed payload is present.
    expect(ics).toContain("Ferritin and ApoB");
    expect(ics).toContain("Re-check iron stores after the supplement push.");
  });

  /* ---- AC: the existing 0028 retest card is byte-for-byte unchanged ------- */
  test("the existing retest card behavior is unchanged — copy + tap-to-labs", async ({ page }) => {
    await onboard(page);
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    const setOn = new Date(Date.now() - 75 * 86_400_000)
      .toLocaleDateString("en-US", { month: "long", day: "numeric" });
    // The card copy is exactly the 0028 string.
    await expect(page.locator(".retest-card__body")).toContainText(
      `ApoB due for a recheck in 9 days — the protocol set this draw on ${setOn}.`,
    );
    // Tapping the card body (not the action) still navigates to labs.
    await page.locator(".retest-card__body").click();
    await expect(page).toHaveURL(/#\/labs$/);
  });

  /* ---- AC: tour mode offers the export only when the fixture card renders -- */
  test("tour mode: no calendar action when the fixture's retest card does not render", async ({ page }) => {
    // The tour fixture's plan is generated ~13 days ago with a 12-week cadence →
    // due ~71 days out (upcoming), so the 0028 card does NOT render under the
    // tour and the export must NOT be fabricated.
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      return new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("almanac");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
    await enterTour(page);
    await page.goto("/#/today");
    await page.locator(".headline").first().waitFor();
    await expect(page.locator(".retest-card")).toHaveCount(0);
    await expect(page.locator(".retest-card__cal")).toHaveCount(0);
  });

  /* ---- AC: shared-view never renders the calendar action ------------------ */
  test("shared-view never renders the calendar action", async ({ page }) => {
    await enterSharedViewWithAdopt(page, {
      version: 1,
      eatList: [{ id: "e", food: "Sardines", frequency: "weekly", portion: "1 tin", why: "x", markerKeys: [] }],
      avoidList: [],
      habitStack: { intro: "One.", habits: [{ id: "h", title: "Walk", cue: "AM", why: "x" }] },
    }, { tapAdopt: false });
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.locator(".retest-card__cal")).toHaveCount(0);
  });

  /* ---- AC: renders on mobile-webkit as a ≥44×44 tap target --------------- */
  test("mobile: the action is a ≥44×44 tap target and the .ics builds via the module", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "this assertion is the mobile counterpart");
    await onboard(page);
    await seedPlanWithRetest(page, {
      generatedDaysAgo: 75,
      retest: [{ markerKeys: ["apo_b"], whenWeeks: 12 }],
    });
    await openToday(page);
    const action = page.locator(".retest-card__cal");
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // WebKit blocks programmatic downloads; verify the .ics through the same
    // module call the chromium path uses, so the build is still proven on mobile.
    const ics = await buildIcs(page, {
      markers: ["ApoB"],
      dueDateIso: "2026-08-15",
      daysUntil: 9,
      state: "due-soon",
      reason: "Re-test on the next draw.",
    });
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Almanac: draw ApoB");
  });
});

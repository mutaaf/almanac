// Insight engine provenance (ticket 0013).
//
// Every rule-fired insight on #/plan carries a small "Why this fired" chip
// underneath the prose. Tapping the chip opens a slideover with the rule id
// in monospace, the supporting markers with their values + units + draw
// dates, the evidence string verbatim, a short editorial gloss per rule,
// and a closing footer naming the deterministic rule engine as the author.
//
// LLM-only insights (those the rule engine did NOT produce) carry no chip —
// the absence is the signal. Provenance is for deterministic findings only.
//
// The fixture in tests/fixtures/plan-with-provenance.json carries two
// insights: one whose title matches the iron-restricted erythropoiesis
// rule the panel fires (will be stitched with provenance), and one
// LLM-only insight (no provenance). The mock serves this fixture when the
// user message includes the rule's title — i.e. the rule fired.

import { test, expect, type Page } from "@playwright/test";
import { installMocks } from "../helpers/mocks";
import { onboard, composePlan, waitForDb } from "../helpers/flows";

/**
 * Add a manual panel that fires the iron-restricted erythropoiesis rule
 * for a male profile: ferritin_m below 70 + MCV below 88 + MCH below 28.
 * Two red-cell signals on top of the ferritin floor land "high" priority.
 */
async function addIronRestrictedPanel(page: Page): Promise<void> {
  await page.goto("/#/labs?manual=1");
  await page.locator("#drawnAt").waitFor({ state: "visible" });
  await page.fill("#drawnAt", "2026-03-04");
  await page.fill("#labName", "Test Lab");
  await page.locator(".manual-row__input[data-key='ferritin_m']").fill("32");
  await page.locator(".manual-row__input[data-key='mcv']").fill("86");
  await page.locator(".manual-row__input[data-key='mch']").fill("27");
  await page.getByRole("button", { name: /^save panel$/i }).click();
  await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
  await expect(page.locator(".result__name").first()).toBeVisible();
}

const FOOTER_TEXT =
  "This finding was produced by a deterministic rule, not by the language model.";

test.describe("Plan — insight engine provenance", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    await addIronRestrictedPanel(page);
  });

  test("rule-fired insight gets a 'Why this fired' chip; LLM-only insight does not", async ({ page }) => {
    await composePlan(page);

    // The rule-fired insight (matches the iron-restricted erythropoiesis
    // rule by title) gets a chip; it's a real button with role="button".
    const chip = page.getByRole("button", { name: /why this fired/i });
    await expect(chip.first()).toBeVisible();

    // Exactly one chip — the second insight in the fixture is LLM-only.
    await expect(chip).toHaveCount(1);

    // The LLM-only insight ("Post-meal walking is the cheapest lever you have")
    // is on the page but carries no chip.
    await expect(page.getByText(/post-meal walking is the cheapest lever/i)).toBeVisible();
  });

  test("slideover surfaces the rule id, supporting markers with values + draw dates, evidence string, gloss, and the footer", async ({ page }) => {
    await composePlan(page);
    await page.getByRole("button", { name: /why this fired/i }).first().click();
    const slideover = page.locator("aside.slideover");
    await expect(slideover).toBeVisible();

    // Rule id in monospace, rendered inside a <code> element with a class
    // we own so the styling target is stable.
    const ruleIdEl = slideover.locator(".provenance-rule-id");
    await expect(ruleIdEl).toBeVisible();
    await expect(ruleIdEl).toContainText("iron_restricted_erythropoiesis");
    // Rule category is named alongside the id ("pattern" for RULES[]).
    await expect(slideover).toContainText(/pattern/i);

    // Supporting markers rendered as a <dl>. Each row carries the marker
    // name + value + unit; the <dd> carries the draw date.
    const markersDl = slideover.locator(".provenance-markers");
    await expect(markersDl).toBeVisible();
    await expect(markersDl).toContainText("ferritin_m");
    await expect(markersDl).toContainText("32");
    await expect(markersDl).toContainText("ng/mL");
    await expect(markersDl).toContainText("MCV");
    await expect(markersDl).toContainText("86");
    await expect(markersDl).toContainText("fL");
    // The draw date the values came from — surfaced verbatim per row.
    await expect(markersDl).toContainText("2026-03-04");

    // Evidence string, verbatim from the rule's `evidence` field.
    await expect(slideover).toContainText(/ferritin 32 ng\/mL/);
    await expect(slideover).toContainText(/MCV 86 fL/);

    // Editorial gloss paragraph — one short sentence per rule, plain English.
    await expect(slideover.locator(".provenance-gloss")).toBeVisible();
    await expect(slideover.locator(".provenance-gloss")).not.toBeEmpty();

    // Closing footer, verbatim, naming the deterministic rule engine.
    await expect(slideover.locator(".provenance-footer")).toContainText(FOOTER_TEXT);
  });

  test("re-roll of the same plan keeps token counts within ±5% (no prompt-cache regression)", async ({ page }) => {
    // Compose once, capture the second-call token usage (steady-state with
    // cache_read populated), then re-roll and confirm the token shape is
    // identical to within 5%. The mock serves deterministic usage figures —
    // the assertion is really "the prompt is byte-stable and we didn't
    // accidentally dump provenance into the prompt".
    await composePlan(page);

    // Trigger a re-compose; reads the same panel + same profile + same fixture.
    await page.getByRole("button", { name: /re-compose plan/i }).click();
    await page.waitForFunction(() => !!document.querySelector(".dash-snapshot"));

    // Re-compose again.
    await page.getByRole("button", { name: /re-compose plan/i }).click();
    await page.waitForFunction(() => !!document.querySelector(".dash-snapshot"));

    // Pull the last two recorded plan calls from telemetry (localStorage).
    // The mock reports cache_read > 0 on calls #2 and #3 — they should be
    // the same value because the prompt is identical run-over-run.
    const calls = await page.evaluate(() => {
      const raw = localStorage.getItem("almanac.telemetry.v1");
      if (!raw) return [] as Array<{ kind: string; inputTokens: number; cacheReadTokens?: number }>;
      const arr = JSON.parse(raw) as Array<{
        kind: string;
        inputTokens: number;
        cacheReadTokens?: number;
      }>;
      return arr.filter(r => r.kind === "plan");
    });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const last = calls[calls.length - 1]!;
    const prev = calls[calls.length - 2]!;
    const diff = Math.abs(last.inputTokens - prev.inputTokens);
    const tolerance = Math.max(1, Math.round(prev.inputTokens * 0.05));
    expect(diff).toBeLessThanOrEqual(tolerance);
  });

  test("chip + slideover render in Read mode too (mode-agnostic)", async ({ page }) => {
    await composePlan(page);
    await page.getByRole("button", { name: /^read$/i }).click();
    await expect(page.locator(".prose").first()).toBeVisible();

    const chip = page.getByRole("button", { name: /why this fired/i });
    await expect(chip.first()).toBeVisible();

    await chip.first().click();
    await expect(page.locator("aside.slideover")).toBeVisible();
    await expect(page.locator("aside.slideover .provenance-rule-id")).toContainText("iron_restricted_erythropoiesis");
    await expect(page.locator("aside.slideover .provenance-footer")).toContainText(FOOTER_TEXT);
  });

  test("opening the slideover fires zero network requests — provenance is fully local", async ({ page }) => {
    const stats = await installMocks(page);
    await composePlan(page);
    const before =
      stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    const outboundBefore = stats.outboundUrls.length;

    await page.getByRole("button", { name: /why this fired/i }).first().click();
    await expect(page.locator("aside.slideover")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("aside.slideover")).toHaveCount(0);

    const after =
      stats.planCalls + stats.extractCalls + stats.mealsCalls + stats.swapCalls;
    expect(after).toBe(before);
    // No new off-device hostnames either — the chip is pure local DOM.
    const newOutbound = stats.outboundUrls.slice(outboundBefore).filter(u => {
      try {
        const host = new URL(u).hostname;
        return host !== "127.0.0.1" && host !== "localhost";
      } catch { return false; }
    });
    expect(newOutbound).toEqual([]);
  });

  test("persisted plan carries the InsightProvenance shape on rule-fired insights only", async ({ page }) => {
    await composePlan(page);
    await waitForDb(page, "plans", (n) => n >= 1);

    const insightShapes = await page.evaluate(() => {
      return new Promise<Array<{ title: string; hasProvenance: boolean; ruleId?: string; category?: string; markerCount?: number; evidence?: string }>>((resolve) => {
        const req = indexedDB.open("almanac");
        req.onerror = () => resolve([]);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("plans", "readonly");
          const cur = tx.objectStore("plans").openCursor(null, "prev");
          cur.onerror = () => { db.close(); resolve([]); };
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) { db.close(); resolve([]); return; }
            const p = c.value as { insights: Array<{ title: string; provenance?: { ruleId: string; category: string; supportingMarkers: unknown[]; evidence: string } }> };
            db.close();
            resolve(p.insights.map(i => ({
              title: i.title,
              hasProvenance: !!i.provenance,
              ...(i.provenance ? {
                ruleId: i.provenance.ruleId,
                category: i.provenance.category,
                markerCount: i.provenance.supportingMarkers.length,
                evidence: i.provenance.evidence,
              } : {}),
            })));
          };
        };
      });
    });

    // Exactly one insight carries provenance (the rule-fired one); the
    // LLM-only insight is bare.
    const withProv = insightShapes.filter(s => s.hasProvenance);
    expect(withProv).toHaveLength(1);
    expect(withProv[0]!.ruleId).toBe("iron_restricted_erythropoiesis");
    expect(withProv[0]!.category).toBe("pattern");
    expect(withProv[0]!.markerCount).toBeGreaterThanOrEqual(2);
    expect(withProv[0]!.evidence).toContain("ferritin 32 ng/mL");

    const bare = insightShapes.filter(s => !s.hasProvenance);
    expect(bare.length).toBeGreaterThanOrEqual(1);
  });
});

/* ============================================================================
   Legacy plans — additive-only field
   ============================================================================
   Old persisted plans never carried the `provenance` field. Loading one and
   rendering it must produce no chips and no errors. We simulate that here by
   onboarding + composing against a panel that fires NO rules (a single lipid
   panel) — the resulting plan has no rule-fired insights, so no insight
   carries provenance and the chip never appears. This is the same shape an
   old plan-DB row would render in.
*/
test.describe("Plan — provenance is additive only", () => {
  test.beforeEach(async ({ page }) => {
    await installMocks(page);
    await onboard(page);
    // Lipid panel — fires no rule for a single draw (needs 3+ signals to
    // fire insulin_resistance / atherogenic_dyslipidemia).
    await page.goto("/#/labs?manual=1");
    await page.locator("#drawnAt").waitFor({ state: "visible" });
    await page.fill("#drawnAt", "2026-05-01");
    await page.fill("#labName", "Lipid panel");
    await page.locator(".manual-row__input[data-key='total_cholesterol']").fill("244");
    await page.locator(".manual-row__input[data-key='triglycerides']").fill("165");
    await page.locator(".manual-row__input[data-key='vit_d_25oh']").fill("32");
    await page.getByRole("button", { name: /^save panel$/i }).click();
    await expect(page).toHaveURL(/#\/labs\?id=\d+$/);
  });

  test("a plan with no rule-fired insights renders cleanly — no chip, no errors", async ({ page }) => {
    await composePlan(page);
    await expect(page.locator(".dash-snapshot, .prose").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /why this fired/i })).toHaveCount(0);
    await expect(page.locator(".insight__provenance-chip")).toHaveCount(0);
  });
});

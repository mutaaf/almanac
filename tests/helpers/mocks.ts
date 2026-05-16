// Anthropic API mock for E2E tests.
//
// Playwright's page.route() intercepts every request to api.anthropic.com
// before it leaves the browser. We route those to fixture responses so:
//   - tests run deterministically (no live LLM variability)
//   - CI never makes real billable calls
//   - the privacy invariant ("only api.anthropic.com talks to anything off-device")
//     is testable with a single allow-list assertion
//
// We sniff the system prompt to pick the right fixture:
//   - "extracting structured biomarker"  → extraction.json
//   - "FOOD-FIRST" / "PLAN_VOICE"        → plan.json
//   - "7-day meal plan"                  → meals.json (week dates patched in)

import { type Page, type Route, type Request } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const FIX_DIR    = join(__dirname, "..", "fixtures");

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIX_DIR, name), "utf8")) as T;
}

interface AnthropicReqBody {
  model: string;
  system?: Array<{ type: string; text: string }>;
  messages: Array<{ role: string; content: any }>;
  max_tokens: number;
}

interface AnthropicResp {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: Array<{ type: "text"; text: string }>;
  stop_reason: "end_turn" | "max_tokens";
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function buildResponse(model: string, jsonBody: unknown, opts: { cacheRead?: number; cacheCreate?: number } = {}): AnthropicResp {
  return {
    id: `msg_test_${Math.random().toString(36).slice(2, 10)}`,
    type: "message",
    role: "assistant",
    model,
    content: [
      { type: "text", text: JSON.stringify(jsonBody) },
    ],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 1200,
      output_tokens: 800,
      cache_creation_input_tokens: opts.cacheCreate ?? 0,
      cache_read_input_tokens: opts.cacheRead ?? 0,
    },
  };
}

function todayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function patchedMealPlan(): unknown {
  const meals = readFixture<any>("meals.json");
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    meals.days[i].day = todayIso(d);
  }
  return meals;
}

export interface MockStats {
  extractCalls: number;
  planCalls: number;
  mealsCalls: number;
  swapCalls: number;
  /** Every request URL the page attempted to make off-device. */
  outboundUrls: string[];
}

/**
 * Attach the mock to a Page. Returns a stats object the test can assert on.
 *
 * The mock is also wired so the FIRST call of a kind reports cache_create > 0
 * and SUBSEQUENT calls report cache_read > 0 — letting the cache-stats
 * telemetry tests verify their math.
 */
export async function installMocks(page: Page): Promise<MockStats> {
  const stats: MockStats = { extractCalls: 0, planCalls: 0, mealsCalls: 0, swapCalls: 0, outboundUrls: [] };

  // Allow-list of hosts the browser may talk to. Anything else gets blocked
  // so the privacy test can prove there's no egress.
  const ALLOWED_HOSTS = new Set([
    "127.0.0.1", "localhost",
    "fonts.googleapis.com", "fonts.gstatic.com",
    "api.anthropic.com",
  ]);

  await page.route("**/*", async (route: Route, request: Request) => {
    const url = new URL(request.url());
    stats.outboundUrls.push(request.url());
    // url.hostname is the bare host (no port); url.host includes the port.
    const host = url.hostname;

    if (host === "api.anthropic.com" && url.pathname === "/v1/messages") {
      const body = request.postDataJSON() as AnthropicReqBody;
      const sys = (body.system ?? []).map(s => s.text).join("\n");

      if (sys.includes("extracting structured biomarker")) {
        stats.extractCalls++;
        const cached = stats.extractCalls > 1;
        // The extractor includes the staged file names in its user text
        // instruction (so Claude can attribute pages to draw dates). We
        // sniff that text for a `multi-date` filename marker and swap in
        // the multi-panel fixture when present — the simplest possible
        // E2E hook into the auto-split branch.
        const userText = (body.messages?.[0]?.content as any[] | undefined)
          ?.filter((b) => b?.type === "text")
          ?.map((b) => b.text as string)
          ?.join("\n") ?? "";
        const fixture = /multi-date/i.test(userText)
          ? "extraction-multi-date.json"
          : /with-unrecognized/i.test(userText)
            ? "extraction-with-unrecognized.json"
            : "extraction.json";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(buildResponse(body.model, readFixture(fixture), {
            cacheRead: cached ? 800 : 0, cacheCreate: cached ? 0 : 400,
          })),
        });
        return;
      }

      // Swap voice — single-meal regeneration. Must be sniffed BEFORE the
      // meals branch since SWAP_VOICE shares phrasing with MEAL_VOICE.
      // The fixture is a single Meal object; the cache_read tokens are set
      // higher than input so the per-call cache-hit assertion can verify the
      // static prefix (system + eat/avoid + profile + marker reference) is
      // being served from the cache primed by the meal-plan generation.
      if (sys.includes("SWAP_VOICE")) {
        stats.swapCalls++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(buildResponse(body.model, readFixture("swap.json"), {
            cacheRead: 3200, cacheCreate: 0,
          })),
        });
        return;
      }

      if (sys.includes("7-day meal plan")) {
        stats.mealsCalls++;
        const cached = stats.mealsCalls > 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(buildResponse(body.model, patchedMealPlan(), {
            cacheRead: cached ? 1800 : 0, cacheCreate: cached ? 0 : 800,
          })),
        });
        return;
      }

      // Intake-only plan voice (ticket 0007). Sniffed BEFORE the default
      // plan branch so the more-specific sentinel wins. Telemetry is still
      // tracked under planCalls — both code paths persist a Plan and the
      // tests don't distinguish them by kind.
      if (sys.includes("INTAKE_PLAN_VOICE")) {
        stats.planCalls++;
        const cached = stats.planCalls > 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(buildResponse(body.model, readFixture("plan-from-intake.json"), {
            cacheRead: cached ? 2400 : 0, cacheCreate: cached ? 0 : 1200,
          })),
        });
        return;
      }

      // Default: plan generation.
      stats.planCalls++;
      const cached = stats.planCalls > 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildResponse(body.model, readFixture("plan.json"), {
          cacheRead: cached ? 2400 : 0, cacheCreate: cached ? 0 : 1200,
        })),
      });
      return;
    }

    if (ALLOWED_HOSTS.has(host)) {
      await route.continue();
      return;
    }

    // Unknown egress — fail loudly so tests can assert on it.
    await route.abort("blockedbyclient");
  });

  return stats;
}

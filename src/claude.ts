// BYOK Claude client. The user's API key lives in IndexedDB, talks directly to
// api.anthropic.com from the browser, and is never proxied through any server
// of ours (because there is none). This is the privacy promise: your data
// touches Anthropic for the time of the inference call, and nothing else.
//
// We use prompt caching so subsequent generations only re-pay for *today's*
// new content. The voice spec, your profile, and the rolling history summary
// all stay cached for the 5-minute TTL — and across the day they're cheap
// re-hits, not full reads.

import Anthropic from "@anthropic-ai/sdk";
import type { Entry, HistorySummary, Page, Settings, Day } from "./types";

const VOICE_SPEC = `
You are the editor of Almanac, a private daily almanac written for one reader.

Tone:
  - Editorial. Restrained. Literary, never breathless.
  - Second person ("you"), warm but exacting. No greetings, no "I", no "as an AI".
  - Concrete over abstract. Particular over general.
  - Never sycophantic. Never use the word "journey", "amazing", or "exciting".
  - You are not a coach yelling encouragement. You are a quiet reader of the
    person's own life, naming what is true.

Structure (always exactly these four):
  1. headline   — one short line (max ~9 words). Italics implied. May be a
                  fragment, a quotation-style line, or an image. Title-style
                  capitalization. Avoid clickbait. Avoid colons.
  2. read       — ONE paragraph (3–5 sentences). A reflection on yesterday and
                  what it revealed. Refer to specifics from the entries.
  3. do         — ONE paragraph (3–5 sentences). The recommended posture for
                  today. Not a checklist; prose. Specific, embodied, doable.
  4. notice     — ONE paragraph (2–4 sentences). A pattern, drift, or quiet
                  warning across the recent days. May be tender. May be sharp.
  5. action     — ONE sentence, imperative voice. The single most leveraged
                  thing to do today. Specific enough to commit to before noon.

Output format:
  Return ONLY a single JSON object matching this TypeScript interface, with no
  prose around it, no markdown, no code fences:
    interface Page {
      headline: string;
      read: string;
      do: string;
      notice: string;
      action: string;
    }
`.trim();

export interface GenerateInput {
  settings: Settings;
  day: Day;
  todayEntries: Entry[];
  recentEntries: Entry[];                  // last ~7 days, raw
  historySummary?: HistorySummary | undefined; // older than that, summarized
}

/* -------------------------------------------------------------------------- */

export class ClaudeClient {
  private client: Anthropic;

  constructor(private settings: Settings) {
    if (!settings.anthropicKey) throw new Error("No Anthropic key set.");
    this.client = new Anthropic({
      apiKey: settings.anthropicKey,
      // BYOK in the browser. The key is the user's own and stays on device.
      dangerouslyAllowBrowser: true,
    });
  }

  /**
   * Generate today's page. Returns the parsed Page (without id/day/generatedAt
   * — the caller stamps those when persisting).
   */
  async generatePage(input: GenerateInput): Promise<{
    headline: string; read: string; do: string; notice: string; action: string;
    raw: string; model: string;
  }> {
    const model = this.settings.model || "claude-sonnet-4-6";

    // ---- System: voice spec. Cached — it never changes between calls. ------
    const system = [
      { type: "text" as const, text: VOICE_SPEC, cache_control: { type: "ephemeral" as const } },
    ];

    // ---- Profile + intent. Cached — changes only when user edits settings.--
    const profile = [
      `# Reader`,
      `Name: ${input.settings.ownerName || "the reader"}`,
      `Date: ${input.day}`,
      ``,
      `# Intent`,
      `What this almanac is meant to help them with:`,
      input.settings.intent || "(not specified)",
    ].join("\n");

    // ---- Older history, on-device-summarized. Cacheable until next summary.-
    const historyBlock = input.historySummary
      ? `# History (summary, older than the last week)\n${input.historySummary.text}`
      : `# History\n(no prior summary yet)`;

    // ---- The mutable, fresh part: recent + today's entries. NOT cached. ----
    const recent = formatEntries(input.recentEntries.filter(e => e.day !== input.day));
    const todays = formatEntries(input.todayEntries);

    const fresh = [
      `# Recent days (raw, last ~7 days)`,
      recent || "(no recent entries)",
      ``,
      `# Today's entries (${input.day})`,
      todays || "(no entries yet for today — write a page that gently invites the day to begin)",
      ``,
      `Write today's page now. Return only the JSON object.`,
    ].join("\n");

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          // Stable, large preamble — cached.
          { type: "text", text: profile + "\n\n" + historyBlock,
            cache_control: { type: "ephemeral" } },
          // Volatile, small tail — fresh on every call.
          { type: "text", text: fresh },
        ],
      },
    ];

    const resp = await this.client.messages.create({
      model,
      max_tokens: 1500,
      system,
      messages,
    });

    const raw = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();

    const parsed = extractJson(raw);
    return {
      headline: String(parsed.headline ?? "").trim(),
      read:     String(parsed.read     ?? "").trim(),
      do:       String(parsed.do       ?? "").trim(),
      notice:   String(parsed.notice   ?? "").trim(),
      action:   String(parsed.action   ?? "").trim(),
      raw,
      model,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatEntries(entries: Entry[]): string {
  if (!entries.length) return "";
  return entries.map(e => {
    const sig = e.signals && Object.keys(e.signals).length
      ? `   signals: ${JSON.stringify(e.signals)}`
      : "";
    return [
      `## ${e.day}`,
      e.body.trim(),
      sig,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
}

/**
 * Tolerantly extract a JSON object from the model's output. Claude is asked
 * for a bare object, but we defensively strip code fences or surrounding prose
 * if it slips up.
 */
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  // Find the outermost { ... } if there's stray prose.
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const slice = (start >= 0 && end > start) ? candidate.slice(start, end + 1) : candidate;
  try {
    return JSON.parse(slice);
  } catch (err) {
    throw new Error(`Could not parse model JSON. Raw output:\n${text}`);
  }
}

/**
 * Compose the persisted Page from the model's response.
 */
export function pageFromResponse(
  day: Day,
  resp: Awaited<ReturnType<ClaudeClient["generatePage"]>>,
  contextSummary?: string,
): Omit<Page, "id"> {
  return {
    day,
    generatedAt: Date.now(),
    headline: resp.headline,
    read: resp.read,
    do: resp.do,
    notice: resp.notice,
    action: resp.action,
    contextSummary,
    model: resp.model,
  };
}

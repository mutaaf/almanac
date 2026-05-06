// Domain types for Almanac.
// Stored verbatim in IndexedDB; also the shape of the .almanac.json export.

/** ISO date in YYYY-MM-DD, local time. The almanac thinks in days, not timestamps. */
export type Day = string;

/**
 * A single user input. Free-form prose plus optional structured signals.
 * The whole point of the inputs screen is that you can dump anything in here —
 * we never force a schema. Structured fields are bonuses, not requirements.
 */
export interface Entry {
  id?: number;
  day: Day;
  createdAt: number;        // ms since epoch, for sorting within a day
  body: string;             // free-form text — the main thing
  signals?: Signals;        // optional structured numbers
  tags?: string[];
}

export interface Signals {
  sleepHours?: number;
  weight?: number;
  mood?: 1 | 2 | 3 | 4 | 5;
  energy?: 1 | 2 | 3 | 4 | 5;
  // Anything else the user wants to track. Keys are user-defined.
  [k: string]: number | string | undefined;
}

/**
 * A generated daily Page. One per day, regeneratable.
 * The `read/do/notice` triplet is the editorial structure;
 * `action` is the single concrete recommendation.
 */
export interface Page {
  id?: number;
  day: Day;
  generatedAt: number;
  headline: string;
  read: string;             // 1 short paragraph: reflection on yesterday
  do: string;               // 1 short paragraph: today's recommended posture
  notice: string;           // 1 short paragraph: a pattern or quiet warning
  action: string;           // single sentence: the one thing
  // The summary fed in to generate this page — kept so we can debug / reroll.
  contextSummary?: string;
  model?: string;
}

/**
 * A long-running on-device summary of the user's history. We re-summarize
 * older entries locally with Transformers.js so we don't ship raw text to
 * Claude for every generation.
 */
export interface HistorySummary {
  id?: number;
  day: Day;                 // the day this summary covers (or "thru" date)
  text: string;
  createdAt: number;
}

export interface Settings {
  id: "singleton";
  ownerName: string;
  anthropicKey: string;     // BYOK, lives in IndexedDB. We never POST it anywhere.
  model: string;            // default: claude-sonnet-4-6
  enabledSignals: string[]; // which structured fields the inputs page shows
  intent: string;           // free-text: what the user wants the almanac to help with
  createdAt: number;
}

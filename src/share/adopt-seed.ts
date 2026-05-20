// Adopt-and-adapt seed persistence (ticket 0020).
//
// The seed is the structured carry-over from a friend's shared protocol — at
// most five habit titles and at most three eat-list food names (built by
// `extractAdoptSeed()` in `src/share/shared-state.ts`). It lives in
// `localStorage["almanac.adoptSeed"]` from the moment the recipient taps
// "Adopt as a starting point" until onboarding submit, where it moves onto the
// persisted Profile and the localStorage entry is cleared (single source of
// truth). This module is the read/write/clear boundary, and nothing else.
//
// Mirrors the discipline of `src/share/shared-state.ts`: small surface, no
// novelty, defensive against the rare environment where localStorage throws.

import type { AdoptSeed } from "../types";

const ADOPT_KEY = "almanac.adoptSeed";

/**
 * Persist the seed to localStorage. The most-recent write wins — opening a
 * second share link before consent overwrites the first seed (one-friend-at-a-
 * time, by the ticket). No-op when localStorage throws (private mode).
 */
export function persistAdoptSeed(seed: AdoptSeed): void {
  try { localStorage.setItem(ADOPT_KEY, JSON.stringify(seed)); }
  catch { /* private mode: the seed simply doesn't carry; the user gets the clean slate */ }
}

/**
 * Read the seed back. Returns `null` on missing / malformed / version-mismatch
 * — the absence is the signal the welcome notice, onboarding prefix, and plan-
 * empty editorial line all gate on. Structural validation mirrors the share
 * decoder's defensive `null` return.
 */
export function readAdoptSeed(): AdoptSeed | null {
  try {
    const raw = localStorage.getItem(ADOPT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isAdoptSeed(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clear the seed. Called on onboarding submit (after moving it onto the Profile)
 * and idempotent everywhere else. No-op when localStorage throws.
 */
export function clearAdoptSeed(): void {
  try { localStorage.removeItem(ADOPT_KEY); }
  catch { /* nothing to do */ }
}

function isAdoptSeed(v: unknown): v is AdoptSeed {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<AdoptSeed>;
  if (s.version !== 1) return false;
  if (!Array.isArray(s.habitTitles) || !s.habitTitles.every(t => typeof t === "string")) return false;
  if (!Array.isArray(s.topEatFoods) || !s.topEatFoods.every(t => typeof t === "string")) return false;
  if (typeof s.capturedAt !== "number") return false;
  return true;
}

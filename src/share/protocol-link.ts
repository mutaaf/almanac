// Shareable protocol link — the encoder/decoder pair (ticket 0017).
//
// A user on #/plan taps "Share this protocol". The Plan page calls
// `encodeProtocolPayload(plan, mealPlan)` which returns a base64url-encoded
// string of the gzipped JSON of the curated payload. The Plan page then
// constructs `${origin}/#/shared?p=${encoded}` and hands it to either the OS
// share sheet or the clipboard.
//
// A recipient who opens that URL lands on `#/shared`. The router reads the
// `p=` query param, calls `decodeProtocolPayload(encoded)`, and — on a
// successful decode — enters the shared-view mode (see `src/share/shared-
// state.ts`). On failure the recipient lands on #/welcome with an inline
// "did not decode" notice.
//
// Curation discipline (the whole point of the ticket): the payload carries
// exactly `eatList`, `avoidList`, `habitStack`, and (when present) a trimmed
// `mealPlan` of `days` + `grocery`. The encoder strips every other field by
// CONSTRUCTION — there is no "exclude this" filter to forget; the new object
// has the explicitly-named fields and nothing else. A sentinel test in
// `tests/e2e/protocol-link.spec.ts` proves the discipline holds.
//
// Compression: CompressionStream("gzip") is available in every browser we
// target (Chrome ≥ 80, Safari ≥ 16.4, Firefox ≥ 113). Vite ships no polyfill;
// none is needed. The encoded bytes are URL-safe (`-` and `_` substitute
// `+` and `/`; no padding). Round-trip is asserted in the spec.

import type {
  Plan, MealPlan, EatItem, AvoidItem, HabitStack, DayMeals, GrocerySection,
  SharedProtocolPayload, SharedMealPlan, SharedProtocolState,
} from "../types";

/* -------------------------------------------------------------------------- */
/*  Construction — strip every field that doesn't belong                      */
/* -------------------------------------------------------------------------- */
/*
 * Every field of the payload is built by NAMING it, not by spreading a
 * source object and deleting things. That's the structural guarantee a
 * sentinel test exists to defend — a future contributor who adds a new
 * field to Plan or MealPlan does NOT automatically widen the share link.
 *
 * `cleanEat` / `cleanAvoid` / `cleanHabit` / `cleanDay` / `cleanGrocery` are
 * deliberately literal — each one names the keys it carries and ignores
 * everything else.
 */

function cleanEat(e: EatItem): EatItem {
  return {
    id: e.id,
    food: e.food,
    frequency: e.frequency,
    portion: e.portion,
    why: e.why,
    markerKeys: [...e.markerKeys],
    ...(e.examples ? { examples: [...e.examples] } : {}),
    ...(e.cuisineNotes ? { cuisineNotes: e.cuisineNotes } : {}),
  };
}

function cleanAvoid(a: AvoidItem): AvoidItem {
  // `markerKeys` IS carried on avoid items — it ties them to the eat list in
  // the UI. The ticket excludes labs + insights + profile, not the marker
  // keys that label foods. The recipient's Plan page renders avoid chips by
  // name + swap; markerKeys are still useful for the chip's tooltip.
  return {
    id: a.id,
    food: a.food,
    why: a.why,
    ...(a.swap ? { swap: a.swap } : {}),
    ...(a.markerKeys ? { markerKeys: [...a.markerKeys] } : {}),
  };
}

function cleanHabitStack(h: HabitStack): HabitStack {
  return {
    intro: h.intro,
    habits: h.habits.map(habit => ({
      id: habit.id,
      title: habit.title,
      cue: habit.cue,
      why: habit.why,
    })),
  };
}

function cleanDay(dm: DayMeals): DayMeals {
  const cleanMeal = (m: DayMeals["breakfast"]) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    effort: m.effort,
    timeMinutes: m.timeMinutes,
    servings: m.servings,
    ingredients: [...m.ingredients],
    ...(m.steps ? { steps: [...m.steps] } : {}),
    hits: [...m.hits],
    ...(m.cuisine ? { cuisine: m.cuisine } : {}),
    ...(m.tags ? { tags: [...m.tags] } : {}),
  });
  return {
    day: dm.day,
    breakfast: cleanMeal(dm.breakfast),
    lunch:     cleanMeal(dm.lunch),
    dinner:    cleanMeal(dm.dinner),
    ...(dm.snack ? { snack: cleanMeal(dm.snack) } : {}),
  };
}

function cleanGrocery(g: GrocerySection): GrocerySection {
  return {
    name: g.name,
    items: g.items.map(it => ({
      name: it.name,
      ...(it.quantity ? { quantity: it.quantity } : {}),
      // forMeals carries no host-identifying data, but the recipient's view
      // doesn't use it either — strip it to keep the payload lean.
    })),
  };
}

/* -------------------------------------------------------------------------- */
/*  Base64url codec                                                           */
/* -------------------------------------------------------------------------- */

function bytesToBase64Url(bytes: Uint8Array): string {
  // btoa wants a binary string. We chunk to avoid call-stack issues on large
  // payloads (apply with 100k+ args throws in some engines).
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  // Re-add padding so atob is happy.
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Gzip via CompressionStream                                                */
/* -------------------------------------------------------------------------- */

async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  // Cast the Uint8Array view to a BlobPart-compatible source. The view's
  // backing ArrayBuffer is what Blob actually reads; the cast paves over
  // TS's `Uint8Array<ArrayBufferLike>` strictness while keeping the runtime
  // behavior unchanged.
  const stream = new Blob([input as unknown as BlobPart]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([input as unknown as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Encode the host's plan + mealPlan into a base64url-encoded gzipped JSON
 * payload suitable for embedding in a URL hash. Excludes every field the
 * ticket names — profile, labs, insights, retest, lifestyle, supplements,
 * snapshot, the API key — by constructing a fresh payload object with only
 * the named-included fields rather than filtering an existing one.
 *
 * `mealPlan` is optional. When absent, the payload omits the field entirely
 * (the recipient's Meals page renders the "This was not shared with you"
 * empty state for that surface alone — Today and Plan still render).
 */
export async function encodeProtocolPayload(
  plan: Plan,
  mealPlan: MealPlan | undefined,
): Promise<string> {
  const payload: SharedProtocolPayload = {
    version: 1,
    eatList:   (plan.eatList   ?? []).map(cleanEat),
    avoidList: (plan.avoidList ?? []).map(cleanAvoid),
    habitStack: cleanHabitStack(plan.habitStack),
    ...(mealPlan ? {
      mealPlan: {
        days: mealPlan.days.map(cleanDay),
        grocery: mealPlan.grocery.map(cleanGrocery),
      } satisfies SharedMealPlan,
    } : {}),
  };

  const json  = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const gz    = await gzip(bytes);
  return bytesToBase64Url(gz);
}

/**
 * Decode an encoded payload back into a `SharedProtocolState` ready for the
 * shared-view module to install. Returns `null` on any structural failure:
 *
 *   - the input is not valid base64url
 *   - the gzipped bytes don't decompress
 *   - the decompressed text isn't valid JSON
 *   - the JSON doesn't structurally match `SharedProtocolPayload`
 *   - the version field is not exactly 1 (future-proofing — older clients
 *     refuse to render newer payloads rather than silently mis-rendering)
 *
 * `null` is the signal the router uses to route to #/welcome with the inline
 * notice. The caller never sees the exception path.
 */
export async function decodeProtocolPayload(
  encoded: string,
): Promise<SharedProtocolState | null> {
  try {
    if (!encoded || typeof encoded !== "string") return null;
    const bytes = base64UrlToBytes(encoded);
    const raw   = await gunzip(bytes);
    const json  = new TextDecoder().decode(raw);
    const parsed = JSON.parse(json) as unknown;
    if (!isPayload(parsed)) return null;
    return materializeState(parsed);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Structural validation + state materialization                             */
/* -------------------------------------------------------------------------- */

function isPayload(v: unknown): v is SharedProtocolPayload {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<SharedProtocolPayload>;
  if (p.version !== 1) return false;
  if (!Array.isArray(p.eatList))   return false;
  if (!Array.isArray(p.avoidList)) return false;
  if (!p.habitStack || typeof p.habitStack !== "object") return false;
  if (typeof p.habitStack.intro !== "string") return false;
  if (!Array.isArray(p.habitStack.habits)) return false;
  // mealPlan is optional; when present it must be a SharedMealPlan shape.
  if (p.mealPlan !== undefined) {
    if (!p.mealPlan || typeof p.mealPlan !== "object") return false;
    if (!Array.isArray(p.mealPlan.days))    return false;
    if (!Array.isArray(p.mealPlan.grocery)) return false;
  }
  return true;
}

/**
 * Wrap the decoded payload in the synthetic Plan + MealPlan shells the page
 * renderers read against. The shells use empty strings + empty arrays for
 * every field the recipient's view will not paint — snapshot, insights,
 * lifestyle, supplements, retest. The recipient's Plan page conditional
 * branches render the shared payload's eat/avoid/habit sections only.
 */
function materializeState(payload: SharedProtocolPayload): SharedProtocolState {
  const plan: Plan = {
    id: 0,                              // sentinel — never persisted
    generatedAt: 0,
    basedOnPanelIds: [],
    snapshot: "",
    insights: [],
    eatList:   payload.eatList,
    avoidList: payload.avoidList,
    lifestyle:   [],
    supplements: [],
    habitStack: payload.habitStack,
    retest: [],
  };

  if (!payload.mealPlan) {
    return { payload, plan };
  }

  const mealPlan: MealPlan = {
    id: 0,
    planId: 0,
    weekStart: payload.mealPlan.days[0]?.day ?? "",
    generatedAt: 0,
    days: payload.mealPlan.days,
    grocery: payload.mealPlan.grocery,
  };

  return { payload, plan, mealPlan };
}

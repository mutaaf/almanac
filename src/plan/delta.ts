// Plan-to-plan delta (ticket 0029).
//
// `computePlanDelta(current, prior)` is a pure structural diff of two Plan
// objects the app already stores. No DOM, no Dexie, no network, no inference —
// the whole value of the surface is being instant, local, and provably honest
// about the actual diff. The Plan page passes both plans in; this module never
// reads anything itself.
//
// Items are matched across plans by their natural identity field:
//   - eat / avoid : `food`
//   - habits      : `title`
//   - insights    : `title`
// The eat list also captures a same-food frequency-or-portion change.

import type { Plan, PlanDelta, EatItem, AvoidItem, Habit } from "../types";

/**
 * Diff `current` against the plan it replaced (`prior`). Both plans are read
 * by value; the result is render-time only. Matching is by natural identity
 * (see the module header). A same-food eat item whose frequency or portion
 * shifted lands in `eat.changed` with a human-readable `was`/`now` describing
 * the shift; identical items contribute nothing.
 */
export function computePlanDelta(current: Plan, prior: Plan): PlanDelta {
  const curEat = byKey(current.eatList, e => e.food);
  const priEat = byKey(prior.eatList, e => e.food);

  const eatAdded: EatItem[] = [];
  const eatChanged: { item: EatItem; was: string; now: string }[] = [];
  for (const [food, item] of curEat) {
    const before = priEat.get(food);
    if (!before) { eatAdded.push(item); continue; }
    // Frequency is the primary axis (the user's "2x → 3x" mental model). When
    // it shifted, the was/now read as frequencies; otherwise a portion-only
    // change reads as portions. Either still registers as a change.
    const freqBefore = norm(before.frequency);
    const freqNow = norm(item.frequency);
    const portionBefore = norm(before.portion);
    const portionNow = norm(item.portion);
    if (freqBefore !== freqNow) {
      eatChanged.push({ item, was: before.frequency.trim(), now: item.frequency.trim() });
    } else if (portionBefore !== portionNow) {
      eatChanged.push({ item, was: before.portion.trim(), now: item.portion.trim() });
    }
  }
  const eatRemoved: EatItem[] = [];
  for (const [food, item] of priEat) {
    if (!curEat.has(food)) eatRemoved.push(item);
  }

  const curAvoid = byKey(current.avoidList, a => a.food);
  const priAvoid = byKey(prior.avoidList, a => a.food);
  const avoidAdded: AvoidItem[] = [];
  for (const [food, item] of curAvoid) if (!priAvoid.has(food)) avoidAdded.push(item);
  const avoidRemoved: AvoidItem[] = [];
  for (const [food, item] of priAvoid) if (!curAvoid.has(food)) avoidRemoved.push(item);

  const curHabits = byKey(current.habitStack.habits, h => h.title);
  const priHabits = byKey(prior.habitStack.habits, h => h.title);
  const habitsAdded: Habit[] = [];
  for (const [title, h] of curHabits) if (!priHabits.has(title)) habitsAdded.push(h);
  const habitsRetired: Habit[] = [];
  for (const [title, h] of priHabits) if (!curHabits.has(title)) habitsRetired.push(h);

  const curInsightTitles = new Set(current.insights.map(i => i.title));
  const priInsightTitles = new Set(prior.insights.map(i => i.title));
  const newlyFiring = [...curInsightTitles].filter(t => !priInsightTitles.has(t));
  const resolved = [...priInsightTitles].filter(t => !curInsightTitles.has(t));

  return {
    eat: { added: eatAdded, removed: eatRemoved, changed: eatChanged },
    avoid: { added: avoidAdded, removed: avoidRemoved },
    habits: { added: habitsAdded, retired: habitsRetired },
    insights: { newlyFiring, resolved },
  };
}

/**
 * True when the delta carries no change in any section — the honest "nothing
 * changed" case (a re-roll with no input change). The renderer paints a single
 * declarative line for this rather than an empty summary.
 */
export function isEmptyDelta(d: PlanDelta): boolean {
  return (
    d.eat.added.length === 0 &&
    d.eat.removed.length === 0 &&
    d.eat.changed.length === 0 &&
    d.avoid.added.length === 0 &&
    d.avoid.removed.length === 0 &&
    d.habits.added.length === 0 &&
    d.habits.retired.length === 0 &&
    d.insights.newlyFiring.length === 0 &&
    d.insights.resolved.length === 0
  );
}

/**
 * The elapsed-span phrase between two plan generation timestamps, e.g.
 * "three months ago" / "6 weeks ago" / "yesterday". Numbers one through twelve
 * are spelled out; thirteen and above use digits — the almanac voice. Used by
 * the eyebrow: "Since your last plan — <span>." Pure.
 */
export function relativeSpan(currentMs: number, priorMs: number): string {
  const DAY = 86_400_000;
  const days = Math.max(0, Math.round((currentMs - priorMs) / DAY));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${spell(days)} days ago`;

  const weeks = Math.round(days / 7);
  if (days < 56) return `${count(weeks)} weeks ago`;     // up to ~8 weeks → weeks

  const months = Math.round(days / 30);
  return `${count(months)} ${months === 1 ? "month" : "months"} ago`;
}

/* -------------------------------------------------------------------------- */
/*  internals                                                                 */
/* -------------------------------------------------------------------------- */

/** Index a list by a stable identity key. First occurrence wins on collision. */
function byKey<T>(items: T[], key: (t: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, it);
  }
  return m;
}

/** Case- and whitespace-insensitive normalization for change detection. */
function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

/** Spell one..twelve; digits for thirteen and up. */
function spell(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n]! : String(n);
}

/** Same as spell, but used for the count slot in week/month phrases. */
function count(n: number): string {
  return spell(n);
}

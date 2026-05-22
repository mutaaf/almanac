// The functional-range reference — the marker library, read before the gate (ticket 0038).
//
// A read-only, gate-bypassed `#/reference` route a precision-health-literate
// prospect reaches from the welcome screen WITHOUT acknowledging consent or
// building a profile. It lays the curated functional-range DB open for
// inspection: every built-in marker with its unit, the lab's typical reference
// range, the tighter functional optimum, and the one-line `description` already
// on every `MarkerDef`. The literate skeptic can judge the curation on its own
// terms — the way they would skim a reference book in a shop — before they paste
// a key or upload a single lab.
//
// It is a pure client-side render over `MARKERS[]` (src/data/markers.ts) — the
// static seed that ships in the bundle. No key, no upload, no Anthropic call, NO
// IndexedDB read or write. It deliberately does NOT include user-defined markers
// (0002): those are personal data behind the gate, and this page must not touch
// IndexedDB at all. That is what makes it safe to ship pre-consent — it carries
// nothing personal and reads nothing from the user's device, so it is the same
// library for everyone.
//
// The single affordance off the page is "Start your own", which routes to
// `#/welcome` — the path back that reinstates the consent + profile gate. There
// is deliberately no key field, no upload control, no compose action.

import { mount, h, esc } from "../ui";
import { MARKERS } from "../data/markers";
import type { MarkerCategory, MarkerDef, Range } from "../types";

/**
 * Fixed editorial order for the category sections. A category that carries no
 * seed markers is skipped (see `renderReference()`), so adding a category here
 * that the DB doesn't use yet is harmless. The order groups related families
 * the way a reference book would: metabolism first, then lipids and the
 * cardiovascular extras, the endocrine axes, micronutrients, inflammation, the
 * blood count, and the metabolic-panel organs last.
 */
const CATEGORY_ORDER: MarkerCategory[] = [
  "metabolic",
  "lipids",
  "cardio",
  "thyroid",
  "hormones",
  "vitamins",
  "minerals",
  "iron",
  "inflammation",
  "blood",
  "kidney",
  "liver",
  "other",
];

/** Human-readable section headings for each category. Plain — the category names. */
const CATEGORY_LABELS: Record<MarkerCategory, string> = {
  metabolic: "Metabolic",
  lipids: "Lipids",
  cardio: "Cardiovascular",
  thyroid: "Thyroid",
  hormones: "Hormones",
  vitamins: "Vitamins",
  minerals: "Minerals",
  iron: "Iron",
  inflammation: "Inflammation",
  blood: "Blood count",
  kidney: "Kidney",
  liver: "Liver",
  other: "Other",
};

export async function renderReference(): Promise<void> {
  // Group the built-in seed by category. Read `MARKERS[]` directly — the static
  // bundle array — and never the user's IndexedDB (no `findMarker` extras, no
  // `getAllMarkers`): the reference is the curated public library, the same for
  // everyone. Within a category the seed's declaration order is preserved so
  // families stay together (the lipid panel, the CBC, etc.).
  const byCategory = new Map<MarkerCategory, MarkerDef[]>();
  for (const marker of MARKERS) {
    const list = byCategory.get(marker.category) ?? [];
    list.push(marker);
    byCategory.set(marker.category, list);
  }

  const sections = CATEGORY_ORDER
    .map((cat) => ({ cat, markers: byCategory.get(cat) ?? [] }))
    .filter((s) => s.markers.length > 0)
    .map((s) => sectionHtml(s.cat, s.markers))
    .join("");

  const frag = h(`
    <div>
      <header class="masthead">
        <div>
          <div class="dateline">Read before you trust it</div>
          <div class="wordmark">Almanac<span class="amp">.</span></div>
        </div>
      </header>

      <section class="reference reveal">
        <div class="eyebrow">The marker reference</div>
        <h1 class="headline" style="margin-top: 0.4rem; max-width: 20ch;">
          Both ranges, <em>laid open</em>.
        </h1>
        <p class="lede reference__sub">
          Every marker we curate, with both the lab range and the functional
          optimum. No key, nothing saved — read it the way you would a reference
          book before you buy it.
        </p>

        <div class="reference__list">
          ${sections}
        </div>

        <div class="reference__start">
          <a href="#/welcome" class="reference__start-link">Start your own</a>
          <span class="reference__start-note">
            Setting up writes to this device and uses your own Anthropic key.
          </span>
        </div>
      </section>

      <footer class="foot">
        <span class="colophon">Informational, not medical advice. Discuss changes with your clinician.</span>
        <span>i</span>
      </footer>
    </div>
  `);

  mount(frag);
}

/* -------------------------------------------------------------------------- */
/*  Render                                                                     */
/* -------------------------------------------------------------------------- */

/** One category section: a heading plus a column header and one row per marker. */
function sectionHtml(category: MarkerCategory, markers: MarkerDef[]): string {
  const rows = markers.map(rowHtml).join("");
  return `
    <section class="reference__section" data-category="${esc(category)}">
      <h2 class="reference__heading section-mark">${esc(CATEGORY_LABELS[category])}</h2>
      <div class="reference__cols" aria-hidden="true">
        <span class="reference__col reference__col--name">Marker</span>
        <span class="reference__col reference__col--unit">Unit</span>
        <span class="reference__col reference__col--lab">Lab range</span>
        <span class="reference__col reference__col--functional">Functional</span>
      </div>
      ${rows}
    </section>
  `;
}

/**
 * One marker row: name (+ shortName when present), unit, lab range, functional
 * range, and the curated description. The lab range can be absent on a marker
 * the DB carries no reference band for — it renders as "—".
 */
function rowHtml(marker: MarkerDef): string {
  const lab = marker.labRange ? formatRange(marker.labRange) : "—";
  const functional = formatRange(marker.optimalRange);
  const shortName = marker.shortName
    ? `<span class="reference__short">${esc(marker.shortName)}</span>`
    : "";

  return `
    <div class="reference__row" data-key="${esc(marker.key)}">
      <div class="reference__name">${esc(marker.name)}${shortName}</div>
      <div class="reference__unit">${esc(marker.unit)}</div>
      <div class="reference__range reference__lab">
        <span class="reference__rangelabel">lab</span><span>${esc(lab)}</span>
      </div>
      <div class="reference__range reference__functional">
        <span class="reference__rangelabel">functional</span><span>${esc(functional)}</span>
      </div>
      <p class="reference__desc">${esc(marker.description)}</p>
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Range formatting — open/closed bounds rendered honestly                    */
/* -------------------------------------------------------------------------- */
/*
 * A pure helper, mirroring the labs page's `rangeStr()` (src/pages/labs.ts) and
 * the try sandbox's local copy: a closed range reads "low–high", an open-high
 * range "≤ high", an open-low range "≥ low", and an absent range "—". The unit
 * is rendered separately in its own cell here, so this returns the number(s)
 * only. Kept local so this pre-gate page imports nothing from the gated
 * labs / progress modules.
 */
export function formatRange(r: Range): string {
  if (r.low != null && r.high != null) return `${r.low}–${r.high}`;
  if (r.low != null)  return `≥ ${r.low}`;
  if (r.high != null) return `≤ ${r.high}`;
  return "—";
}

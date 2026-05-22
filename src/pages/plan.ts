// Plan screen — the food-forward protocol.
//
// Two view modes, toggled in the masthead-area chip:
//   - Read       : editorial long-form (prose, drop caps, section marks)
//   - Dashboard  : visual cards, marker thermometers, habit rings, eat gallery
//
// The mode persists in localStorage so each user gets their preferred surface
// every time they open the plan.

import { mount, h, esc, longDate, errorCard, openSlideover, closeSlideover } from "../ui";
import { glossForRule, type PreComputedInsight } from "../insights";
import { simulateInsights } from "../insights/simulate";
import { masthead, foot } from "../chrome";
import {
  getProfile, allPanels, latestPlan, allPlans, savePlan, saveProfile, recentCheckIns,
  latestMealPlan, today, checkInFor, upsertCheckIn, db,
} from "../db";
import { computePlanDelta, isEmptyDelta, relativeSpan } from "../plan/delta";
import {
  WELCOME_BACK_THRESHOLD_DAYS, WELCOME_BACK_MAX_SYNTHETIC_SKIP_DAYS,
} from "./welcome-back";
import { route } from "../main";
import { ClaudeClient, TruncatedResponseError } from "../claude";
import type {
  Plan, EatItem, AvoidItem, Recommendation, Panel, Profile, CheckIn, Insight, MealPlan,
  SimulationOverride, InsightProvenance, PlanDelta,
} from "../types";
import { findMarker } from "./../data/markers";
import { getAllMarkers } from "../data/userMarkers";
import { thermometer, sparkline, ring } from "../viz";
import { mountAndPrint, removeMountedSheet, type Audience } from "../print/protocol";
import { encodeProtocolPayload } from "../share/protocol-link";
import { isSharedView } from "../share/shared-state";
import { selectMostImproved } from "../progress/most-improved";
import { composeShareMessage } from "../plan/share-message";
import { saveProtocolCard } from "../plan/protocol-card";

type ViewMode = "read" | "dashboard";
const VIEW_KEY = "almanac.plan.view";

function getMode(): ViewMode {
  const v = localStorage.getItem(VIEW_KEY);
  return v === "read" ? "read" : "dashboard";
}
function setMode(m: ViewMode) { localStorage.setItem(VIEW_KEY, m); }

/* ============================================================================
   What-if simulation state (ticket 0019)
   ============================================================================
   Page-local, never persisted. `paint()` resets it to null on every full
   render, so navigating away or re-composing exits simulation mode. When a
   marker's "What if?" chip is tapped we push a SimulationOverride and re-render
   ONLY the insights list + the simulation header — the eat list, avoid list,
   habit stack, and meal CTA never re-render (the rule engine emits insights,
   not eat-list deltas; surfacing a hypothetical eat list would need an LLM
   call, which the ticket explicitly avoids).
*/

interface SimContext {
  panels: Panel[];           // newest first, the live panels
  profile: Profile;
  /** A user-overridable catalog so user-defined markers (0002) resolve. */
  catalog: import("../types").MarkerDef[];
}

interface SimState {
  overrides: SimulationOverride[];
}

let _sim: SimState | null = null;
let _simCtx: SimContext | null = null;

// In dev/test only, expose the pure simulator so the spec can assert the diff
// against a synthetic panel via `page.evaluate`. Mirrors the `__almanacDb`
// hook in src/db.ts: Vite drops this branch from the production bundle.
if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __almanacSimulate?: unknown }).__almanacSimulate =
    (panel: Panel, overrides: SimulationOverride[]) => {
      // The pure-function hook accepts a single panel + overrides and defaults
      // to a male profile (the spec's synthetic panels use male-keyed markers).
      const profile = { sex: "male" } as unknown as Profile;
      return simulateInsights([panel], profile, overrides);
    };
}

/* ============================================================================
   Top-level renderers
   ============================================================================ */

export async function renderPlan(): Promise<void> {
  const profile = await getProfile();
  if (!profile) { location.hash = "#/onboarding"; return; }

  // Lapse-aware recompose (ticket 0018). The welcome-back surface's
  // "Re-compose with the time off counted" CTA routes here with a
  // `recompose=lapse-aware` query flag. We honour it once — read the gap
  // from the `sessions` table, clear the query, and drive `compose()` with
  // the synthetic skip-days threaded through.
  const recomposeGap = await consumeLapseAwareRecompose();

  const plan = await latestPlan();
  if (!plan && recomposeGap == null) return paintEmpty();

  const mode = getMode();
  if (plan) await paint(plan, profile, mode);
  else        await paintEmpty();

  if (recomposeGap != null) {
    // Defer the compose call by a microtask so the dashboard renders first;
    // the user sees their existing plan and then the spinner over it. The
    // compose() helper writes a new plan row and routes through the router.
    void compose({ lapseAwareGap: recomposeGap });
  }
}

/**
 * Read the `recompose=lapse-aware` query parameter (ticket 0018). When set,
 * derive the gap days from the most-recent two `sessions` rows (the load
 * itself and the prior one), cap at WELCOME_BACK_MAX_SYNTHETIC_SKIP_DAYS,
 * and clear the query so a reload doesn't re-trigger. The synthetic days
 * are NEVER persisted; they live only inside the next compose call.
 *
 * Returns null when the flag is absent or the gap cannot be computed.
 */
async function consumeLapseAwareRecompose(): Promise<number | null> {
  const hash = location.hash || "";
  const q = (hash.split("?")[1] ?? "").split("#")[0] ?? "";
  if (!q) return null;
  const params = new URLSearchParams(q);
  if (params.get("recompose") !== "lapse-aware") return null;
  // Clear the flag — replaceState avoids polluting history with the consumed
  // query, and the SPA's router treats `#/plan` and `#/plan?recompose=...`
  // identically so this is a UX nicety, not a correctness fix.
  try {
    history.replaceState(null, "", "#/plan");
  } catch { /* embedded iframes / restricted contexts — fine to leave */ }

  // Pull the two most-recent session rows and derive the gap in days.
  const rows = await db.sessions.orderBy(":id").reverse().limit(2).toArray();
  if (rows.length < 2) return null;
  const newest = rows[0]!.at;
  const prior  = rows[1]!.at;
  const days = Math.max(0, Math.floor((newest - prior) / 86_400_000));
  if (days < WELCOME_BACK_THRESHOLD_DAYS) return null;
  return Math.min(days, WELCOME_BACK_MAX_SYNTHETIC_SKIP_DAYS);
}

async function paintEmpty(): Promise<void> {
  const masth = await masthead("#/plan");
  const panels = await allPanels();
  const haveLabs = panels.length > 0;

  // Adopt-and-adapt editorial line (ticket 0020). When the user arrived by
  // adopting a friend's protocol, the seed now lives on the persisted Profile.
  // Surface a single editorial line above the first-compose CTA so the empty
  // state acknowledges how they got here — context only; the plan is still
  // built against their own intake.
  const profile = await getProfile();
  const adoptLine = profile?.adoptSeed
    ? `<p class="adopt-plan-line">${esc(
        "You came in after reading a friend's protocol. Your plan will be built "
        + "against your own intake — the friend's pattern is context only.",
      )}</p>`
    : "";

  // Three branches:
  //   - haveLabs                → "compose now from your panels" (the old flow)
  //   - !haveLabs (intake only) → the first-compose two-path state (ticket 0007)
  //
  // The intake branch offers compose-from-intake as the primary CTA and a
  // labs-first link as the secondary. We keep the labs-first option so the
  // reader who came in with a PDF in hand isn't railroaded.
  const body = haveLabs
    ? `
      <div class="eyebrow">The plan</div>
      <h1 class="headline" style="margin-top: 0.4rem; max-width: 26ch;">
        Your <em>protocol</em> hasn't been written yet.
      </h1>
      <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
        ${panels.length} panel${panels.length === 1 ? "" : "s"} ready. Compose the plan when you are.
      </p>
      <div style="display: flex; gap: 1rem; margin-top: 2.2rem;">
        <button id="compose" class="btn btn--accent">Compose the plan</button>
        <a href="#/labs" class="btn btn--ghost">Back to labs</a>
      </div>
    `
    : `
      <div class="eyebrow">The plan</div>
      <h1 class="headline" style="margin-top: 0.4rem; max-width: 30ch;">
        Your first <em>protocol</em>, from what you've told us so far.
      </h1>
      <p class="lede" style="max-width: 60ch; margin-top: 1rem;">
        We can compose a real first plan from your intake — the goals, the dietary pattern, the conditions
        you named. It will be written without lab data, and the first thing it asks you to do is upload your
        most recent labs so the next pass can name specific markers.
      </p>
      ${adoptLine}
      <div style="display: flex; gap: 1rem; margin-top: 2.2rem; flex-wrap: wrap;">
        <button id="compose-from-intake" class="btn btn--accent">Compose from intake</button>
        <a href="#/labs" class="btn btn--ghost">I have labs — upload first</a>
      </div>
    `;

  const frag = h(`
    <div class="reveal">
      ${masth}
      <section class="page">
        ${body}
        <div id="status" class="quiet" style="display: none; margin-top: 2rem;"></div>
      </section>
      ${foot("iii")}
    </div>
  `);

  mount(frag);
  document.getElementById("compose")?.addEventListener("click", () => compose());
  document.getElementById("compose-from-intake")?.addEventListener("click", () => composeFromIntake());
}

/**
 * Compose the first plan from intake answers alone — no panels required.
 * Mirrors `compose()` (loading state, telemetry via the SDK call, savePlan,
 * commit-wait, then route() to re-render). The persisted Plan has
 * `basedOnPanelIds: []`, which is the only marker that distinguishes it
 * from a panel-grounded plan in storage. Ticket 0007.
 */
async function composeFromIntake(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus("Reading your intake…");

    setStatus("Composing your first plan…");
    const client = new ClaudeClient(profile);
    const { plan, model } = await client.generatePlanFromIntake({ profile });

    const savedId = await savePlan({
      ...plan,
      generatedAt: Date.now(),
      basedOnPanelIds: [],
      model,
    });

    // Single-use adopt seed (ticket 0020): the first composed plan acknowledges
    // the referral, then the seed is retired so subsequent re-composes never
    // carry it. Clear it AFTER the plan is saved so a compose failure leaves the
    // seed in place for a retry.
    await clearProfileAdoptSeed(profile);

    // Same WebKit/IndexedDB read-after-write wait as compose() — see the
    // comment in compose() for the long form of why this exists.
    await waitForPlanCommit(savedId);

    location.hash = "#/plan";
    await route();
  } catch (err: any) {
    if (!status) return;
    status.style.display = "block";
    const isTrunc = err instanceof TruncatedResponseError;
    const raw = isTrunc ? err.raw : extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Composition failed",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
      actions: `<button id="retry-intake" class="btn btn--accent">Try again</button>`,
    });
    document.getElementById("retry-intake")?.addEventListener("click", () => composeFromIntake());
  }
}

async function compose(opts: { lapseAwareGap?: number } = {}): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  const status = document.getElementById("status") as HTMLDivElement | null;
  const setStatus = (msg: string) => {
    if (!status) return;
    status.style.display = "block";
    status.innerHTML = `<span class="spinner"></span>&nbsp;&nbsp;${esc(msg)}`;
  };

  try {
    setStatus("Reading your panels…");
    const panels = await allPanels();
    const previousPlan = await latestPlan();
    const recent = await recentCheckIns(14);

    setStatus(opts.lapseAwareGap != null
      ? "Composing with the time off counted…"
      : "Composing your plan…");
    const client = new ClaudeClient(profile);
    const { plan, model } = await client.generatePlan({
      profile,
      panels,
      recentCheckIns: recent,
      ...(previousPlan ? { previousPlan } : {}),
      ...(opts.lapseAwareGap != null ? { lapseAwareGap: opts.lapseAwareGap } : {}),
    });

    const savedId = await savePlan({
      ...plan,
      generatedAt: Date.now(),
      basedOnPanelIds: panels.map(p => p.id!).filter(Boolean) as number[],
      model,
    });

    // Single-use adopt seed (ticket 0020) — see composeFromIntake() for the why.
    // The panels-first compose path also carries the seed (a recipient who
    // uploaded labs between onboarding and compose), so clear it here too.
    await clearProfileAdoptSeed(profile);

    // WebKit (especially headless Linux WebKit in CI) sometimes returns from
    // `db.plans.add()` slightly before the row is readable through the
    // `generatedAt` index — meaning the next `latestPlan()` call inside
    // renderPlan() could see undefined and paint the empty state. Poll until
    // the row we just wrote is visible to a fresh query, then drive the
    // re-render through the router. The loop is bounded (≤500ms in practice).
    await waitForPlanCommit(savedId);

    // We're already on #/plan, so reassigning location.hash to the same value
    // does NOT fire `hashchange` on WebKit. Instead, hand the next paint to
    // the router and await it.
    location.hash = "#/plan";
    await route();
  } catch (err: any) {
    if (!status) return;
    status.style.display = "block";
    const isTrunc = err instanceof TruncatedResponseError;
    const raw = isTrunc ? err.raw : extractRawFromMessage(err.message);
    status.innerHTML = errorCard({
      title: "Composition failed",
      message: err.message ?? String(err),
      ...(raw ? { raw } : {}),
      actions: `<button id="retry" class="btn btn--accent">Try again</button>`,
    });
    document.getElementById("retry")?.addEventListener("click", () => compose());
  }
}

function extractRawFromMessage(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  const m = msg.match(/--- raw ---\n([\s\S]+)$/);
  return m?.[1];
}

/**
 * Poll `latestPlan()` until it reflects the row we just saved. Used after
 * `savePlan()` to absorb WebKit/IndexedDB's occasional delay between a
 * write resolving and the indexed read returning that row.
 *
 * Bounded by `timeoutMs` so a real bug (the row never landed) still surfaces.
 */
async function waitForPlanCommit(id: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = await latestPlan();
    if (p && p.id === id) return;
    await new Promise(r => setTimeout(r, 20));
  }
  // If we drop out here we still proceed; the subsequent render will paint
  // an empty state (rare), but at least the user sees the screen — not a
  // half-built UI.
}

/**
 * Retire the single-use adopt seed (ticket 0020) off the persisted Profile
 * after the first plan is composed. Re-persists the profile with `adoptSeed`
 * dropped so subsequent re-composes never carry the referral block. No-op when
 * the profile never had a seed — the common case for non-referred users, so the
 * write only happens for the referred-first-compose path.
 */
async function clearProfileAdoptSeed(profile: Profile): Promise<void> {
  if (!profile.adoptSeed) return;
  const { id: _id, createdAt: _c, updatedAt: _u, adoptSeed: _seed, ...rest } = profile;
  await saveProfile({ ...rest, createdAt: profile.createdAt, adoptSeed: undefined });
}

/* ============================================================================
   Paint — dispatches to the chosen view mode
   ============================================================================ */

async function paint(plan: Plan, profile: Profile, mode: ViewMode): Promise<void> {
  // Shared-view (ticket 0017): render the bare eat / avoid / habit shape
  // from the decoded payload. No re-compose button, no share button (a
  // shared protocol is read-only by definition), no print button. The
  // editorial Read mode is the only surface — the dashboard's visualizations
  // depend on panels + check-ins that shared-view does not carry.
  if (isSharedView()) {
    return paintShared(plan);
  }

  const masth = await masthead("#/plan");
  const panels = await allPanels();
  const mealPlan = await latestMealPlan();
  const haveMeals = mealPlan && mealPlan.planId === plan.id;
  const ci = await checkInFor(today());
  const recent = await recentCheckIns(14);

  // What-if simulation context (ticket 0019). A full paint always exits any
  // active simulation — the state machine is per-render, never persisted.
  _sim = null;
  _simCtx = { panels, profile, catalog: await getAllMarkers() };

  const composedDate = esc(longDate(new Date(plan.generatedAt).toISOString().slice(0,10)));
  const toggleHtml = renderViewToggle(mode);
  const shareHtml = renderShareControl();

  // "Since your last plan" summary (ticket 0029). Diff the two most recent
  // plans by `generatedAt`; a third, older plan never contributes. Rendered
  // above the snapshot in both view modes when a prior plan exists. Pure +
  // local — no network, no inference. Shared-view never reaches here (it
  // returns early in paintShared above), and tour mode carries one plan only
  // so `prior` is undefined there — the summary is absent, never fabricated.
  const recent2 = await allPlans();      // newest-first by generatedAt
  const prior = recent2.find(p => p.id !== plan.id) ?? recent2[1];
  const deltaHtml = prior ? renderPlanDelta(plan, prior) : "";

  const body = mode === "dashboard"
    ? renderDashboard(plan, profile, panels, recent, ci, !!haveMeals)
    : renderEditorial(plan, !!haveMeals, mealPlan?.generatedAt);

  const frag = h(`
    <div class="reveal">
      ${masth}
      <article class="page">
        <div class="plan-head">
          <div class="eyebrow">Plan · composed ${composedDate}</div>
          <div class="plan-head__actions">
            ${toggleHtml}
            ${shareHtml}
          </div>
        </div>
        ${deltaHtml}
        ${body}
        <div style="margin-top: 3rem; display: flex; gap: 1rem; flex-wrap: wrap;">
          <a href="#/today" class="btn btn--accent">Go to today</a>
          <a href="#/meals" class="btn btn--ghost">${haveMeals ? "Open the meals" : "Generate the meals"}</a>
          <button id="recompose" class="btn btn--ghost">Re-compose plan</button>
        </div>
        ${renderTellFriend()}
        ${renderProtocolCardAction()}
        <div id="status" class="quiet" style="display: none; margin-top: 1.4rem;"></div>
      </article>
      ${foot("iii")}
    </div>
  `);

  mount(frag);

  // View mode toggle
  for (const btn of document.querySelectorAll<HTMLElement>(".view-toggle__opt")) {
    btn.addEventListener("click", async () => {
      const newMode = btn.dataset.mode as ViewMode;
      setMode(newMode);
      await paint(plan, profile, newMode);
    });
  }

  document.getElementById("recompose")?.addEventListener("click", () => compose());

  // Print or share — the audience-toggle panel + the generate handler.
  wireShareControl(plan, profile, panels);

  // Share with a friend (ticket 0050) — the text-recommendation channel.
  wireTellFriend(plan, profile, panels);

  // Save the card (ticket 0033) — the protocol-on-the-fridge image.
  wireProtocolCardAction(plan, profile);

  // Provenance chips render in both modes (ticket 0013) — wire here so the
  // handler is attached regardless of which view paints.
  wireProvenanceChips(plan);

  // What-if simulation chips (ticket 0019) — wire in both modes.
  wireSimulationChips(plan);

  // Dashboard-only handlers.
  if (mode === "dashboard") {
    wireDashboardHandlers(plan, ci, panels);
  }
}

/**
 * Render the Plan page against a shared payload (ticket 0017). Reads from
 * the synthetic Plan that `latestPlan()` returned (its eat/avoid/habit are
 * populated, every other field is empty). The render is intentionally a
 * trimmed-down editorial — eat list, avoid list, habit stack, no recompose
 * controls, no share button, no print button. The masthead carries the
 * shared-view banner so the recipient knows what they're reading.
 */
async function paintShared(plan: Plan): Promise<void> {
  const masth = await masthead("#/plan");
  const frag = h(`
    <div class="reveal">
      ${masth}
      <article class="page">
        <div class="eyebrow">A shared protocol</div>
        <h1 class="headline" style="margin-top: 0.4rem;">
          The <em>protocol.</em>
        </h1>
        <div class="ornament"><span class="dot"></span></div>

        <section class="prose dash-snapshot">
          <p class="dash-snapshot__lede">A friend sent you the food prescription, the avoid list, and the daily habits from their plan. Tap Today and Meals above to see the rest.</p>
        </section>

        <section style="margin-top: 2.6rem;">
          <div class="section-mark">Eat — the food prescription</div>
          ${plan.eatList.length === 0
            ? `<div class="quiet">Nothing was shared in this section.</div>`
            : plan.eatList.map(eatRowProse).join("")}
        </section>

        <section style="margin-top: 2.6rem;">
          <div class="section-mark">Reduce or replace</div>
          ${plan.avoidList.length === 0
            ? `<div class="quiet">Nothing flagged for avoidance.</div>`
            : plan.avoidList.map(avoidRow).join("")}
        </section>

        ${habitsHtml(plan)}
      </article>
      ${foot("iii")}
    </div>
  `);
  mount(frag);
}

function renderViewToggle(mode: ViewMode): string {
  const opt = (m: ViewMode, label: string) =>
    `<button class="view-toggle__opt ${m === mode ? "is-active" : ""}" data-mode="${m}">${label}</button>`;
  return `
    <div class="view-toggle" role="tablist">
      ${opt("dashboard", "Dashboard")}
      ${opt("read", "Read")}
    </div>
  `;
}

/* ============================================================================
   Print or share (ticket 0010)
   ============================================================================
   A small in-header chip that toggles an inline panel with two audience radio
   options plus a Generate button. Generating builds a `.print-sheet` into
   the document and fires `window.print()`. No route change, no API call.
*/

function renderShareControl(): string {
  // The control is a single button that toggles an `aria-expanded` flag on
  // the wrapping element; the panel itself lives next to the button and is
  // shown via the `is-open` class.
  //
  // Ticket 0017 — the second button next to "Print or share" opens the
  // shareable-protocol-link modal. The two affordances sit in the same row
  // so a user reaching for one sees the other; the editorial copy on the
  // modal is what disambiguates them.
  return `
    <div class="print-share">
      <button type="button" class="print-share__btn" aria-expanded="false" aria-controls="print-share-panel">
        Print or share
      </button>
      <button type="button" class="print-share__btn share-protocol__btn" data-action="share-protocol">
        Share this protocol
      </button>
      <div class="print-share-panel" id="print-share-panel" hidden>
        <fieldset class="print-share-panel__group">
          <legend class="print-share-panel__legend">Who is this for?</legend>
          <label class="print-share-panel__opt">
            <input type="radio" name="print-audience" value="doctor" checked />
            <span>For my doctor</span>
          </label>
          <label class="print-share-panel__opt">
            <input type="radio" name="print-audience" value="friend" />
            <span>For a friend</span>
          </label>
        </fieldset>
        <label class="print-share-panel__hide" data-audience-only="friend" hidden>
          <input type="checkbox" id="print-hide-name" />
          <span>Hide my name</span>
        </label>
        <button type="button" class="btn btn--accent print-share-panel__generate" id="print-generate">
          Generate PDF
        </button>
        <div class="print-share-panel__hint">
          Generated on your device — nothing is sent anywhere.
        </div>
      </div>
    </div>
  `;
}

function wireShareControl(plan: Plan, profile: Profile, panels: Panel[]): void {
  const btn   = document.querySelector<HTMLButtonElement>(".print-share__btn");
  const panel = document.querySelector<HTMLDivElement>(".print-share-panel");
  if (!btn || !panel) return;

  const openPanel = () => {
    panel.hidden = false;
    panel.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
  };
  const closePanel = () => {
    panel.hidden = true;
    panel.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  };

  btn.addEventListener("click", () => {
    if (panel.classList.contains("is-open")) closePanel();
    else openPanel();
  });

  // Show / hide the "Hide my name" checkbox in sync with the audience choice.
  // The checkbox only makes sense for the friend variant — for the doctor
  // variant the name is the whole point.
  const hideWrap = panel.querySelector<HTMLLabelElement>('[data-audience-only="friend"]');
  const syncHideVisibility = () => {
    if (!hideWrap) return;
    const selected = panel.querySelector<HTMLInputElement>('input[name="print-audience"]:checked');
    const isFriend = selected?.value === "friend";
    hideWrap.hidden = !isFriend;
  };
  for (const r of panel.querySelectorAll<HTMLInputElement>('input[name="print-audience"]')) {
    r.addEventListener("change", syncHideVisibility);
  }
  syncHideVisibility();

  // The generate button assembles the audience choice + hide-name toggle and
  // hands off to the print orchestrator. No async work — the sheet renders
  // synchronously from already-loaded local data.
  panel.querySelector<HTMLButtonElement>("#print-generate")?.addEventListener("click", () => {
    const checked = panel.querySelector<HTMLInputElement>('input[name="print-audience"]:checked');
    const audience: Audience = checked?.value === "friend" ? "friend" : "doctor";
    const hideName = (panel.querySelector<HTMLInputElement>("#print-hide-name")?.checked) ?? false;
    mountAndPrint({ plan, profile, panels, audience, hideName });
  });

  // Re-painting the page (view-mode toggle, re-compose) blows away the share
  // panel along with the rest of the plan body. Strip any orphaned print
  // sheet on render so a previously-printed variant doesn't ghost into the
  // next paint as a stray DOM fragment.
  removeMountedSheet();

  // Ticket 0017 — wire the second affordance (the shareable-protocol-link
  // modal). Lives next to the print-share toggle; the modal is rendered on
  // open via the same `.modal` idiom 0010 uses for the print dialog.
  document.querySelector<HTMLButtonElement>("[data-action='share-protocol']")
    ?.addEventListener("click", () => {
      void openProtocolShareModal(plan);
    });
}

/* ============================================================================
   Share this protocol — modal + encode + share-sheet/clipboard handoff
   (ticket 0017)
   ============================================================================
   The modal is a centered `.modal` overlay (mirrors the existing print-share
   panel CSS tokens). The encoded payload is computed lazily on Continue so
   a user who Cancels never pays the gzip cost. The 8000-char threshold is
   evaluated on open; when over, the modal switches to the "Copy long link"
   branch (no share-sheet attempt — long URLs do not survive iMessage).
*/

async function openProtocolShareModal(plan: Plan): Promise<void> {
  // The Plan object includes the synthetic meal plan in shared-view mode
  // (which would never reach this branch — shared-view hides the share
  // button), or undefined when the host hasn't generated meals yet. In the
  // long-payload test the spec writes a synthetic meal plan into a window
  // global; we read that first when present so the test can exercise the
  // long branch without driving the full meal-plan compose path.
  const overrideMp = (window as unknown as { __almanacShareTestInflate?: MealPlan }).__almanacShareTestInflate;
  const mealPlan = overrideMp ?? await latestMealPlan();
  const usableMealPlan = mealPlan && (overrideMp || mealPlan.planId === plan.id) ? mealPlan : undefined;

  // Encode upfront so the long-payload branch can read the length. The
  // encoded string is reused on Continue — no double work.
  const encoded = await encodeProtocolPayload(plan, usableMealPlan);
  const url = `${location.origin}/#/shared?p=${encoded}`;
  const isLong = encoded.length > 8000;

  const modalCopy = "This will create a link that contains your eat list, avoid list, habits, and meal plan. "
    + "It will not contain your name, your labs, your goals, your API key, or any insights about your biology. "
    + "The link works on any phone that opens it.";
  const longLine = "Your protocol is longer than most messaging apps allow in one link. Tap to copy instead of share.";

  const continueLabel = isLong ? "Copy long link" : "Continue";
  const html = `
    <div class="modal-backdrop" data-share-close></div>
    <div class="modal share-modal" role="dialog" aria-modal="true" aria-label="Share this protocol">
      <h2 class="share-modal__title">Share this protocol</h2>
      <p class="share-modal__body">${esc(modalCopy)}</p>
      ${isLong ? `<p class="share-modal__longline">${esc(longLine)}</p>` : ""}
      <div class="share-modal__actions">
        <button type="button" class="btn btn--accent" data-share-continue>${esc(continueLabel)}</button>
        <button type="button" class="btn btn--ghost" data-share-cancel>Cancel</button>
      </div>
      <div class="share-modal__confirm" role="status" aria-live="polite"></div>
    </div>
  `;

  const wrap = document.createElement("div");
  wrap.className = "share-modal-root";
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  const close = () => wrap.remove();
  wrap.querySelector("[data-share-close]")?.addEventListener("click", close);
  wrap.querySelector("[data-share-cancel]")?.addEventListener("click", close);
  wrap.querySelector("[data-share-continue]")?.addEventListener("click", async () => {
    // Long branch always copies — long URLs blow up in messaging apps.
    if (!isLong && typeof navigator !== "undefined"
        && typeof navigator.canShare === "function" && navigator.canShare({ url })) {
      try {
        await navigator.share({ url });
        close();
        return;
      } catch {
        // Fall through to the clipboard path on share-sheet failure.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      const confirm = wrap.querySelector<HTMLElement>(".share-modal__confirm");
      if (confirm) confirm.textContent = "Link copied. Paste it anywhere.";
    } catch {
      // Last resort: stash the URL on a visible input the user can copy
      // manually. Vanishingly rare; never reached in CI.
      const confirm = wrap.querySelector<HTMLElement>(".share-modal__confirm");
      if (confirm) confirm.textContent = "Could not access the clipboard. Long-press the link to copy.";
    }
  });
}

/* ============================================================================
   Share with a friend — the text-recommendation channel (ticket 0050)
   ============================================================================
   A single action below the plan-actions row that pre-composes a pure-ASCII
   recommendation from data already on the device (the top eat item, the
   most-improved marker if one exists, the wordmark, the canonical `#/try`
   tour path) and hands it to the OS share sheet — or, where `navigator.share`
   is absent or rejects (desktop / blocked), falls back to the clipboard with a
   transient "Copied." It renders whenever `paint()` runs, which is only when a
   composed plan exists AND we are not in shared-view (that path returns early
   in paintShared); tour mode reaches `paint()` so the action is offered against
   the sample plan. Zero network, zero Anthropic, zero key — a pure transform.

   The compose + share/clipboard handoff mirrors the share-link (0017) idiom and
   the improvement-card (0047) save flow; there is no second share mechanism.
*/

function renderTellFriend(): string {
  return `
    <section class="tell-friend" aria-label="Share a recommendation with a friend">
      <button type="button" class="tell-friend__btn"
              aria-label="Share with a friend — a pre-written recommendation built from your plan">
        Share with a friend
      </button>
      <span class="tell-friend__confirm" role="status" aria-live="polite"></span>
      <p class="tell-friend__note">
        A short, honest message built from your plan on this device — your top action and a marker that moved. Nothing about your biology travels.
      </p>
    </section>
  `;
}

function wireTellFriend(plan: Plan, profile: Profile, panels: Panel[]): void {
  const btn = document.querySelector<HTMLButtonElement>(".tell-friend__btn");
  if (!btn) return;
  const confirmEl = document.querySelector<HTMLElement>(".tell-friend__confirm");

  btn.addEventListener("click", async () => {
    // Compose entirely on-device: the most-improved selection (0047, verbatim)
    // plus the plan's top eat item. `_simCtx.catalog` carries user-defined
    // markers (0002) for name resolution; fall back to an empty extras list.
    const improved = selectMostImproved(panels, profile, _simCtx?.catalog ?? []);
    const text = composeShareMessage(plan, profile, improved);

    // Native share sheet when available. A rejection (user cancel / blocked)
    // OR a throw both fall through to the clipboard — never an error surface.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Fall through to the clipboard path.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      if (confirmEl) confirmEl.textContent = "Copied.";
    } catch {
      // Clipboard unavailable (rare; never in CI) — stay quiet rather than
      // surfacing an error for an optional growth affordance.
    }
  });
}

/* ============================================================================
   Save the card — the protocol-on-the-fridge image (ticket 0033)
   ============================================================================
   A single action below the plan-actions row that renders the protocol's
   glanceable essentials — the habit stack (≤5), the top eat foods with
   frequency (≤5), the top avoid items with swap (≤3) — to one phone-shaped
   editorial PNG entirely on-device, and hands it to the OS share sheet (or a
   `<a download>` fallback). It renders whenever `paint()` runs, which is only
   when a composed plan exists AND we are not in shared-view (that path returns
   early in paintShared); tour mode reaches `paint()` so the action is offered
   against the sample plan. Zero network, zero Anthropic, zero key — a pure
   render of local data, reusing the 0011/0047 canvas-and-download mechanism.
*/

function renderProtocolCardAction(): string {
  return `
    <section class="protocol-card" aria-label="Save the protocol as an image">
      <button type="button" class="protocol-card-save"
              aria-label="Save the card — a phone-shaped image of today's eat, avoid, and habits">
        Save the card
      </button>
      <p class="protocol-card__note">
        A phone-shaped image of the protocol — your habits, the foods to lean into, the ones to ease off — in the almanac's own type. Save it to the fridge or a lock screen. Drawn on this device; nothing is sent anywhere.
      </p>
    </section>
  `;
}

function wireProtocolCardAction(plan: Plan, profile: Profile): void {
  const btn = document.querySelector<HTMLButtonElement>(".protocol-card-save");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    // Guard against a double-tap re-render race while the canvas draws.
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      // Pure on-device render → the same shareOrDownload path 0011/0047 use.
      await saveProtocolCard(plan, profile);
    } catch {
      // A canvas/toBlob failure is vanishingly rare; never surface an error for
      // an optional keepsake affordance.
    } finally {
      btn.disabled = false;
    }
  });
}

/* ============================================================================
   Editorial mode (long-form prose)
   ============================================================================ */

function renderEditorial(plan: Plan, haveMeals: boolean, mealsGeneratedAt?: number): string {
  // Preserve original indices so provenance chips can map back to the
  // unsorted plan.insights[] entry the wiring expects.
  const insights = plan.insights
    .map((insight, originalIndex) => ({ insight, originalIndex }))
    .sort((a, b) => priorityOrder(a.insight.priority) - priorityOrder(b.insight.priority));

  return `
    <h1 class="headline" style="margin-top: 0.4rem;"><em>The protocol.</em></h1>
    <div class="ornament"><span class="dot"></span></div>

    <section class="prose">
      <div class="section-mark">Snapshot</div>
      ${plan.snapshot.split(/\n\n+/).map((p, i) => `<p ${i===0?'class="first"':""}>${esc(p)}</p>`).join("")}
    </section>

    <section style="margin-top: 2.4rem;">
      <div class="section-mark">What stands out</div>
      <ul class="insight-list">
        ${insights.map(({ insight: i, originalIndex }) => `
          <li class="insight insight--${esc(i.priority)}">
            <div class="insight__title">${esc(i.title)}</div>
            <div class="insight__detail">${esc(i.detail)}</div>
            <div class="insight__chips">
              ${provenanceChipHtml(i, originalIndex)}
              ${simChipRowHtml(i)}
            </div>
          </li>
        `).join("")}
      </ul>
    </section>

    <section style="margin-top: 2.6rem;">
      <div class="section-mark">Eat — the food prescription</div>
      ${plan.eatList.length === 0
        ? `<div class="quiet">No additions prescribed.</div>`
        : plan.eatList.map(eatRowProse).join("")}
    </section>

    <section style="margin-top: 2.6rem;">
      <div class="section-mark">Reduce or replace</div>
      ${plan.avoidList.length === 0
        ? `<div class="quiet">Nothing flagged for avoidance.</div>`
        : plan.avoidList.map(avoidRow).join("")}
    </section>

    <section style="margin-top: 2.6rem;">
      <div class="meal-cta">
        <div>
          <div class="meal-cta__title">${haveMeals ? `This week's meals are ready.` : `Turn this into a 7-day meal plan.`}</div>
          <div class="meal-cta__hint">${haveMeals
            ? `<span style="color: var(--ink-faint);">Last generated ${mealsGeneratedAt ? new Date(mealsGeneratedAt).toLocaleDateString() : ""}.</span>`
            : `Each meal hits the eat list at the right frequency, never includes anything from the avoid list, and respects your dietary pattern.`}</div>
        </div>
        <a href="#/meals" class="btn btn--accent">${haveMeals ? "Open the meals" : "Generate the meals"}</a>
      </div>
    </section>

    ${recBlock("Lifestyle",   plan.lifestyle,   "")}
    ${recBlock("Supplements", plan.supplements, "No supplement is justified by your current labs.")}

    ${habitsHtml(plan)}
    ${retestHtml(plan)}
  `;
}

/* ============================================================================
   Dashboard mode (visual + interactive)
   ============================================================================ */

function renderDashboard(
  plan: Plan,
  profile: Profile,
  panels: Panel[],
  recent: CheckIn[],
  todayCheckIn: CheckIn | undefined,
  haveMeals: boolean,
): string {
  // Preserve original indices so provenance chips can map back to the
  // unsorted plan.insights[] entry the wiring expects.
  const insights = plan.insights
    .map((insight, originalIndex) => ({ insight, originalIndex }))
    .sort((a, b) => priorityOrder(a.insight.priority) - priorityOrder(b.insight.priority));

  // Build a per-marker timeline so cards can show sparklines + thermometers.
  const series = buildMarkerSeries(panels);

  // Hero: pick up to 3 markers that the plan's high-priority insights cite,
  // or fall back to the first three from the eat list's markerKeys.
  const heroKeys = pickHeroMarkers(plan, profile, series);

  return `
    <h1 class="headline" style="margin-top: 0.4rem;">${esc(profile.ownerName)}'s <em>protocol.</em></h1>

    <section class="dash-snapshot" style="margin-top: 1rem;">
      ${plan.snapshot.split(/\n\n+/).slice(0, 1).map(p => `<p class="dash-snapshot__lede">${esc(p)}</p>`).join("")}
    </section>

    ${heroKeys.length ? `
      <section class="dash-hero">
        ${heroKeys.map(k => renderHeroCard(k, series)).join("")}
      </section>
    ` : ""}

    ${renderPanelSummary(panels)}

    <section class="dash-section">
      <header class="dash-section__head">
        <h2 class="dash-section__title">What stands out</h2>
        <span class="dash-section__hint">tap a card to see the supporting markers</span>
      </header>
      <div class="dash-insights">
        ${insights.map(({ insight: i, originalIndex }) => renderInsightCard(i, series, originalIndex)).join("")}
      </div>
    </section>

    <section class="dash-section">
      <header class="dash-section__head">
        <h2 class="dash-section__title">Eat</h2>
        <span class="dash-section__hint">${plan.eatList.length} ${plan.eatList.length === 1 ? "food" : "foods"} prescribed</span>
      </header>
      <div class="dash-eats">
        ${plan.eatList.map(renderEatCard).join("") || `<div class="quiet">No additions prescribed.</div>`}
      </div>
    </section>

    ${plan.avoidList.length ? `
      <section class="dash-section">
        <header class="dash-section__head">
          <h2 class="dash-section__title">Avoid</h2>
          <span class="dash-section__hint">${plan.avoidList.length} to reduce or swap</span>
        </header>
        <div class="dash-avoids">
          ${plan.avoidList.map(renderAvoidChip).join("")}
        </div>
      </section>
    ` : ""}

    <section class="dash-section">
      <header class="dash-section__head">
        <h2 class="dash-section__title">Habit stack</h2>
        <span class="dash-section__hint">tap to mark today done · 14-day completion ring</span>
      </header>
      <div class="dash-habits">
        ${plan.habitStack.habits.map(h => renderHabitCard(h, recent, todayCheckIn)).join("")}
      </div>
    </section>

    <section class="dash-section">
      <div class="meal-cta">
        <div>
          <div class="meal-cta__title">${haveMeals ? `This week's meals are ready.` : `Turn this into a 7-day meal plan.`}</div>
          <div class="meal-cta__hint">${haveMeals ? `Tap to open today's three meals.` : `Each meal honors the eat list, the avoid list, and your dietary pattern.`}</div>
        </div>
        <a href="#/meals" class="btn btn--accent">${haveMeals ? "Open the meals" : "Generate the meals"}</a>
      </div>
    </section>

    ${plan.supplements.length || plan.lifestyle.length ? `
      <section class="dash-section">
        <header class="dash-section__head">
          <h2 class="dash-section__title">Supporting</h2>
          <span class="dash-section__hint">lifestyle + supplements</span>
        </header>
        <div class="dash-supporting">
          ${plan.lifestyle.map(r => renderSupportingCard(r, "Lifestyle")).join("")}
          ${plan.supplements.map(r => renderSupportingCard(r, "Supplement")).join("")}
        </div>
      </section>
    ` : ""}

    ${plan.retest.length ? `
      <section class="dash-section">
        <header class="dash-section__head">
          <h2 class="dash-section__title">Retest cadence</h2>
        </header>
        <ul class="retest-list">
          ${plan.retest.map(r => `
            <li><strong>${esc(r.markerKeys.join(", "))}</strong> in <strong>${r.whenWeeks}</strong> weeks — ${esc(r.reason)}</li>
          `).join("")}
        </ul>
      </section>
    ` : ""}
  `;
}

/* ---- dashboard pieces -------------------------------------------------- */

interface MarkerSeries {
  values: { value: number; drawnAt: string }[];
  latest: number | undefined;
}

function buildMarkerSeries(panels: Panel[]): Map<string, MarkerSeries> {
  const map = new Map<string, MarkerSeries>();
  // Iterate oldest → newest so series is chronological.
  const ordered = [...panels].sort((a, b) => a.drawnAt.localeCompare(b.drawnAt));
  for (const p of ordered) {
    for (const r of p.results) {
      if (!map.has(r.markerKey)) map.set(r.markerKey, { values: [], latest: undefined });
      const s = map.get(r.markerKey)!;
      s.values.push({ value: r.value, drawnAt: p.drawnAt });
      s.latest = r.value;
    }
  }
  return map;
}

function pickHeroMarkers(plan: Plan, _profile: Profile, series: Map<string, MarkerSeries>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  // Prefer markers cited in HIGH-priority insights.
  for (const i of plan.insights) {
    if (i.priority !== "high") continue;
    if (i.markerKey && series.has(i.markerKey) && !seen.has(i.markerKey)) {
      out.push(i.markerKey); seen.add(i.markerKey);
    }
  }
  // Then medium.
  for (const i of plan.insights) {
    if (i.priority !== "medium") continue;
    if (i.markerKey && series.has(i.markerKey) && !seen.has(i.markerKey)) {
      out.push(i.markerKey); seen.add(i.markerKey);
    }
  }
  // Then anything from the eat-list's markerKeys.
  for (const e of plan.eatList) {
    for (const k of e.markerKeys) {
      if (series.has(k) && !seen.has(k)) {
        out.push(k); seen.add(k);
      }
      if (out.length >= 4) break;
    }
    if (out.length >= 4) break;
  }
  return out.slice(0, 4);
}

/**
 * The panel-summary block (ticket 0019, acceptance criterion (b)). Lists every
 * marker on the latest panel with its value and a "What if?" chip, so even a
 * marker no insight or eat item cites — including a user-defined marker — is
 * interrogable by the simulator. The hero cards above are the editorial focus;
 * this strip is the complete, dragable index of the draw.
 */
function renderPanelSummary(panels: Panel[]): string {
  const latest = panels[0];
  if (!latest || latest.results.length === 0) return "";
  const rows = latest.results.map(r => {
    const m = findMarker(r.markerKey, _simCtx?.catalog ?? []);
    const name = m?.shortName ?? m?.name ?? r.markerKey;
    const unit = r.unit || m?.unit || "";
    return `
      <div class="panel-summary__row" data-marker-key="${esc(r.markerKey)}">
        <span class="panel-summary__name">${esc(name)}</span>
        <span class="panel-summary__value">${esc(r.value)} <span class="panel-summary__unit">${esc(unit)}</span></span>
        ${simChipHtml(r.markerKey)}
      </div>
    `;
  }).join("");
  return `
    <section class="dash-section panel-summary">
      <header class="dash-section__head">
        <h2 class="dash-section__title">On this draw</h2>
        <span class="dash-section__hint">drag any value to see which insights would fire</span>
      </header>
      <div class="panel-summary__grid">${rows}</div>
    </section>
  `;
}

function renderHeroCard(markerKey: string, series: Map<string, MarkerSeries>): string {
  const m = findMarker(markerKey);
  const s = series.get(markerKey);
  if (!m || !s || s.latest == null) return "";

  const flag = computeFlag(s.latest, m.optimalRange, m.labRange);
  const sp   = sparkline({ marker: m, points: s.values });

  return `
    <div class="hero-card hero-card--${esc(flag)}">
      <div class="hero-card__name">${esc(m.shortName ?? m.name)}</div>
      <div class="hero-card__value">
        <span class="hero-card__num">${esc(s.latest)}</span>
        <span class="hero-card__unit">${esc(m.unit)}</span>
      </div>
      <div class="hero-card__chart">${sp}</div>
      <div class="hero-card__flag flag--${esc(flag)}">${esc(flag)}</div>
      <div class="hero-card__chips">${simChipHtml(markerKey)}</div>
    </div>
  `;
}

function renderInsightCard(i: Insight, series: Map<string, MarkerSeries>, originalIndex: number): string {
  // The insight may carry a single markerKey; show its thermometer when present.
  const m = i.markerKey ? findMarker(i.markerKey) : undefined;
  const s = i.markerKey ? series.get(i.markerKey) : undefined;
  const therm = (m && s && s.latest != null)
    ? thermometer({ marker: m, value: s.latest })
    : "";

  // "Read why X is on the list" — only when the insight cites a marker we know.
  // Lives outside <summary> so a tap on it never toggles the details
  // disclosure; the JS handler stops propagation as a belt-and-braces too.
  const whyLabel = m ? `Read why ${m.shortName ?? m.name} is on the list` : "";
  const whyChevron = i.markerKey && m
    ? `<button type="button" class="insight-card__why" data-why="${esc(i.markerKey)}" aria-label="${esc(whyLabel)}">›</button>`
    : "";

  // The chevron sits OUTSIDE <details> so closed-state UA styling doesn't
  // hide it. Both live inside a positioning wrapper so the button can be
  // pinned to the top-right corner. The provenance chip lives inside the
  // wrapper but OUTSIDE the <details> so it remains visible whether the
  // card is collapsed or expanded — the rule attribution belongs at the
  // top level of the card.
  return `
    <div class="insight-card-wrap">
      <details class="insight-card insight-card--${esc(i.priority)}">
        <summary class="insight-card__head">
          <span class="insight-card__pri">${esc(i.priority)}</span>
          <span class="insight-card__title">${esc(i.title)}</span>
        </summary>
        <div class="insight-card__body">
          <p class="insight-card__detail">${esc(i.detail)}</p>
          ${therm ? `
            <div class="insight-card__therm">
              <div class="insight-card__therm-label">${esc(m!.shortName ?? m!.name)} · ${esc(s!.latest!)} ${esc(m!.unit)}</div>
              ${therm}
            </div>
          ` : ""}
        </div>
      </details>
      ${whyChevron}
      <div class="insight-card__chips">
        ${provenanceChipHtml(i, originalIndex)}
        ${simChipRowHtml(i)}
      </div>
    </div>
  `;
}

/**
 * The set of "What if?" chips for one insight: one per marker the insight
 * surfaces — its single `markerKey` plus every provenance supporting marker.
 * De-duped so a marker that is both the insight's markerKey and a supporting
 * marker only renders one chip.
 */
function simChipRowHtml(i: Insight): string {
  const keys = new Set<string>();
  if (i.markerKey) keys.add(i.markerKey);
  for (const sm of i.provenance?.supportingMarkers ?? []) keys.add(sm.markerKey);
  return [...keys].map(k => simChipHtml(k)).join("");
}

function renderEatCard(e: EatItem): string {
  // Frequency dots — extract a number from "2x per week", "4 days/week", etc.
  const freqNum = parseFreq(e.frequency);
  const dots = Array.from({ length: 7 }, (_, i) =>
    `<span class="freq-dot ${i < freqNum ? "is-on" : ""}"></span>`,
  ).join("");
  const markerChips = e.markerKeys.map(k => {
    const m = findMarker(k);
    return `<span class="chip">${esc(m?.shortName ?? m?.name ?? k)}</span>`;
  }).join("");

  return `
    <article class="eat-card" data-card-id="${esc(e.id)}">
      <div class="eat-card__head">
        <div class="eat-card__food">${esc(e.food)}</div>
        <div class="eat-card__freq" title="${esc(e.frequency)}">${dots}</div>
      </div>
      <div class="eat-card__portion">${esc(e.portion)}</div>
      <p class="eat-card__why">${esc(e.why)}</p>
      ${e.examples?.length ? `<div class="eat-card__examples">${esc(e.examples.slice(0, 3).join(" · "))}</div>` : ""}
      ${markerChips ? `<div class="eat-card__markers">${markerChips}</div>` : ""}
    </article>
  `;
}

function renderAvoidChip(a: AvoidItem): string {
  return `
    <article class="avoid-chip">
      <div class="avoid-chip__food">${esc(a.food)}</div>
      ${a.swap ? `<div class="avoid-chip__swap">→ ${esc(a.swap)}</div>` : ""}
    </article>
  `;
}

function renderHabitCard(h: { id: string; title: string; cue: string; why: string }, recent: CheckIn[], todayCi: CheckIn | undefined): string {
  // Last 14 days completion — for the ring progress.
  const window = 14;
  let hits = 0;
  for (const c of recent.slice(0, window)) {
    if (c.habitsCompleted.includes(h.id)) hits++;
  }
  const ratio = hits / window;
  const ringSvg = ring({ value: ratio, size: 48, label: `${hits}` });

  const doneToday = todayCi?.habitsCompleted.includes(h.id) ?? false;

  return `
    <button class="habit-card ${doneToday ? "is-done" : ""}" data-habit="${esc(h.id)}" type="button">
      <div class="habit-card__ring">${ringSvg}</div>
      <div class="habit-card__body">
        <div class="habit-card__title">${esc(h.title)}</div>
        <div class="habit-card__cue">${esc(h.cue)}</div>
      </div>
      <div class="habit-card__check">${doneToday ? "✓" : ""}</div>
    </button>
  `;
}

function renderSupportingCard(r: Recommendation, kind: string): string {
  return `
    <details class="support-card support-card--${esc(r.tier)}" data-card-id="${esc(r.id)}">
      <summary>
        <span class="support-card__kind">${esc(kind)}</span>
        <span class="support-card__title">${esc(r.title)}</span>
        <span class="support-card__tier">${esc(r.tier)}</span>
      </summary>
      <div class="support-card__body">
        <p><em>Why:</em> ${esc(r.why)}</p>
        <p><em>How:</em> ${esc(r.how)}</p>
        ${r.expectedImpact ? `<p><em>Expected:</em> ${esc(r.expectedImpact)}</p>` : ""}
        ${r.caution ? `<p class="support-card__caution">⚠ ${esc(r.caution)}</p>` : ""}
      </div>
    </details>
  `;
}

/* ---- dashboard wiring -------------------------------------------------- */

async function wireDashboardHandlers(plan: Plan, _ci: CheckIn | undefined, panels: Panel[]): Promise<void> {
  for (const btn of document.querySelectorAll<HTMLElement>(".habit-card")) {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.habit;
      if (!id) return;

      // Toggle in today's check-in.
      const day = today();
      const current = await checkInFor(day);
      const set = new Set(current?.habitsCompleted ?? []);
      if (set.has(id)) set.delete(id); else set.add(id);

      await upsertCheckIn({
        day,
        habitsCompleted: Array.from(set),
        ...(current?.mealsAte ? { mealsAte: current.mealsAte } : {}),
        ...(current?.signals ? { signals: current.signals } : {}),
        ...(current?.note ? { note: current.note } : {}),
      });

      // Optimistic UI: toggle state + the check mark. The 14-day completion
      // ring only refreshes on the next render — that's a deliberate lag,
      // not a bug. Doing a full repaint here used to race with concurrent
      // UI assertions on WebKit and yielded no visual win.
      btn.classList.toggle("is-done");
      const checkEl = btn.querySelector(".habit-card__check");
      if (checkEl) checkEl.textContent = btn.classList.contains("is-done") ? "✓" : "";
    });
  }

  // "Why is this a problem?" chevrons on each insight card — open the
  // slideover with three local sections built from the marker DB, the
  // user's own trajectory, and the current plan. Zero API calls.
  for (const btn of document.querySelectorAll<HTMLElement>(".insight-card__why")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();   // never toggle the wrapping <details>
      const key = btn.dataset.why;
      if (!key) return;
      const insight = plan.insights.find(i => i.markerKey === key);
      if (!insight) return;
      openWhySlideover(insight, plan, panels, btn);
    });
  }
}

/* ---- why slideover ---------------------------------------------------- */

/**
 * Build and open the "Why is this a problem?" slideover for a single insight.
 * All data comes from the marker DB, the user's panels, and the current plan
 * — strictly local, zero network. Tap-targets close the slideover and scroll
 * to the matching plan card.
 */
function openWhySlideover(insight: Insight, plan: Plan, panels: Panel[], opener: HTMLElement): void {
  const key = insight.markerKey!;
  const marker = findMarker(key);

  // -- "The marker": marker DB description verbatim ----------------------
  const markerSection = marker
    ? `
      <section class="slideover__section">
        <h2 class="slideover__heading">The marker</h2>
        <div class="slideover__marker-name">${esc(marker.shortName ?? marker.name)}</div>
        <p class="slideover__marker-desc">${esc(marker.description)}</p>
      </section>
    `
    : `
      <section class="slideover__section">
        <h2 class="slideover__heading">The marker</h2>
        <p class="slideover__marker-desc">No reference entry on file.</p>
      </section>
    `;

  // -- "Your trajectory": ≤6 newest-first readings -----------------------
  // Walk every panel; gather (drawnAt, value, unit, flag) for this markerKey.
  // Sort newest → oldest by drawnAt and slice 6.
  type Row = { drawnAt: string; value: number; unit: string; flag?: string };
  const all: Row[] = [];
  for (const p of panels) {
    for (const r of p.results) {
      if (r.markerKey === key) {
        all.push({
          drawnAt: p.drawnAt,
          value: r.value,
          unit: r.unit,
          ...(r.flag ? { flag: r.flag as string } : {}),
        });
      }
    }
  }
  all.sort((a, b) => b.drawnAt.localeCompare(a.drawnAt));
  const visible = all.slice(0, 6);

  const trajectorySection = visible.length <= 1
    ? `
      <section class="slideover__section">
        <h2 class="slideover__heading">Your trajectory</h2>
        <div class="slideover__trajectory">
          <p>Only one reading on file — upload earlier draws to see a trend.</p>
          <p><a href="#/labs">Add earlier panels in labs →</a></p>
        </div>
      </section>
    `
    : `
      <section class="slideover__section">
        <h2 class="slideover__heading">Your trajectory</h2>
        <div class="slideover__trajectory">
          <ol class="slideover__trajectory-list">
            ${visible.map(r => `
              <li class="slideover__trajectory-row">
                <span class="slideover__trajectory-date">${esc(r.drawnAt)}</span>
                <span class="slideover__trajectory-value">${esc(r.value)} <span class="slideover__trajectory-unit">${esc(r.unit)}</span></span>
                ${r.flag ? `<span class="slideover__trajectory-flag flag--${esc(r.flag)}">${esc(r.flag)}</span>` : ""}
              </li>
            `).join("")}
          </ol>
        </div>
      </section>
    `;

  // -- "How to move it": insight detail + tap-targets --------------------
  const matchingEats: Array<{ id: string; label: string }> = plan.eatList
    .filter(e => e.markerKeys.includes(key))
    .map(e => ({ id: e.id, label: e.food }));
  const matchingSupps: Array<{ id: string; label: string }> = plan.supplements
    .filter(r => (r.markerKeys ?? []).includes(key))
    .map(r => ({ id: r.id, label: r.title }));
  const targets = [...matchingEats, ...matchingSupps];

  const moveSection = `
    <section class="slideover__section">
      <h2 class="slideover__heading">How to move it</h2>
      <p class="slideover__detail">${esc(insight.detail)}</p>
      ${targets.length ? `
        <div class="slideover__move">
          <div class="slideover__move-label">In your plan:</div>
          ${targets.map(t => `
            <button type="button" class="slideover__target" data-target="${esc(t.id)}">${esc(t.label)} <span class="slideover__target-arrow">↘</span></button>
          `).join("")}
        </div>
      ` : `
        <p class="slideover__detail slideover__detail--muted">No directly-matched items in your current plan.</p>
      `}
    </section>
  `;

  const labelName = marker?.shortName ?? marker?.name ?? insight.title;
  openSlideover(
    `<div class="slideover__sections">${markerSection}${trajectorySection}${moveSection}</div>`,
    { label: `Why ${labelName} is on the list`, returnFocusTo: opener },
  );

  // Wire tap-targets after the slideover is in the DOM.
  for (const t of document.querySelectorAll<HTMLElement>("aside.slideover .slideover__target")) {
    t.addEventListener("click", () => {
      const id = t.dataset.target;
      closeSlideover();
      if (!id) return;
      // Find the matching card on the plan: either an `.eat-card` (no data-id
      // today) or a `.support-card`. We tag both by data-card-id below to
      // make this scrollIntoView deterministic.
      const card = document.querySelector<HTMLElement>(`[data-card-id="${cssEscape(id)}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

/**
 * Bare-bones CSS.escape polyfill. WebKit/Chromium ship CSS.escape but
 * eat-item ids are simple slugs in practice; this just protects against
 * the unlikely id containing characters CSS would mis-parse.
 */
function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
}

/* ============================================================================
   Helpers shared between modes
   ============================================================================ */

function eatRowProse(e: EatItem): string {
  return `
    <div class="eat-item">
      <div class="eat-item__head">
        <div class="eat-item__food">${esc(e.food)}</div>
        <div class="eat-item__freq">${esc(e.frequency)} · ${esc(e.portion)}</div>
      </div>
      <p class="eat-item__why"><em>Why:</em> ${esc(e.why)}</p>
      ${e.examples?.length ? `<div class="eat-item__examples">e.g. ${e.examples.map(esc).join(" · ")}</div>` : ""}
      ${e.cuisineNotes ? `<div class="eat-item__cuisine">${esc(e.cuisineNotes)}</div>` : ""}
    </div>
  `;
}

function avoidRow(a: AvoidItem): string {
  return `
    <div class="avoid-item">
      <div class="avoid-item__food">${esc(a.food)}</div>
      <p class="avoid-item__why"><em>Why:</em> ${esc(a.why)}</p>
      ${a.swap ? `<p class="avoid-item__swap"><em>Swap:</em> ${esc(a.swap)}</p>` : ""}
    </div>
  `;
}

function recBlock(title: string, items: Recommendation[], emptyText: string): string {
  return `
    <section class="prose" style="margin-top: 2.4rem;">
      <div class="section-mark">${esc(title)}</div>
      ${items.length === 0 ? `<div class="quiet" style="padding: 0.6rem 0;">${esc(emptyText)}</div>` : ""}
      ${items.map(r => `
        <div class="rec rec--${esc(r.tier)}">
          <div class="rec__title">${esc(r.title)} <span class="rec__tier">${esc(r.tier)}</span></div>
          <p class="rec__why"><em>Why:</em> ${esc(r.why)}</p>
          <p class="rec__how"><em>How:</em> ${esc(r.how)}</p>
          ${r.expectedImpact ? `<p class="rec__impact"><em>Expected:</em> ${esc(r.expectedImpact)}</p>` : ""}
          ${r.caution ? `<p class="rec__caution">⚠ ${esc(r.caution)}</p>` : ""}
        </div>
      `).join("")}
    </section>
  `;
}

function habitsHtml(plan: Plan): string {
  return `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Habit stack · the easy tier</div>
      <p class="lede" style="max-width: 60ch; margin: 0 0 1.2rem;">${esc(plan.habitStack.intro)}</p>
      <ol class="habit-list">
        ${plan.habitStack.habits.map((h, i) => `
          <li class="habit-list__item">
            <span class="habit-list__num">${i + 1}</span>
            <div>
              <div class="habit-list__title">${esc(h.title)}</div>
              <div class="habit-list__cue">${esc(h.cue)}</div>
              <div class="habit-list__why"><em>${esc(h.why)}</em></div>
            </div>
          </li>
        `).join("")}
      </ol>
    </section>
  `;
}

function retestHtml(plan: Plan): string {
  if (plan.retest.length === 0) return "";
  return `
    <section style="margin-top: 2.4rem;">
      <div class="section-mark">Retest cadence</div>
      <ul class="retest-list">
        ${plan.retest.map(r => `
          <li><strong>${esc(r.markerKeys.join(", "))}</strong> in <strong>${r.whenWeeks}</strong> weeks — ${esc(r.reason)}</li>
        `).join("")}
      </ul>
    </section>
  `;
}

function priorityOrder(p: "high" | "medium" | "low"): number {
  return p === "high" ? 0 : p === "medium" ? 1 : 2;
}

/* ============================================================================
   Since your last plan — the plan-to-plan delta (ticket 0029)
   ============================================================================
   A short, deterministic, zero-network account of what changed between the two
   most recent plans, rendered above the snapshot. Editorial prose in ink /
   ink-soft — declarative lines, no diff coloring, no strikethroughs. The diff
   itself is pure (`computePlanDelta`); this function only resolves marker keys
   to human names and lays the lines out. When the two plans are identical it
   renders a single honest line rather than an empty summary.
*/

function renderPlanDelta(current: Plan, prior: Plan): string {
  const delta = computePlanDelta(current, prior);
  const span = relativeSpan(current.generatedAt, prior.generatedAt);
  const eyebrow = `<div class="plan-delta__eyebrow eyebrow">Since your last plan — ${esc(span)}</div>`;

  if (isEmptyDelta(delta)) {
    return `
      <section class="plan-delta" aria-label="Since your last plan">
        ${eyebrow}
        <p class="plan-delta__line plan-delta__line--quiet">Nothing changed since your last plan — your inputs were the same.</p>
      </section>
    `;
  }

  const lines: string[] = [];

  // Eat list — changed, added, retired.
  for (const c of delta.eat.changed) {
    lines.push(line(`${esc(c.item.food)} moved from ${esc(c.was)} to ${esc(c.now)}${markerReason(c.item.markerKeys)}.`));
  }
  for (const e of delta.eat.added) {
    lines.push(line(`${esc(e.food)} was added — ${esc(e.frequency)}${markerReason(e.markerKeys)}.`));
  }
  for (const e of delta.eat.removed) {
    lines.push(line(`${esc(e.food)} retired from the eat list.`));
  }

  // Avoid list — joined / left.
  for (const a of delta.avoid.added) {
    lines.push(line(`${esc(a.food)} joined the avoid list.`));
  }
  for (const a of delta.avoid.removed) {
    lines.push(line(`${esc(a.food)} left the avoid list.`));
  }

  // Habits — added / retired.
  for (const hbt of delta.habits.added) {
    lines.push(line(`${esc(hbt.title)} was added.`));
  }
  for (const hbt of delta.habits.retired) {
    lines.push(line(`${esc(hbt.title)} retired.`));
  }

  // Insights — newly noted / resolved, each under its own sub-line.
  let insightHtml = "";
  if (delta.insights.newlyFiring.length) {
    insightHtml += `<div class="plan-delta__sub">Newly noted</div>`;
    for (const title of delta.insights.newlyFiring) {
      insightHtml += line(esc(title) + ".");
    }
  }
  if (delta.insights.resolved.length) {
    insightHtml += `<div class="plan-delta__sub">Resolved</div>`;
    for (const title of delta.insights.resolved) {
      insightHtml += line(`${esc(title)} — resolved.`);
    }
  }

  return `
    <section class="plan-delta" aria-label="Since your last plan">
      ${eyebrow}
      <div class="plan-delta__lines">
        ${lines.join("")}
        ${insightHtml}
      </div>
    </section>
  `;
}

/** One declarative change line in ink-soft. */
function line(html: string): string {
  return `<p class="plan-delta__line">${html}</p>`;
}

/**
 * Resolve an eat item's `markerKeys` to a short " — <human marker names>"
 * suffix for a change/add line, via `findMarker()` so a raw key never reaches
 * the page. Empty when the item targets no markers. Caps at two names so the
 * line stays a sentence.
 */
function markerReason(markerKeys: string[] | undefined): string {
  const keys = (markerKeys ?? []).slice(0, 2);
  if (!keys.length) return "";
  const names = keys
    .map(k => {
      const m = findMarker(k, _simCtx?.catalog ?? []);
      return m?.shortName ?? m?.name ?? k;
    })
    .map(esc);
  return ` — ${names.join(", ")}`;
}

/* ============================================================================
   Provenance chip + slideover (ticket 0013)
   ============================================================================
   Rule-fired insights carry an optional `provenance` field. When present we
   render a small "Why this fired" chip underneath the insight; tapping it
   opens a slideover that names the rule id, the supporting markers (value,
   unit, draw date), the evidence string, the editorial gloss for that rule,
   and a footer attributing the finding to the deterministic rule engine.
   LLM-only insights carry no provenance and render no chip — the absence
   is the signal.
*/

const PROVENANCE_FOOTER =
  "This finding was produced by a deterministic rule, not by the language model.";

function provenanceChipHtml(insight: Insight, idx: number): string {
  if (!insight.provenance) return "";
  return `<button
    type="button"
    class="insight__provenance-chip"
    role="button"
    data-provenance-idx="${esc(idx)}"
    aria-label="Why this fired — ${esc(insight.title)}"
  >Why this fired</button>`;
}

/* ============================================================================
   What-if simulation chip (ticket 0019)
   ============================================================================
   A small-caps "What if?" eyebrow link in the ink token (NOT oxblood —
   interrogation is informational, not a call-to-action). Mirrors the
   provenance chip from 0013. Rendered next to every marker visible on the
   page; the same marker in two places renders the chip identically. The
   `data-marker-key` is the only thing the wiring needs to resolve the live
   value and enter simulation mode for that marker.
*/

function simChipHtml(markerKey: string | undefined): string {
  if (!markerKey) return "";
  const m = findMarker(markerKey, _simCtx?.catalog ?? []);
  const name = m?.shortName ?? m?.name ?? markerKey;
  return `<button
    type="button"
    class="sim-chip"
    role="button"
    data-marker-key="${esc(markerKey)}"
    aria-label="What if ${esc(name)} were different?"
  >What if?</button>`;
}

function renderProvenanceSlideover(insight: Insight, opener: HTMLElement): void {
  const prov = insight.provenance;
  if (!prov) return;
  const gloss = glossForRule(prov.ruleId);

  const markersHtml = prov.supportingMarkers.map(m => {
    const def = findMarker(m.markerKey);
    const display = def?.shortName ?? def?.name ?? m.markerKey;
    return `
      <div class="provenance-markers__row">
        <dt class="provenance-markers__key">
          <span class="provenance-markers__name">${esc(display)}</span>
          <code class="provenance-markers__code">${esc(m.markerKey)}</code>
          <span class="provenance-markers__value">${esc(m.value)} <span class="provenance-markers__unit">${esc(m.unit)}</span></span>
        </dt>
        <dd class="provenance-markers__meta">
          <span class="provenance-markers__drawn">drawn ${esc(m.drawnAt)}</span>
          ${m.threshold ? `<span class="provenance-markers__threshold">${esc(m.threshold)}</span>` : ""}
        </dd>
      </div>
    `;
  }).join("");

  const html = `
    <div class="provenance-slideover">
      <section class="slideover__section">
        <h2 class="slideover__heading">The rule</h2>
        <div class="provenance-rule-line">
          <code class="provenance-rule-id">rule: ${esc(prov.ruleId)}</code>
          <span class="provenance-rule-category">· ${esc(prov.category)}</span>
        </div>
      </section>

      <section class="slideover__section">
        <h2 class="slideover__heading">Supporting markers</h2>
        <dl class="provenance-markers">
          ${markersHtml}
        </dl>
        ${prov.evidence ? `<p class="provenance-evidence">Evidence: ${esc(prov.evidence)}</p>` : ""}
      </section>

      ${gloss ? `
        <section class="slideover__section">
          <h2 class="slideover__heading">Why this rule fires</h2>
          <p class="provenance-gloss">${esc(gloss)}</p>
        </section>
      ` : ""}

      <p class="provenance-footer">${esc(PROVENANCE_FOOTER)}</p>
    </div>
  `;

  openSlideover(html, {
    label: `Why this fired — ${insight.title}`,
    returnFocusTo: opener,
  });
}

/**
 * Bind click handlers for every `.insight__provenance-chip` currently in the
 * DOM. Looks up the insight by its position in `plan.insights[]` so the
 * mapping stays stable across both Read and Dashboard renders.
 */
function wireProvenanceChips(plan: Plan): void {
  for (const btn of document.querySelectorAll<HTMLElement>(".insight__provenance-chip")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = Number(btn.dataset.provenanceIdx);
      if (!Number.isFinite(idx)) return;
      const insight = plan.insights[idx];
      if (!insight || !insight.provenance) return;
      renderProvenanceSlideover(insight, btn);
    });
  }
}

/* ============================================================================
   What-if simulation — chip wiring + diff-aware re-render (ticket 0019)
   ============================================================================
   The chip enters a per-page simulation mode for a marker. While active:
     - a persistent `.sim-header` banner names the override(s) and the diff
     - each marker's thermometer gains a stepped slider (number input + ±)
     - the insights list re-renders with three diff states (still / would no
       longer / would newly fire), reading from `simulateInsights()`
     - the eat list / habit stack / meals DO NOT re-render; a note above them
       says the real values still drive them
   Closing simulation mode never writes anything — the live panel is untouched.
*/

function wireSimulationChips(plan: Plan): void {
  for (const btn of document.querySelectorAll<HTMLElement>(".sim-chip")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.markerKey;
      if (!key) return;
      enterSim(key, plan);
    });
  }
}

/** The latest reading for a marker across the live panels (newest first). */
function liveValueFor(key: string): number | undefined {
  for (const p of _simCtx?.panels ?? []) {
    for (const r of p.results) {
      if (r.markerKey === key) return r.value;
    }
  }
  return undefined;
}

/** The unit for a marker — the panel's recorded unit, else the catalog's. */
function unitFor(key: string): string {
  for (const p of _simCtx?.panels ?? []) {
    for (const r of p.results) {
      if (r.markerKey === key && r.unit) return r.unit;
    }
  }
  return findMarker(key, _simCtx?.catalog ?? [])?.unit ?? "";
}

/**
 * Resolve the slider bounds for a marker. Lab range wins when it provides
 * tighter bounds than the [0.3×, 2.5×] default window; a user-defined marker
 * with no range falls back to a wider [0.5×, 2×] window and the chip footer
 * notes the bounds are approximate. Returns the window plus a `userApprox`
 * flag the slider uses to render the note.
 */
function boundsFor(key: string, current: number): { low: number; high: number; userApprox: boolean } {
  const m = findMarker(key, _simCtx?.catalog ?? []);
  // A user-defined marker (0002) is one not present in the built-in seed —
  // `findMarker(key)` with no extras returns undefined for those. `getAllMarkers()`
  // strips `createdAt`, so we can't sniff that field; seed-membership is the
  // reliable test.
  const isUser = findMarker(key) == null && m != null;

  const lab = m?.labRange;
  const hasLab = lab && (lab.low != null || lab.high != null);

  // Default window for most markers.
  let low  = Math.max(0, current * 0.3);
  let high = current * 2.5;

  if (hasLab) {
    // Lab range wins when it gives a tighter window than the default.
    if (lab!.low  != null) low  = Math.max(low, lab!.low);
    if (lab!.high != null) high = Math.min(high, lab!.high);
    // Keep the current value inside the window even if the lab range excludes it.
    low  = Math.min(low, current);
    high = Math.max(high, current);
    return { low, high, userApprox: false };
  }

  if (isUser) {
    // No range on a user-defined marker — wider approximate window.
    return { low: Math.max(0, current * 0.5), high: current * 2, userApprox: true };
  }

  return { low, high, userApprox: false };
}

/** Snap a value to the marker's curated precision (default: 2 sig figs). */
function snapValue(key: string, v: number): number {
  const m = findMarker(key, _simCtx?.catalog ?? []);
  if (m?.precision != null) {
    const f = Math.pow(10, m.precision);
    return Math.round(v * f) / f;
  }
  // Default: two significant figures.
  if (v === 0) return 0;
  const digits = Math.ceil(Math.log10(Math.abs(v)));
  const power = 2 - digits;
  const f = Math.pow(10, power);
  return Math.round(v * f) / f;
}

/** The slider step for a marker — derived from its precision. */
function stepFor(key: string): number {
  const m = findMarker(key, _simCtx?.catalog ?? []);
  if (m?.precision != null) return m.precision === 0 ? 1 : Math.pow(10, -m.precision);
  return 1;
}

/**
 * Enter (or add a marker to) simulation mode. Idempotent per marker — tapping
 * the same chip twice does not stack a duplicate override. The first override
 * seeds the state machine; subsequent ones stack under the header.
 */
function enterSim(markerKey: string, plan: Plan): void {
  const live = liveValueFor(markerKey);
  if (live == null) return;   // nothing to drag against
  if (!_sim) _sim = { overrides: [] };
  if (!_sim.overrides.some(o => o.markerKey === markerKey)) {
    _sim.overrides.push({ markerKey, value: live });
  }
  renderSimulation(plan);
}

/** Remove a single override; if none remain, exit simulation mode entirely. */
function removeOverride(markerKey: string, plan: Plan): void {
  if (!_sim) return;
  _sim.overrides = _sim.overrides.filter(o => o.markerKey !== markerKey);
  if (_sim.overrides.length === 0) { exitSim(plan); return; }
  renderSimulation(plan);
}

/** Exit simulation mode: tear down the overlay and restore the live render. */
function exitSim(plan: Plan): void {
  _sim = null;
  document.querySelector(".sim-header")?.remove();
  document.querySelector(".sim-eat-note")?.remove();
  // Re-render the insights list against the live plan.
  restoreLiveInsights(plan);
}

/** Locate the insights list container in either view mode. */
function insightsContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".dash-insights, .insight-list");
}

/** Re-render the insights list from the live plan (used on exit). */
function restoreLiveInsights(plan: Plan): void {
  const container = insightsContainer();
  if (!container) return;
  const series = _simCtx ? buildMarkerSeries(_simCtx.panels) : new Map();
  const insights = plan.insights
    .map((insight, originalIndex) => ({ insight, originalIndex }))
    .sort((a, b) => priorityOrder(a.insight.priority) - priorityOrder(b.insight.priority));

  if (container.classList.contains("dash-insights")) {
    container.innerHTML = insights.map(({ insight: i, originalIndex }) =>
      renderInsightCard(i, series, originalIndex)).join("");
  } else {
    container.innerHTML = insights.map(({ insight: i, originalIndex }) => `
      <li class="insight insight--${esc(i.priority)}">
        <div class="insight__title">${esc(i.title)}</div>
        <div class="insight__detail">${esc(i.detail)}</div>
        <div class="insight__chips">
          ${provenanceChipHtml(i, originalIndex)}
          ${simChipRowHtml(i)}
        </div>
      </li>
    `).join("");
  }
  // Re-wire the chips on the freshly-rendered cards.
  wireProvenanceChips(plan);
  wireSimulationChips(plan);
}

/**
 * Render (or re-render) the full simulation overlay: header, sliders, and the
 * diff-aware insights list. Called on every chip tap and every slider input.
 * Only the insights list + header re-render; the eat/habit/meal DOM is left
 * exactly as the live render painted it.
 */
function renderSimulation(plan: Plan): void {
  if (!_sim || !_simCtx) return;

  const result = simulateInsights(_simCtx.panels, _simCtx.profile, _sim.overrides);
  const changed =
    result.diff.wouldNoLongerFire.length + result.diff.wouldNewlyFire.length;

  // -- Header (insert once, then update) --------------------------------------
  const article = document.querySelector<HTMLElement>("article.page");
  if (!article) return;
  let header = document.querySelector<HTMLElement>(".sim-header");
  if (!header) {
    header = document.createElement("div");
    header.className = "sim-header";
    article.insertBefore(header, article.firstChild);
  }
  header.innerHTML = simHeaderHtml(changed);
  wireSimHeader(header, plan);

  // -- Eat-list note (insert once) --------------------------------------------
  if (!document.querySelector(".sim-eat-note")) {
    const eatSection = findEatSection();
    if (eatSection) {
      const note = document.createElement("div");
      note.className = "sim-eat-note";
      note.textContent =
        "These are based on your real values. Close the simulation to see how they would shift.";
      eatSection.parentElement?.insertBefore(note, eatSection);
    }
  }

  // -- Diff-aware insights list -----------------------------------------------
  renderDiffInsights(plan, result);
}

/** The eat section element, whichever view painted it. */
function findEatSection(): HTMLElement | null {
  const dashEats = document.querySelector<HTMLElement>(".dash-eats");
  if (dashEats) return dashEats.closest<HTMLElement>(".dash-section") ?? dashEats;
  // Read mode: the eat list lives under a `.section-mark` heading; the first
  // `.eat-item` is enough of an anchor to insert the note before its section.
  const eatItem = document.querySelector<HTMLElement>(".eat-item");
  return eatItem ? (eatItem.closest<HTMLElement>("section") ?? eatItem) : null;
}

function simHeaderHtml(changed: number): string {
  if (!_sim || !_simCtx) return "";
  const phrases = _sim.overrides.map(o => {
    const m = findMarker(o.markerKey, _simCtx!.catalog);
    const name = m?.shortName ?? m?.name ?? o.markerKey;
    const live = liveValueFor(o.markerKey);
    const unit = unitFor(o.markerKey);
    return `${esc(name)}: ${esc(live)} → ${esc(o.value)} ${esc(unit)}`;
  });
  const subject = phrases.length === 1
    ? phrases[0]
    : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
  const changeLine = `${changed} ${changed === 1 ? "insight" : "insights"} changed`;

  const sliders = _sim.overrides.map(o => simSliderHtml(o.markerKey, o.value)).join("");

  return `
    <div class="sim-header__line">
      <span class="sim-header__label">Simulating ${subject}. ${changeLine}.</span>
      <div class="sim-header__actions">
        <button type="button" class="btn btn--ghost sim-header__reset">Reset to current</button>
        <button type="button" class="btn btn--ghost sim-header__close">Keep my real value</button>
      </div>
    </div>
    <div class="sim-header__sliders">${sliders}</div>
  `;
}

/**
 * One slider control: a stepped number input plus +/- steppers (the
 * cross-browser-deterministic path), with the marker's interactive
 * thermometer layered above it for the chromium pointer-drag. The number
 * input is the source of truth on both projects.
 */
function simSliderHtml(markerKey: string, value: number): string {
  if (!_simCtx) return "";
  const m = findMarker(markerKey, _simCtx.catalog);
  const name = m?.shortName ?? m?.name ?? markerKey;
  const live = liveValueFor(markerKey) ?? value;
  const { low, high, userApprox } = boundsFor(markerKey, live);
  const step = stepFor(markerKey);
  const unit = unitFor(markerKey);

  const therm = m
    ? thermometer({
        marker: m,
        value: live,
        interactive: { value, bounds: [low, high], onChange: () => {} },
      })
    : "";

  return `
    <div class="sim-slider" data-marker-key="${esc(markerKey)}"
         data-low="${low}" data-high="${high}" data-step="${step}">
      <div class="sim-slider__head">
        <span class="sim-slider__name">${esc(name)}</span>
        <button type="button" class="sim-slider__close" aria-label="Close ${esc(name)} override">×</button>
      </div>
      ${therm ? `<div class="sim-slider__therm">${therm}</div>` : ""}
      <div class="sim-slider__control">
        <button type="button" class="sim-slider__step" data-dir="-1" aria-label="Decrease">−</button>
        <input class="sim-slider__input" type="number" inputmode="decimal"
               min="${low}" max="${high}" step="${step}" value="${esc(value)}"
               aria-label="${esc(name)} value" />
        <span class="sim-slider__unit">${esc(unit)}</span>
        <button type="button" class="sim-slider__step" data-dir="1" aria-label="Increase">+</button>
      </div>
      ${userApprox
        ? `<div class="sim-slider__note">This is a user-defined marker — bounds are approximate.</div>`
        : ""}
    </div>
  `;
}

/** Wire the header buttons + every slider's input / steppers / handle / close. */
function wireSimHeader(header: HTMLElement, plan: Plan): void {
  header.querySelector(".sim-header__close")?.addEventListener("click", () => exitSim(plan));
  header.querySelector(".sim-header__reset")?.addEventListener("click", () => {
    if (!_sim) return;
    for (const o of _sim.overrides) {
      const live = liveValueFor(o.markerKey);
      if (live != null) o.value = live;
    }
    renderSimulation(plan);
  });

  for (const sliderEl of header.querySelectorAll<HTMLElement>(".sim-slider")) {
    const key = sliderEl.dataset.markerKey!;
    const low  = Number(sliderEl.dataset.low);
    const high = Number(sliderEl.dataset.high);
    const step = Number(sliderEl.dataset.step);
    const input = sliderEl.querySelector<HTMLInputElement>(".sim-slider__input")!;

    const apply = (raw: number) => {
      const clamped = Math.max(low, Math.min(high, raw));
      const snapped = snapValue(key, clamped);
      const ov = _sim?.overrides.find(o => o.markerKey === key);
      if (ov) ov.value = snapped;
      // Update the input without a full slider re-render so the user's caret
      // and the live drag stay smooth; the diff-aware insights re-render is
      // what carries the visible change.
      input.value = String(snapped);
      renderDiffOnly(plan);
    };

    input.addEventListener("input", () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) apply(v);
    });

    for (const stepBtn of sliderEl.querySelectorAll<HTMLElement>(".sim-slider__step")) {
      stepBtn.addEventListener("click", () => {
        const dir = Number(stepBtn.dataset.dir) || 1;
        const cur = _sim?.overrides.find(o => o.markerKey === key)?.value ?? low;
        apply(cur + dir * step);
      });
    }

    // Chromium pointer-drag on the SVG handle.
    const handle = sliderEl.querySelector<SVGElement>(".thermometer__slider-handle");
    if (handle) wireHandleDrag(handle, key, low, high, apply);

    sliderEl.querySelector(".sim-slider__close")?.addEventListener("click", () => removeOverride(key, plan));
  }
}

/**
 * Map a pointer drag along the thermometer to a value. The handle carries the
 * scale [sMin, sMax] and the canvas width as data attributes; we read the
 * pointer's x relative to the SVG and invert the scale, then clamp to bounds.
 */
function wireHandleDrag(
  handle: SVGElement,
  _key: string,
  low: number,
  high: number,
  apply: (v: number) => void,
): void {
  const svg = handle.closest("svg");
  if (!svg) return;
  const sMin = Number(handle.getAttribute("data-smin"));
  const sMax = Number(handle.getAttribute("data-smax"));

  let dragging = false;
  const valueAt = (clientX: number): number => {
    const rect = svg.getBoundingClientRect();
    const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const raw = sMin + frac * (sMax - sMin);
    return Math.max(low, Math.min(high, raw));
  };
  const move = (e: PointerEvent) => { if (dragging) apply(valueAt(e.clientX)); };
  const up = () => { dragging = false; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dragging = true;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

/**
 * Re-render only the diff-aware insights + the header's change count, without
 * rebuilding the sliders (so the input the user is typing into is not torn out
 * from under them). This is the hot path on slider input — it must stay under
 * 50ms, which it does: one `simulateInsights()` call (~1-5ms) plus an innerHTML
 * swap on the insights container.
 */
function renderDiffOnly(plan: Plan): void {
  if (!_sim || !_simCtx) return;
  const result = simulateInsights(_simCtx.panels, _simCtx.profile, _sim.overrides);
  const changed = result.diff.wouldNoLongerFire.length + result.diff.wouldNewlyFire.length;

  // Update the header's label + each slider's live→dragged readout in place.
  const label = document.querySelector<HTMLElement>(".sim-header__label");
  if (label) {
    const phrases = _sim.overrides.map(o => {
      const m = findMarker(o.markerKey, _simCtx!.catalog);
      const name = m?.shortName ?? m?.name ?? o.markerKey;
      const live = liveValueFor(o.markerKey);
      const unit = unitFor(o.markerKey);
      return `${name}: ${live} → ${o.value} ${unit}`;
    });
    const subject = phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
    label.textContent = `Simulating ${subject}. ${changed} ${changed === 1 ? "insight" : "insights"} changed.`;
  }

  renderDiffInsights(plan, result);
}

/**
 * Paint the diff-aware insights list. Live insights keep their normal render
 * with a diff state added: a card whose rule is in `wouldNoLongerFire` gets a
 * strikethrough + the "would no longer fire" badge; rules in `wouldNewlyFire`
 * append fresh cards at the bottom carrying the "would newly fire" badge, the
 * rule's evidence, and its gloss (re-used from 0013). LLM-only insights (no
 * provenance, not rule-fired) always read "still fires".
 */
function renderDiffInsights(plan: Plan, result: ReturnType<typeof simulateInsights>): void {
  const container = insightsContainer();
  if (!container) return;
  const isDash = container.classList.contains("dash-insights");
  const series = _simCtx ? buildMarkerSeries(_simCtx.panels) : new Map();

  const noLonger = new Set(result.diff.wouldNoLongerFire);

  // Existing insights, in priority order, with the "would no longer fire" mark.
  const ordered = plan.insights
    .map((insight, originalIndex) => ({ insight, originalIndex }))
    .sort((a, b) => priorityOrder(a.insight.priority) - priorityOrder(b.insight.priority));

  const existingHtml = ordered.map(({ insight: i, originalIndex }) => {
    const ruleId = i.provenance?.ruleId;
    const retired = ruleId ? noLonger.has(ruleId) : false;
    const isTrend = i.provenance?.category === "trend";
    return isDash
      ? renderDiffDashCard(i, series, originalIndex, retired, isTrend)
      : renderDiffReadCard(i, originalIndex, retired, isTrend);
  }).join("");

  // Newly-firing rules → fresh cards at the bottom.
  const newlyHtml = result.hypothetical
    .filter(h => result.diff.wouldNewlyFire.includes(h.id))
    .map(h => renderNewlyCard(h, isDash))
    .join("");

  container.innerHTML = existingHtml + newlyHtml;

  // Re-wire chips + provenance on the freshly rendered cards (live + newly).
  wireProvenanceChips(plan);
  wireSimulationChips(plan);
  wireNewlyProvenanceChips(result);
}

function badgeHtml(kind: "no-longer" | "newly", isTrend: boolean): string {
  const hedge = isTrend ? " after the next draw" : "";
  const text = kind === "no-longer" ? `would no longer fire${hedge}` : `would newly fire${hedge}`;
  return `<span class="sim-badge sim-badge--${kind}">${esc(text)}</span>`;
}

/** A live insight card (dashboard) with an optional "would no longer fire" mark. */
function renderDiffDashCard(
  i: Insight, series: Map<string, MarkerSeries>, originalIndex: number,
  retired: boolean, isTrend: boolean,
): string {
  const cls = retired ? "insight-card-wrap insight--would-no-longer-fire" : "insight-card-wrap";
  const m = i.markerKey ? findMarker(i.markerKey) : undefined;
  const s = i.markerKey ? series.get(i.markerKey) : undefined;
  const therm = (m && s && s.latest != null) ? thermometer({ marker: m, value: s.latest }) : "";
  const pri = retired ? badgeHtml("no-longer", isTrend) : `<span class="insight-card__pri">${esc(i.priority)}</span>`;
  return `
    <div class="${cls}">
      <details class="insight-card insight-card--${esc(i.priority)}">
        <summary class="insight-card__head">
          ${pri}
          <span class="insight-card__title">${esc(i.title)}</span>
        </summary>
        <div class="insight-card__body">
          <p class="insight-card__detail">${esc(i.detail)}</p>
          ${therm ? `<div class="insight-card__therm">${therm}</div>` : ""}
        </div>
      </details>
      <div class="insight-card__chips">
        ${provenanceChipHtml(i, originalIndex)}
        ${simChipRowHtml(i)}
      </div>
    </div>
  `;
}

/** A live insight card (read mode) with an optional "would no longer fire" mark. */
function renderDiffReadCard(i: Insight, originalIndex: number, retired: boolean, isTrend: boolean): string {
  const cls = retired ? "insight insight--would-no-longer-fire" : "insight";
  return `
    <li class="${cls} insight--${esc(i.priority)}">
      <div class="insight__title">${esc(i.title)}</div>
      <div class="insight__detail">${esc(i.detail)}</div>
      ${retired ? badgeHtml("no-longer", isTrend) : ""}
      <div class="insight__chips">
        ${provenanceChipHtml(i, originalIndex)}
        ${simChipRowHtml(i)}
      </div>
    </li>
  `;
}

/**
 * A fresh "would newly fire" card built from the hypothetical rule output. The
 * body re-uses the rule's evidence + gloss (0013) — no new content authored.
 * It carries a provenance chip whose slideover reads the HYPOTHETICAL marker
 * values (the cloned panel the simulator computed against).
 */
function renderNewlyCard(ins: PreComputedInsight, isDash: boolean): string {
  const isTrend = ins.category === "trend";
  const gloss = glossForRule(ins.id);
  const chip = ins.provenance
    ? `<button type="button" class="insight__provenance-chip" role="button"
         data-sim-rule="${esc(ins.id)}" aria-label="Why this fired — ${esc(ins.title)}">Why this fired</button>`
    : "";
  if (isDash) {
    return `
      <div class="insight-card-wrap insight--would-newly-fire">
        <details class="insight-card insight-card--${esc(ins.priority)}" open>
          <summary class="insight-card__head">
            ${badgeHtml("newly", isTrend)}
            <span class="insight-card__title">${esc(ins.title)}</span>
          </summary>
          <div class="insight-card__body">
            <p class="insight-card__detail">${esc(ins.detail)}</p>
            ${ins.evidence ? `<p class="insight-card__evidence">${esc(ins.evidence)}</p>` : ""}
            ${gloss ? `<p class="insight-card__gloss">${esc(gloss)}</p>` : ""}
          </div>
        </details>
        <div class="insight-card__chips">${chip}</div>
      </div>
    `;
  }
  return `
    <li class="insight insight--would-newly-fire insight--${esc(ins.priority)}">
      <div class="insight__title">${esc(ins.title)}</div>
      <div class="insight__detail">${esc(ins.detail)}</div>
      ${ins.evidence ? `<div class="insight__evidence">${esc(ins.evidence)}</div>` : ""}
      ${gloss ? `<div class="insight__gloss">${esc(gloss)}</div>` : ""}
      ${badgeHtml("newly", isTrend)}
      <div class="insight__chips">${chip}</div>
    </li>
  `;
}

/**
 * Wire the provenance chips on the "would newly fire" cards. These read the
 * hypothetical insight's provenance (built by `computeInsights()` from the
 * cloned, mutated panel) so the slideover's value rows reflect the dragged
 * number, not the live one — the spec asserts exactly this.
 */
function wireNewlyProvenanceChips(result: ReturnType<typeof simulateInsights>): void {
  for (const btn of document.querySelectorAll<HTMLElement>(".insight__provenance-chip[data-sim-rule]")) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const ruleId = btn.dataset.simRule;
      const ins = result.hypothetical.find(h => h.id === ruleId);
      if (!ins || !ins.provenance) return;
      renderProvenanceSlideover(toInsight(ins), btn);
    });
  }
}

/** Adapt a PreComputedInsight (rule output) into the Insight shape the
 *  provenance slideover renders. */
function toInsight(ins: PreComputedInsight): Insight {
  return {
    title: ins.title,
    detail: ins.detail,
    priority: ins.priority,
    ...(ins.supportingMarkers[0] ? { markerKey: ins.supportingMarkers[0] } : {}),
    ...(ins.provenance ? { provenance: ins.provenance as InsightProvenance } : {}),
  };
}

function parseFreq(s: string): number {
  // Try to extract a /week count from common phrasings.
  const m = s.match(/(\d+)\s*(?:x|times|servings?|days?)?\s*(?:per|\/)?\s*(?:wk|week)/i);
  if (m && m[1]) return Math.min(7, Math.max(1, parseInt(m[1], 10)));
  // "daily" / "every day"
  if (/daily|every day|each day/i.test(s)) return 7;
  // "twice daily" — cap at 7 for the dot strip
  if (/twice daily|2x daily/i.test(s)) return 7;
  return 3; // sensible default
}

function computeFlag(value: number, opt: { low?: number; high?: number }, lab?: { low?: number; high?: number }): string {
  const within = (v: number, r?: { low?: number; high?: number }) => {
    if (!r) return true;
    if (r.low != null  && v < r.low)  return false;
    if (r.high != null && v > r.high) return false;
    return true;
  };
  if (!within(value, lab)) return value < (lab?.low ?? -Infinity) ? "low" : "high";
  if (within(value, opt)) return "optimal";
  return "suboptimal";
}

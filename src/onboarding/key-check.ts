// Verify-before-commit — the "Check this key" affordance (ticket 0024).
//
// One shared helper backs both the onboarding form and the Settings form so the
// copy and behavior cannot drift between the two pages. The affordance is an
// opt-in, advisory probe: it never gates Save, it fires exactly one minimal call
// only when the user taps it, and it NEVER displays, logs, or echoes the key.
//
// The markup is small-caps eyebrow ink (informational, not a primary CTA). The
// result slot reserves its line height so the spinner doesn't shift the form
// when the answer arrives. Oxblood is reserved for the failure line only — a key
// that doesn't work is a genuine stop, the one place an alert register is honest.

import { esc } from "../ui";
import { verifyKey } from "../claude";
import { isTour } from "../sample/state";
import { isSharedView } from "../share/shared-state";

/** The result lines, kept here so the two pages render identical copy. */
const COPY = {
  ok:      (model: string) => `Key works. ${model} is reachable.`,
  auth:    "That key did not authenticate. Re-copy it from console.anthropic.com — the key starts with sk-ant- and is one long string.",
  model:   "Your key works, but the selected model is not reachable on this account. Pick a different model.",
  billing: "Your key works, but the account has no credit. Add credit at console.anthropic.com, then check again.",
  network: "Could not reach Anthropic. Check your connection and try again.",
} as const;

/**
 * The static markup for the affordance + reserved result slot. Drop it directly
 * under a key field's hint line. The action starts disabled; `wireKeyCheck`
 * keeps `aria-disabled` in sync with whether the key field holds text.
 *
 * Returns "" in tour (0014) and shared-view (0017) mode: neither has a real key
 * field — the field shown is sandbox scaffolding — and the probe must never fire
 * a billable call in a fixture context. Absent affordance, absent probe.
 */
export function keyCheckMarkup(): string {
  if (isTour() || isSharedView()) return "";
  return `
    <div class="key-check">
      <span class="key-check__action eyebrow" role="button" tabindex="0"
            aria-disabled="true">Check this key</span>
      <div class="key-check__result" role="status" aria-live="polite"></div>
    </div>
  `;
}

/**
 * Wire the affordance: enable/disable it as the key field gains/loses text,
 * and on tap read the CURRENT key + model, fire one probe, and paint one
 * deterministic line. Independent of the form's submit handler — submit is
 * untouched whether or not the check is ever invoked.
 *
 * `getKey` and `getModel` are read at click time (not at wire time) so the
 * probe always uses what's in the field right now.
 */
export function wireKeyCheck(
  root: ParentNode,
  getKey: () => string,
  getModel: () => string,
): void {
  const action = root.querySelector<HTMLElement>(".key-check__action");
  const result = root.querySelector<HTMLElement>(".key-check__result");
  const keyInput = root.querySelector<HTMLInputElement>("#key");
  if (!action || !result || !keyInput) return;

  const sync = () => {
    const enabled = getKey().trim().length > 0;
    action.setAttribute("aria-disabled", enabled ? "false" : "true");
  };
  sync();
  keyInput.addEventListener("input", sync);

  let inFlight = false;
  const run = async () => {
    if (inFlight) return;
    if (action.getAttribute("aria-disabled") === "true") return;
    const key = getKey().trim();
    if (!key) return;

    inFlight = true;
    action.setAttribute("aria-disabled", "true");
    // Reserved-height slot already holds the line, so swapping in the spinner
    // doesn't shift the form. The dots are CSS-animated, no layout cost.
    result.className = "key-check__result key-check__pending";
    result.textContent = "Checking…";

    const model = getModel();
    // verifyKey catches its own failures and resolves a discriminated union —
    // it never throws here, so an unhandled rejection can't reach the console.
    const outcome = await verifyKey(key, model);
    inFlight = false;
    sync();

    if (outcome.ok) {
      result.className = "key-check__result key-check__ok";
      result.textContent = COPY.ok(esc(model));
    } else {
      result.className = "key-check__result key-check__fail";
      result.textContent = COPY[outcome.reason];
    }
  };

  action.addEventListener("click", () => void run());
  action.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void run(); }
  });
}

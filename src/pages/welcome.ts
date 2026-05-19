// Welcome / consent splash. Runs once, before onboarding.
//
// Three things every user must read before doing anything:
//   1. This is informational, not medical advice.
//   2. All data stays on this device.
//   3. Inference uses YOUR Anthropic key, billed to YOU; we have no server.
//
// Acknowledgment flips a localStorage flag so subsequent visits skip the splash.
//
// Ticket 0014: a second always-enabled button below the consent checkbox
// drops the visitor into a sandboxed sample tour without acknowledging
// consent. The tour reads from a hand-curated fixture; nothing it does
// touches IndexedDB.

import { mount, h } from "../ui";
import { enterTour as enterSampleTour } from "../sample/state";

const KEY = "almanac.consent.v1";

export function consentAcknowledged(): boolean {
  return localStorage.getItem(KEY) === "true";
}

export function ackConsent(): void {
  localStorage.setItem(KEY, "true");
}

export function clearConsent(): void {
  localStorage.removeItem(KEY);
}

export async function renderWelcome(): Promise<void> {
  const frag = h(`
    <div>
      <header class="masthead">
        <div>
          <div class="dateline">An honest start</div>
          <div class="wordmark">Almanac<span class="amp">.</span></div>
        </div>
      </header>

      <section class="welcome reveal">
        <div class="ornament"><span class="dot"></span></div>

        <h1 class="headline" style="max-width: 22ch;">
          Before <em>we begin</em>.
        </h1>

        <p class="welcome__intro">
          Almanac is a local-first reading of your own biology. It is not a clinic,
          a doctor, or a diagnostic. Three things to understand before you upload
          a single number.
        </p>

        <div class="welcome__points">
          <div class="welcome__point">
            <div class="welcome__num">i</div>
            <div>
              <div class="welcome__pt-title">Informational, not medical advice.</div>
              <div class="welcome__pt-body">
                Nothing here diagnoses, treats, or replaces a clinician. The plan
                speaks in patterns ("tracks with", "is consistent with"), not
                prescriptions. Real changes — especially supplements, dosing, or
                stopping a medication — are conversations with a doctor who knows
                your full history. Almanac is a thinking partner; it is not your
                physician.
              </div>
            </div>
          </div>

          <div class="welcome__point">
            <div class="welcome__num">ii</div>
            <div>
              <div class="welcome__pt-title">All your data stays on this device.</div>
              <div class="welcome__pt-body">
                There is <strong>no backend</strong> and no telemetry. Your profile,
                lab panels, generated plans, meal plans, and check-ins live in your
                browser's IndexedDB — on this machine, never anywhere else.
                Original lab PDFs and photos are kept locally as well. The only
                way data leaves is when you explicitly export it to a JSON file.
              </div>
            </div>
          </div>

          <div class="welcome__point">
            <div class="welcome__num">iii</div>
            <div>
              <div class="welcome__pt-title">Your Anthropic key. Your data. Your bill.</div>
              <div class="welcome__pt-body">
                Inference is <strong>BYOK</strong> — bring your own Anthropic key.
                The key lives in your browser only and is sent <strong>directly</strong>
                from your browser to <code>api.anthropic.com</code>, never proxied
                through any server we run (because there isn't one). When Claude
                extracts your lab report or composes your plan, the request bills
                <em>your</em> Anthropic account. We don't see the lab, the response,
                or the key. Tokens are tracked locally so you can verify what was
                actually billed.
              </div>
            </div>
          </div>
        </div>

        <label class="welcome__consent" for="consent">
          <input id="consent" type="checkbox" />
          <span>
            I understand Almanac is informational only, that my data stays on this
            device, and that inference uses my own Anthropic key billed to me.
          </span>
        </label>

        <div style="display: flex; gap: 1rem; margin-top: 1.6rem; flex-wrap: wrap; align-items: center;">
          <button id="continue" class="btn btn--accent" disabled>Continue to onboarding</button>
          <button id="enter-tour" class="btn btn--ghost" type="button">Take a tour with sample data</button>
        </div>
        <p class="welcome__tour-note">
          The tour renders a fictional reader's Almanac — fully populated, read-only.
          Nothing is written. No key is used. You can close the tour at any time and
          start your own.
        </p>
      </section>

      <footer class="foot">
        <span class="colophon">Informational, not medical advice. Discuss changes with your clinician.</span>
        <span>i</span>
      </footer>
    </div>
  `);

  mount(frag);

  const cb   = document.getElementById("consent") as HTMLInputElement | null;
  const btn  = document.getElementById("continue") as HTMLButtonElement | null;

  const update = () => { if (btn && cb) btn.disabled = !cb.checked; };
  cb?.addEventListener("change", update);

  btn?.addEventListener("click", () => {
    if (!cb?.checked) return;
    ackConsent();
    location.hash = "#/onboarding";
  });

  // Sample tour (ticket 0014). Always enabled; does NOT call ackConsent().
  // Setting the tour flag tells the router on the next render to bypass
  // both the consent gate AND the profile gate so the visitor lands on
  // a fully-populated Almanac driven by the fixture in src/sample/.
  document.getElementById("enter-tour")?.addEventListener("click", () => {
    enterSampleTour();
    location.hash = "#/today";
  });
}

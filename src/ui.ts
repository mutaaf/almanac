// Tiny vanilla-TS templating. No virtual DOM. No framework. The almanac is
// five screens, total — a real framework would be louder than the content.

export function h(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content;
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mount(node: Node | DocumentFragment): void {
  const app = document.getElementById("app");
  if (!app) throw new Error("Missing #app root");
  app.replaceChildren(node);
}

/** Pretty date for marginalia: "Tuesday, May 6 2026" */
export function longDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

/** Roman numeral for page numbers in the foot. Vanity, but earns its keep. */
export function roman(n: number): string {
  if (n <= 0) return "";
  const map: [number, string][] = [
    [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
    [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"],
  ];
  let out = "";
  for (const [v, s] of map) { while (n >= v) { out += s; n -= v; } }
  return out;
}

/**
 * Render the inline tour-notice surfaced when a user taps a write action
 * during the sample tour (ticket 0014). Lives next to `errorCard()` because
 * it shares the same single-block-of-prose layout pattern, but uses the ink
 * token rather than the oxblood error token — the message is informational
 * ("this write was a no-op") rather than a failure.
 *
 * The notice is rendered into the page's `#status` slot (or whatever local
 * slot the calling page uses for transient feedback). It is a sibling of
 * errorCard(), not an alias: the CSS class is `.tour-notice`, not
 * `.error-card`, so the tone reads correctly.
 */
export function tourNotice(message: string): string {
  return `
    <div class="tour-notice" role="status">
      <div class="tour-notice__title">This is the sample tour.</div>
      <p class="tour-notice__msg">${esc(message)}</p>
    </div>
  `;
}

/**
 * Find the most plausible status slot on the current page and replace its
 * contents with the tour notice. Used by the db.ts write guards so each
 * page's existing `<div id="status">` block becomes the surface for the
 * informational notice without each page having to opt in.
 *
 * Falls back to a transient toast appended at the bottom of the page when
 * no status slot exists (e.g. on the Settings page).
 */
export function surfaceInlineTourNotice(
  message = "Start your own to write data.",
): void {
  if (typeof document === "undefined") return;
  const html = tourNotice(message);
  const status = document.getElementById("status");
  if (status) {
    status.style.display = "block";
    status.innerHTML = html;
    return;
  }
  // Settings has multiple specific status slots; pick the most recently
  // active one as a heuristic, otherwise append a transient floating notice.
  const localStatuses = ["set-status", "io-status", "save-status", "import-health-status"];
  for (const id of localStatuses) {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = html;
      // Make sure it's visible (some status spans have minimal styling).
      (el as HTMLElement).style.display = "block";
      return;
    }
  }
  // Last resort — append a floating toast to <main>.
  const host = document.querySelector(".page") ?? document.body;
  const wrap = document.createElement("div");
  wrap.className = "tour-notice-floating";
  wrap.innerHTML = html;
  host.appendChild(wrap);
  // Auto-remove after 4s so it doesn't pile up across multiple writes.
  setTimeout(() => wrap.remove(), 4000);
}

/**
 * Render a structured error card. Used by the plan / meals / labs flows
 * when a generation fails. `raw` is shown collapsed behind a disclosure;
 * `actions` is HTML for any retry / dismiss buttons (or an empty string).
 */
export function errorCard(opts: {
  title: string;
  message: string;
  raw?: string;
  actions?: string;
}): string {
  return `
    <div class="error-card">
      <div class="error-card__title">${esc(opts.title)}</div>
      <p class="error-card__msg">${esc(opts.message)}</p>
      ${opts.raw ? `
        <details>
          <summary>Show raw response</summary>
          <pre>${esc(opts.raw)}</pre>
        </details>
      ` : ""}
      ${opts.actions ? `<div class="error-card__actions">${opts.actions}</div>` : ""}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/*  Slideover                                                                 */
/* -------------------------------------------------------------------------- */
/*
 * In-page slideover for contextual long-form. The slideover is a sibling of
 * the route content (mounted directly under #app) so subsequent route renders
 * (which use `mount()`'s `replaceChildren`) do NOT blow it away — wait,
 * actually they would. So instead we mount it on <body>, return focus to the
 * element that opened it, and never touch the URL.
 *
 * The contract:
 *   - one instance at a time; opening a second slideover closes the first
 *   - backdrop tap, Escape, and the close button all dismiss
 *   - focus returns to the element that was active at open time
 *   - zero network — the consumer passes pre-rendered HTML
 *   - no history.pushState / no hashchange — strictly DOM-only
 */

interface SlideoverState {
  root: HTMLElement;
  backdrop: HTMLElement;
  aside: HTMLElement;
  returnFocus: HTMLElement | null;
  onClose?: (() => void) | undefined;
  escListener: (e: KeyboardEvent) => void;
}

let _slideover: SlideoverState | null = null;

function isPhoneViewport(): boolean {
  // Match the same breakpoint used in styles.css for `.slideover--from-bottom`.
  // Window.matchMedia is the simplest correct read; if it's unavailable
  // (vanishingly rare) default to desktop variant.
  try { return window.matchMedia("(max-width: 720px)").matches; }
  catch { return false; }
}

export interface OpenSlideoverOpts {
  onClose?: () => void;
  /** Optional ARIA label for the slideover container itself. */
  label?: string;
  /**
   * Element to focus when the slideover closes. Defaults to whatever was
   * `document.activeElement` at open time, but WebKit doesn't focus buttons
   * on click, so callers should pass the originating element explicitly.
   */
  returnFocusTo?: HTMLElement;
}

/**
 * Open the slideover with the given inner HTML. Closes any existing one first.
 * Returns nothing; the caller closes via `closeSlideover()` or by tapping the
 * backdrop / close button / pressing Escape.
 */
export function openSlideover(html: string, opts: OpenSlideoverOpts = {}): void {
  closeSlideover();   // enforce single-instance

  const returnFocus = opts.returnFocusTo
    ?? ((document.activeElement instanceof HTMLElement) ? document.activeElement : null);

  const variant = isPhoneViewport() ? "slideover--from-bottom" : "slideover--from-right";

  // Build markup as a single fragment so the close button is reachable.
  const frag = h(`
    <div class="slideover-root">
      <div class="slideover-backdrop" data-close></div>
      <aside class="slideover ${variant}" role="dialog" aria-modal="true"${opts.label ? ` aria-label="${esc(opts.label)}"` : ""}>
        <button type="button" class="slideover__close" aria-label="Close" data-close>×</button>
        <div class="slideover__inner">${html}</div>
      </aside>
    </div>
  `);

  // Mount on body so route re-renders into #app don't take the slideover
  // with them. (#app's replaceChildren would otherwise clear it.)
  document.body.appendChild(frag);
  const root     = document.body.querySelector<HTMLElement>(".slideover-root")!;
  const backdrop = root.querySelector<HTMLElement>(".slideover-backdrop")!;
  const aside    = root.querySelector<HTMLElement>("aside.slideover")!;

  const escListener = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); closeSlideover(); }
  };
  document.addEventListener("keydown", escListener);

  for (const el of root.querySelectorAll<HTMLElement>("[data-close]")) {
    el.addEventListener("click", () => closeSlideover());
  }

  _slideover = { root, backdrop, aside, returnFocus, ...(opts.onClose ? { onClose: opts.onClose } : {}), escListener };

  // Move focus to the close button so keyboard users land inside the dialog.
  // Skipping the focus call would leave focus on the opener and break Escape
  // routing in some browsers. Still, returnFocus is restored on close.
  queueMicrotask(() => aside.querySelector<HTMLElement>(".slideover__close")?.focus());
}

export function closeSlideover(): void {
  if (!_slideover) return;
  const s = _slideover;
  _slideover = null;
  document.removeEventListener("keydown", s.escListener);
  s.root.remove();
  // Return focus to whatever opened the slideover — keyboard users should
  // never find their focus stranded on <body> after a dismiss.
  if (s.returnFocus && document.contains(s.returnFocus)) {
    try { s.returnFocus.focus(); } catch { /* element no longer focusable */ }
  }
  s.onClose?.();
}

/** Volume / Issue label like "Vol. III · No. 47" — derived from the user's start date. */
export function issueLabel(startedAt: number, today: Date = new Date()): string {
  const start = new Date(startedAt);
  const diffDays = Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
  const vol = Math.floor((diffDays - 1) / 90) + 1;        // a "volume" is ~one season
  const iss = ((diffDays - 1) % 90) + 1;
  return `Vol. ${roman(vol)} · No. ${iss}`;
}

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

/** Volume / Issue label like "Vol. III · No. 47" — derived from the user's start date. */
export function issueLabel(startedAt: number, today: Date = new Date()): string {
  const start = new Date(startedAt);
  const diffDays = Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
  const vol = Math.floor((diffDays - 1) / 90) + 1;        // a "volume" is ~one season
  const iss = ((diffDays - 1) % 90) + 1;
  return `Vol. ${roman(vol)} · No. ${iss}`;
}

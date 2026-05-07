# Almanac

> *Your biology, translated into a plan you can keep.*

A local-first precision-health protocol that's **food-first**. You upload your lab reports — PDFs or photos — and Almanac extracts every marker, reconciles it against **functional / optimal** ranges (not just the lab's "in-range"), and composes:

- **Snapshot + Insights** — what your biology is saying, prioritized
- **Eat list** — specific foods, with frequency and portion, each tied to a marker (e.g. *"Fatty fish — 2x per week, ~4 oz cooked — for omega-3 index at 4% → target ≥8%"*)
- **Avoid list** — specific foods to reduce, with the swap
- **A 7-day meal plan** — real breakfast / lunch / dinner for each of the next seven days, distributed across **batch** / **weekend** / **weeknight** / **assembly** efforts so the week is realistic
- **Grocery list** — auto-derived from the week's meals, organized by section
- **Habit stack** — exactly 3–5 daily things you can hold without thinking
- **Lifestyle + Supplements** — supporting players, only when labs justify them
- **Retest cadence** — when to recheck what, and why

A 20-second daily check-in tracks meals eaten and habit adherence. New labs come in → the plan re-tunes; new week begins → the meal plan can be re-rolled independently.

## Why this isn't a Claude wrapper

The honest test: *"Why don't I just paste my labs into Claude.app and ask for a plan?"*

You can. You'll get a paragraph back. Almanac wins because of state, structure, and computation that exist outside the LLM call:

| What raw Claude can't do | What Almanac does |
|---|---|
| **Persistent timeline** — every chat starts blank | Every panel you've ever uploaded lives in IndexedDB, indexed by date and marker. The plan generator sees your full history every time. |
| **Functional ranges** — Claude defaults to lab "normal" | A curated DB of ~70 markers carrying *both* the lab range and the tighter functional / optimal range. Recommendations reason against the optimum, not the floor. |
| **Marker canonicalization** — "25-OH Vit D" / "Vitamin D, 25-OH" / "VitD" are different strings to Claude | All three resolve to the same canonical key, so trends span re-tests across labs and report formats. |
| **Programmatic insight engine** — Claude only spots what it happens to spot | A deterministic rule engine (`src/insights.ts`) scans your panels for clinically meaningful multi-marker patterns *before* the LLM sees the data: subclinical hypothyroid, iron-restricted erythropoiesis, atherogenic dyslipidemia, B12/folate insufficiency, smoldering inflammation triad — plus trend rules ("persistently elevated across N draws", "monotonic decline"). The patterns are passed to Claude as authoritative findings, not derived. |
| **Adherence loop** — Claude has no idea what you actually did | Every daily check-in feeds the next plan generation. If you held the easy tier 12/14 days, the next plan can promote to moderate. If you skipped salmon dinner three weeks running, the next plan picks a different protein vehicle. |
| **Multi-page lab reconciliation** — Claude can read a PDF, but won't dedupe across pages of the same draw | The extractor accepts up to N PDFs/images at once and reconciles markers across pages. |
| **Extraction caching** — Claude bills you every time | SHA-256 hash of staged files; re-pasting the same screenshots replays the prior extraction at zero cost. |
| **Aggressive prompt caching** — Claude.app charges for every token of context every time | The voice spec, your profile, and the marker reference live in `cache_control: ephemeral` blocks. Re-rolls within 5 minutes only re-pay for the volatile content. **Settings → AI calls** shows your actual cache hit rate. |
| **Structured artifact, not chat** — Claude.app gives you prose | Every plan / meal-plan / panel renders as a real document: tappable habits, sparkline trends per marker with the functional range as the band behind the line, a 7-day meal grid you can navigate, a grocery list with checkboxes. |
| **Privacy** — every Claude.app conversation persists in your account | No backend exists. Your data lives in this browser. Inference calls go directly from your browser to api.anthropic.com using **your** key. |

The wrapper that adds none of these is dead-weight. The one that adds all of them is a different product than the chat box.

## The privacy promise

There is no server. There is no cloud. There is no telemetry.

- Your profile, panels, plans, and check-ins live in **this browser's IndexedDB**, on this machine.
- Your Anthropic API key lives in IndexedDB. The only egress is direct from your browser to `api.anthropic.com` — once when you upload a lab (Claude extracts markers from the PDF/photo), and once when you compose or recompose your plan.
- Original lab PDFs/images stay on the device as `Blob`s in IndexedDB. They are never uploaded anywhere except the one extraction call.
- Export anytime to a single `.almanac.json`. Sharing with friends means each person runs their own copy with their own key.

## Stack

| | |
|---|---|
| Build | Vite + TypeScript, vanilla DOM (no framework) |
| Storage | IndexedDB via [Dexie](https://dexie.org/) |
| Inference | [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), browser-direct, BYOK |
| Lab extraction | Claude Vision — PDFs and images parsed directly into structured results |
| Functional ranges | Built-in DB of ~40 common markers (`src/data/markers.ts`) — extend as needed |
| Aesthetic | Editorial / private-press: Cormorant Garamond + Inter Tight, cream + ink + a single oxblood accent |

## Deploy to Vercel

Almanac is a static SPA — no backend, no environment variables, no secrets to manage on the host. Deployment takes about a minute.

**Option 1 — Vercel CLI (fastest):**

```bash
cd /Users/mutaafaziz/Desktop/projects/almanac
npm i -g vercel
vercel             # follow prompts; creates a preview URL
vercel --prod      # promotes to production
```

**Option 2 — GitHub + Vercel dashboard:**

1. `gh repo create almanac --private --source . --push` (or push to your own remote).
2. At [vercel.com/new](https://vercel.com/new), import the repo. Vite is auto-detected.
3. No environment variables required. Click Deploy.

The `vercel.json` in this repo handles the rest:
- **SPA rewrites** — every path falls back to `index.html` so direct links to `#/today`, `#/labs?id=3`, etc. work after refresh.
- **Security headers** — `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Permissions-Policy` blocking camera/mic/geolocation, `Referrer-Policy: no-referrer`.
- **Asset caching** — fingerprinted bundles get `Cache-Control: public, max-age=31536000, immutable`.

Note: deploying to Vercel means *the public can reach the site*, but Almanac is still a single-tenant app — every visitor sets up their own profile in their own browser, runs against their own Anthropic key, and stores their data in their own IndexedDB. Nothing is shared, because there's no backend to share through.

## Run it

```bash
cd /Users/mutaafaziz/Desktop/projects/almanac
npm install
npm run dev          # → http://127.0.0.1:5181
```

## The first lap

1. **Onboarding** (`#/onboarding`) — name, DOB, sex, height/weight, goals, conditions, **dietary pattern** (halal / vegetarian / cuisines / cooking capacity / allergies — all in one free-form line), household size, Anthropic key.
2. **Labs** (`#/labs`) — drop a PDF or photo of your last report. Claude extracts every numeric marker. Or click *enter values manually*.
3. **Plan** (`#/plan`) — *Compose the plan*. Snapshot, insights, **eat list**, **avoid list**, lifestyle, supplements, habit stack, retest schedule.
4. **Meals** (`#/meals`) — *Generate the week*. Seven days of meals + a grocery list, all aligned to the eat list, free of anything on the avoid list, respecting your dietary pattern. Re-roll any time.
5. **Today** (`#/today`) — today's three meals as tap-to-mark cards, then the habit stack, then optional mood/energy/sleep. The day's ritual.
6. **Progress** (`#/progress`) — sparkline trends per marker once you have 2+ panels, with the functional range as the band behind the line.
7. **Settings** (`#/settings`) — edit profile, key, model, **export**, **import**, **burn**.

## How the plan stays current

- **Adherence loop** — your last 14 daily check-ins go into the plan-generation prompt. If you've held the easy tier reliably, the next composition can promote you to moderate.
- **Panel loop** — every new lab feeds the next composition. Insights name what changed since last draw.
- **Prompt caching** — the voice spec, your profile, and the marker reference live in a `cache_control: ephemeral` block. Re-compositions within a 5-minute TTL only pay for the freshest content.

## Design choices worth flagging

- **Both ranges, always.** Every result shows the lab's reference range AND a functional range. The lab's "normal" is a floor; the functional range is the target.
- **Easy tier first.** The HabitStack is capped at 3–5 items, every one of which a tired person can do without thinking. The plan generator is explicitly told to default to *easy* and only promote to *moderate*/*advanced* when adherence justifies it.
- **Light disclaimer, no dark patterns.** A single line at the bottom of every page: *informational, not medical advice*. No popups, no consent walls.
- **No streaks-as-pressure.** The 14-day strip is a calm visualization, not a Snapchat-style retention loop. Miss a day; the strip just shows it. No alerts.

## What's deliberately missing in v1

- No login, no account, no sync server.
- No web tracking, no analytics, no error reporting.
- No wearables yet (Apple Health / Whoop / Oura) — those are roadmap.
- No social feed, no sharing buttons, no export to anything but JSON.

## Roadmap

- **v1.1** — Wearables: Apple Health import (CSV/XML) + Whoop / Oura via their export files. Read-only, on-device parsing.
- **v1.2** — Compare two panels side-by-side; "since last draw" diff in the plan.
- **v1.3** — Print-to-PDF that actually looks like a printed almanac.
- **v1.4** — User-extensible marker DB: add your own markers + functional ranges.
- **v2** — Optional Ollama / local-model toggle for full zero-egress (no Claude call at all).

## License

Private. For me, and for whoever I hand a copy to.

---

*Informational, not medical advice. Discuss recommendations and supplement dosing with a clinician who knows your history.*

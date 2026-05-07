# Almanac

> *Your biology, translated into a plan you can keep.*

A local-first precision-health protocol. You upload your lab reports — PDFs or photos — and Almanac extracts every marker, reconciles it against **functional / optimal** ranges (not just the lab's "in-range"), and composes a single living protocol:

- **Snapshot** — what your biology is saying right now, in plain language
- **Insights** — 3–7 prioritized findings that drive everything else
- **Nutrition · Lifestyle · Supplements** — specific recommendations, each tied to a finding, ranked **easy → moderate → advanced**
- **Habit stack** — exactly 3–5 daily things you can hold without thinking. Earn the harder protocols by sustaining the easy ones.
- **Retest cadence** — when to recheck what, and why

A 20-second daily check-in tracks adherence. New labs come in → the plan re-tunes against what changed.

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

## Run it

```bash
cd /Users/mutaafaziz/Desktop/projects/almanac
npm install
npm run dev          # → http://127.0.0.1:5181
```

## The first lap

1. **Onboarding** — name, DOB, sex, height/weight, goals, conditions, Anthropic key. (`#/onboarding`)
2. **Labs** (`#/labs`) — drop a PDF or photo of your last report. Claude extracts every numeric marker. Or click *enter values manually*.
3. **Plan** (`#/plan`) — *Compose the plan*. Snapshot, insights, nutrition / lifestyle / supplements, habit stack, retest schedule. Re-compose anytime.
4. **Today** (`#/today`) — your habit stack as tappable cards. 20 seconds. Optionally log mood / energy / sleep.
5. **Progress** (`#/progress`) — for any marker that appears in 2+ panels, a small inline trend with the functional range as the band behind it. Direction is colored relative to the optimum, not the lab range.
6. **Settings** (`#/settings`) — edit profile, key, model, **export**, **import**, **burn**.

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

# Almanac

> *A daily page, printed only on this device.*

A local-first personal almanac. You feed it your inputs — labs, sleep, what you ate, a paragraph about yesterday — and each morning it composes one page written for you: a *Read*, a *Do*, a *Notice*, and a single concrete *Action of the day*.

It is not a dashboard. It is not a coach. It is the morning ritual of opening a thin, well-set book.

## The privacy promise

There is no server. There is no cloud. There is no telemetry.

- Your entries, pages, summaries, and API key live in **this browser's IndexedDB**, on this machine.
- The only network request the app makes is the call to `api.anthropic.com` that drafts your daily page — directly from your browser, using **your own** Anthropic key (BYOK).
- Older entries are summarized **on-device** with [Transformers.js](https://github.com/xenova/transformers.js) before any context is sent to Claude — so most of your raw history never leaves the machine, even on inference calls.
- Export anytime to a single `.almanac.json` file. That file is the entire almanac. Keep it where you trust.
- Sharing with friends means each person runs their own copy with their own key. That's the point.

## Stack

| | |
|---|---|
| Build | Vite + TypeScript, vanilla DOM (no framework) |
| Storage | IndexedDB via [Dexie](https://dexie.org/) |
| Inference | [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript), browser-direct, BYOK |
| On-device summarization | [@xenova/transformers](https://huggingface.co/docs/transformers.js) — `Xenova/distilbart-cnn-6-6` |
| Type | Editorial / private-press: Cormorant Garamond + Inter Tight, cream + ink + a single oxblood accent |

## Run it

```bash
cd /Users/mutaafaziz/Desktop/projects/almanac
npm install
npm run dev          # → http://127.0.0.1:5181
```

First run drops you on `#/onboarding`:

1. **Your name** — how the page should address you.
2. **Intent** — a few sentences on what you want this almanac to help with. The editor reads this every morning.
3. **Anthropic API key** — get one at https://console.anthropic.com/settings/keys.
4. Pick a model (default: `claude-sonnet-4-6`).

Then write a note (`#/inputs`) — anything; a paragraph is plenty — and press **Compose today's page** on `#/today`.

## The day

```
Inputs (notebook)  ─►  Compose  ─►  Today's Page  ─►  read · close · come back tomorrow
       ▲                                │
       └────────  every entry feeds the next morning's draft  ───┘
```

The first compose of the week downloads the on-device summarizer (~80MB, one-time). Subsequent compositions reuse the cached model and the cached prompt — Anthropic's prompt cache means the editor's voice spec, your profile, and your rolling history summary are paid for once and re-read for free.

## The five screens

- `#/onboarding` — name, intent, key. Once.
- `#/today` — the page. Compose, read, re-roll if you want.
- `#/inputs` — the notebook. One textarea, optional structured signals.
- `#/almanac` — bound archive of past pages.
- `#/settings` — edit profile/key/model, toggle signals, **export**, **import**, **burn**.

## Backup and sharing

- **Export** writes `YYYY-MM-DD.almanac.json` to your Downloads folder. That's the whole thing.
- To **share with someone else**, hand them this repo + their own Anthropic key. Their almanac is theirs, on their machine.
- To **sync between your own machines**, drop the export file into a folder you already trust (iCloud Drive, Dropbox, Syncthing, a USB stick). On the other machine, **Import a backup**.
- To **burn it all**, Settings → *Burn the almanac*. There is no undo.

## What's deliberately missing in v0

- No streaks, no graphs, no notifications, no gamification.
- No login, no account, no sync server.
- No web tracking, no analytics, no error reporting.
- No social feed, no sharing buttons, no export to anything but JSON.

These will stay missing until they're earned. The almanac is a quiet object.

## Roadmap (small, deliberate)

- **v0.2** — Ollama / local-model toggle for full zero-egress (no Claude call at all).
- **v0.3** — Apple Health / Whoop / Oura readers (read-only, on-device).
- **v0.4** — Print-to-PDF that actually looks like a printed almanac.
- **v0.5** — Voice-first entry mode (speak the notebook, transcribe locally with Whisper.cpp).

## License

Private. For me, and for whoever I hand a copy to.

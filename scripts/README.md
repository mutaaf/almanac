# scripts/ — local autonomous agents

Two launchd jobs that run the GTM and Implementation-Dev agents against this repo on a schedule, using your local `claude` CLI. No remote routines, no extra subscription charge — just your Anthropic API usage when the agents actually run.

## What's here

| File | Role |
|---|---|
| `agent-ship.sh` | Fired hourly at :41 local. Picks the top groomed/proposed ticket, invokes the `implementation-dev` subagent, opens a PR through CI. Single-PR-at-a-time gated. |
| `agent-groom.sh` | Fired every 6 hours at :17 local. Invokes the `gtm-innovation` subagent to re-prioritize the backlog and add 2-4 new tickets, opens a PR. Self-gates when there are already 3+ groomed P0/P1 tickets. |
| `install-agents.sh` | Generates `~/Library/LaunchAgents/com.almanac.agent-{ship,groom}.plist` and loads them into launchd. Idempotent. |
| `uninstall-agents.sh` | Unloads both jobs and removes the plists. Keeps logs. |

## Quickstart

```bash
# from the repo root
bash scripts/install-agents.sh
```

## Running one now (don't wait for the cron)

```bash
launchctl kickstart -k gui/$UID/com.almanac.agent-ship
launchctl kickstart -k gui/$UID/com.almanac.agent-groom
```

## Watching them

```bash
# tail every run's per-script log
ls -lt ~/.cache/almanac-agent/logs/ | head -10
tail -f ~/.cache/almanac-agent/logs/$(ls -t ~/.cache/almanac-agent/logs/ | head -1)

# launchd's own stdio (one file per job, overwritten each run)
tail -f ~/.cache/almanac-agent/logs/launchd-ship.out
tail -f ~/.cache/almanac-agent/logs/launchd-ship.err
```

## Status checks

```bash
launchctl print gui/$UID/com.almanac.agent-ship | head -30
launchctl print gui/$UID/com.almanac.agent-groom | head -30

# disable temporarily (re-enable with `enable`)
launchctl disable gui/$UID/com.almanac.agent-ship
launchctl enable  gui/$UID/com.almanac.agent-ship
```

## Updating

Edit `agent-ship.sh` or `agent-groom.sh` in this repo. Then:

```bash
bash scripts/install-agents.sh
```

The installer re-bootstraps the plists, which re-reads the script paths.

## Uninstalling

```bash
bash scripts/uninstall-agents.sh
```

## What runs on each tick

Each script:

1. Sets PATH (launchd starts processes with a minimal env).
2. Checks the **self-cancel date** (2026-05-28 UTC). Past that, prints a re-arm hint and exits. Bound the autonomous spend.
3. Pulls the repo into `~/.cache/almanac-agent/checkout/` (clones first time, resets to `origin/main` thereafter).
4. Configures git as a non-human committer.
5. Hands the agent prompt to `claude --print --dangerously-skip-permissions`. The CLI does the rest via tool use — branching, writing tests, running `npm run typecheck/build/test`, pushing, opening the PR, watching CI.

## Caveats and gotchas

- **Mac must be awake.** launchd queues at most one missed run per `StartCalendarInterval` entry. If you close the lid at 22:00 local and open it at 09:00, you get one queued ship run, not eleven.
- **`--dangerously-skip-permissions`** auto-approves every tool call. We're running it because there's no human to approve. Make sure the prompt itself is conservative — it is (HARD NOs section).
- **Token usage** bills directly to whatever your local `claude` CLI is authed to. Watch your usage at https://console.anthropic.com.
- **Don't run two ships in parallel.** The single-PR-at-a-time gate in the prompt prevents most issues, but if you `launchctl kickstart` twice rapidly you can race. The cron's :41 spread + single-PR gate handle the normal case.
- **First run is slow.** First clone is ~150 MB. Subsequent runs are pulls of a few KB.

## Why local and not remote routines / GitHub Actions

- **Remote routines** bill per session against your Claude plan. With hourly ship + 6-hourly groom that's ~28 sessions a day. Local just bills Anthropic API tokens for the work actually done.
- **GitHub Actions** also works (free CI minutes on a public repo + API token usage). Trade-off: GHA runs even when your Mac is asleep, but means hosting the API key as a repo secret. Easy to switch later by porting these two scripts to a workflow.
- **Local launchd** is the simplest answer when your Mac is on most of the time and you already have `claude`, `git`, and `gh` authenticated.

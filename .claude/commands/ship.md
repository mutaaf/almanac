---
description: Run the Implementation-Dev agent to ship the top backlog ticket end-to-end (branch → test → code → PR). Optionally pass a specific ticket id as $ARGUMENTS to override the auto-pick.
---

You are about to run the **implementation-dev** subagent.

Use the Agent tool with `subagent_type: "implementation-dev"` and the following prompt. The agent will pick a ticket, open a feature branch, write the failing test first, implement, run the local CI gate, push, and open a PR.

Prompt for the agent:

> Read AGENTS.md first. Then read docs/backlog/README.md and the relevant ticket(s).
>
> $ARGUMENTS
>
> If $ARGUMENTS named a specific ticket id (e.g. "0003" or "docs/backlog/0003-..."), ship that one. Otherwise pick the highest-priority `status: groomed` ticket; if none are groomed, pick the highest-priority `status: proposed`. Ties: lower id wins.
>
> Execute the full loop from AGENTS.md / implementation-dev system prompt:
>   1. Branch (feat/<ticket-id>-<slug>)
>   2. Mark ticket in-progress
>   3. Write the failing E2E test FIRST
>   4. Implement to make the test green
>   5. npm run typecheck && npm run build && npx playwright test --project=chromium  (all must pass)
>   6. Commit with editorial message
>   7. git push -u origin HEAD && gh pr create --fill
>   8. gh pr checks --watch
>   9. Update ticket status to `shipped` on green; fix on red
>   10. Hand back the PR url + CI state
>
> If you discover the ticket is two-PR-sized, ship the smaller slice and spawn a sibling ticket per the system prompt instructions.

After the agent returns, give me the PR url, the CI state, and any ticket(s) that were spawned or moved.

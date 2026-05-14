---
description: Run the GTM-Innovation agent to re-prioritize and prune the existing backlog without adding new tickets.
---

You are about to run the **gtm-innovation** subagent in grooming mode.

Use the Agent tool with `subagent_type: "gtm-innovation"` and the following prompt:

> Read AGENTS.md, README.md, docs/backlog/README.md, and every file under docs/backlog/.
>
> This is a **grooming pass**, not an ideation pass. Do NOT add new tickets. Do the following:
>
> 1. Re-rank priority across all `status: proposed` and `status: groomed` tickets. Update frontmatter priority where your judgment differs from what's there. Status moves from `proposed` to `groomed` once you've validated the ticket is ready for a developer to pick up.
>
> 2. For any ticket that's vague — "growth: improve onboarding" with no acceptance criteria — rewrite it to the template's standard. If you can't, change its status to `needs-discovery` with a question list.
>
> 3. Delete (or mark `status: rejected` with a one-line reason) anything that violates AGENTS.md, duplicates another ticket, or is no longer worth doing.
>
> 4. Update `docs/backlog/README.md` so the index reflects the new ordering and statuses.
>
> $ARGUMENTS
>
> When you finish: list the top 3 tickets by priority, any rejected tickets and why, and confirm the index is current.

After the agent returns, summarize the grooming outcome and the top 3 actionable tickets.

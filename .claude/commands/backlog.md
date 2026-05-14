---
description: Show the current backlog at a glance — counts by status, top 5 actionable tickets, anything blocked.
---

Read every file under `docs/backlog/` (skip `_template.md` and `README.md`), parse the frontmatter of each, and print a single concise table:

| id | title | priority | status | area |
|----|-------|----------|--------|------|

Sort by:
1. `in-progress` first
2. Then `groomed` by priority (P0 → P3) ascending
3. Then `proposed` by priority
4. Then `needs-discovery`
5. `shipped` and `rejected` collapsed at the bottom with a count, not row-by-row

After the table, print:
- **Top up next:** the single most-actionable ticket (highest priority that's groomed or proposed) — one line.
- **Counts:** `N proposed · N groomed · N in-progress · N shipped · N rejected · N needs-discovery`.

Do not modify anything. This is a read-only command.

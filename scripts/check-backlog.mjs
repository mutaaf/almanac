#!/usr/bin/env node
// Backlog integrity check — a deterministic gate so the index table in
// docs/backlog/README.md can never silently drift from the ticket files.
//
// This is what stops the autonomous loop from re-shipping a ticket: if a
// merged ticket's file says `shipped` but the index still says `groomed`
// (or vice versa), this fails CI and the PR can't merge until they agree.
//
// No dependencies — frontmatter and the markdown table are parsed by hand.
// Run: `node scripts/check-backlog.mjs` (also wired into `npm run ci`).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKLOG = join(__dirname, "..", "docs", "backlog");
const README = join(BACKLOG, "README.md");

const VALID_STATUS = new Set([
  "proposed", "groomed", "in-progress", "shipped", "rejected", "needs-discovery",
]);

const errors = [];
const fail = (msg) => errors.push(msg);

/* ---- 1. Read every ticket file's frontmatter ---------------------------- */

/** id (4-digit string) -> { status, file } from the NNNN-*.md ticket files. */
const files = new Map();

for (const name of readdirSync(BACKLOG)) {
  if (!/^\d{4}-.*\.md$/.test(name)) continue;          // skip README, _template
  const text = readFileSync(join(BACKLOG, name), "utf8");
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) { fail(`${name}: missing frontmatter block`); continue; }
  const body = fm[1];
  const id = (body.match(/^id:\s*["']?(\d{4})["']?\s*$/m) || [])[1];
  const status = (body.match(/^status:\s*["']?([a-z-]+)["']?\s*$/m) || [])[1];

  if (!id) { fail(`${name}: frontmatter has no 4-digit \`id\``); continue; }
  if (!status) { fail(`${name}: frontmatter has no \`status\``); continue; }
  if (!VALID_STATUS.has(status)) {
    fail(`${name}: invalid status "${status}" (allowed: ${[...VALID_STATUS].join(", ")})`);
  }
  const filePrefix = name.slice(0, 4);
  if (filePrefix !== id) {
    fail(`${name}: filename id ${filePrefix} != frontmatter id ${id}`);
  }
  if (files.has(id)) {
    fail(`duplicate ticket id ${id}: ${files.get(id).file} and ${name}`);
  }
  files.set(id, { status, file: name });
}

/* ---- 2. Read the README index table ------------------------------------- */

/** id -> { status, line } from the markdown index table rows. */
const index = new Map();

const readme = readFileSync(README, "utf8");
for (const line of readme.split(/\r?\n/)) {
  // A data row looks like: | 0018 | title... | P1 | shipped | today |
  const m = line.match(/^\|\s*(\d{4})\s*\|[^|]*\|[^|]*\|\s*([a-z-]+)\s*\|/);
  if (!m) continue;
  const [, id, status] = m;
  if (!VALID_STATUS.has(status)) {
    fail(`README index row ${id}: invalid status "${status}"`);
  }
  if (index.has(id)) {
    fail(`README index lists ticket ${id} more than once`);
  }
  index.set(id, { status, line: line.trim() });
}

/* ---- 3. Cross-check files <-> index ------------------------------------- */

for (const [id, { status, file }] of files) {
  if (!index.has(id)) {
    fail(`ticket ${id} (${file}) has no row in the README index table`);
    continue;
  }
  const idx = index.get(id);
  if (idx.status !== status) {
    fail(`status drift for ${id}: file (${file}) says "${status}" but README index says "${idx.status}"`);
  }
}

for (const [id] of index) {
  if (!files.has(id)) {
    fail(`README index row ${id} has no matching docs/backlog/${id}-*.md file`);
  }
}

/* ---- 4. Report ---------------------------------------------------------- */

if (errors.length) {
  console.error(`✗ backlog integrity: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\nFix the ticket file frontmatter or the README index table so they agree.`);
  process.exit(1);
}

console.log(`✓ backlog integrity: ${files.size} tickets, index in sync.`);

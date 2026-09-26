---
observed_at: "2026-09-26T13:22:52Z"
session: "01a0d9de-cc8e-7ca0-b584-d186f30c10c3"
area: "workspace PR verification"
---

# Full workspace run exposed stale fixture assumptions

## Context

The product branch ran its repository PR verification after dependencies were installed.

## Friction

Thirteen workspace tests failed in three files. Hook and Knowledge manager fixtures tried to hash canonical package directories before install materialized them. Skill selection examples compared source text with snapshot records that now encode file bytes.

## Cost / impact

The workspace target reported 4,458 passing tests, 13 failures, and one skip, stopping later stages of the PR workflow. The three affected files needed fixture corrections and a focused rerun.

## Outcome

The fixture hashes now read existing source directories, and the skill assertion reads installed file content. All three focused files passed after the edits.

## Evidence

`pnpm run verify:pr` stopped at `workspace:test`; the focused `workspace:test` target for the three files subsequently passed.

---
observed_at: "2026-10-09T21:18:00Z"
session: "01a1225e-0c8d-7e12-9bb3-810aaf329ea5"
area: "workspace-features test fixtures"
---

# A shared temporary Git marker changes a non-Git fixture

## Context

Running the staged-lint specifications in an isolated worktree.

## Friction

The non-Git refusal scenario failed repeatedly: it expected `Git index unavailable`, but received `Git index snapshot failed` with `fatal: not a git repository`. Inspection found an existing `/tmp/.git` directory. The fixture was a child of `/tmp`, so ancestor detection found that marker.

## Cost / impact

Three focused executions failed while the other selected staged-lint scenarios passed.

## Outcome

The non-Git scenario now supplies a filesystem service that excludes Git ancestor markers while preserving actual filesystem operations. The shared directory was left untouched. Verification remains pending.

## Evidence

`workspace-features:test`, `src/linting/run/git-index-requires-a-resolved-index.spec.ts`; the existing `/tmp/.git` directory was observed on 2026-10-09.

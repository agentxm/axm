---
observed_at: "2026-09-24T18:22:00Z"
session: "e5f06887"
area: "repository checkout / worktree creation"
---

# Stale primary checkout misled the survey of every in-scope file

## Context

Implementing the one-update-planner change: delete the selective update
pipeline and route type-group update through the configured sweep. The
worktree was created from `origin/main` (27efab9a8, the issue's baseline)
while the primary checkout at `~/Code/agentxm/axm` sat on `3d48ab9f0`, three
commits behind `origin/main`, after a fetch had updated the remote ref.

## Friction

The initial survey read every in-scope file from the primary checkout rather
than the worktree. PR #442 (in those three commits) had already changed
`resolution/index.ts`, `configured-entry-resolution.ts`, `release-age-policy.ts`,
`lifecycle/update/configured.ts`, the selective planner, and the update
specification, and had deleted `constraint-precedence.ts`. The first edit
script therefore failed to match text in `resolution/index.ts`, and a `git rm`
targeted a file that no longer existed.

## Cost / impact

The survey of roughly thirty files was repeated against the worktree, and the
plan for pack-range intersection (issue decision a) was rewritten once it was
clear the baseline already owned it. Several edits were applied against the
worktree before the mismatch surfaced and had to be re-checked.

## Outcome

Re-read the changed files from the worktree, adjusted the plan, and continued.
All later reads and edits used the worktree path.

## Evidence

`git log --oneline origin/main..main` printed nothing while `git log -4 main`
showed `3d48ab9f0` at the tip and `git log -1 origin/main` showed
`27efab9a8`; `git diff --stat 3d48ab9f0..27efab9a8` listed 224 changed files.

## Existing context

An earlier note in this directory (`…-stale-checkout-made-every-audit-agent-export-origin-main.md`
in the internal repository) records the same stale-checkout condition for the
audit that produced this issue.

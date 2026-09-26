---
observed_at: "2026-09-26T13:36:34Z"
session: "6f2c"
area: "parallel worktree verification"
---

# Nx reset in one worktree interrupted another worktree

## Context

The release branch's affected workflow was running while the product branch's pre-commit hook needed an Nx reset.

## Friction

The product worktree's `pnpm exec nx reset` removed a cache path under `/home/exedev/.nx/222df7ffaba857c9` that the release worktree was using. The release run then failed to write a terminal output file with `ENOENT`.

## Cost / impact

The release affected workflow stopped and required another run.

## Outcome

The worktrees' Nx operations were sequenced after the failure; release verification was pending at capture time.

## Evidence

`ENOENT` for `/home/exedev/.nx/222df7ffaba857c9/cache/terminalOutputs/...` in the local affected-run log.

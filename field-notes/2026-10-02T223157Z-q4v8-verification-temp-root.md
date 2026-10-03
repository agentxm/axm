---
observed_at: "2026-10-02T22:31:57.530915+00:00"
session: "01a0fe98-84a8-74a0-a015-e64fc2e7b44e"
area: "source distribution verification"
---

# Verification temporary directory inherited repository context

## Context

An affected verification run used a dedicated TMPDIR inside the worktree to avoid a crowded shared temporary directory.

## Friction

Tests expecting a non-Git temporary directory detected the worktree ancestor. The run also reported missing built modules in subprocess tests while a focused test command was rebuilding the same package.

## Cost / impact

The kernel suite reported eight failed tests and 2074 passed tests. The affected run exited 130 without completing the downstream gates.

## Outcome

Moved subsequent test temporary directories to a dedicated directory under /var/tmp, outside Git. Subsequent build-dependent verification commands will run sequentially.

## Evidence

Failures included git detection returning Some instead of None, instruction tests observing unexpected gitignore writes, and ERR_MODULE_NOT_FOUND for the kernel settlement build entry.

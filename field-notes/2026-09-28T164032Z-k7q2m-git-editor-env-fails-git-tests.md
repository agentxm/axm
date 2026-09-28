---
observed_at: "2026-09-28T16:29:36Z"
session: "cae9dea3"
area: "workspace-features:test environment"
---

# Session GIT_EDITOR made unrelated Git-backed tests fail

## Context

Running `workspace-features:test` over `src/linting src/lifecycle` while changing official-skill compatibility.

## Friction

About 15 unrelated Git-backed tests (git discovery, locator selection, Git Pack install) failed with `Use of "GIT_EDITOR" is not permitted without enabling allowUnsafeEditor` because the agent shell exports `GIT_EDITOR`.

## Cost / impact

One extra test run and triage to separate environmental failures from change-related ones.

## Outcome

Reran every target with `env -u GIT_EDITOR`; those tests passed.

## Evidence

`src/lifecycle/install/git-discovery.test.ts` and `src/lifecycle/install/locator-selection.test.ts` failures citing `allowUnsafeEditor`.

## Existing context

A separate local worktree branch `fix/git-editor-independence` exists, not yet on `main`.

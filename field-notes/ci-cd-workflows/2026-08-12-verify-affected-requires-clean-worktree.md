---
subject: ci-cd-workflows
key: verify-affected-requires-clean-worktree
date: 2026-08-12
kind: gap
status: open
---

**Expected:** `pnpm run ci:affected` could verify an implementation diff before
commit, as the feature-delivery workflow treats local verification as a
pre-commit gate.
**Actual:** `generate:check` runs generators and then unconditional
`git diff --exit-code`, so every intended uncommitted change makes
`ci:affected` stop before later checks even when generated files are current.
**Gap:** The affected verification entry point conflates generated-output drift
with unrelated implementation changes already present in the worktree.
**Suggests:** Compare only generated paths or snapshot the preexisting diff so
the gate detects generator-created drift without requiring a clean commit.

Evidence: `pnpm run ci:affected` reached `pnpm run generate:check`; all
generators reported current output, then `git diff --exit-code` returned 1 on
the existing implementation diff.

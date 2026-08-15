---
subject: axm-cli-interactions
key: pre-commit-local-cli-stale-dist
date: 2026-08-15
kind: blocked
status: open
---

**Expected:** The tracked pre-commit hook would validate a deletion-only field-note commit from a clean current `main` checkout.
**Actual:** `pnpm axm:local lint --view git-index --strict` failed before linting because Bun loaded stale built core output that did not export `resolveVisibilityIntent`; the pre-push lint failed identically.
**Gap:** The repository hook's source CLI path can resolve stale package build output and block an otherwise unrelated commit after the source tree advances.
**Suggests:** Make the local CLI runner resolve current workspace source consistently, or give the hook a repository-owned prerequisite that detects and refreshes stale build output before linting.

Evidence: On current public `main`, committing two tracked field-note deletions reached `.husky/pre-commit` and failed with `SyntaxError: Export named 'resolveVisibilityIntent' not found in module 'packages/core/dist/src/unstable/publish/index.js'`. No commit was created and the push was rejected by the same pre-push check.

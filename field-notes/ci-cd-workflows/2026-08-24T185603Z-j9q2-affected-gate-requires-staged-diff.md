---
id: 2026-08-24T185603Z-j9q2
subject: ci-cd-workflows
key: affected-gate-requires-staged-diff
observed_at: "2026-08-24T18:56:03Z"
session: 01a03512-fee3-79a2-8e87-0d51cd2476bb
kind: gap
status: open
---

**Expected:** `pnpm run ci:affected` would validate an in-flight implementation in a dirty worktree, including checking that generators introduce no additional changes.
**Observed:** The gate stopped during `generate:check` because that script runs `git diff --exit-code`, which reported the pre-existing unstaged implementation diff even though generators did not modify its files.
**Impact:** The affected verification gate requires an undocumented staging step before it can distinguish the reviewed implementation from newly generated drift; elapsed time was not measured.
**Recovery:** Stage the reviewed task diff, rerun `pnpm run ci:affected`, and inspect for any new unstaged changes after the gate.
**Detected by:** The `generate:check` failure and diff printed by `pnpm run ci:affected`.
**Observed factors:** The isolated worktree began clean; all displayed changes were the intentional source and test changes already present before the gate; the generator output named only existing generated targets.
**Hypothesis:** The check is designed for CI's clean checkout and does not snapshot or otherwise isolate the generator delta for local dirty-worktree use.
**Suggests:** Document the staging prerequisite for local use or make `generate:check` compare repository state before and after generation.

Evidence: Command `pnpm run ci:affected`; script `generate:check`; failure at `git diff --exit-code` after successful generators.

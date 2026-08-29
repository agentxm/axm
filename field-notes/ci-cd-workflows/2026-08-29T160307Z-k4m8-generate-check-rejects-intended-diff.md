---
id: 2026-08-29T160307Z-k4m8
subject: ci-cd-workflows
key: generate-check-rejects-intended-diff
observed_at: "2026-08-29T16:03:07Z"
session: r7c2m9
kind: gap
status: open
---

**Expected:** `pnpm run ci:affected` would verify an implementation that intentionally updates generated Registry contract artifacts.
**Observed:** `generate:check` regenerated deterministically, then `git diff --exit-code` rejected the complete intended uncommitted change set and exited 1.
**Impact:** Affected CI could not run past generation verification until the implementation was committed; one verification attempt was unusable.
**Recovery:** Inspect that generation introduced no additional changes, commit the reviewed implementation, then run affected CI against the clean committed tree.
**Detected by:** `pnpm run ci:affected` in the isolated implementation worktree.
**Observed factors:** The task intentionally changed `packages/core/specs/registry-openapi.json` and its generated Registry client; generation completed successfully; the failure output was the pre-existing implementation diff.
**Diagnostic evidence:** `generate:check`; failing command `git diff --exit-code`; process exit code 1.
**Hypothesis:** The generation check assumes a clean worktree and cannot distinguish generator drift from an intended generated update.
**Suggests:** Compare pre-generation and post-generation worktree state, or document that generated changes must be committed before affected CI.

Evidence: `pnpm run ci:affected` reached `pnpm run generate:check`; both Registry generation and all other generation targets completed before the diff check failed.

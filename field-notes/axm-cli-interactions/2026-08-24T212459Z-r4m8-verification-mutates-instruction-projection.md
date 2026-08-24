---
id: 2026-08-24T212459Z-r4m8
subject: axm-cli-interactions
key: verification-mutates-instruction-projection
observed_at: "2026-08-24T21:24:59Z"
session: fna2m9
kind: workaround
status: open
---

**Expected:** Retrying the commit after formatting the reported package files should leave unrelated managed instruction projections unchanged and complete the repository verification.
**Observed:** Before the second commit hook ran, `CLAUDE.md` appeared as a staged deletion and the AXM-managed ignore block had been removed from `.gitignore`; `generate:check` then failed on the `.gitignore` diff.
**Impact:** A second commit attempt failed and required restoring two instruction-projection files to their exact pre-task state before retrying.
**Recovery:** Restore the AXM ignore block, restage the existing `CLAUDE.md -> AGENTS.md` symlink, verify the staged diff, and retry; the rollout was not yet complete when captured.
**Detected by:** `git status --short` before the retry and the repository's `pnpm run generate:check` failure.
**Observed factors:** `CLAUDE.md` remained present in the worktree as a symlink to `AGENTS.md`; the index recorded it as deleted; `.gitignore` lacked only the three-line `axm:instructions` block; both files were clean before the first commit attempt.
**Diagnostic evidence:** Failing process: `git commit -m "chore: update field-notes guidance"`; process exit: 1; failing task: `axm:verify-affected`; failing command: `pnpm run generate:check`; changed artifacts: `.gitignore` and `CLAUDE.md`; request or correlation ID: not supplied; attempt count: 2; retryability: safe after restoring the exact prior projection state; retry stop reason: generated-output check detected a worktree diff.
**Hypothesis:** A command in the first pre-commit path reconciled the managed instruction projection against a different settings or index view and left those changes behind after failure.
**Suggests:** Verification should be read-only or restore any temporary instruction-projection changes when it exits unsuccessfully.

Evidence: the pre-retry status showed the staged symlink deletion, while `git diff` showed only removal of the AXM-managed ignore block; the second hook output failed on that same `.gitignore` diff.

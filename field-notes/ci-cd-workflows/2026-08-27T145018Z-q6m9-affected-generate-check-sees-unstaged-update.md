---
id: 2026-08-27T145018Z-q6m9
subject: ci-cd-workflows
key: affected-generate-check-sees-unstaged-update
observed_at: "2026-08-27T14:50:18Z"
session: unknown
kind: workaround
status: open
---

**Expected:** `pnpm run ci:affected` would validate the AXM-managed update in
the dirty worktree before commit. **Observed:** The gate reached
`pnpm run generate:check`, printed the existing managed-file diffs, and exited
1 even though the prior format command and AXM convergence checks passed.
**Impact:** The public-repository verification gate failed once and requires
staging plus one repeat of the same gate before commit. **Recovery:** Pending;
stage the reviewed update and rerun `pnpm run ci:affected`. **Detected by:** The
repo-backed affected verifier's process result. **Observed factors:** AXM public
repository on `main`; tracked AXM update remained unstaged; run duration 14.7s;
the failed target was `generate:check`. **Diagnostic evidence:** Top-level exit
status 1; `generate:check` exited non-zero; the verifier reported no retry.
**Hypothesis:** The generated-artifact check compares the entire unstaged
worktree instead of isolating generator-produced drift.

Evidence: The affected verifier completed its preceding tasks, emitted the
already-reviewed AXM update diff during `generate:check`, and returned exit 1.

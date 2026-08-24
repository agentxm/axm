---
id: 2026-08-23T031632Z-e1caa7
subject: axm-cli-interactions
key: worktree-projections-missing
observed_at: "2026-08-23T03:16:32Z"
session: 36f8ab95
kind: workaround
status: promoted
---

**Expected:** A clean isolated Git worktree created from `main` would satisfy the repository's pre-push `axm lint --strict` gate after the staged change passed strict Git-index lint.
**Observed:** The pre-push gate reported the tracked canonical `AGENTS.md` was missing its AXM-owned Knowledge projection and the ignored `docs/CLAUDE.md` alias was missing.
**Impact:** The first push was rejected and required one previewed workspace sync, one applied sync, and a commit amendment before retrying.
**Recovery:** `./scripts/axm-local sync --preview --json --non-interactive`, followed by `./scripts/axm-local sync --non-interactive`, restored the managed region and alias; strict lint and the retried push passed.
**Detected by:** The repository pre-push hook's `./scripts/axm-local lint --strict` invocation.
**Observed factors:** The worktree was created from current `main`; staged Git-index lint passed; the missing alias is ignored by Git; the Knowledge region is derived from installed workspace extensions.
**Hypothesis:** Git worktree creation reproduces tracked source but not ignored AXM projections, and the tracked canonical source can also require workspace-specific reconciliation before strict whole-workspace lint.
**Suggests:** Document or automate the projection-reconciliation preflight for isolated worktrees that will use the repository push hooks.

Evidence: Push output reported `workspace/projections-current` for `AGENTS.md` and `workspace/instructions-target-current` for `docs/CLAUDE.md`; the sync preview reported one `Knowledge discovery` update, and the post-sync strict lint reported no findings.

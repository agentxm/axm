---
id: 2026-08-29T031053Z-k8m4
subject: axm-cli-interactions
key: pre-push-fresh-worktree-projections-stale
observed_at: "2026-08-29T03:10:53Z"
session: k8m4
kind: blocked
status: open
---

**Expected:** A clean linked worktree whose staged commit passed `verify-affected` should pass the repository pre-push hook.
**Observed:** `git push origin HEAD:main` stopped in `./scripts/axm-local lint --strict` because the checked-in `AGENTS.md#knowledge` projection was stale and ignored Claude instruction aliases were absent.
**Impact:** The push was prevented and required an additional owned-projection synchronization and commit amendment.
**Recovery:** In progress: regenerate only AXM-owned projections, revalidate, and retry the push.
**Detected by:** Repository pre-push hook.
**Observed factors:** The change intentionally corrected Knowledge contributor readback; the implementation was developed in a fresh linked worktree; the staged full affected gate had passed before push.
**Diagnostic evidence:** Exit status 1; rule `workspace/projections-current` on `AGENTS.md#knowledge`; two `workspace/instructions-target-current` warnings for missing `CLAUDE.md` aliases.
**Hypothesis:** The clean-index verification does not materialize or reconcile the repository's own managed projections before the stricter worktree-view pre-push lint.

Evidence: The pre-push hook emitted one stale owned Knowledge projection and two missing generated instruction aliases, then rejected the push before remote transfer.

---
subject: ci-cd-workflows
key: release-prepare-commit-enospc
date: 2026-08-16
kind: blocked
status: open
---

**Expected:** After release preparation completed its validation and generated the release artifacts, the release commit hook would finish and allow the documented workflow to push the release branch.
**Actual:** The commit hook's affected Nx validation exhausted the root filesystem and failed while updating Nx's task-invocation database and terminal output, leaving the release artifacts staged on the local release branch.
**Gap:** Release preparation still has no capacity preflight before its duplicated commit-hook validation, so the workflow can fail late after completing the expensive preparation work.
**Suggests:** Add an early free-space check with a supported cache-reclamation instruction, and avoid rerunning an equivalent full validation in the generated release commit hook when release preparation has just completed it.

Evidence: `git commit -m "release: cli-v0.27.7"` failed with Nx `SqliteFailure` code `DiskFull` and Node `ENOSPC`; `df -h /` showed the 99 GB root filesystem at 100% with 423 MB available after the failed process exited. Removing the already-merged owned worktree and running `pnpm store prune` restored 6.8 GB without touching unrelated worktrees.

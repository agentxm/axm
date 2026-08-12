---
subject: ci-cd-workflows
key: git-hook-e2e-inherits-repository-context
date: 2026-08-12
kind: incident
status: open
---

**Expected:** E2E fixtures that initialize and commit a temporary Git repository remain isolated when the suite runs from a Git hook.
**Actual:** During the release commit gate, Git's hook-local `GIT_*` environment variables propagated through the E2E runner and its direct Git helper. The fixture's `git commit` advanced the real release branch to a destructive fixture commit, and staged-view lint read the real checkout's index instead of the temporary repository.
**Gap:** The shared E2E subprocess runner preserved repository-local Git environment variables even when a child command used a different `cwd`.
**Suggests:** Strip the variables reported by `git rev-parse --local-env-vars` from inherited E2E subprocess environments, while still allowing tests to opt into explicit Git variables.

Evidence: the release branch reflog showed a `fixture` commit authored by the test identity; its parent was the intended release base and it removed nearly the whole repository. Moving the branch reference back to the known base and rebuilding only the index restored the unchanged worktree. The isolated compatibility test passed outside the hook because those variables were absent.

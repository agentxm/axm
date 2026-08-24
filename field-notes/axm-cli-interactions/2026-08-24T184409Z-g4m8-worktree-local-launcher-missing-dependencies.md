---
id: 2026-08-24T184409Z-g4m8
subject: axm-cli-interactions
key: worktree-local-launcher-missing-dependencies
observed_at: "2026-08-24T18:44:09Z"
session: 01a03512-fee3-79a2-8e87-0d51cd2476bb
kind: gap
status: open
---

**Expected:** `./scripts/axm-local -C <workspace> mcps list --json` would run the in-flight CLI from a fresh repository worktree, as described by the command reference.
**Observed:** The launcher exited before command execution with `Cannot find module 'effect/Effect'` because the new worktree had no dependency links.
**Impact:** The intended baseline reproduction was delayed by one failed invocation and requires an additional dependency-install step; elapsed time was not measured.
**Recovery:** Install the repository dependencies in the worktree, then retry; recovery had not yet run when captured.
**Detected by:** The Bun module-resolution error printed by `./scripts/axm-local`.
**Observed factors:** The worktree was created from current `origin/main`; the source checkout was clean; the primary checkout already had dependencies; no dependency setup step had run in the new worktree.
**Hypothesis:** The local launcher assumes worktree-local package-manager links already exist.
**Suggests:** Document or automate dependency setup for a fresh worktree before the local launcher is used.

Evidence: Command `./scripts/axm-local -C /home/exedev/Code/agentxm/agentxm-internal mcps list --json`; Bun 1.3.14; error `Cannot find module 'effect/Effect' from 'packages/cli/src/app.ts'`.

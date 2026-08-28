---
id: 2026-08-28T013700Z-gs75
subject: axm-cli-interactions
key: fresh-worktree-requires-undocumented-build
observed_at: "2026-08-28T01:37:00Z"
session: claude-875a3f0a
kind: blocked
status: open
---

**Expected:** A fresh repository worktree should run the local AXM CLI after
one explicit documented bootstrap, per this subject's target condition.

**Observed:** After `git worktree add` and `pnpm install`, `./scripts/axm-local
--version` failed with
`Cannot find module '@agentxm/client-core/unstable/app-error'` from
`packages/cli/src/app.ts`; the CLI only ran after an additional undocumented
`pnpm build`.

**Impact:** The target condition is blocked: the worktree's `gen-stack-check`
wrapper (which pins `axm` to the source CLI) failed until the extra build step
was discovered; the primary checkout masked the dependency with existing
`dist/` output.

**Recovery:** `pnpm build` in the worktree; `./scripts/axm-local` and
`./scripts/gen-stack-check` then succeeded.

**Detected by:** Baseline mechanical checks for a Gen Stack corpus-population
run executed in an isolated worktree.

**Observed factors:** Bun v1.4.0 runs the CLI from source, but
`@agentxm/client-core` resolution reached built `dist` output; `pnpm install`
completed exit 0 without producing it.

**Diagnostic evidence:** Bun module-resolution error naming
`@agentxm/client-core/unstable/app-error`; `pnpm build` exit 0; subsequent
`./scripts/gen-stack-check` exit 0.

**Hypothesis:** Running "from source" still depends on built package exports
for workspace siblings, so a fresh worktree needs a build step that no
bootstrap documentation names.

**Suggests:** Either document the one-step bootstrap (install + build) for
fresh worktrees or make source execution resolve workspace sources directly.

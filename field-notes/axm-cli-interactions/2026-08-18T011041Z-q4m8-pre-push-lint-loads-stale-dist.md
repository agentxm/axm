---
id: 2026-08-18T011041Z-q4m8
subject: axm-cli-interactions
key: pre-push-lint-loads-stale-dist
observed_at: "2026-08-18T01:10:41Z"
session: unknown
kind: workaround
status: open
---

**Expected:** After fast-forwarding a clean main checkout to a commit that passed `axm:verify-affected`, the pre-push `./scripts/axm-local lint --strict` gate should validate the updated source tree.
**Observed:** The gate exited before linting because Bun loaded the checkout's pre-existing `packages/core/dist` output, where the newly exported `extensionRefLifecycleWarnings` symbol was absent.
**Impact:** The first push attempt was rejected and required a local build plus a second push attempt.
**Recovery:** Rebuild the affected packages through the repository target before retrying the push; task completion was still in progress when captured.
**Detected by:** The Git pre-push hook printed `SyntaxError: Export named 'extensionRefLifecycleWarnings' not found` from `packages/core/dist/src/unstable/extensions/index.js`.
**Observed factors:** The main checkout was clean before a large fast-forward; dependencies were refreshed by the pre-push hook; the feature worktree's strict affected verification had already passed.
**Hypothesis:** The pre-push lint path consumes built package output but does not ensure that output reflects the newly checked-out source revision.
**Suggests:** Make the pre-push lint path build or freshness-check the local package output it imports.

Evidence: `git push origin main` ran the pre-push hook, `pnpm install` completed, and `./scripts/axm-local lint --strict` then failed on the missing named export in `packages/core/dist`.

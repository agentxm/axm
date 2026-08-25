---
id: 2026-08-24T212831Z-t6q3
subject: ci-cd-workflows
key: pre-push-e2e-missing-built-modules
observed_at: "2026-08-24T21:28:31Z"
session: fna2m9
kind: blocked
status: open
---

**Expected:** The repository's pre-push affected E2E gate should validate the documentation-only field-notes rollout and allow the branch to push.
**Observed:** The gate ran 437 CLI E2E tests, then failed 62 tests whose CLI subprocesses could not import built runtime modules from `packages/cli/dist`; 359 tests passed and 16 were skipped.
**Impact:** The AXM branch was not pushed and required rebuilding the affected runtime outputs before another push attempt; the failed gate took about two minutes.
**Recovery:** Rebuild the CLI and its workspace dependencies without the Nx cache, rerun the affected E2E target, and retry the push if clean; the rollout was not yet complete when captured.
**Detected by:** The Husky pre-push hook running `pnpm nx affected -t e2e --parallel=1`.
**Observed factors:** The preceding local AXM lint and Nx sync checks passed; cached build steps were reused; representative failures reported missing `@agentxm/client-core/unstable/app-error` and `@agentxm/client-utils/unstable/interaction` imports from `packages/cli/dist`; tests ran under Bun 1.3.5 on macOS arm64.
**Diagnostic evidence:** Mutation: `git push`; outer process exit: unavailable — output was not retained; hook exit: 1; failing target: `cli-e2e:e2e`; test files: 16 failed and 13 passed; tests: 62 failed, 359 passed, and 16 skipped; duration: 120.84 seconds; request or correlation ID: not supplied; retryability: safe after a clean dependency rebuild; attempt count: 1; retry stop reason: pre-push hook rejected the test target.
**Hypothesis:** Nx reused incomplete or stale cached build outputs for workspace packages required by the compiled CLI.
**Suggests:** Ensure the E2E target depends on complete runtime build outputs or validates cached output integrity before launching CLI subprocesses.

Evidence: failures across otherwise unrelated suites reported the same missing runtime modules after cached build steps, and Husky stopped the push with code 1.

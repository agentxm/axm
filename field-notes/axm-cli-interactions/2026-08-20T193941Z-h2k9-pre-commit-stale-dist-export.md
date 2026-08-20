---
id: 2026-08-20T193941Z-h2k9
subject: axm-cli-interactions
key: pre-commit-stale-dist-export
observed_at: "2026-08-20T19:39:41Z"
session: release-20260820-h2k9
kind: workaround
status: open
---

**Expected:** Committing a version-plan-only change from an up-to-date clean
`main` checkout should let the AXM pre-commit hook lint the staged index.
**Observed:** `./scripts/axm-local lint --view git-index --strict` failed because
`packages/core/dist/src/unstable/agents/index.js` did not export
`observeInstructionProjection`, although the current source imports it.
**Impact:** The release-plan commit was delayed by one failed commit attempt and
requires an extra repository build before retrying.
**Recovery:** Rebuild the relevant repository targets, then retry the same
path-scoped commit.
**Detected by:** Husky pre-commit output from `git commit`.
**Observed factors:** The working tree had just fast-forwarded from
`1a8f8cf61` to `6021249fe`; only the new version plan was staged; the failure
loaded `packages/core/dist` rather than source.
**Hypothesis:** The pre-commit source runner can resolve stale workspace build
artifacts after a fast-forward that changes core exports.
**Suggests:** Make the hook's source-mode lint independent of stale `dist`
artifacts or build required dependencies before linting.

Evidence: Bun reported `SyntaxError: Export named 'observeInstructionProjection'
not found in module
'/home/exedev/Code/agentxm/axm/packages/core/dist/src/unstable/agents/index.js'`
and Husky exited with code 1.

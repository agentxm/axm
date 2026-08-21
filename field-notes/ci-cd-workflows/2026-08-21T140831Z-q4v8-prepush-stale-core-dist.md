---
id: 2026-08-21T140831Z-q4v8
subject: ci-cd-workflows
key: prepush-stale-core-dist
observed_at: "2026-08-21T14:08:31Z"
session: "75888"
kind: blocked
status: open
---

**Expected:** `git push origin main` should run the repository pre-push checks
against the rebased source tree and push the synchronized branch.
**Observed:** The pre-push `./scripts/axm-local lint --strict` invocation failed
because `packages/core/dist/src/unstable/agents/index.js` did not export
`observeInstructionProjection` required by the source CLI.
**Impact:** The requested push was prevented on its first attempt and required
an additional repository build before retrying.
**Recovery:** Pending; rebuild affected repository outputs and retry the push.
**Detected by:** Husky pre-push hook exit code 1.
**Observed factors:** `main` had just been rebased from the pre-0.27.14 snapshot
to `origin/main`; `pnpm install` reported the lockfile and dependencies current;
the failing runtime was Bun 1.3.5 on macOS arm64.
**Hypothesis:** The checked-out source advanced beyond an existing local core
build, while the pre-push path did not refresh that dependent output.

Evidence: `SyntaxError: Export named 'observeInstructionProjection' not found
in module 'packages/core/dist/src/unstable/agents/index.js'` during the pre-push
`axm lint --strict` check.

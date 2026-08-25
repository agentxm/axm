---
id: 2026-08-25T022453Z-c8x4p2
subject: ci-cd-workflows
key: update-check-macos-cache-path-assertion
observed_at: "2026-08-25T02:24:53Z"
session: c8x4p2
kind: blocked
status: open
---

**Expected:** The isolated repository `core:test` target should either confirm
the affected run's worker failure or pass unchanged tests.
**Observed:** The isolated run completed all workers but failed
`UpdateCheckLive writes under AXM_USER_HOME`: the test expected Linux's
`.cache/axm` path on macOS, while the shared cache-root contract selects
`Library/Caches/axm` on macOS.
**Impact:** Verification remained blocked by one failed test out of 4,680 and
required a platform-portable test correction; the rerun took about 17 seconds.
**Recovery:** Correct the integration test to derive the expected location from
the shared platform cache-root contract, then rerun the focused file and core
target; recovery had not yet run when captured.
**Detected by:** The isolated `core:test` assertion diff and inspection of the
shared cache-root resolver.
**Observed factors:** Runtime platform: macOS arm64; the test configured
`AXM_USER_HOME` to a temporary directory; production resolution deliberately
uses platform-native cache layout; archive-cache tests already pin the macOS
and Linux layouts separately.
**Diagnostic evidence:** Failing command: `pnpm nx run core:test`; process exit:
1; failing file:
`packages/core/src/unstable/update-check/update-check.test.ts`; failing line:
490; expected file existence: true; received: false; reported counts: 375 files
passed, 1 failed, 4,678 tests passed, 1 failed, 1 skipped; request or
correlation ID: not supplied; retry stop reason: platform-specific path
assertion failed.
**Hypothesis:** The integration assertion predates the platform-native cache
root and retained Linux-only path semantics.
**Suggests:** Reuse the shared resolver when asserting where the live service
writes.

Evidence: the test expected `<temp>/.cache/axm/update-check.json`; on macOS the
resolver returns `<temp>/Library/Caches/axm/update-check.json`.

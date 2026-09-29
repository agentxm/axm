---
observed_at: "2026-09-29T19:03:18Z"
session: "tn5h"
area: "public repository affected verification"
---

# Affected verification timed out in the CLI sync suite

## Context

The public packaging fix passed focused tests and artifact verification, then `pnpm run verify:affected` ran the complete affected test set.

## Friction

Three tests in `apps/cli/src/root/sync/handler.test.ts` exceeded their 5-second deadlines in the first affected run. A second run with `NX_PARALLEL=2` timed out four tests in the same file. The file's 49 tests all passed when run alone; the two slowest observed cases took about 3.3 and 3.1 seconds.

## Cost / impact

Two full affected runs failed after testing thousands of other cases, delaying the public patch PR. A third serialized run is in progress.

## Outcome

The focused file passed. The required full affected verification is pending a serialized rerun.

## Evidence

First run: `/tmp/axm-yarn-verify-affected.log`; second run: `/tmp/axm-yarn-verify-affected-2.log`; focused command: `pnpm exec nx run cli:test --args='src/root/sync/handler.test.ts'` with 49/49 passing.

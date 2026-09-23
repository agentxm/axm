---
observed_at: "2026-09-23T03:19:04Z"
session: "u6p2"
area: "Repository verification"
---

# Overlapping targets cleaned the same build output

## Context

Started CLI typecheck, focused CLI tests, and one workspace specification through
their published targets while verifying scoped file-write coordination.

## Friction

The commands overlapped on workspace:build, which cleans its output directory.
The focused CLI target failed with ENOTEMPTY removing workspace/dist/src;
the typecheck reported missing generated declarations (TS6305).

## Outcome

The specification passed all 13 tests. After the overlapping commands ended,
the CLI typecheck passed when rerun sequentially. Remaining checks are being
run sequentially.

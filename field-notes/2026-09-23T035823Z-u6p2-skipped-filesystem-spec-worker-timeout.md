---
observed_at: "2026-09-23T03:58:22Z"
session: "u6p2"
area: "workspace test worker shutdown"
---

# Worker termination timed out after a skipped filesystem specification

## Context

An uncached full verification run used the repository-pinned Node 24.19.0
toolchain against unchanged source.

## Friction

After reporting 4,402 passing workspace tests and two skipped tests, Vitest
reported a timeout terminating the worker associated with
`packages/core/workspace/src/acquisition/cross-filesystem-source-publishes.spec.ts`.
That specification was skipped on this host. The warning does not establish
which resource or test caused the worker to remain alive.

## Outcome

The workspace target and complete `verify:pr` run exited successfully. The
worker-shutdown warning remains an unresolved lifecycle observation.

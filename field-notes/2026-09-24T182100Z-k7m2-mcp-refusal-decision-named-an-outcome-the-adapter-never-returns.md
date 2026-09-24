---
observed_at: "2026-09-24T18:21:00Z"
session: "k7m2"
area: "work-item decision guidance"
---

# MCP refusal decision named an outcome the adapter never returns

## Context

Consolidating enable/disable realization into one reconciliation recipe. The
work item's decision (b) asked to keep the executor's refusal when an agent
"refuses the manifest write" by moving `requireSuccessfulMcpSync` into
`McpServerManager.makeMaterializeRemoval`, whose `Effect.asVoid` discards the
removal outcome.

## Friction

Reading the adapter showed `removeMcpServerFromManifest` returns only
`success` or `unsupported`; the executor's refused tags (`disabled`,
`failed`, `misconfigured`, `needs-input`, `nothing-runnable`) are never
produced by removal, and the deleted executor test manufactured a `disabled`
outcome through an agent stub. The behavior the decision protected could not be
reproduced through the product's own adapter.

## Cost / impact

Two extra reads (the adapter and the executor test) to establish that the
decision described a stub-only path. The manager now fails typed on any
non-success, non-unsupported outcome, and the specification example instead
makes the native manifest unwritable to show the change is refused.

## Outcome

Continued with the manager-level refusal and a filesystem-based example.

## Evidence

- `packages/core/workspace/src/projection/agent-adapters/mcps/sync.ts`
  `removeMcpServerFromManifest`: returns `{ _tag: "success", targets }` or
  `{ _tag: "unsupported" }`.
- Deleted `mcp-connections/lifecycle/operations/enable-disable.test.ts`
  "fails disable when a configured agent refuses the required write" stubbed
  `removeMcpServer` to return `{ _tag: "disabled" }`.

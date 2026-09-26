---
observed_at: "2026-09-26T18:15:55Z"
session: "wssp"
area: "workspace failure rendering refactor"
---

# Capability domain boundary blocked one kind error from carrying the kernel brand

## Context

The agent session implemented the kernel-owned extension-kind failure brand in `packages/core/workspace`. The frozen design says each of the 21 kind error classes implements the brand declared in `materialization/kind-failure.ts`.

## Friction

One of the 21 classes, `McpConnectionConflict`, was declared in `mcp-connections/lifecycle/domain/source-admission.ts`. That folder is a registered capability root, and its domain files may import only their own element and a short list of external modules. When the class imported the brand, `workspace:lint` reported `boundaries/no-unknown-dependencies` and `boundaries/dependencies` errors. The design text did not mention this constraint.

## Cost / impact

One lint round failed. The class had to be moved outside the frozen decision's stated file set, and the domain function's failure type had to change.

## Outcome

The branded `McpConnectionConflict` now lives in `mcp-connections/errors.ts`. The domain function fails with a plain `McpSourceIdentityConflict` record, and `mcp-connections/source-identity.ts` maps that record to the branded class. After the move, `workspace:lint` passed.

## Evidence

`packages/core/workspace/src/mcp-connections/lifecycle/domain/source-admission.ts` lines 8 and 9: `Dependencies to unknown elements and files are not allowed` and `Use the owning capability's public domain/application contract; technology belongs in adapters and concrete wiring in composition`.

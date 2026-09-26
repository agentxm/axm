---
observed_at: "2026-09-26T22:54:18Z"
session: "wssp"
area: "test placement during a package split"
---

# A cross-kind test had no allowed home in the extension kinds package

## Context

The agent session was moving the kernel test case that asserts every kind manager routes projection through the shared plans out of `workspace-kernel/src/projection/conformance.test.ts`. The step brief said to move it to `packages/core/extension-kinds/src/` beside the managers.

## Friction

The previous step's `slices/placement` rule in `tools/architecture/slices.mjs` allowed only `live.ts` directly under `extension-kinds/src`, and every other location is a single kind's folder. The case reads six kinds' managers, so it fit neither a kind folder nor the package root as the rule stood.

## Cost / impact

The agent first widened the placement rule's ignore list to root-level `*.test.*` files, a change to the previous step's enforcement. Review rejected that, so the rule was restored and the case was rewritten as one test per kind, which cost a second round.

## Outcome

The `slices/placement` rule is unchanged from the previous step. Each of the six kinds with a projection participant (`instructions`, `hooks`, `knowledge`, `skills`, `subagents`, `mcp-connections`) has its own `projection-conformance.test.ts` beside its `manager.ts`, and the `mcp-connections` test also checks `install/install-operation.ts`.

## Evidence

Rule `slices/placement` message before the edit: "Place extension kind code in its kind folder; only live.ts sits at the package root."

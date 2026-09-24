---
observed_at: "2026-09-24T01:50:00Z"
session: "r4c9"
area: "capability boundary lint"
---

# Capability domain import rejected only at pre-commit

## Context

Making MCP connection install consume the desired-state graph's effective
constraint. The first version kept the selection in
`packages/core/workspace/src/mcp-connections/lifecycle/domain/source-admission.ts`
and imported the desired-state package index there.

## Friction

The workspace typecheck, the focused tests, and `axm:unused-code` all passed.
The ESLint capability boundary rules rejected the import only when the
lint-staged pre-commit hook ran `eslint --fix`, so the commit failed after
verification had already passed.

## Cost / impact

One failed commit. The change was restructured so the domain module keeps only
the pure local-name rule and the graph-backed selection moved into the install
planner. After that, the typecheck, tests, and unused-code check were rerun.

## Outcome

Committed after the restructure. The boundary rule was satisfied.

## Evidence

```
13:8  error  Dependencies to unknown elements and files are not allowed  boundaries/no-unknown-dependencies
13:8  error  Use the owning capability's public domain/application contract; technology belongs in adapters and concrete wiring in composition  boundaries/dependencies
```

## Existing context

`tools/architecture/config.mjs` lists
`mcp-connections/lifecycle/domain` as an enforced capability root. Domain files
there may import only `effect`, `semver`, and the extension model's public
contract.

---
observed_at: "2026-09-24T20:26:00Z"
session: "cb804d88-8d8a-44e8-94a4-438b3abcda6e"
area: "desired-state test stub WorkspaceReadTest"
---

# WorkspaceReadTest layout carried no owner, so authored packages observed as wrong-origin

## Context

Routing aggregate contributors (Rules region) through the canonical
observation, which judges a workspace-authored manifest against the layout's
configured owner.

## Friction

The `WorkspaceReadTest` stub builds its default layout without an `owner`
even when the supplied settings declare one, while the production layout is
resolved with that owner. Under the stub an authored rule package whose
manifest names the settings owner observed as `wrong-origin`, and the aggregate
write refused with `ContributorTreeMismatch`, although the same workspace on
disk is valid.

## Cost / impact

One test failure attributed to the source change before the stub was
identified; one focused test run to confirm; the stub was changed to carry the
settings owner into the default layout.

## Outcome

`WorkspaceReadTest` now copies `settings.owner` into the default layout, and
the affected test passes.

## Evidence

- `packages/core/workspace/src/desired-state/workspace/test-stubs.ts`,
  `WorkspaceReadTest` default layout.
- Failing test before the stub change:
  `src/instructions/manager.graph-projection.test.ts` > "re-renders an authored
  body edit and converges on repeat runs", failure tag `ContributorTreeMismatch`
  with `packageRoot` `.../rules/edited-rule`.

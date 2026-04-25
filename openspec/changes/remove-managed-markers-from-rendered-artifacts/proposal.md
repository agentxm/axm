## Why

AXM currently prepends managed markers to rendered command, subagent, and skill artifacts, then reads those markers back during sync to decide whether a file is safe to overwrite. That content-based ownership model is redundant with the workspace classifier, mutates installation artifacts unnecessarily, and causes avoidable rendering and merge problems.

## What Changes

- Remove managed-marker generation from rendered command files, rendered subagent files, Roo mode entries, and materialized `SKILL.md` files.
- Remove content-based conflict detection from command and subagent sync paths.
- Update Roo mode merge/remove behavior to identify AXM-managed entries by slug alone instead of `_axm_managed` metadata.
- Simplify copy, detection, and setup reporting paths that currently parse rendered file contents for marker state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-skills-install`: materialized skills no longer gain an AXM-managed header comment.
- `commands`: rendered command files no longer include managed headers, and sync no longer relies on header-based conflict detection.
- `subagents`: rendered subagent files and Roo mode entries no longer include managed markers, and Roo reconciliation becomes slug-based.

## Impact

- `packages/core/src/unstable/extensions/managed-marker.ts`
- `packages/core/src/unstable/extensions/conflict-detection.ts`
- `packages/core/src/unstable/commands/**`
- `packages/core/src/unstable/subagents/**`
- `packages/core/src/unstable/skills/**`
- `packages/core/src/unstable/extensions/copy.ts`
- `packages/core/test/**`
- `openspec/specs/cli-skills-install/spec.md`
- `openspec/specs/commands/spec.md`
- `openspec/specs/subagents/spec.md`

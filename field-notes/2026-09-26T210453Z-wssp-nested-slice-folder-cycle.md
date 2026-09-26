---
observed_at: "2026-09-26T21:04:53Z"
session: "wssp"
area: "workspace slice gate and cycle cruise"
---

# A nested feature slice made the folder-cycle rule report a false cycle

## Context

The agent session added the slice gate and widened the dependency-cruiser cycle check over `packages/core/workspace/src`. The planned folder rule named `reconciliation/sync` as its own slice folder while it still sat inside the `reconciliation` kernel folder.

## Friction

`architecture:check` reported `no-slice-cycles` between `packages/core/workspace/src/packs` and `packages/core/workspace/src/reconciliation`. dependency-cruiser counts every descendant module toward each ancestor folder, so the sync feature's allowed import of the packs kind showed up as a `reconciliation -> packs` edge. Every kind imports `reconciliation`, so any sync import of a kind closes a cycle that does not exist between files. The plan expected only one extra edge of this kind (`resolution -> acquisition`), and step 1 had already removed that one.

## Cost / impact

The cruise could not pass with the planned layout. The agent read the dependency-cruiser folder aggregation source and grepped for every reference to the sync folder path before choosing a fix.

## Outcome

The sync slice folder moved from `src/reconciliation/sync` to `src/sync` in this step, earlier than the plan's flattening step. The package subpath `./reconciliation/sync` stayed the same, so consumers were not changed. The folder rule and the slice table no longer name a nested sync folder, and the cruise passes.

## Evidence

`pnpm exec nx run architecture:check` output: `no-slice-cycles: packages/core/workspace/src/packs -> packages/core/workspace/src/reconciliation (via packages/core/workspace/src/reconciliation -> packages/core/workspace/src/packs)`. The aggregation is in `node_modules/dependency-cruiser/src/analyze/derive/folders/aggregate-to-folders.mjs` (`getParentFolders`).

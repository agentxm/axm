# Layers Reorg: Per-Feature Self-Wired Layers

## Goal

Move from type-grouped composition (all managers, then all workflow actions) to feature-grouped composition where each extension owns its full layer graph and declares its requirements via the `R` type parameter. `runtime.ts` merges them flat and provides the shared foundation once.

## Current State

```
runtime.ts:
  managerLayer = mergeAll(
    provide(Commands.managerLayer, wsLayer),
    provide(McpServers.managerLayer, wsLayer),
    provide(Skills.managerLayer, workspaceServiceLayer),
    provide(Packs.managerLayer, workspaceServiceLayer),
  )
  supportLayer = mergeAll(workspaceServiceLayer, managerLayer)
  workflowActionsLayer = mergeAll(
    provide(Commands.workflowActionsLayer, supportLayer),
    provide(McpServers.workflowActionsLayer, supportLayer),
    provide(Skills.workflowActionsLayer, supportLayer),
    provide(Packs.workflowActionsLayer, supportLayer),
  )
  return mergeAll(supportLayer, workflowActionsLayer)
```

Each `extensions/<feature>/layers.ts` exports `managerLayer` and `workflowActionsLayer` separately.

## Target State

```
// extensions/<feature>/layers.ts
export const layer = Layer.provideMerge(workflowActionsLayer, managerLayer)
// R is inferred — e.g. Skills needs Workspace | FileSystem | Path | CliEnvConfig | SourceHostProviders

// runtime.ts
const extensionsLayer = Layer.mergeAll(
  Commands.layer, McpServers.layer, Skills.layer, Packs.layer,
)
return Layer.provideMerge(extensionsLayer, workspaceServiceLayer)
```

## Tasks

### 1. Add composed `layer` export to each extension module

For each of the four files, add a single `layer` export that composes `workflowActionsLayer` on top of `managerLayer`. Keep the individual exports for now (no breaking change).

- [ ] `packages/cli/src/extensions/commands/layers.ts` — add `export const layer = Layer.provideMerge(workflowActionsLayer, managerLayer)`
- [ ] `packages/cli/src/extensions/mcp-servers/layers.ts` — same
- [ ] `packages/cli/src/extensions/skills/layers.ts` — same
- [ ] `packages/cli/src/extensions/packs/layers.ts` — same

Verify: `pnpm typecheck` — each `layer` should infer its `R` correctly.

### 2. Simplify `makeWorkspaceProgramLayer` in runtime.ts

Replace the type-grouped blocks with a flat merge + single provide:

```typescript
const makeWorkspaceProgramLayer = (envConfig, workspace) => {
  // -- Workspace foundation (unchanged) --
  const wsLayer = ...
  const sourceProvidersLayer = ...
  const workspaceServiceLayer = Layer.mergeAll(wsLayer, sourceProvidersLayer)

  // -- Extensions (new) --
  const extensionsLayer = Layer.mergeAll(
    Commands.layer, McpServers.layer, Skills.layer, Packs.layer,
  )

  return Layer.provideMerge(extensionsLayer, workspaceServiceLayer)
}
```

### 3. Remove individual exports if unused

Check whether any code imports `managerLayer` or `workflowActionsLayer` directly from an extension module. If not, remove them and keep only `layer`.

- [ ] Grep for `managerLayer` and `workflowActionsLayer` imports outside `layers.ts` files
- [ ] If unused externally, unexport (keep as `const` for internal composition)

### 4. Verify

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`

## Risks

- **Cross-feature manager deps**: Workflow actions for one feature may depend on another feature's manager (e.g. Packs workflow actions needing SkillManager). If so, `Layer.provideMerge` within a single feature won't satisfy that — the dep comes from the merged extensions layer. Verify this isn't the case, or adjust by merging all manager layers first, then providing to workflow actions.
- **Layer memoization**: Effect v4 shares memoization across `Effect.provide` calls by default, so consolidating `provide` calls should not cause duplicate instantiation. Confirm no `Layer.fresh` usage that would break.

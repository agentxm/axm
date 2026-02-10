## Context

Current structure has two packages:

- `packages/core/` - Domain logic (agents, resolution, schemas, skills, workspace, workspace-init, paths)
- `packages/cli/` - CLI layer with services (clack-effect, workspace-context)

All `core` exports are consumed only by `cli`. The separation adds import indirection without enabling code reuse.

## Goals / Non-Goals

**Goals:**

- Single package containing all code
- Flat, intuitive directory structure in `cli/src/`
- All imports become relative within the package

**Non-Goals:**

- Behavioral changes
- API changes
- Renaming modules beyond `workspace-context` → `workspace`

## Decisions

### 1. Target directory structure

```
packages/cli/src/
  agents/           ← from core/src/experimental/agents/
  clack-effect/     ← from cli/src/services/clack-effect/
  commands/         (unchanged)
  resolution/       ← from core/src/experimental/resolution/
  schemas/          ← from core/src/experimental/schemas/
  skills/           ← from core/src/experimental/skills/
  workspace/        ← merged from:
                      - cli/src/services/workspace-context/
                      - core/src/experimental/workspace/
                      - core/src/experimental/workspace-init/
                      - core/src/experimental/paths.ts
  utils/            (unchanged)
  main.ts           (unchanged)
```

**Rationale:** Flat structure at `cli/src/` level. Each domain (agents, skills, etc.) is a top-level directory. The `workspace/` directory consolidates all workspace-related code.

### 2. Merge workspace modules

Combine four sources into `cli/src/workspace/`:

- `workspace-context/` (service layer)
- `workspace/` (state management)
- `workspace-init/` (initialization)
- `paths.ts` (path utilities)

**Rationale:** These are all workspace-related. Single directory reduces navigation.

### 3. Update imports in batches

Process one source directory at a time:

1. Move directory
2. Update imports within moved files
3. Update imports in dependent files
4. Run typecheck to verify

**Rationale:** Incremental approach catches errors early.

### 4. Delete core package last

After all moves complete:

1. Remove `@axm.sh/core` from cli's dependencies
2. Delete `packages/core/`
3. Update pnpm-workspace.yaml if needed

## Risks / Trade-offs

**[Merge conflicts in workspace/]** → Keep original filenames where possible. Only rename if there are conflicts.

**[Circular dependencies]** → Run `pnpm typecheck` after each move to catch immediately.

**[Missed import updates]** → TypeScript compiler will catch missing imports. Run full build before considering complete.

## Context

The `init-*` modules in `packages/cli/src/workspace/` implemented a state-based initialization architecture (load actual state → build ideal state → compute diff → apply). This was superseded when commit `53b220e` integrated initialization directly into `WorkspaceContext.make()`.

Current state:

- 4 source files + 4 test files (8 total)
- Exported from `workspace/index.ts` but never imported elsewhere
- ~600 lines of dead code

## Goals / Non-Goals

**Goals:**

- Remove dead code to reduce maintenance burden
- Clean up exports from workspace module

**Non-Goals:**

- Preserving any of this code for future use (the pattern was intentionally replaced)
- Backward compatibility (these were internal, unused exports)

## Decisions

**Delete files directly rather than deprecate**

Rationale: No external consumers exist. The exports were never used outside the workspace module's own tests. Deprecation warnings serve no purpose for code with zero callers.

**Remove exports from index.ts**

Rationale: Clean public API. Leaving exports to deleted files would cause build failures anyway.

## Risks / Trade-offs

**Risk**: Hidden dependency we missed → Mitigation: Build and test will catch any missed imports.

**Risk**: Future need for this pattern → Mitigation: Git history preserves the implementation. The pattern can be recovered if needed, but `WorkspaceContext.make()` is the preferred approach.

## Context

The project structure documented in CLAUDE.md defines a specific file organization pattern for CLI commands:

```
packages/cli/src/commands/
  <command>/
    <subcommand>/
      handler.ts
      handler.test.ts
    utils.ts  # Shared within this command module
```

The current codebase uses a flatter structure with handlers at the command level and tests in `__tests__/` subdirectories, which diverges from the documented convention.

## Goals / Non-Goals

**Goals:**

- Align file locations with CLAUDE.md conventions
- Colocate tests with implementation files
- Establish consistent patterns for future commands
- Update imports to reflect new paths

**Non-Goals:**

- Changing handler logic or behavior
- Adding new functionality
- Modifying test assertions or coverage
- Creating `utils/` directories (deferred until needed)
- Creating `<external-lib>-effect/` directories (deferred until Effect wrappers are needed)

## Decisions

**Decision: Use `command.ts` naming for yargs command definitions**

The CLAUDE.md structure shows `handler.ts` but doesn't explicitly name the yargs command module. Using `command.ts` distinguishes the yargs command builder from the Effect handler:

- `command.ts` - yargs command definition, args parsing
- `handler.ts` - Effect handler with business logic

**Alternatives considered:**

- `index.ts` for command - rejected as less explicit
- `<command>.ts` (e.g., `init.ts`) - rejected as redundant with directory name

**Decision: Move rather than copy files**

Use git mv to preserve history.

**Alternatives considered:**

- Copy and delete - loses git history
- Symlinks - adds complexity without benefit

## Risks / Trade-offs

**Risk:** Breaking imports in other files
**Mitigation:** Update all imports after moves; run build and tests to verify

**Risk:** Disrupting in-progress work
**Mitigation:** This is a pure refactor; no behavior changes

## Migration Plan

1. Move files using git mv
2. Update all import statements
3. Remove empty directories
4. Verify with `pnpm build && pnpm test`
5. Single commit with all changes

## Open Questions

None - this is a straightforward reorganization following documented conventions.

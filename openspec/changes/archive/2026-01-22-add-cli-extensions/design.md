## Context

The `extensions` sub-command will serve as the namespace for all extension management operations. This stub establishes the command structure that future sub-commands will build upon.

## Goals / Non-Goals

- Goals:
  - Establish `axm extensions` as a command group
  - Provide helpful output when invoked without a sub-command
  - Follow existing CLI patterns in the codebase

- Non-Goals:
  - Implement actual extension functionality (future work)
  - Define extension data models or storage

## Proposed Structure

```
packages/cli/src/
├── main.ts                      # Wire extensions command
└── commands/
    └── extensions.ts            # Parent command (stub)

# Future sub-commands will follow this pattern:
packages/cli/src/commands/
└── extensions/
    ├── list.ts                  # axm extensions list
    ├── add.ts                   # axm extensions add
    ├── remove.ts                # axm extensions remove
    └── update.ts                # axm extensions update
```

## Decisions

- **Command structure**: Use yargs command grouping pattern
  - Allows adding sub-commands incrementally
  - Provides automatic help generation for the group

- **Stub behavior**: Display help/usage when invoked without sub-command
  - Consistent with CLI conventions
  - Guides users toward available sub-commands as they're added

## Risks / Trade-offs

- Shipping a stub exposes an incomplete feature → Acceptable for incremental development; help text will indicate available commands

## Open Questions

- What sub-commands will be added? (TBD - candidates: `list`, `add`, `remove`, `update`)

# CLI Package Instructions

## Architecture

- **yargs parses, Effect executes** - CLI handlers only parse arguments. All business logic lives in Effect.
- **Dependencies via Effect services** - No direct I/O in business logic. Inject via Effect context.
- **Commands follow noun-verb** - `<resource> <action>` pattern (e.g., `extension list`).

## Project Structure

```
src/
  main.ts                           # Entry point
  commands/
    <resource>.ts                   # Parent command
    <resource>/<action>.ts          # Subcommands
    <resource>/utils.ts             # Shared utilities for subcommands
```

## Specs

CLI specs live in `openspec/specs/` with the naming convention:

```
cli/                    # CLI root capability
cli-<command>/          # Command capability
cli-<command>-<action>/ # Subcommand capability
```

## Key References

- CLI design patterns: `docs/guides/cli-design-guidelines.md`

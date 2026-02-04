## Why

The `--verbose` and `--quiet` flags add complexity without providing value. They're defined but not actually used anywhere—no command varies its output based on these flags. Removing them simplifies the CLI interface and reduces maintenance burden.

## What Changes

- **BREAKING**: Remove `--verbose` / `-v` global flag from CLI
- **BREAKING**: Remove `--quiet` / `-q` global flag from CLI
- Remove `verbose` and `quiet` properties from command argument interfaces (`InitArgs`, `InstallArgs`, etc.)
- Remove `verbose` property from `OperationContextConfig` service

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `cli`: Remove verbose and quiet flag requirements from Standard Flags section

## Impact

- **CLI**: `main.ts` global options, all command interfaces and handlers
- **Services**: `OperationContext` service loses `verbose` property
- **Users**: Breaking change for any scripts using `--verbose` or `--quiet` (flags will error instead of being silently accepted)

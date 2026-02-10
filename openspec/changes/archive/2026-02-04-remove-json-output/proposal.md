## Why

The JSON output feature is incomplete and adds maintenance burden without delivering value. Only dry-run plan output is implemented, the init command flag is unused, and there's no consistent error handling or list output. Removing it simplifies the CLI and reduces code surface area.

## What Changes

- **BREAKING**: Remove `--json` global CLI flag from main.ts
- **BREAKING**: Remove `--json` flag from `skills install` command
- **BREAKING**: Remove `--json` flag from `skills uninstall` command
- **BREAKING**: Remove `--json` flag from `init` command
- Remove JSON conversion utilities (`planToJson`, `sourceToJson`, `stepToJson`)
- Remove JSON type exports (`PlanJson`, `PlanStepJson`, `SkillSourceJson`)
- Remove JSON output suppression logic (`showOutput = !args.json`)
- Remove E2E tests for JSON output

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-install`: Remove JSON flag handling and output logic from install handler
- `workspace-uninstall`: Remove JSON flag handling and output logic from uninstall handler

## Impact

- **CLI API**: Breaking change for any users relying on `--json` flag
- **packages/cli/src/main.ts**: Remove global json option
- **packages/cli/src/commands/init/command.ts**: Remove json from InitArgs
- **packages/cli/src/commands/skills/install/**: Remove json flag, handler logic, and examples
- **packages/cli/src/commands/skills/uninstall/**: Remove json flag, handler logic, and examples
- **packages/core/src/experimental/workspace/plan.ts**: Remove JSON types and conversion functions
- **packages/core/src/experimental/workspace/index.ts**: Remove JSON exports
- **packages/cli/e2e/skills-install-dry-run.test.ts**: Remove JSON-related test cases

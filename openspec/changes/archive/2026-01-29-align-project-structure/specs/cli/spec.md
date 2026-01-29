## ADDED Requirements

### Requirement: Command File Organization

CLI commands SHALL follow the project structure defined in CLAUDE.md, organizing files by command hierarchy with colocated tests.

#### Scenario: Top-level command directory structure

- **WHEN** a new CLI command is added
- **THEN** its files are placed in `packages/cli/src/commands/<command>/`
- **AND** the yargs command definition is in `command.ts`
- **AND** the Effect handler is in `handler.ts`
- **AND** handler tests are in `handler.test.ts`

#### Scenario: Subcommand directory structure

- **WHEN** a command has subcommands
- **THEN** each subcommand has its own directory under the parent command
- **AND** files follow the same pattern: `<command>/<subcommand>/command.ts`, `handler.ts`, `handler.test.ts`

#### Scenario: Test colocation

- **WHEN** tests exist for a handler
- **THEN** tests are colocated with the handler file as `handler.test.ts`
- **AND** tests are NOT placed in separate `__tests__/` directories

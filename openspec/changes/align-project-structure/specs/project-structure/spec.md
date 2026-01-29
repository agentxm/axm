# Capability: Project Structure

Defines the directory structure and file organization conventions for the codebase.

## ADDED Requirements

### Requirement: CLI Command Directory Structure

Each CLI command SHALL be organized in its own subdirectory under `packages/cli/src/commands/`.

#### Scenario: Top-level command structure

- **WHEN** a new CLI command is created
- **THEN** it MUST be placed in `commands/<command>/index.ts` for yargs wiring
- **AND** the handler MUST be in `commands/<command>/handler.ts`
- **AND** the handler test MUST be colocated as `commands/<command>/handler.test.ts`

#### Scenario: Subcommand structure

- **WHEN** a CLI command has subcommands
- **THEN** each subcommand MUST be in `commands/<command>/<subcommand>/index.ts`
- **AND** the handler MUST be in `commands/<command>/<subcommand>/handler.ts`
- **AND** the handler test MUST be colocated as `commands/<command>/<subcommand>/handler.test.ts`

### Requirement: Core Module Test Colocation

Unit tests in core package SHALL be colocated with their source files.

#### Scenario: Test file placement

- **WHEN** a module has unit tests
- **THEN** tests MUST be named `<module>.test.ts` and placed next to `<module>.ts`
- **AND** tests MUST NOT be placed in a separate `__tests__/` directory

### Requirement: E2E Test Location

End-to-end tests SHALL be placed in `packages/cli/e2e/`.

#### Scenario: E2E test placement

- **WHEN** an E2E test is created for CLI behavior
- **THEN** it MUST be placed in `packages/cli/e2e/<feature>.test.ts`
- **AND** fixtures MUST be in `packages/cli/e2e/fixtures/`

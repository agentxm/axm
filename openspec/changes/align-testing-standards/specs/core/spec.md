# core Specification Delta

## MODIFIED Requirements

### Requirement: Testability

The core package SHALL include a Vitest configuration for unit testing. Tests SHALL be colocated with source files following the same pattern as CLI handler tests.

#### Scenario: Running tests

- **WHEN** `pnpm test` is run from the monorepo root
- **THEN** core package tests are executed

#### Scenario: Test colocation

- **WHEN** tests exist for a module
- **THEN** tests are colocated with the source file as `<module>.test.ts`
- **AND** tests are NOT placed in separate `__tests__/` directories

#### Scenario: Effect testing patterns

- **WHEN** a test needs to run Effect programs
- **THEN** the test defines `run` and `runEither` helpers at describe scope
- **AND** `run` executes Effects that should succeed
- **AND** `runEither` wraps Effects with `Effect.either` for error assertions

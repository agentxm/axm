## MODIFIED Requirements

### Requirement: Testability

The core package SHALL include a Vitest configuration for unit testing. Tests SHALL be colocated with source files, not placed in separate `__tests__/` directories.

Tests for Effect-based code SHALL use `@effect/vitest` to stay in Effect-land without bridging to Promise-land.

#### Scenario: Running tests

- **WHEN** `pnpm test` is run from the monorepo root
- **THEN** core package tests are executed

#### Scenario: Test file location

- **WHEN** a test file exists for a module
- **THEN** the test file is colocated as `<module>.test.ts` alongside `<module>.ts`
- **AND** tests are NOT placed in separate `__tests__/` directories

#### Scenario: Effect test patterns

- **WHEN** testing Effect-based functions
- **THEN** tests SHALL use `it.effect` from `@effect/vitest`
- **AND** tests SHALL use `Effect.flip` for error assertions
- **AND** tests SHALL NOT use `Effect.runPromise` wrappers

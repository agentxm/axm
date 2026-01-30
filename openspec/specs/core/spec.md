# core Specification

## Purpose

TBD - created by archiving change add-core-package. Update Purpose after archive.

## Requirements

### Requirement: Package Structure

The core package SHALL be located at `packages/core` and published as `@agentxm/core`.

#### Scenario: Package discovery

- **WHEN** a consumer adds `@agentxm/core` as a dependency
- **THEN** the package resolves via pnpm workspace protocol

### Requirement: TypeScript Configuration

The core package SHALL use strict TypeScript configuration extending the monorepo base config.

#### Scenario: Type checking

- **WHEN** `pnpm typecheck` is run
- **THEN** the core package compiles without type errors

### Requirement: Effect Integration

The core package SHALL use Effect for domain logic and expose Effect-based APIs.

#### Scenario: Effect dependency

- **WHEN** the core package is built
- **THEN** Effect is available as a dependency for defining services and effects

### Requirement: Testability

The core package SHALL include a Vitest configuration for unit testing. Tests SHALL be colocated with source files, not placed in separate `__tests__/` directories.

#### Scenario: Running tests

- **WHEN** `pnpm test` is run from the monorepo root
- **THEN** core package tests are executed

#### Scenario: Test file location

- **WHEN** a test file exists for a module
- **THEN** the test file is colocated as `<module>.test.ts` alongside `<module>.ts`
- **AND** tests are NOT placed in separate `__tests__/` directories

### Requirement: Experimental Subpath Export

The core package SHALL expose experimental APIs via a separate `/experimental` subpath. Experimental code SHALL NOT be re-exported from the main entry point.

#### Scenario: Importing experimental APIs

- **WHEN** a consumer wants to use experimental APIs
- **THEN** they MUST import from `@agentxm/core/experimental`
- **AND** importing from `@agentxm/core` does NOT include experimental exports

#### Scenario: JSDoc documentation

- **WHEN** code is added to the experimental folder
- **THEN** all exports MUST include `@experimental` JSDoc tag

### Requirement: CLI Separation

The core package SHALL NOT depend on CLI-specific concerns (yargs, process arguments, terminal I/O). The CLI SHALL depend on core for domain logic.

#### Scenario: Dependency direction

- **WHEN** inspecting package.json dependencies
- **THEN** `@agentxm/cli` depends on `@agentxm/core`
- **AND** `@agentxm/core` does NOT depend on `@agentxm/cli`

# Core

The `@axm.sh/core` package provides domain logic, types, and utilities for AgentXM. It is consumed by the CLI and other packages that need agent extension functionality.

## ADDED Requirements

### Requirement: Package Structure

The core package SHALL be located at `packages/core` and published as `@axm.sh/core`.

#### Scenario: Package discovery

- **WHEN** a consumer adds `@axm.sh/core` as a dependency
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

The core package SHALL include a Vitest configuration for unit testing.

#### Scenario: Running tests

- **WHEN** `pnpm test` is run from the monorepo root
- **THEN** core package tests are executed

### Requirement: Experimental Subpath Export

The core package SHALL expose experimental APIs via a separate `/experimental` subpath. Experimental code SHALL NOT be re-exported from the main entry point.

#### Scenario: Importing experimental APIs

- **WHEN** a consumer wants to use experimental APIs
- **THEN** they MUST import from `@axm.sh/core/experimental`
- **AND** importing from `@axm.sh/core` does NOT include experimental exports

#### Scenario: JSDoc documentation

- **WHEN** code is added to the experimental folder
- **THEN** all exports MUST include `@experimental` JSDoc tag

### Requirement: CLI Separation

The core package SHALL NOT depend on CLI-specific concerns (yargs, process arguments, terminal I/O). The CLI SHALL depend on core for domain logic.

#### Scenario: Dependency direction

- **WHEN** inspecting package.json dependencies
- **THEN** `@axm.sh/cli` depends on `@axm.sh/core`
- **AND** `@axm.sh/core` does NOT depend on `@axm.sh/cli`

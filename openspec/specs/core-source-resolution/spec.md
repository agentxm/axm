## ADDED Requirements

### Requirement: Source resolution available from core

The `@axm.sh/core/unstable/source-resolution` module SHALL export the `SourceHostProviders` Effect service, `SourceHostProvider` interface, source resolution functions (`resolveSource`, `resolveSourcePattern`), and all provider implementations (git-hosting, local, builtin, registry).

#### Scenario: SourceHostProviders service importable from core

- **WHEN** a consumer imports `SourceHostProviders` from `@axm.sh/core/unstable/source-resolution`
- **THEN** the service SHALL provide `find`, `fetch`, `cloneUrl`, and `origin` methods

#### Scenario: resolveSource importable from core

- **WHEN** a consumer imports `resolveSource` from `@axm.sh/core/unstable/source-resolution`
- **THEN** it SHALL accept a source URI string and return the resolved `Source` object

#### Scenario: Provider implementations importable from core

- **WHEN** a consumer imports provider factories from `@axm.sh/core/unstable/source-resolution`
- **THEN** `createGitHostingProvider`, `createLocalProvider`, `createBuiltinProvider`, and `createRegistrySourceHostProvider` SHALL be available

### Requirement: Source resolution has no CLI imports

The `@axm.sh/core/unstable/source-resolution` module SHALL only import from `effect/*` and `@axm.sh/core/unstable/*`.

#### Scenario: No CLI module imports

- **WHEN** inspecting all imports in source resolution module files
- **THEN** no import paths SHALL reference `@axm.sh/cli` or relative paths outside core

### Requirement: Skill discovery available from core

The `@axm.sh/core/unstable/source-resolution` module (or `@axm.sh/core/unstable/skill-discovery`) SHALL export `discoverSkillsInDir`. This function scans a directory for skill manifests and returns discovered skill metadata.

#### Scenario: discoverSkillsInDir importable from core

- **WHEN** a consumer imports `discoverSkillsInDir` from core
- **THEN** it SHALL accept a directory path and discovery options
- **AND** return an array of discovered skill metadata

#### Scenario: discoverSkillsInDir has no CLI dependencies

- **WHEN** inspecting the imports of `discoverSkillsInDir`
- **THEN** it SHALL depend only on `FileSystem`, `Path`, and core types
- **AND** it SHALL NOT import from any CLI module

### Requirement: Source resolution depends on core services

The `SourceHostProviders` service layer SHALL depend on `Workspace` (from core), `FileSystem`, and `Path`. It SHALL NOT depend on any CLI-specific services.

#### Scenario: SourceHostProviders layer uses core Workspace

- **WHEN** the `SourceHostProviders` layer is constructed
- **THEN** it SHALL require `Workspace` from `@axm.sh/core/unstable/workspace`
- **AND** it SHALL NOT require any CLI-specific service

## ADDED Requirements

### Requirement: Bare-name registry lookup uses default namespace

When `skills install` receives a bare name (e.g., `effect-basics`), the system SHALL resolve the default namespace and search effective registry source hosts for a matching skill under that namespace.

Default namespace precedence:

1. Project settings namespace
2. User settings namespace
3. Logged-in identity handle (future)
4. None (no default available)

#### Scenario: Bare name resolved via default namespace in first registry

- **WHEN** user runs `axm skills install effect-basics` with default namespace `@acme` and one registry source host containing `@acme/skills/effect-basics`
- **THEN** the system SHALL resolve the source as a registry install from that registry with namespace `@acme`

#### Scenario: Bare name resolved in a later registry source host

- **WHEN** user runs `axm skills install effect-basics` with default namespace `@acme` and two registry source hosts where only the second contains the skill
- **THEN** the system SHALL return the registry source from the second host

#### Scenario: Bare name not found in any registry

- **WHEN** user runs `axm skills install effect-basics` with default namespace `@acme` and registry source hosts that do not contain the skill
- **THEN** the system SHALL fail with error code `REGISTRY_SKILL_NOT_FOUND`
- **AND** the error SHALL include the provided input, default namespace, and list of checked registries
- **AND** the error SHALL include guidance on alternative install formats

#### Scenario: No default namespace available

- **WHEN** user runs `axm skills install effect-basics` with no configured namespace and no logged-in identity
- **THEN** the system SHALL fail with error code `REGISTRY_SKILL_NOT_FOUND`
- **AND** the error SHALL indicate that no default namespace was available for lookup
- **AND** the error SHALL suggest configuring a namespace or logging in

#### Scenario: No registry source hosts available

- **WHEN** user runs `axm skills install effect-basics` with default namespace `@acme` but no registry source hosts configured
- **THEN** the system SHALL fail with error code `REGISTRY_SKILL_NOT_FOUND`
- **AND** the error SHALL indicate that no registry sources were available

### Requirement: Parse errors remain distinct from lookup failures

The system SHALL distinguish between unparseable input and bare-name lookup failures. Only true parse failures SHALL use the `INVALID_SOURCE` error code.

#### Scenario: Unparseable input produces INVALID_SOURCE

- **WHEN** user runs `axm skills install "not a valid source ???"`
- **THEN** the system SHALL fail with error code `INVALID_SOURCE`
- **AND** the error SHALL list valid input formats

#### Scenario: Resolver errors are not coerced to INVALID_SOURCE

- **WHEN** a bare name is parsed successfully but registry lookup fails with `REGISTRY_SKILL_NOT_FOUND`
- **THEN** the handler SHALL preserve the `REGISTRY_SKILL_NOT_FOUND` error code
- **AND** the error SHALL NOT be remapped to `INVALID_SOURCE`

### Requirement: Workspace exposes default namespace as Option

The workspace service SHALL provide a `getDefaultNamespace` method that returns `Option<string>` following the default namespace precedence chain. The method SHALL return `Option.none()` when no namespace source is available, rather than falling back to a hardcoded default.

#### Scenario: Project settings namespace takes precedence

- **WHEN** project settings has namespace `@proj` and user settings has namespace `@user`
- **THEN** `getDefaultNamespace` SHALL return `Option.some("@proj")`

#### Scenario: User settings namespace used when project has none

- **WHEN** project settings has no namespace and user settings has namespace `@user`
- **THEN** `getDefaultNamespace` SHALL return `Option.some("@user")`

#### Scenario: No namespace available

- **WHEN** neither project nor user settings has a namespace and no identity is logged in
- **THEN** `getDefaultNamespace` SHALL return `Option.none()`

### Requirement: Workspace exposes registry source hosts aligned to ontology

The workspace service SHALL rename `getConfiguredRegistrySources` to `getRegistrySourceHosts` to align with the ontology term `Registry Source Hosts` (`H_registry`). The method SHALL continue to return the subset of effective source hosts where `SourceType = registry`.

#### Scenario: Returns effective registry hosts

- **WHEN** project settings and built-in sources are merged
- **THEN** `getRegistrySourceHosts` SHALL return all members of effective source hosts with `type = "registry"`

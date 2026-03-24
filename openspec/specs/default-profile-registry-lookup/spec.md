### Requirement: Bare-name registry lookup uses default profile

When `skills install` receives a bare name (e.g., `effect-basics`), the system SHALL resolve the default profile and search effective registry source hosts for a matching skill under that profile.

Default profile precedence:

1. Project settings profile
2. User settings profile
3. Logged-in identity handle (future)
4. None (no default available)

#### Scenario: Bare name resolved via default profile in first registry

- **WHEN** user runs `axm skills install effect-basics` with default profile `@acme` and one registry source host containing `@acme/skills/effect-basics`
- **THEN** the system SHALL resolve the source as a registry install from that registry with profile `@acme`

#### Scenario: Bare name resolved in a later registry source host

- **WHEN** user runs `axm skills install effect-basics` with default profile `@acme` and two registry source hosts where only the second contains the skill
- **THEN** the system SHALL return the registry source from the second host

#### Scenario: Bare name not found in any registry

- **WHEN** user runs `axm skills install effect-basics` with default profile `@acme` and registry source hosts that do not contain the skill
- **THEN** the system SHALL fail with error code `REGISTRY_SKILL_NOT_FOUND`
- **AND** the error SHALL include the provided input, default profile, and list of checked registries
- **AND** the error SHALL include guidance on alternative install formats

#### Scenario: No default profile available

- **WHEN** user runs `axm skills install effect-basics` with no configured profile and no logged-in identity
- **THEN** the system SHALL fail with error code `REGISTRY_SKILL_NOT_FOUND`
- **AND** the error SHALL indicate that no default profile was available for lookup
- **AND** the error SHALL suggest configuring a profile or logging in

#### Scenario: No registry source hosts available

- **WHEN** user runs `axm skills install effect-basics` with default profile `@acme` but no registry source hosts configured
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

### Requirement: Workspace exposes default profile as Option

The workspace service SHALL provide a `getDefaultProfile` method that returns `Option<string>` following the default profile precedence chain. The method SHALL return `Option.none()` when no profile source is available, rather than falling back to a hardcoded default.

#### Scenario: Project settings profile takes precedence

- **WHEN** project settings has profile `@proj` and user settings has profile `@user`
- **THEN** `getDefaultProfile` SHALL return `Option.some("@proj")`

#### Scenario: User settings profile used when project has none

- **WHEN** project settings has no profile and user settings has profile `@user`
- **THEN** `getDefaultProfile` SHALL return `Option.some("@user")`

#### Scenario: No profile available

- **WHEN** neither project nor user settings has a profile and no identity is logged in
- **THEN** `getDefaultProfile` SHALL return `Option.none()`

### Requirement: Workspace exposes registry source hosts aligned to ontology

The workspace service SHALL rename `getConfiguredRegistrySources` to `getRegistrySourceHosts` to align with the ontology term `Registry Source Hosts` (`H_registry`). The method SHALL continue to return the subset of effective source hosts where `SourceType = registry`.

#### Scenario: Returns effective registry hosts

- **WHEN** project settings and built-in sources are merged
- **THEN** `getRegistrySourceHosts` SHALL return all members of effective source hosts with `type = "registry"`

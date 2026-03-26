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

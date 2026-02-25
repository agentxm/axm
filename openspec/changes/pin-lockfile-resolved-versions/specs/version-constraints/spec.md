## MODIFIED Requirements

### Requirement: Version expression model

The system SHALL accept any valid semver range string as a version constraint for registry-sourced extensions. Version constraints SHALL be validated using `semver.validRange()` from the `semver` npm package.

Three recommended forms:

- `*` or omitted: stay current (resolve to latest available)
- `^x.y.z`: compatible updates within the same major version
- `x.y.z`: exact pin to a specific version

All other valid semver ranges (`~x.y.z`, `>=x.y.z <a.b.c`, etc.) SHALL be accepted without restriction.

Version constraints apply to registry-sourced extensions only. Non-registry sources (git, GitHub, local, etc.) are unaffected.

Accepted version constraints at input boundaries (CLI source strings, settings entries, and pack manifest dependencies) MUST be resolved to an exact version before lockfile persistence. Lockfile resolved fields MUST contain exact versions only and MUST NOT contain semver ranges.

#### Scenario: No version means latest

- **WHEN** an extension source has no version suffix (e.g., `@acme/tool`)
- **THEN** the system SHALL treat it as `*` (resolve to latest available version)

#### Scenario: Caret range accepted

- **WHEN** an extension source specifies `@acme/tool@^1.0.0`
- **THEN** the system SHALL resolve to the newest version satisfying `^1.0.0`

#### Scenario: Exact pin accepted

- **WHEN** an extension source specifies `@acme/tool@1.2.3`
- **THEN** the system SHALL resolve to exactly version `1.2.3`

#### Scenario: Tilde range accepted

- **WHEN** an extension source specifies `@acme/tool@~1.2.0`
- **THEN** the system SHALL resolve to the newest version satisfying `~1.2.0`

#### Scenario: Complex range accepted

- **WHEN** an extension source specifies `@acme/tool@>=1.0.0 <2.0.0`
- **THEN** the system SHALL resolve to the newest version satisfying the range

#### Scenario: Invalid range rejected

- **WHEN** an extension source specifies `@acme/tool@not-a-version`
- **AND** `semver.validRange()` returns null
- **THEN** the system SHALL fail with a CliError indicating the version constraint is invalid

#### Scenario: Lockfile resolved values reject ranges

- **WHEN** a resolved lockfile field would be written as `^1.2.0`
- **THEN** the operation SHALL fail with a `CliError` indicating resolved lockfile versions must be exact

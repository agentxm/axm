## MODIFIED Requirements

### Requirement: Version resolution by semver range

The registry client SHALL select a version from `index.json` by matching against a semver range using `semver.satisfies()` from the `semver` npm package.

#### Scenario: Exact version match

- **WHEN** resolving `@acme/tool@1.2.3` and `index.json` contains version `1.2.3`
- **THEN** version `1.2.3` is selected

#### Scenario: Range match selects newest satisfying version

- **WHEN** resolving `@acme/tool@^1.0.0` and `index.json` contains versions `1.2.3`, `1.1.0`, `1.0.0`, `0.9.0`
- **THEN** version `1.2.3` is selected (newest satisfying `^1.0.0`)

#### Scenario: No version specified resolves latest

- **WHEN** resolving `@acme/tool` with no version constraint
- **THEN** the newest version in `index.json` is selected (wildcard `*` match)

#### Scenario: No satisfying version returns 404

- **WHEN** resolving `@acme/tool@^2.0.0` and no versions satisfy the range
- **THEN** resolution returns 404 (triggers fallthrough to next registry source)

#### Scenario: Invalid version constraint rejected

- **WHEN** resolving with a version constraint that `semver.validRange()` returns null for
- **THEN** resolution SHALL fail with an AppError indicating the version constraint is invalid

#### Scenario: Version constraint passed to selectVersion

- **WHEN** the registry provider resolves an extension with a version constraint
- **THEN** the constraint SHALL be passed to `selectVersion` which filters candidates using `semver.satisfies(version, constraint)` in addition to the existing agent compatibility filter

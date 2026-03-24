## Requirements

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
- **THEN** the system SHALL fail with a AppError indicating the version constraint is invalid

#### Scenario: Lockfile resolved values reject ranges

- **WHEN** a resolved lockfile field would be written as `^1.2.0`
- **THEN** the operation SHALL fail with a `AppError` indicating resolved lockfile versions must be exact

### Requirement: Constraint priority

When resolving a version for a registry extension, the system SHALL apply constraints with the following priority: user explicit constraint takes precedence over pack constraints, which take precedence over latest.

#### Scenario: User explicit constraint wins over pack

- **WHEN** the user's settings specify `@acme/tool@^2.0.0`
- **AND** pack "starter" declares `@acme/tool: "^1.0.0"` in its manifest
- **THEN** the system SHALL resolve using `^2.0.0` only, ignoring the pack constraint

#### Scenario: Pack constraint applies when user has no constraint

- **WHEN** the user's settings specify `@acme/tool` (no version, i.e., `*`)
- **AND** pack "starter" declares `@acme/tool: "^1.0.0"` in its manifest
- **THEN** the system SHALL resolve to the newest version satisfying `^1.0.0`

#### Scenario: No constraints resolves to latest

- **WHEN** the user's settings specify `@acme/tool` (no version)
- **AND** no pack constrains `@acme/tool`
- **THEN** the system SHALL resolve to the newest available version

### Requirement: Multi-constraint resolution

When multiple packs constrain the same extension and the user has no explicit constraint, the system SHALL attempt to satisfy all pack constraints simultaneously by iterating available versions newest-first and checking `semver.satisfies()` against each constraint.

#### Scenario: Compatible pack constraints intersected

- **WHEN** pack "a" declares `@acme/tool: "^1.0.0"`
- **AND** pack "b" declares `@acme/tool: "^1.2.0"`
- **AND** available versions include 1.0.0, 1.1.0, 1.2.0, 1.3.0
- **THEN** the system SHALL resolve to 1.3.0 (newest satisfying both)

#### Scenario: Incompatible pack constraints use newest with warning

- **WHEN** pack "a" declares `@acme/tool: "^1.0.0"`
- **AND** pack "b" declares `@acme/tool: "^2.0.0"`
- **AND** no version satisfies both constraints
- **THEN** the system SHALL resolve to the newest available version
- **AND** SHALL warn about each unsatisfied pack constraint

#### Scenario: User constraint unsatisfiable fails with error

- **WHEN** the user's settings specify `@acme/tool@^5.0.0`
- **AND** no available version satisfies `^5.0.0`
- **THEN** the system SHALL fail with a AppError indicating no matching version exists

### Requirement: Update warnings

During `axm update`, the system SHALL warn when a pack constraint prevents a user-installed skill from reaching the latest available version.

#### Scenario: Pack holds back user's latest intent

- **WHEN** the user has `@acme/tool` in settings (no version, wants latest)
- **AND** pack "starter" declares `@acme/tool: "^1.0.0"`
- **AND** the newest available version is 2.0.0
- **AND** the resolved version is 1.3.0 (held back by pack constraint)
- **THEN** the system SHALL warn that `@acme/tool` is held at 1.x by pack "starter"

#### Scenario: No warning for pack-only skills

- **WHEN** `@acme/tool` is only installed as a pack dependency (not in user's settings)
- **AND** the pack's constraint holds it below latest
- **THEN** the system SHALL NOT warn

#### Scenario: No warning for user explicit constraint

- **WHEN** the user has `@acme/tool@^1.0.0` in settings (explicit constraint)
- **AND** the newest available version is 2.0.0
- **THEN** the system SHALL NOT warn (the user explicitly chose `^1.0.0`)

### Requirement: Derived extension ownership

Extension ownership SHALL be derived from existing data structures, not stored explicitly. A skill is user-owned if it appears in `settings.json`, pack-owned if its FQN appears in any pack's `resolvedSkills` in the lockfile, or both (shared).

#### Scenario: User-owned skill

- **WHEN** a skill appears in `settings.json` skills section
- **AND** no pack's `resolvedSkills` references its FQN
- **THEN** the skill is user-owned

#### Scenario: Pack-owned skill

- **WHEN** a skill does NOT appear in `settings.json`
- **AND** a pack's `resolvedSkills` references its FQN
- **THEN** the skill is pack-owned

#### Scenario: Shared skill

- **WHEN** a skill appears in `settings.json`
- **AND** a pack's `resolvedSkills` also references its FQN
- **THEN** the skill is shared (both user-owned and pack-owned)

#### Scenario: Orphaned skill

- **WHEN** a skill lock entry exists but the skill is not in `settings.json`
- **AND** no pack's `resolvedSkills` references its FQN
- **THEN** the skill is orphaned and safe to clean up

#### Scenario: FQN correlation

- **WHEN** determining ownership of a registry skill lock entry
- **THEN** the system SHALL construct the FQN from the lock entry's `profile` and `name` fields (`@{profile}/{name}`)
- **AND** match it against pack `resolvedSkills` keys

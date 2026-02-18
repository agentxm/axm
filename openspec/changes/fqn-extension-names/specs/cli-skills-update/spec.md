## MODIFIED Requirements

### Requirement: Constraint-aware version resolution

During update, the handler SHALL collect version constraints from settings source strings and pack manifests, apply constraint priority rules, and resolve the highest version satisfying the effective constraint. Source strings and pack manifest keys SHALL use the three-segment FQN format.

#### Scenario: Update skill with no constraint

- **WHEN** the user runs `axm skills update`
- **AND** skill "review" has settings source `@acme/skills/code-review` (no version)
- **AND** no pack constrains `@acme/skills/code-review`
- **THEN** the handler SHALL resolve to the newest available version

#### Scenario: Update skill with user constraint

- **WHEN** skill "review" has settings source `@acme/skills/code-review@^1.0.0`
- **AND** available versions include 1.0.0, 1.3.0, 2.0.0
- **THEN** the handler SHALL resolve to 1.3.0 (newest satisfying `^1.0.0`)

#### Scenario: Update skill constrained by pack

- **WHEN** skill "review" has settings source `@acme/skills/code-review` (no version, i.e., `*`)
- **AND** pack "starter" declares `@acme/skills/code-review: "^1.0.0"` in its manifest
- **AND** available versions include 1.0.0, 1.3.0, 2.0.0
- **THEN** the handler SHALL resolve to 1.3.0 (pack constraint applies)

#### Scenario: User constraint overrides pack constraint

- **WHEN** skill "review" has settings source `@acme/skills/code-review@^2.0.0`
- **AND** pack "starter" declares `@acme/skills/code-review: "^1.0.0"`
- **THEN** the handler SHALL resolve using `^2.0.0` only, ignoring the pack constraint

#### Scenario: User constraint unsatisfiable

- **WHEN** skill "review" has settings source `@acme/skills/code-review@^5.0.0`
- **AND** no available version satisfies `^5.0.0`
- **THEN** the handler SHALL fail with a CliError for that skill

### Requirement: Update warns when pack holds back user skill

During update, the handler SHALL warn when a pack constraint prevents a user-installed skill from reaching the latest available version. Warning messages SHALL use the three-segment FQN format.

#### Scenario: Warning shown for held-back skill

- **WHEN** skill "review" has settings source `@acme/skills/code-review` (wants latest)
- **AND** pack "starter" constrains it to `^1.0.0`
- **AND** the newest available version is 2.0.0
- **AND** the resolved version is 1.3.0
- **THEN** the handler SHALL warn: `@acme/skills/code-review` held at 1.3.0 by pack "starter" (^1.0.0), latest is 2.0.0

#### Scenario: No warning for pack-only skills

- **WHEN** `@acme/skills/code-review` is installed only as a pack dependency (not in settings)
- **THEN** the handler SHALL NOT warn about version being held back

### Requirement: Pack update cascades to dependencies

When a pack updates to a new version, the handler SHALL re-read its manifest and reconcile dependencies. Pack manifest dependency keys SHALL use the three-segment FQN format.

#### Scenario: New dependency added by pack update

- **WHEN** pack "starter" updates from 2.0.0 to 2.1.0
- **AND** the 2.1.0 manifest adds `@acme/skills/linting: "^1.0.0"` (not in 2.0.0 manifest)
- **THEN** the handler SHALL install `@acme/skills/linting`

#### Scenario: Dependency removed by pack update

- **WHEN** pack "starter" updates from 2.0.0 to 2.1.0
- **AND** the 2.1.0 manifest removes `@acme/skills/old-tool` (was in 2.0.0 manifest)
- **AND** `@acme/skills/old-tool` is not in user's settings and not referenced by another pack
- **THEN** the handler SHALL remove `@acme/skills/old-tool` (orphaned)

#### Scenario: Removed dependency kept if user-owned

- **WHEN** pack "starter" updates and removes `@acme/skills/code-review` from its manifest
- **AND** `@acme/skills/code-review` appears in user's settings
- **THEN** the handler SHALL keep `@acme/skills/code-review` (user still owns it)

#### Scenario: Pack deps re-resolved even when pack version unchanged

- **WHEN** pack "starter" has no newer version available
- **AND** its manifest declares `@acme/skills/code-review: "^1.0.0"`
- **AND** `@acme/skills/code-review` is currently at 1.2.0 but 1.3.0 is available
- **THEN** the handler SHALL update `@acme/skills/code-review` to 1.3.0

## ADDED Requirements

### Requirement: Constraint-aware version resolution

During update, the handler SHALL collect version constraints from settings source strings and pack manifests, apply constraint priority rules, and resolve the highest version satisfying the effective constraint.

#### Scenario: Update skill with no constraint

- **WHEN** the user runs `axm skills update`
- **AND** skill "review" has settings source `@acme/code-review` (no version)
- **AND** no pack constrains `@acme/code-review`
- **THEN** the handler SHALL resolve to the newest available version

#### Scenario: Update skill with user constraint

- **WHEN** skill "review" has settings source `@acme/code-review@^1.0.0`
- **AND** available versions include 1.0.0, 1.3.0, 2.0.0
- **THEN** the handler SHALL resolve to 1.3.0 (newest satisfying `^1.0.0`)

#### Scenario: Update skill constrained by pack

- **WHEN** skill "review" has settings source `@acme/code-review` (no version, i.e., `*`)
- **AND** pack "starter" declares `@acme/code-review: "^1.0.0"` in its manifest
- **AND** available versions include 1.0.0, 1.3.0, 2.0.0
- **THEN** the handler SHALL resolve to 1.3.0 (pack constraint applies)

#### Scenario: User constraint overrides pack constraint

- **WHEN** skill "review" has settings source `@acme/code-review@^2.0.0`
- **AND** pack "starter" declares `@acme/code-review: "^1.0.0"`
- **THEN** the handler SHALL resolve using `^2.0.0` only, ignoring the pack constraint

#### Scenario: User constraint unsatisfiable

- **WHEN** skill "review" has settings source `@acme/code-review@^5.0.0`
- **AND** no available version satisfies `^5.0.0`
- **THEN** the handler SHALL fail with an AppError for that skill

### Requirement: Update warns when pack holds back user skill

During update, the handler SHALL warn when a pack constraint prevents a user-installed skill from reaching the latest available version.

#### Scenario: Warning shown for held-back skill

- **WHEN** skill "review" has settings source `@acme/code-review` (wants latest)
- **AND** pack "starter" constrains it to `^1.0.0`
- **AND** the newest available version is 2.0.0
- **AND** the resolved version is 1.3.0
- **THEN** the handler SHALL warn: `@acme/code-review` held at 1.3.0 by pack "starter" (^1.0.0), latest is 2.0.0

#### Scenario: No warning for pack-only skills

- **WHEN** `@acme/code-review` is installed only as a pack dependency (not in settings)
- **THEN** the handler SHALL NOT warn about version being held back

### Requirement: Pack update

`axm update` SHALL update packs in addition to skills. Pack versions SHALL be re-resolved within their constraints from the settings source string.

#### Scenario: Pack updated within constraint

- **WHEN** pack "starter" has settings source `@acme/starter-pack@^2.0.0`
- **AND** current resolved version is 2.0.0
- **AND** version 2.1.0 is available
- **THEN** the handler SHALL update the pack to 2.1.0

#### Scenario: Pack with no constraint updated to latest

- **WHEN** pack "starter" has settings source `@acme/starter-pack` (no version)
- **AND** version 3.0.0 is available
- **THEN** the handler SHALL update the pack to 3.0.0

#### Scenario: Pack constraint unsatisfiable

- **WHEN** pack "starter" has settings source `@acme/starter-pack@^5.0.0`
- **AND** no available version satisfies `^5.0.0`
- **THEN** the handler SHALL fail with an AppError for that pack

### Requirement: Pack update cascades to dependencies

When a pack updates to a new version, the handler SHALL re-read its manifest and reconcile dependencies.

#### Scenario: New dependency added by pack update

- **WHEN** pack "starter" updates from 2.0.0 to 2.1.0
- **AND** the 2.1.0 manifest adds `@acme/linting: "^1.0.0"` (not in 2.0.0 manifest)
- **THEN** the handler SHALL install `@acme/linting`

#### Scenario: Dependency removed by pack update

- **WHEN** pack "starter" updates from 2.0.0 to 2.1.0
- **AND** the 2.1.0 manifest removes `@acme/old-tool` (was in 2.0.0 manifest)
- **AND** `@acme/old-tool` is not in user's settings and not referenced by another pack
- **THEN** the handler SHALL remove `@acme/old-tool` (orphaned)

#### Scenario: Removed dependency kept if user-owned

- **WHEN** pack "starter" updates and removes `@acme/code-review` from its manifest
- **AND** `@acme/code-review` appears in user's settings
- **THEN** the handler SHALL keep `@acme/code-review` (user still owns it)

#### Scenario: Pack deps re-resolved even when pack version unchanged

- **WHEN** pack "starter" has no newer version available
- **AND** its manifest declares `@acme/code-review: "^1.0.0"`
- **AND** `@acme/code-review` is currently at 1.2.0 but 1.3.0 is available
- **THEN** the handler SHALL update `@acme/code-review` to 1.3.0

## MODIFIED Requirements

### Requirement: Update handler orchestration

The update handler SHALL load configured state, filter by lifecycle flags, re-resolve sources, compare versions, build a plan, and resolve it via `ws.resolvePlan()`. The handler SHALL also update packs and cascade to their dependencies.

#### Scenario: Handler flow for update all

- **WHEN** the handler runs with no source argument
- **THEN** it SHALL read configured skills from `ws.getConfiguredSkills()` (normalized entries)
- **AND** filter to entries where `managed` is `true` and `enabled` is `true`
- **AND** log a skip message for each filtered entry (e.g., "Skipping my-skill (disabled)" or "Skipping my-skill (unmanaged)")
- **AND** read locked skills from `ws.getLockedSkills()` (lockfile entries)
- **AND** for each remaining skill, extract the source string (including version constraint) and re-resolve via `resolveSource()`
- **AND** collect pack constraints from installed pack manifests on disk
- **AND** apply constraint priority rules to determine effective constraint per skill
- **AND** discover the skill from the re-resolved source via `SourceProviders.resolveExtension()`
- **AND** build `InstallSkillOperation`s with `force: true` for skills with version changes
- **AND** also re-resolve installed packs within their constraints
- **AND** cascade pack updates to their dependencies
- **AND** build a plan via `buildUpdatePlan()`
- **AND** resolve the plan via `ws.resolvePlan(plan, handlers)`

#### Scenario: Handler flow for update by source

- **WHEN** the handler runs with a source argument
- **THEN** it SHALL resolve the source argument via `resolveSource()`
- **AND** filter configured skills to those whose resolved source matches the argument source
- **AND** apply the same managed/enabled filtering and skip logging
- **AND** proceed with the same constraint-aware re-resolve, compare, plan, apply flow for matched skills only

#### Scenario: Source matching for filtering

- **WHEN** comparing an installed skill's source against the `[source]` argument
- **THEN** a match SHALL require same source type and same identity fields (owner/repo for git hosting, path for local, scope/name for registry)
- **AND** differences in `ref` or version SHALL NOT prevent a match (the update will fetch the latest)

#### Scenario: Disabled skills skipped with message

- **WHEN** a configured skill has `enabled: false`
- **THEN** the handler SHALL log "Skipping <name> (disabled)" and exclude it from the update plan

#### Scenario: Unmanaged skills skipped with message

- **WHEN** a configured skill has `managed: false`
- **THEN** the handler SHALL log "Skipping <name> (unmanaged)" and exclude it from the update plan

#### Scenario: Plan handlers include uninstall for rename support

- **WHEN** resolving the update plan
- **THEN** the handlers map SHALL include both `"install-skill": installSkill` and `"uninstall-skill": uninstallSkill`
- **AND** this enables rename detection to add uninstall operations for old names

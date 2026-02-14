# cli-skills-update Specification

## Purpose

Defines the `axm skills update` command for updating installed agent skills to their latest versions.

## Requirements

### Requirement: Update command definition

The CLI SHALL provide an `update` subcommand under `axm skills` with the syntax `axm skills update [source]`.

#### Scenario: Update all installed skills

- **WHEN** the user runs `axm skills update` with no positional argument
- **THEN** the handler SHALL attempt to update all installed skills

#### Scenario: Update skills from a specific source

- **WHEN** the user runs `axm skills update <source>`
- **THEN** the handler SHALL only update skills whose settings source matches the given source
- **AND** skills from other sources SHALL be skipped

#### Scenario: Command accepts standard flags

- **WHEN** the user runs `axm skills update`
- **THEN** the command SHALL accept `--skill`, `--force`, `--yes`, `--preview`, `--global`, and `--non-interactive` options

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

### Requirement: Skill filtering with --skill

The handler SHALL support `--skill <pattern>` to scope updates to specific skills by name.

#### Scenario: Filter by exact name

- **WHEN** `--skill my-skill` is provided
- **THEN** only the skill named `my-skill` SHALL be included in the update plan

#### Scenario: Filter by glob pattern

- **WHEN** `--skill "my-*"` is provided
- **THEN** only skills whose names match the glob pattern SHALL be included in the update plan

#### Scenario: No skills match filter

- **WHEN** `--skill` is provided and no installed skills match
- **THEN** the handler SHALL log a warning and exit with a "nothing to update" message

### Requirement: Force update with --force

The `--force` flag SHALL bypass version comparison and treat all matched skills as needing update.

#### Scenario: Force updates all matched skills

- **WHEN** `--force` is provided
- **THEN** the plan builder SHALL mark all matched skills with `expectedResult: { result: "success" }` regardless of version comparison
- **AND** `InstallSkillOperation`s SHALL be built with `force: true`

### Requirement: No installed skills

The handler SHALL handle the case where no skills are installed.

#### Scenario: Empty lockfile

- **WHEN** the user runs `axm skills update` and no skills are installed
- **THEN** the handler SHALL log an informational message indicating no skills are installed
- **AND** exit without building a plan

### Requirement: Workspace pipeline integration

The update handler SHALL use WorkspaceContext for initialization and workspace access, following the same pattern as install.

#### Scenario: Resolve plan via workspace

- **WHEN** the plan is built
- **THEN** the handler SHALL call `ws.resolvePlan(plan, handlers)` from `WorkspaceContextService`
- **AND** the `handlers` argument SHALL be `{ "install-skill": installSkill, "uninstall-skill": uninstallSkill }`
- **AND** the handler SHALL NOT contain inline plan display, confirm, or apply logic

#### Scenario: Handler does not display results

- **WHEN** `resolvePlan` returns the applied plan
- **THEN** the handler SHALL NOT iterate over steps to display success or error messages
- **AND** result display SHALL be handled entirely by `resolvePlan` via `displayPlan`

### Requirement: Re-resolution error handling

The handler SHALL handle errors during source re-resolution gracefully.

#### Scenario: Source re-resolution fails for one skill

- **WHEN** re-resolving a skill's source fails (e.g., network error, repo deleted)
- **THEN** the handler SHALL log a warning for that skill
- **AND** continue processing remaining skills
- **AND** the failed skill SHALL NOT appear in the plan

#### Scenario: All source re-resolutions fail

- **WHEN** all skills fail to re-resolve
- **THEN** the handler SHALL log an error and exit without building a plan

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
- **THEN** the handler SHALL fail with a CliError for that skill

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
- **THEN** the handler SHALL fail with a CliError for that pack

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

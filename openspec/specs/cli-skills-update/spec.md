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

The update handler SHALL load configured state, filter by lifecycle flags, re-resolve sources, compare versions, build a plan, and resolve it via `ws.resolvePlan()`.

#### Scenario: Handler flow for update all

- **WHEN** the handler runs with no source argument
- **THEN** it SHALL read configured skills from `ws.getConfiguredSkills()` (normalized entries)
- **AND** filter to entries where `managed` is `true` and `enabled` is `true`
- **AND** log a skip message for each filtered entry (e.g., "Skipping my-skill (disabled)" or "Skipping my-skill (unmanaged)")
- **AND** read locked skills from `ws.getLockedSkills()` (lockfile entries)
- **AND** for each remaining skill, extract the source string and re-resolve via `resolveSource()`
- **AND** discover the skill from the re-resolved source via `SourceProviders.resolveExtension()`
- **AND** build `InstallSkillOperation`s with `force: true` for skills with version changes
- **AND** build a plan via `buildUpdatePlan()`
- **AND** resolve the plan via `ws.resolvePlan(plan, { "install-skill": installSkill, "uninstall-skill": uninstallSkill })`

#### Scenario: Handler flow for update by source

- **WHEN** the handler runs with a source argument
- **THEN** it SHALL resolve the source argument via `resolveSource()`
- **AND** filter configured skills to those whose resolved source matches the argument source
- **AND** apply the same managed/enabled filtering and skip logging
- **AND** proceed with the same re-resolve, compare, plan, apply flow for matched skills only

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

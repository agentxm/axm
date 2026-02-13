## MODIFIED Requirements

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

## MODIFIED Requirements

### Requirement: Skill installation orchestrator

The `installSkill` operation handler SHALL orchestrate the full per-skill installation pipeline by dispatching to a per-refType install function via `switch(ref.refType)`. Each case (`git-hosted`, `registry`, `local`, `builtin`) SHALL produce a `MaterializedSkill` containing the `skillSrcPath` and `versionConstraint`. Shared post-install steps (agent symlinks, lockfile/settings writes, result computation) SHALL run after materialization.

#### Scenario: Sanitize skill name for canonical path

- **WHEN** executing an install skill operation
- **THEN** the canonical directory name SHALL be derived from `sanitizeName(ref.skill.name)` (performed internally by `getSkillDir`)

#### Scenario: Registry source canonical location

- **WHEN** writing skill files for a registry source
- **THEN** skill content SHALL be written to the `skillSrcPath` returned by `getSkillDir(name, source)`
- **AND** `skillSrcPath` resolves to `<base>/.axm/extensions/@<scope>/skills/<sanitized-name>/src/`
- **AND** the canonical path SHALL NOT depend on which agents are targeted

#### Scenario: Non-registry source canonical location

- **WHEN** writing skill files for a non-registry source
- **THEN** they SHALL be written to the `skillSrcPath` returned by `getSkillDir(name, source)`
- **AND** `skillSrcPath` resolves to `<base>/.axm/extensions/external/skills/<sanitized-name>` (no `src/` subdirectory)

#### Scenario: Clean-slate copy to canonical

- **WHEN** the canonical directory already exists
- **THEN** it SHALL be removed before copying
- **AND** the skill files SHALL be copied via `copySkillDirectory`

#### Scenario: Path safety validated before any writes

- **WHEN** computing canonical and agent-specific paths
- **THEN** `validatePathSafety` SHALL be called for the canonical path against the workspace base directory
- **AND** if the path is unsafe, the skill installation SHALL fail without writing any files

#### Scenario: Agent symlinks created for all agents

- **WHEN** the operation targets agents
- **THEN** a symlink SHALL be created from `<base>/<agent.skills.dir>/<sanitized-name>` to `skillSrcPath` for every agent
- **AND** agents whose `skills.dir` resolves to `.agents/skills` SHALL also receive symlinks (no self-reference skip)

#### Scenario: Symlink failure falls back to copy

- **WHEN** symlink creation fails for an agent
- **THEN** the skill directory SHALL be copied to the agent's path instead
- **AND** the `InstallResult` for that agent SHALL have `symlinkFailed: true`

#### Scenario: Agent symlinks run concurrently

- **WHEN** creating symlinks for multiple agents within a single skill
- **THEN** the symlink operations SHALL run concurrently

#### Scenario: Lockfile updated after installation

- **WHEN** skill files and symlinks are successfully created
- **THEN** `ws.setSkillLock` or `ws.setSkill` SHALL be called with the skill name, lock entry from `sourceToLockEntry`, and the materialized `versionConstraint`

#### Scenario: Lockfile write failure does not fail installation

- **WHEN** the lockfile/settings write fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still be considered successful

#### Scenario: Settings updated after successful installation

The install skill executor SHALL call `ws.setSkill` after successful file installation, keeping settings in sync with the lockfile. When `skipSettings` is true, only `ws.setSkillLock` SHALL be called.

#### Scenario: Skill added to settings on success

- **WHEN** skill files are copied, symlinks created, and lockfile updated successfully
- **AND** `skipSettings` is false
- **THEN** the executor calls `ws.setSkill` with the skill name, lock entry, and version constraint

#### Scenario: Settings write failure does not fail installation

- **WHEN** `ws.setSkill` fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still be considered successful

#### Scenario: Returns per-agent results

- **WHEN** installation completes
- **THEN** the function SHALL return an `OperationResult` indicating success or listing failed agents

#### Scenario: Pre-clean removes from all known locations

- **WHEN** pre-cleaning before install
- **THEN** the handler SHALL remove from `.axm/extensions/external/skills/<name>` (non-registry canonical)
- **AND** remove from `.axm/extensions/@*/skills/<name>` (registry canonical, any scope)

#### Scenario: Per-refType dispatch is exhaustive

- **WHEN** dispatching on `ref.refType`
- **THEN** all four cases (`git-hosted`, `registry`, `local`, `builtin`) SHALL be handled
- **AND** the switch SHALL be exhaustive (no default fallthrough)

### Requirement: Self-copy detection for local refs

When installing a local ref, the handler SHALL detect when the source path resolves to the same location as the install target (`skillSrcPath`). This occurs during the fork workflow when the local ref already points to the installed location.

#### Scenario: Local ref source equals install target

- **WHEN** the local ref's source path resolves to the same absolute path as `skillSrcPath`
- **THEN** pre-clean and copy SHALL be skipped (files already in place)

### Requirement: Registry empty-integrity detection

When installing a registry ref with empty integrity (synthetic refs from the fork/publish pipeline), the handler SHALL reuse the existing canonical directory instead of fetching from the registry.

#### Scenario: Synthetic registry ref with existing canonical

- **WHEN** installing a registry ref with empty integrity
- **AND** the canonical path already exists on disk
- **THEN** the handler SHALL skip fetching and use the existing canonical files

#### Scenario: Synthetic registry ref without existing canonical

- **WHEN** installing a registry ref with empty integrity
- **AND** the canonical path does not exist on disk
- **THEN** the handler SHALL fetch from the registry as normal

## ADDED Requirements

### Requirement: Registry integrity verification

When installing a registry skill, the handler SHALL verify the integrity of the fetched archive against the expected integrity value from the ref.

#### Scenario: Integrity matches

- **WHEN** installing a registry skill
- **AND** the computed integrity of the fetched archive matches `ref.integrity`
- **THEN** installation SHALL proceed normally

#### Scenario: Integrity mismatch

- **WHEN** installing a registry skill
- **AND** the computed integrity of the fetched archive does not match `ref.integrity`
- **THEN** the handler SHALL fail with an `INSTALL_SKILL_INTEGRITY_MISMATCH` error
- **AND** the error SHALL include the expected and actual integrity values

## MODIFIED Requirements

### Requirement: Skill installation orchestrator

The `executeAddSkill` function SHALL orchestrate the full per-skill installation pipeline: sanitize name, validate paths, copy files to canonical location, symlink from agent directories, and update the lockfile. Canonical path and skill source path SHALL be resolved via `Workspace.getSkillDir` with an explicit source argument. For registry sources, agent symlinks SHALL target `skillSrcPath`.

#### Scenario: Sanitize skill name for canonical path

- **WHEN** executing an `AddSkillOperation`
- **THEN** the canonical directory name SHALL be derived from `sanitizeName(op.skill.name)` (performed internally by `getSkillDir`)

#### Scenario: Registry source canonical location

- **WHEN** writing skill files for a registry source
- **THEN** skill content SHALL be written to the `skillSrcPath` returned by `getSkillDir(name, source)`
- **AND** `skillSrcPath` resolves to `<base>/.axm/extensions/@<scope>/skills/<sanitized-name>/src/`
- **AND** the canonical path SHALL NOT depend on which agents are targeted

#### Scenario: Non-registry source canonical location

- **WHEN** writing skill files for a non-registry source
- **THEN** they SHALL be written to the `skillSrcPath` returned by `getSkillDir(name, source)`
- **AND** `skillSrcPath` resolves to `<base>/.agents/skills/<sanitized-name>` (no `src/` subdirectory)

#### Scenario: Clean-slate copy to canonical

- **WHEN** the canonical directory already exists
- **THEN** it SHALL be removed before copying
- **AND** the skill files SHALL be copied via `copySkillDirectory`

#### Scenario: Path safety validated before any writes

- **WHEN** computing canonical and agent-specific paths
- **THEN** `isPathSafe` SHALL be called for each path against the workspace base
- **AND** if any path is unsafe, the skill installation SHALL fail without writing any files

#### Scenario: Symlink targets skillSrcPath for registry sources

- **WHEN** the operation targets agents whose `skills.dir` differs from the canonical location and the source is registry
- **THEN** a symlink SHALL be created from `<base>/<agent.skills.dir>/<sanitized-name>` to `skillSrcPath`

#### Scenario: Symlink targets canonical path for non-registry sources

- **WHEN** the operation targets agents whose `skills.dir` differs from the canonical location and the source is non-registry
- **THEN** a symlink SHALL be created from `<base>/<agent.skills.dir>/<sanitized-name>` to the canonical directory

#### Scenario: Self-reference detected for universal agents

- **WHEN** an agent's resolved `skills.dir` path equals the universal skills directory (`.agents/skills`)
- **THEN** symlink creation SHALL be skipped for that agent
- **AND** the result SHALL indicate success

#### Scenario: Symlink failure falls back to copy

- **WHEN** symlink creation fails for an agent
- **THEN** the skill directory SHALL be copied to the agent's path instead
- **AND** the `InstallResult` for that agent SHALL have `symlinkFailed: true`

#### Scenario: Agent symlinks run concurrently

- **WHEN** creating symlinks for multiple agents within a single skill
- **THEN** the symlink operations SHALL run concurrently

#### Scenario: Lockfile updated after installation

- **WHEN** skill files and symlinks are successfully created
- **THEN** `LockfileService.updateEntry()` SHALL be called with the skill name and a lock entry from `sourceToLockEntry`

#### Scenario: Lockfile write failure does not fail installation

- **WHEN** `LockfileService.updateEntry()` fails
- **THEN** the failure SHALL be silently swallowed
- **AND** the installation SHALL still be considered successful

#### Scenario: Settings updated after successful installation

The install skill executor SHALL call `SettingsService.addSkill()` after successful file installation and lockfile update, keeping settings in sync with the lockfile.

#### Scenario: Skill added to settings on success

- **WHEN** skill files are copied, symlinks created, and lockfile updated successfully
- **THEN** the executor calls `SettingsService.addSkill()` with the skill name and source string

#### Scenario: Settings write failure does not fail installation

- **WHEN** `SettingsService.addSkill()` fails
- **THEN** the failure SHALL be silently swallowed (consistent with lockfile write failure handling)
- **AND** the installation SHALL still be considered successful

#### Scenario: Returns per-agent results

- **WHEN** installation completes
- **THEN** the function SHALL return an `InstallResult` for each target agent

#### Scenario: Self-copy detection for fork workflow

- **WHEN** the source location resolves to the `skillSrcPath` (`<canonical>/src/` for registry, `<canonical>` for others)
- **THEN** pre-clean and copy SHALL be skipped (files already in place)

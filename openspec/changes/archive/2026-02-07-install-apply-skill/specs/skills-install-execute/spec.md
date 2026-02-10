## ADDED Requirements

### Requirement: Skill installation orchestrator

The `executeAddSkill` function SHALL orchestrate the full per-skill installation pipeline: sanitize name, validate paths, copy files to canonical location, symlink from agent directories, and update the lockfile.

#### Scenario: Sanitize skill name for canonical path

- **WHEN** executing an `AddSkillOperation`
- **THEN** the canonical directory name SHALL be derived from `sanitizeName(op.skill.name)`

#### Scenario: Canonical location is fixed

- **WHEN** writing skill files
- **THEN** they SHALL be written to `<base>/.agents/skills/<sanitized-name>`
- **AND** the canonical path SHALL NOT depend on which agents are targeted

#### Scenario: Clean-slate copy to canonical

- **WHEN** the canonical directory already exists
- **THEN** it SHALL be removed before copying
- **AND** the skill files SHALL be copied via `copySkillDirectory`

#### Scenario: Path safety validated before any writes

- **WHEN** computing canonical and agent-specific paths
- **THEN** `isPathSafe` SHALL be called for each path against the workspace base
- **AND** if any path is unsafe, the skill installation SHALL fail without writing any files

#### Scenario: Symlink created for each non-universal agent

- **WHEN** the operation targets agents whose `skills.dir` differs from the canonical location
- **THEN** a relative symlink SHALL be created from `<base>/<agent.skills.dir>/<sanitized-name>` to the canonical directory

#### Scenario: Self-reference detected for universal agents

- **WHEN** an agent's resolved `skills.dir` path equals the canonical location (e.g., both are `.agents/skills`)
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
- **THEN** `updateLockEntry` SHALL be called with the skill name and a lock entry from `sourceToLockEntry`

#### Scenario: Lockfile write failure does not fail installation

- **WHEN** `updateLockEntry` fails
- **THEN** the failure SHALL be silently swallowed
- **AND** the installation SHALL still be considered successful

#### Scenario: Returns per-agent results

- **WHEN** installation completes
- **THEN** the function SHALL return an `InstallResult` for each target agent

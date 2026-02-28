## MODIFIED Requirements

### Requirement: Skill installation orchestrator

Skills installation orchestration SHALL execute a full per-skill installation pipeline by dispatching to a per-refType install function via `switch(ref.refType)`. Each case (`git-hosted`, `registry`, `local`, `builtin`) SHALL produce a `MaterializedSkill` containing the `skillSrcPath` and `versionConstraint`. Shared post-install steps (agent-target resolution, distinct-directory materialization/symlink, lockfile/settings writes, result computation) SHALL run after materialization.

All skills-install execution paths (the primary manager path and direct install operation path) SHALL enforce the same outcome and policy semantics.

For registry-sourced skills, any `resolvedVersion` written to lockfile MUST be an exact semver version and MUST NOT be a semver range.

#### Scenario: Sanitize skill name for canonical path

- **WHEN** executing an install skill operation
- **THEN** the canonical directory name SHALL be derived from `sanitizeName(ref.skill.name)` (performed internally by `getSkillDir`)

#### Scenario: Registry source canonical location

- **WHEN** writing skill files for a registry source
- **THEN** skill content SHALL be written to the `skillSrcPath` returned by `getSkillDir(name, source)`
- **AND** `skillSrcPath` resolves to `<base>/.axm/extensions/@<namespace>/skills/<sanitized-name>/src/`
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

#### Scenario: Configured agents resolved via CodingAgent services

- **WHEN** the install operation starts post-materialization
- **THEN** configured agents SHALL be resolved through `CodingAgentRepository`
- **AND** effective skills directories SHALL be resolved through each agent's `resolveEffectiveSkillsDir`

#### Scenario: Manager and direct operation parity

- **WHEN** skills install is invoked through either primary manager orchestration or direct install operation
- **THEN** both paths SHALL apply identical tagged outcome handling and strict/best-effort unknown-agent policy behavior

#### Scenario: Unsupported and disabled agents are skipped

- **WHEN** an agent resolves to `_tag: "unsupported"` or `_tag: "disabled"`
- **THEN** that agent SHALL be excluded from install target directories
- **AND** the result output SHALL report that the agent was skipped

#### Scenario: Misconfigured agent fails installation

- **WHEN** any configured agent resolves to `_tag: "misconfigured"`
- **THEN** the operation SHALL fail with actionable error details
- **AND** no agent-specific materialization/symlink step SHALL run

#### Scenario: Unknown configured agent in best-effort mode

- **WHEN** configured agents include unknown ids
- **AND** strict mode is disabled
- **THEN** unknown agents SHALL be skipped with warnings
- **AND** installation SHALL continue for known agents

#### Scenario: Unknown configured agent in strict mode

- **WHEN** configured agents include unknown ids
- **AND** strict mode is enabled
- **THEN** the operation SHALL fail before directory materialization/symlink

#### Scenario: Distinct-directory targeting

- **WHEN** multiple installable agents resolve to the same normalized effective skills directory
- **THEN** the operation SHALL perform one materialization/symlink step for that distinct directory
- **AND** all agents targeting that directory SHALL map to that one directory result

#### Scenario: Symlink failure falls back to copy per target directory

- **WHEN** symlink creation fails for a distinct target directory
- **THEN** the skill directory SHALL be copied to that target directory instead
- **AND** all agents mapped to that directory SHALL report `symlinkFailed: true`

#### Scenario: Distinct-directory operations run concurrently

- **WHEN** creating symlinks/copies for multiple distinct target directories
- **THEN** directory operations SHALL run concurrently

#### Scenario: Lockfile updated after installation

- **WHEN** skill files and target directory operations are successfully created
- **THEN** `ws.setSkillLock` or `ws.setSkill` SHALL be called with the skill name, lock entry from `sourceToLockEntry`, and the materialized `versionConstraint`

#### Scenario: Registry lockfile resolvedVersion is exact

- **WHEN** executing an install skill operation for a registry source
- **THEN** the written lockfile entry's `resolvedVersion` SHALL be an exact version (for example, `1.2.3`)
- **AND** the operation SHALL fail if a range value (for example, `^1.2.0`) would be written

#### Scenario: Lockfile write failure does not fail installation

- **WHEN** the lockfile/settings write fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still be considered successful

#### Scenario: Settings updated after successful installation

The install skill executor SHALL call `ws.setSkill` after successful file installation, keeping settings in sync with the lockfile. When `skipSettings` is true, only `ws.setSkillLock` SHALL be called.

#### Scenario: Skill added to settings on success

- **WHEN** skill files are copied, symlinks/copies completed for target directories, and lockfile updated successfully
- **AND** `skipSettings` is false
- **THEN** the executor calls `ws.setSkill` with the skill name, lock entry, and version constraint

#### Scenario: Settings write failure does not fail installation

- **WHEN** `ws.setSkill` fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still be considered successful

#### Scenario: Returns per-agent results

- **WHEN** installation completes
- **THEN** the function SHALL return an `OperationResult` indicating success or listing failed/skipped agents

#### Scenario: Pre-clean removes from all known locations

- **WHEN** pre-cleaning before install
- **THEN** the handler SHALL remove from `.axm/extensions/external/skills/<name>` (non-registry canonical)
- **AND** remove from `.axm/extensions/@*/skills/<name>` (registry canonical, any namespace)

#### Scenario: Per-refType dispatch is exhaustive

- **WHEN** dispatching on `ref.refType`
- **THEN** all four cases (`git-hosted`, `registry`, `local`, `builtin`) SHALL be handled
- **AND** the switch SHALL be exhaustive (no default fallthrough)

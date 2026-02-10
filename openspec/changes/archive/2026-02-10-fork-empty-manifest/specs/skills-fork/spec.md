## RENAMED Requirements

### Requirement: ForkSkillOperation executor

FROM: ForkSkillOperation executor
TO: CopySkillOperation executor

## MODIFIED Requirements

### Requirement: Fork builds three sequential operations

The fork command SHALL build a plan with three sequential operations: copy, publish, install.

#### Scenario: Single skill fork plan

- **WHEN** forking a single skill
- **THEN** the plan contains: `CopySkillOperation` then `PublishSkillOperation` then `InstallSkillOperation`

#### Scenario: Operations execute sequentially

- **WHEN** the plan is executed
- **THEN** copy completes before publish, publish completes before install (concurrency: 1)

#### Scenario: Install operation uses registry source

- **WHEN** the `InstallSkillOperation` is constructed for a forked skill
- **THEN** its `source` SHALL be `{ source: "registry" }`
- **AND** its `location` SHALL point to the registry extension path
- **AND** `force` SHALL be `true`

#### Scenario: Settings updated after fork

- **WHEN** the fork plan completes successfully
- **THEN** the forked skill SHALL appear in `settings.json` under `skills`
- **AND** the settings entry SHALL use the registry source string

#### Scenario: No manual post-plan bookkeeping

- **WHEN** the fork plan completes
- **THEN** lockfile updates, settings updates, and agent symlink creation SHALL be handled entirely by the `install-skill` operation
- **AND** the fork handler SHALL NOT perform these steps outside the plan

### Requirement: CopySkillOperation executor

The `copy-skill` executor SHALL copy source files to `.axm/extensions/` and generate an `axm-skill.json` manifest.

#### Scenario: Files written to managed location

- **WHEN** forking skill `code-review` to `@acme/code-review`
- **THEN** files are copied to `.axm/extensions/@acme/skills/code-review/`

#### Scenario: Manifest generated without agents

- **WHEN** forking a skill
- **THEN** `axm-skill.json` is created with `name: "@scope/name"`, `version: "0.1.0"`, and empty `dependencies`
- **AND** the `agents` property SHALL NOT be present in the manifest

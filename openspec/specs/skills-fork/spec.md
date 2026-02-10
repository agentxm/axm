# skills-fork Specification

## Purpose

Forks installed skills into managed extensions with scope resolution, uniqueness checking, and a three-operation plan (fork, publish, install).

## Requirements

### Requirement: Fork command input

`skills fork` SHALL accept a skill reference as input: an installed skill name, a source string, or a glob pattern.

#### Scenario: Fork by installed skill name

- **WHEN** `skills fork frontend-design` is called and `frontend-design` is in the lockfile
- **THEN** the skill's files are read from the current canonical location

#### Scenario: Fork by source string

- **WHEN** `skills fork github:owner/repo` is called
- **THEN** the source is resolved using the same discovery pipeline as `skills install`

#### Scenario: Fork by glob pattern

- **WHEN** `skills fork "effect-*"` is called
- **THEN** installed skills matching the glob are identified and a plan with fork operations for each match is built

### Requirement: Scope resolution

The fork command SHALL determine the default scope for the forked extension using a resolution chain (highest priority wins):

1. Project settings `scope` field
2. Global settings `scope` field
3. Prompt user (persisted to project settings)

#### Scenario: Scope from project settings

- **WHEN** project settings has `scope: "@acme"`
- **THEN** the default scope is `@acme` (no prompt)

#### Scenario: Scope from global settings

- **WHEN** project settings has no scope but global settings has `scope: "@myorg"`
- **THEN** the default scope is `@myorg` (no prompt)

#### Scenario: Scope prompted and persisted

- **WHEN** no scope is configured anywhere and the session is interactive
- **THEN** the user is prompted for a scope, and the provided value is persisted to project settings

### Requirement: Uniqueness check

The fork command SHALL verify that `@scope/name` does not collide with an existing extension in configured registries.

#### Scenario: Name available

- **WHEN** `checkNameExists` returns false for `@acme/code-review`
- **THEN** forking proceeds with that name

#### Scenario: Name collision

- **WHEN** `checkNameExists` returns true for `@acme/code-review`
- **THEN** the user is prompted for an alternate name

### Requirement: Fork builds three sequential operations

The fork command SHALL build a plan with three sequential operations: fork, publish, install.

#### Scenario: Single skill fork plan

- **WHEN** forking a single skill
- **THEN** the plan contains: `ForkSkillOperation` then `PublishSkillOperation` then `InstallSkillOperation`

#### Scenario: Operations execute sequentially

- **WHEN** the plan is executed
- **THEN** fork completes before publish, publish completes before install (concurrency: 1)

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

### Requirement: ForkSkillOperation executor

The `fork-skill` executor SHALL copy source files to `.axm/extensions/` under the `src/` subdirectory and generate an `axm-skill.json` manifest at the extension root.

#### Scenario: Skill content written to src subdirectory

- **WHEN** forking skill `code-review` to `@acme/code-review`
- **THEN** skill content files are copied to `.axm/extensions/@acme/skills/code-review/src/`

#### Scenario: Manifest generated at extension root

- **WHEN** forking a skill
- **THEN** `axm-skill.json` is created at `.axm/extensions/@acme/skills/code-review/axm-skill.json` with `name: "@scope/name"`, `version: "0.1.0"`, `agents` from workspace settings, and empty `dependencies`

#### Scenario: Manifest not inside src

- **WHEN** forking a skill
- **THEN** `axm-skill.json` SHALL NOT exist inside the `src/` subdirectory

### Requirement: Glob-based batch forking

When the input is a glob pattern, the handler SHALL match against installed skill names and build a plan for all matches.

#### Scenario: Multiple matches

- **WHEN** `skills fork "effect-*"` is called and skills `effect-basics`, `effect-testing`, `effect-errors` are installed
- **THEN** the plan contains fork operations for all three skills

#### Scenario: Full plan displayed for confirmation

- **WHEN** a glob matches multiple skills
- **THEN** the full plan (all matched skills) is displayed for user confirmation before execution

#### Scenario: No matches

- **WHEN** `skills fork "nonexistent-*"` is called and no installed skills match
- **THEN** the command reports no matching skills and exits

### Requirement: Registry guard precondition

`skills fork` SHALL call the registry guard before proceeding.

#### Scenario: No registry configured

- **WHEN** `skills fork` is called and no registry sources exist
- **THEN** the registry guard is invoked before any fork logic runs

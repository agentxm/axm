# skills-fork Specification

## Purpose

Forks installed skills into managed extensions with namespace resolution, uniqueness checking, and a three-operation plan (fork, publish, install).

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
- **THEN** local skills matching the glob are identified from the combined candidate set
- **AND** a plan with fork operations for each match is built

### Requirement: Namespace resolution

The fork command SHALL determine the default namespace for the forked extension using a resolution chain (highest priority wins):

1. Project settings `namespace` field
2. User-scope settings `namespace` field
3. Prompt user (persisted to project settings)

#### Scenario: Namespace from project settings

- **WHEN** project settings has `namespace: "@acme"`
- **THEN** the default namespace is `@acme` (no prompt)

#### Scenario: Namespace from user-scope settings

- **WHEN** project settings has no namespace but user-scope settings has `namespace: "@myorg"`
- **THEN** the default namespace is `@myorg` (no prompt)

#### Scenario: Namespace prompted and persisted

- **WHEN** no namespace is configured anywhere and the session is interactive
- **THEN** the user is prompted for a namespace, and the provided value is persisted to project settings

### Requirement: Uniqueness check

The fork command SHALL verify that `@namespace/name` does not collide with an existing extension in configured registries.

#### Scenario: Name available

- **WHEN** `checkNameExists` returns false for `@acme/code-review`
- **THEN** forking proceeds with that name

#### Scenario: Name collision

- **WHEN** `checkNameExists` returns true for `@acme/code-review`
- **THEN** the user is prompted for an alternate name

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
- **THEN** `axm-skill.json` is created with `name: "@namespace/name"`, `version: "0.1.0"`, and empty `dependencies`
- **AND** the `agents` property SHALL NOT be present in the manifest

### Requirement: Glob-based batch forking

When the input is a glob pattern, the handler SHALL match against a combined local candidate set and build a plan for all matches. The candidate set SHALL include:

- installed skill names from lockfile
- configured skill names from settings (including unmanaged entries)
- unmanaged skill names discovered on disk under configured agent skill directories

#### Scenario: Multiple matches across sources

- **WHEN** `skills fork "effect-*"` is called
- **AND** lockfile contains `effect-basics`
- **AND** settings contains unmanaged `effect-errors`
- **AND** an unmanaged on-disk skill `effect-streams` exists in a configured agent skills directory
- **THEN** the command SHALL match all three names
- **AND** the plan contains fork operations for all matched skills

#### Scenario: Dedupe across discovery sources

- **WHEN** `skills fork "effect-*"` is called
- **AND** `effect-basics` exists in both lockfile and settings candidate sources
- **THEN** `effect-basics` SHALL appear only once in the matched skill set
- **AND** the fork plan SHALL include a single fork sequence for `effect-basics`

#### Scenario: Full plan displayed for confirmation

- **WHEN** a glob matches multiple skills
- **THEN** the full plan (all matched skills) is displayed for user confirmation before execution

#### Scenario: No matches

- **WHEN** `skills fork "nonexistent-*"` is called and no local candidates match
- **THEN** the command reports no matching skills and exits
- **AND** the error output SHALL include available names from the combined local candidate set

### Requirement: Registry guard precondition

`skills fork` SHALL call the registry guard before proceeding.

#### Scenario: No registry configured

- **WHEN** `skills fork` is called and no registry sources exist
- **THEN** the registry guard is invoked before any fork logic runs

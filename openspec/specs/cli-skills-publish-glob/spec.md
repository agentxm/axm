# cli-skills-publish-glob Specification

## Purpose

Glob pattern support for the `skills publish` command, expanding patterns against managed extensions and building multi-skill publish plans.

## Requirements

### Requirement: Expand glob patterns against installed skill names

When any positional argument contains `*`, the publish handler SHALL expand it against installed (managed) skill names from `Workspace.getInstalledSkills()` using `expandGlobs`. Non-glob arguments SHALL be passed through as literal names.

#### Scenario: Glob matches multiple managed skills

- **WHEN** `axm skills publish "effect-*"` is called
- **AND** installed managed skills are `["effect-basics", "effect-stream", "effect-testing", "commit"]`
- **THEN** the plan SHALL contain `PublishSkillOperation` steps for `effect-basics`, `effect-stream`, and `effect-testing`

#### Scenario: Literal name passes through without expansion

- **WHEN** `axm skills publish commit` is called
- **THEN** the handler SHALL resolve `commit` to its FQN and build a single `PublishSkillOperation`
- **AND** no glob expansion SHALL occur

#### Scenario: Mix of glob and literal patterns

- **WHEN** `axm skills publish "effect-*" commit` is called
- **AND** installed managed skills are `["effect-basics", "effect-stream", "commit"]`
- **THEN** the plan SHALL contain steps for `effect-basics`, `effect-stream`, and `commit` (deduplicated)

#### Scenario: Glob matches zero skills

- **WHEN** `axm skills publish "foo-*"` is called
- **AND** no installed skill names match `foo-*`
- **THEN** the handler SHALL warn `No skills matched pattern "foo-*"`
- **AND** exit cleanly without error

### Requirement: Accept multiple positional arguments

The `skills publish` command SHALL accept one or more positional arguments. Each argument SHALL be either a bare skill name, a glob pattern, or a fully qualified name.

#### Scenario: Multiple positional arguments

- **WHEN** `axm skills publish "effect-*" commit "testing-*"` is called
- **THEN** all patterns SHALL be expanded and deduplicated
- **AND** a single plan SHALL be built containing all matched skills

#### Scenario: Single positional argument (backward compatible)

- **WHEN** `axm skills publish code-review` is called
- **THEN** behavior SHALL be identical to current single-extension publish

### Requirement: Scope resolution for bare names and glob matches

Each matched bare name SHALL be resolved to an FQN using the project scope from settings, identical to current behavior. FQN inputs (starting with `@`) SHALL be passed through without scope resolution.

#### Scenario: Bare glob matches resolved with scope

- **WHEN** `axm skills publish "effect-*"` is called
- **AND** project scope is `@acme`
- **AND** `effect-basics` and `effect-stream` match
- **THEN** the plan SHALL use FQNs `@acme/skills/effect-basics` and `@acme/skills/effect-stream`

#### Scenario: FQN input bypasses glob expansion

- **WHEN** `axm skills publish @acme/skills/code-review` is called
- **THEN** no glob expansion SHALL occur
- **AND** the FQN SHALL be used directly

### Requirement: Multi-skill publish plan

When multiple skills are resolved, the handler SHALL build a single plan with one `PublishSkillOperation` per skill. The plan SHALL be displayed for confirmation before execution.

#### Scenario: Plan shows all skills to publish

- **WHEN** 3 skills match the input patterns
- **THEN** the plan SHALL contain 3 `PublishSkillOperation` steps
- **AND** the plan description SHALL indicate the count (e.g., "Publish 3 skills to registry \"local\"")

#### Scenario: Plan respects --preview flag

- **WHEN** `--preview` is passed with a glob pattern
- **THEN** the plan SHALL be displayed without execution

### Requirement: Only managed skills are publishable via glob

Glob expansion SHALL only match against managed (installed) skills. Unmanaged skills SHALL NOT appear in glob expansion results.

#### Scenario: Unmanaged skill excluded from glob match

- **WHEN** `axm skills publish "*"` is called
- **AND** installed skills include managed `effect-basics` and unmanaged `local-tool`
- **THEN** only `effect-basics` SHALL be included in the plan

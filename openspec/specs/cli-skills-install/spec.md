## ADDED Requirements

### Requirement: Workspace-scoped agent installation

`axm skills install` SHALL install skills to all agents configured in the workspace. There SHALL be no `--agent` flag for per-agent targeting. The set of agents is determined by the workspace's configured agent list at install time.

#### Scenario: Skill installed to all configured agents without flag

- **WHEN** user runs `axm skills install code-review`
- **AND** the workspace has configured agents `["claude", "cursor"]`
- **THEN** the skill SHALL be installed with agent symlinks for both `claude` and `cursor`
- **AND** no `--agent` flag SHALL be accepted

#### Scenario: Agent flag is rejected

- **WHEN** user runs `axm skills install code-review --agent claude`
- **THEN** the command SHALL reject the `--agent` flag as unrecognized

### Requirement: Discovery-only inspection uses preview

Discovery-only inspection of available skills SHALL use `--preview` instead of `--list`. The `--list` flag SHALL NOT be accepted.

#### Scenario: Preview shows plan without applying

- **WHEN** user runs `axm skills install @acme/skills --preview`
- **THEN** the install plan SHALL be displayed without applying
- **AND** no skills SHALL be installed

#### Scenario: List flag is rejected

- **WHEN** user runs `axm skills install @acme/skills --list`
- **THEN** the command SHALL reject the `--list` flag as unrecognized

### Requirement: Idempotent skill install

Installing a skill that is already installed SHALL be a safe no-op that produces a success result. The operation SHALL re-apply idempotently without adverse effects. There SHALL be no `skip` state in the plan.

#### Scenario: Re-installing already installed skill succeeds

- **WHEN** user runs `axm skills install code-review`
- **AND** `code-review` is already installed
- **THEN** the install operation SHALL complete with a success result
- **AND** the skill state SHALL remain consistent

### Requirement: Source input forms

`axm skills install` SHALL accept registry skill names in the fully qualified form `@owner/skills/name`, optionally with a `@<version>` suffix, bare skill names resolved through the default owner, local filesystem paths, `file://` URLs, and explicit git-hosted sources such as `github:owner/repo` or `git:https://example.com/repo.git`.

#### Scenario: Fully qualified registry skill name

- **WHEN** user runs `axm skills install @acme/skills/code-review`
- **THEN** the command SHALL install the `code-review` skill from the `@acme` owner

#### Scenario: Fully qualified registry skill with version constraint

- **WHEN** user runs `axm skills install @acme/skills/code-review@^1.2.0`
- **THEN** the command SHALL install the newest available version satisfying `^1.2.0`

#### Scenario: Local path source

- **WHEN** user runs `axm skills install ./skills/code-review`
- **THEN** the command SHALL install from the local filesystem path

#### Scenario: File URL source

- **WHEN** user runs `axm skills install file:///Users/dev/skills/code-review`
- **THEN** the command SHALL treat the input as a local filesystem source

### Requirement: Bare-name lookup uses default owner

When the user provides a bare skill name, install SHALL resolve it under the default owner. Project settings SHALL take precedence over user settings when both define a default owner.

#### Scenario: Bare name resolved from project default owner

- **WHEN** user runs `axm skills install code-review`
- **AND** project settings define default owner `@acme`
- **THEN** the command SHALL resolve the request as `@acme/skills/code-review`

#### Scenario: Bare name resolved from user default owner

- **WHEN** user runs `axm skills install code-review`
- **AND** project settings do not define an owner
- **AND** user settings define default owner `@acme`
- **THEN** the command SHALL resolve the request as `@acme/skills/code-review`

#### Scenario: Bare name without any default owner fails

- **WHEN** user runs `axm skills install code-review`
- **AND** neither project nor user settings define a default owner
- **THEN** the command SHALL fail with guidance to configure an owner or use a fully qualified name

### Requirement: Registry source selection

When resolving a registry install, owner-matched registry sources SHALL be preferred over catch-all sources. Project source definitions with the same name SHALL override user-scope definitions. A built-in default registry SHALL be available when no override is present.

#### Scenario: Profile-matched registry source used first

- **WHEN** `@corp/skills/code-review` can be resolved by a registry source configured for `@corp`
- **THEN** install SHALL use the owner-matched registry source before any catch-all registry sources

#### Scenario: Project registry source overrides user source of the same name

- **WHEN** project settings and user settings both define a registry source with the same name
- **THEN** install SHALL use the project-scoped definition

### Requirement: Registry version constraints

Registry installs SHALL accept valid semver ranges. Omitting the version SHALL mean "install the latest available version". Invalid version constraints SHALL fail before installation begins.

#### Scenario: Exact pin accepted

- **WHEN** user runs `axm skills install @acme/skills/code-review@1.2.3`
- **THEN** the command SHALL install exactly version `1.2.3`

#### Scenario: Caret range accepted

- **WHEN** user runs `axm skills install @acme/skills/code-review@^1.0.0`
- **THEN** the command SHALL install the newest version satisfying `^1.0.0`

#### Scenario: Invalid range rejected

- **WHEN** user runs `axm skills install @acme/skills/code-review@not-a-version`
- **THEN** the command SHALL fail with an error indicating the version constraint is invalid

### Requirement: Positional glob expansion

When a positional install argument contains `*`, the command SHALL expand it against locally known skill names, including already installed skills and unmanaged discovered skills. Ignored names SHALL be excluded from the candidate set.

#### Scenario: Glob expands across installed and unmanaged candidates

- **WHEN** user runs `axm skills install "effect-*"`
- **AND** installed skills include `effect-basics`
- **AND** unmanaged discovered skills include `effect-stream`
- **THEN** the command SHALL expand the input to `effect-basics` and `effect-stream`

#### Scenario: Ignored names excluded from glob expansion

- **WHEN** user runs `axm skills install "effect-*"`
- **AND** `effect-errors` matches ignored patterns
- **THEN** `effect-errors` SHALL be excluded from expansion

#### Scenario: Non-glob input is not expanded

- **WHEN** user runs `axm skills install code-review`
- **THEN** the input SHALL be resolved directly without glob expansion

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

## ADDED Requirements

### Requirement: List command displays installed skills

The CLI SHALL provide a `skills list` command (alias `ls`) that displays all
installed skills from the lockfile.

#### Scenario: Skills are installed

- **WHEN** the user runs `axm skills list`
- **THEN** the CLI displays each installed skill with its name, source type, and
  agent list
- **AND** exits with code 0

#### Scenario: No skills installed

- **WHEN** the user runs `axm skills list` and the lockfile has no skill entries
- **THEN** the CLI displays a message indicating no skills are installed
- **AND** exits with code 0

#### Scenario: Lockfile does not exist

- **WHEN** the user runs `axm skills list` and no lockfile exists
- **THEN** the CLI displays a message indicating no skills are installed
- **AND** exits with code 0

### Requirement: Global scope flag

The list command SHALL support a `--global` flag to read from the global lockfile
instead of the project lockfile.

#### Scenario: List global skills

- **WHEN** the user runs `axm skills list --global`
- **THEN** the CLI reads from the global `~/.axm/axm-lock.yaml`
- **AND** displays globally installed skills

#### Scenario: Default to project scope

- **WHEN** the user runs `axm skills list` without `--global`
- **THEN** the CLI reads from the project `.axm/axm-lock.yaml`

### Requirement: Agent filter flag

The list command SHALL support an `--agent` flag that can be passed multiple times
to filter skills by agent.

#### Scenario: Filter by single agent

- **WHEN** the user runs `axm skills list --agent claude-code`
- **THEN** the CLI displays only skills whose `agents` array includes `claude-code`

#### Scenario: Filter by multiple agents

- **WHEN** the user runs `axm skills list --agent claude-code --agent cursor`
- **THEN** the CLI displays skills whose `agents` array includes `claude-code` OR
  `cursor`

#### Scenario: No skills match agent filter

- **WHEN** the user runs `axm skills list --agent nonexistent`
- **AND** no installed skills have that agent
- **THEN** the CLI displays a message indicating no skills match the filter
- **AND** exits with code 0

### Requirement: Command alias

The list command SHALL be aliased as `ls`.

#### Scenario: Alias invocation

- **WHEN** the user runs `axm skills ls`
- **THEN** the behavior is identical to `axm skills list`

#### Scenario: Alias with flags

- **WHEN** the user runs `axm skills ls --global --agent claude-code`
- **THEN** the behavior is identical to `axm skills list --global --agent claude-code`

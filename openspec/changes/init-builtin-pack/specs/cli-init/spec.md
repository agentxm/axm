## MODIFIED Requirements

### Requirement: Init Command

The CLI SHALL provide an `init` command that creates WorkspaceContext to trigger initialization.

#### Scenario: First-time project initialization

- **WHEN** the user runs `axm init` in a directory without `.axm/`
- **THEN** the CLI SHALL detect agents by checking both project-level directories (first segment of each agent's `skills.dir` in cwd) and global directories (`~/.{agent-id}` in home)
- **AND** SHALL present a multiselect of all registered agents with detected agents pre-selected
- **AND** SHALL write selected agents to `.axm/settings.json`
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace
- **AND** SHALL record the builtin pack and its skills in the lockfile

#### Scenario: First-time global initialization

- **WHEN** the user runs `axm init --global` without `~/.axm/`
- **THEN** the CLI creates WorkspaceContext layer which creates empty settings and lockfile
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace

#### Scenario: Already initialized

- **WHEN** the user runs `axm init` and `.axm/settings.json` exists
- **THEN** the CLI displays a message that the project is already initialized

#### Scenario: Non-interactive initialization

- **WHEN** the user runs `axm init --yes`
- **THEN** the CLI SHALL auto-select all detected agents (project-level + global) without prompting
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace

#### Scenario: No agents detected

- **WHEN** the user runs `axm init` in a directory without agent config directories and no matching global directories
- **THEN** the CLI SHALL present a multiselect of all registered agents with none pre-selected
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace after agent selection

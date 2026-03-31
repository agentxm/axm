# cli-init Specification

## Purpose

The `axm init` command initializes axm in a project or user scope.

## Requirements

### Requirement: Init Command

The CLI SHALL provide an `init` command that initializes axm state for the selected scope.

#### Scenario: First-time project initialization

- **WHEN** the user runs `axm init` in a directory without `.axm/`
- **THEN** the CLI SHALL detect agents by checking both project-level directories (first segment of each agent's `skills.dir` in cwd) and user-level directories (`~/.{agent-id}` in home)
- **AND** SHALL present a multiselect of all registered agents with detected agents pre-selected
- **AND** SHALL write selected agents to `.axm/settings.json`
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace
- **AND** SHALL record the builtin pack and its skills in the lockfile
- **AND** SHALL display a notice informing the user that anonymous telemetry is enabled
- **AND** the notice SHALL mention how to disable telemetry (`AXM_TELEMETRY=0` or setting `"telemetry": false` in settings)

#### Scenario: First-time user-scope initialization

- **WHEN** the user runs `axm init --scope user` without `~/.axm/`
- **THEN** the CLI SHALL create user-scope axm settings and lockfile state
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace
- **AND** SHALL display the telemetry notice

#### Scenario: Already initialized

- **WHEN** the user runs `axm init` and `.axm/settings.json` exists
- **THEN** the CLI displays a message that the project is already initialized

#### Scenario: Non-interactive initialization

- **WHEN** the user runs `axm init --yes`
- **THEN** the CLI SHALL auto-select all detected agents (project-level + user-level) without prompting
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace
- **AND** SHALL display the telemetry notice

#### Scenario: No agents detected

- **WHEN** the user runs `axm init` in a directory without agent config directories and no matching user-level directories
- **THEN** the CLI SHALL present a multiselect of all registered agents with none pre-selected
- **AND** SHALL materialize the `@axm/cli` builtin pack skills into the workspace after agent selection
- **AND** SHALL display the telemetry notice

#### Scenario: Telemetry notice not shown when telemetry is disabled

- **WHEN** the user runs `axm init` with `DO_NOT_TRACK=1` or `AXM_TELEMETRY=0` set
- **THEN** the CLI SHALL NOT display the telemetry notice

#### Scenario: Telemetry notice content

- **WHEN** the telemetry notice is displayed during init
- **THEN** the notice SHALL state that anonymous telemetry is enabled to help improve axm
- **AND** SHALL mention `AXM_TELEMETRY=0` or `"telemetry": false` in settings to disable

### Requirement: Init Command Flags

The CLI SHALL support flags for controlling initialization behavior.

#### Scenario: Scope flag

- **WHEN** the user runs `axm init --scope user`
- **THEN** axm SHALL initialize the user scope instead of the current project

#### Scenario: Yes flag

- **WHEN** the user runs `axm init --yes`
- **THEN** confirmation prompts SHALL be skipped

#### Scenario: Non-interactive flag

- **WHEN** the user runs `axm init --non-interactive`
- **THEN** the command SHALL not prompt
- **AND** SHALL use defaults or explicit flags for required choices

#### Scenario: Agent flag

- **WHEN** the user runs `axm init --agent claude-code cursor`
- **THEN** only the specified agents SHALL be configured
- **AND** agent auto-detection and agent prompts SHALL be skipped

### Requirement: Agent Detection

The system SHALL detect installed agents by checking two locations per agent.

#### Scenario: Project-level detection

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL check if the first path segment of each agent's `skills.dir` exists as a directory in cwd
- **AND** SHALL mark matching agents as detected

#### Scenario: User-level detection

- **WHEN** detecting agents for a project directory
- **THEN** the system SHALL also check if `~/.{agent-id}` exists as a directory in the user's home
- **AND** SHALL mark matching agents as detected

#### Scenario: Combined detection

- **WHEN** an agent matches either project-level or user-level detection
- **THEN** the agent SHALL be considered detected (logical OR)

#### Scenario: Shared skills directory

- **WHEN** multiple agents share the same `skills.dir` (e.g., `.agents/skills/`)
- **AND** the shared directory exists in the project
- **THEN** all agents sharing that directory SHALL be detected

#### Scenario: Concurrent detection

- **WHEN** detecting agents across all registered agents
- **THEN** the system SHALL run detection checks concurrently

# cli-init Delta Specification

## MODIFIED Requirements

### Requirement: Init Command

The CLI SHALL provide an `init` command that creates WorkspaceContext to trigger initialization.

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
- **THEN** the CLI creates WorkspaceContext layer which creates empty settings and lockfile
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

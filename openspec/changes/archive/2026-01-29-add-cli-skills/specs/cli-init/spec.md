## ADDED Requirements

### Requirement: Init Command

The CLI SHALL provide an `init` command for initializing axm in a project or globally.

#### Scenario: First-time project initialization

- **WHEN** the user runs `axm init` in a directory without `.axm/`
- **THEN** the CLI detects installed agents, prompts for agent selection, and creates `.axm/settings.json`

#### Scenario: First-time global initialization

- **WHEN** the user runs `axm init --global` without `~/.axm/`
- **THEN** the CLI detects installed agents, prompts for agent selection, and creates `~/.axm/settings.json`

#### Scenario: Already initialized

- **WHEN** the user runs `axm init` and `.axm/settings.json` exists
- **THEN** the CLI displays a message that the project is already initialized

#### Scenario: Non-interactive initialization

- **WHEN** the user runs `axm init --yes`
- **THEN** the CLI uses all detected agents without prompting

### Requirement: Agent Detection

The CLI SHALL detect installed AI coding agents during initialization.

#### Scenario: Multiple agents detected

- **WHEN** multiple agents are detected (Claude Code, Cursor, etc.)
- **THEN** the CLI displays the detected agents and prompts for selection

#### Scenario: No agents detected

- **WHEN** no agents are detected
- **THEN** the CLI displays all supported agents and prompts for selection with a warning

#### Scenario: Single agent detected

- **WHEN** exactly one agent is detected
- **THEN** the CLI pre-selects that agent and asks for confirmation

### Requirement: Settings File Creation

The CLI SHALL create a properly formatted settings file during initialization.

#### Scenario: Settings file structure

- **WHEN** initialization completes
- **THEN** `.axm/settings.json` contains `version`, `agents` array, and empty `skills` object

#### Scenario: Settings file format

- **WHEN** viewing the created settings file
- **THEN** it is valid JSON with version 1 schema

Unit tests SHALL verify:

- Settings JSON structure matches schema
- Agent list is correctly populated
- File is created in correct location (project or global)

### Requirement: Implicit Initialization

The CLI SHALL support implicit initialization when running commands that require it.

#### Scenario: Add command triggers init

- **WHEN** the user runs `axm skills add <source>` in an uninitialized project
- **THEN** the CLI runs the init flow first, then continues with the add flow

#### Scenario: Add with --yes skips init prompts

- **WHEN** the user runs `axm skills add <source> --yes` in an uninitialized project
- **THEN** the CLI initializes with all detected agents without prompting

#### Scenario: Init state is checked efficiently

- **WHEN** checking if initialization is needed
- **THEN** the CLI checks for `.axm/settings.json` existence (not content parsing)

### Requirement: Init Command Flags

The CLI SHALL support flags for controlling initialization behavior.

#### Scenario: Global flag

- **WHEN** the user runs `axm init --global`
- **THEN** initialization targets `~/.axm/` instead of `./.axm/`

#### Scenario: Yes flag

- **WHEN** the user runs `axm init --yes`
- **THEN** the CLI skips all prompts and uses detected agents

#### Scenario: Agent flag

- **WHEN** the user runs `axm init --agent claude-code cursor`
- **THEN** the CLI initializes with the specified agents without detection or prompting

### Requirement: Reusable Init Logic

The init logic SHALL be abstracted for reuse by other commands.

#### Scenario: Init as Effect service

- **WHEN** implementing the init functionality
- **THEN** it is exposed as an Effect service that can be composed with other commands

#### Scenario: ensureInitialized helper

- **WHEN** a command requires initialization
- **THEN** it can call `ensureInitialized()` which either returns existing settings or runs the init flow

Unit tests SHALL verify:

- `ensureInitialized()` returns existing settings when initialized
- `ensureInitialized()` runs init flow when not initialized
- Init flow can be called with options (agents, global, yes)

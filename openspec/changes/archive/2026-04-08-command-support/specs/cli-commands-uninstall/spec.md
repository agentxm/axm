## ADDED Requirements

### Requirement: Uninstall removes rendered files and state

`axm commands uninstall` SHALL remove the rendered command files from all agents listed in the lockfile `agents` array, remove the settings entry, remove the lockfile entry, and remove materialized files from `.axm/extensions/`.

#### Scenario: Full uninstall flow

- **WHEN** user runs `axm commands uninstall review`
- **AND** the lockfile lists `agents: ["claude-code", "cursor"]`
- **THEN** the CLI SHALL remove the rendered file from `.claude/commands/review.md`
- **AND** SHALL remove the rendered file from `.cursor/commands/review.md`
- **AND** SHALL remove the `review` entry from `settings.json`
- **AND** SHALL remove the `review` entry from the lockfile
- **AND** SHALL remove materialized files from `.axm/extensions/`

#### Scenario: Partial cleanup on missing rendered file

- **WHEN** user runs `axm commands uninstall review`
- **AND** the rendered file for one agent has already been manually deleted
- **THEN** the CLI SHALL continue uninstalling from remaining agents without error

### Requirement: Confirmation prompt

`axm commands uninstall` SHALL prompt for confirmation before removing a command. The `--yes` flag SHALL skip the confirmation.

#### Scenario: Confirmation required

- **WHEN** user runs `axm commands uninstall review`
- **THEN** the CLI SHALL prompt for confirmation showing the command name and affected agents

#### Scenario: Yes flag skips confirmation

- **WHEN** user runs `axm commands uninstall review --yes`
- **THEN** the CLI SHALL proceed without prompting

#### Scenario: Non-interactive without yes fails

- **WHEN** user runs `axm commands uninstall review --non-interactive`
- **AND** `--yes` is not provided
- **THEN** the CLI SHALL fail with an error indicating confirmation is required

### Requirement: Unknown command errors

Uninstalling a command that is not installed SHALL fail with a clear error.

#### Scenario: Command not found

- **WHEN** user runs `axm commands uninstall unknown-cmd`
- **AND** `unknown-cmd` is not in settings or lockfile
- **THEN** the CLI SHALL fail with an error indicating the command is not installed

### Requirement: Scope flag

`axm commands uninstall` SHALL accept `--scope` to target the correct scope's settings and lockfile. Default SHALL be project scope.

#### Scenario: User scope uninstall

- **WHEN** user runs `axm commands uninstall review --scope user`
- **THEN** the CLI SHALL remove the command from user-scope settings, lockfile, and user-level agent directories

## Purpose

The CLI provides the primary user interface for the axm tool.

## Requirements

### Startup Message

The CLI SHALL display "AgentXM CLI ready" when invoked.

#### Scenario: CLI startup

- **WHEN** the user runs the `axm` command
- **THEN** the message "AgentXM CLI ready" is displayed to the console

### Requirement: Extensions Sub-command

The CLI SHALL provide an `extensions` sub-command for managing extensions.

#### Scenario: Extensions command invoked without sub-command

- **WHEN** the user runs `axm extensions`
- **THEN** the CLI displays available extensions sub-commands or a placeholder message

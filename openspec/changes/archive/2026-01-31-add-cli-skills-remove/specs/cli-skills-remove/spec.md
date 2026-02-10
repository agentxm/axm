## ADDED Requirements

### Requirement: Remove Command Basic Invocation

The CLI SHALL provide a `remove` sub-command under `skills` that displays a greeting message.

#### Scenario: Remove command invoked

- **WHEN** the user runs `axm skills remove`
- **THEN** the CLI prints "Hello Alex" to the console
- **AND** exits with code 0

#### Scenario: Remove command displays help

- **WHEN** the user runs `axm skills remove --help`
- **THEN** the CLI displays help for the remove command

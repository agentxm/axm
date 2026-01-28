## ADDED Requirements

### Requirement: Skills Sub-command

The CLI SHALL provide a `skills` sub-command for managing agent skills.

#### Scenario: Skills command invoked without sub-command

- **WHEN** the user runs `axm skills`
- **THEN** the CLI displays available skills sub-commands and usage examples

#### Scenario: Skills command displays help

- **WHEN** the user runs `axm skills --help`
- **THEN** the CLI displays detailed help for the skills command including all sub-commands and their options

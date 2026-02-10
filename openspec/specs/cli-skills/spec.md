# cli-skills Specification

## Purpose

TBD - created by archiving change add-cli-skills. Update Purpose after archive.

## Requirements

### Requirement: Skills Sub-command

The CLI SHALL provide a `skills` sub-command for managing agent skills.

#### Scenario: Skills command invoked without sub-command

- **WHEN** the user runs `axm skills`
- **THEN** the CLI displays available skills sub-commands, examples, and usage
  information
- **AND** exits with code 0

_Note: Changed from displaying "sub-commands or error" to explicitly requiring
help display and exit 0, per CLI design guidelines._

#### Scenario: Skills command displays help

- **WHEN** the user runs `axm skills --help`
- **THEN** the CLI displays detailed help for the skills command including all
  sub-commands and their options

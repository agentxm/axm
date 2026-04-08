# cli-commands-new Specification

## Purpose

The `axm commands new` command scaffolds a new command package with `command.json` and `COMMAND.md`.

## Requirements

### Requirement: Scaffold command package

`axm commands new` SHALL create a new command package directory containing `command.json` and `COMMAND.md` in the current directory.

#### Scenario: Interactive scaffolding

- **WHEN** user runs `axm commands new`
- **THEN** the CLI SHALL prompt for a command name and description
- **AND** SHALL create a directory with the command name
- **AND** SHALL write `command.json` with the provided metadata and `type: "command"`
- **AND** SHALL write `COMMAND.md` with a placeholder prompt body

#### Scenario: Name provided as argument

- **WHEN** user runs `axm commands new review`
- **THEN** the CLI SHALL skip the name prompt
- **AND** SHALL prompt for description only

#### Scenario: Directory already exists

- **WHEN** user runs `axm commands new review`
- **AND** a `review/` directory already exists
- **THEN** the CLI SHALL fail with an error indicating the directory already exists

### Requirement: Non-interactive mode

`axm commands new --non-interactive` SHALL scaffold with the provided name argument and sensible defaults for all other fields.

#### Scenario: Non-interactive with name

- **WHEN** user runs `axm commands new review --non-interactive`
- **THEN** the CLI SHALL create the package without prompting
- **AND** SHALL use an empty description

#### Scenario: Non-interactive without name

- **WHEN** user runs `axm commands new --non-interactive`
- **THEN** the CLI SHALL fail with an error indicating a name is required in non-interactive mode

### Requirement: Generated manifest structure

The generated `command.json` SHALL contain `name`, `version: "0.1.0"`, `description`, and `type: "command"`. No command-specific fields (arguments, model, etc.) SHALL be included in the scaffold — authors add these as needed.

#### Scenario: Minimal manifest generated

- **WHEN** user runs `axm commands new review` with description "Code review command"
- **THEN** `command.json` SHALL contain `name: "review"`, `version: "0.1.0"`, `description: "Code review command"`, `type: "command"`
- **AND** SHALL NOT contain `arguments`, `model`, `allowedTools`, or other command-specific fields

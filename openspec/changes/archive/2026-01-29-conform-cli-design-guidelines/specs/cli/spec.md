## REMOVED Requirements

### ~~Startup Message~~

_Removed: The CLI no longer outputs "AgentXM CLI ready" when invoked._

### ~~Requirement: Extensions Sub-command~~

_Removed: The `extensions` command has been replaced by `skills`._

## MODIFIED Requirements

### Requirement: Root Command Behavior

The CLI SHALL display help and exit cleanly when invoked without arguments.

#### Scenario: CLI invoked without arguments

- **WHEN** the user runs `axm` without any arguments
- **THEN** the CLI displays available commands, examples, and usage information
- **AND** exits with code 0

#### Scenario: CLI displays available commands

- **WHEN** the user runs `axm`
- **THEN** the output includes the `init` and `skills` commands with descriptions

#### Scenario: CLI displays examples

- **WHEN** the user runs `axm`
- **THEN** the output includes 1-2 example invocations

#### Scenario: CLI help flag

- **WHEN** the user runs `axm --help`
- **THEN** the CLI displays the same help information as running `axm` alone

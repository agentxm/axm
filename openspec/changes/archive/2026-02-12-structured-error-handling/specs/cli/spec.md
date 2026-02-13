## MODIFIED Requirements

### Requirement: Error Message Format

The CLI SHALL provide actionable error messages with recovery guidance. All errors reaching the runtime boundary SHALL be either `CliError` (expected errors) or `PromptCancelled` (user cancellation). Any other error reaching the boundary SHALL be treated as a defect.

#### Scenario: Expected error exits with code 1

- **WHEN** a `CliError` reaches the runtime boundary
- **THEN** the CLI SHALL render it using `renderCliError`
- **AND** exit with code 1

#### Scenario: User cancellation exits cleanly

- **WHEN** a `PromptCancelled` reaches the runtime boundary
- **THEN** the CLI SHALL exit with code 0
- **AND** SHALL NOT print an error message

#### Scenario: Defect exits with code 2

- **WHEN** an unhandled error (not `CliError` or `PromptCancelled`) reaches the runtime boundary
- **THEN** the CLI SHALL render it using `renderDefect`
- **AND** exit with code 2

#### Scenario: Error includes what happened

- **WHEN** an error occurs
- **THEN** the error message describes what went wrong

#### Scenario: Error includes how to fix

- **WHEN** an error has a known recovery path
- **THEN** the error message suggests how to resolve the issue

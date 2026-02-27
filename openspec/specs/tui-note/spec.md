## MODIFIED Requirements

### Requirement: Note service displays boxed informational callouts

The note capability SHALL be provided by `ClackLog.note` from `src/clack-effect/log/` rather than a standalone Note service module. It SHALL accept a message string and optional title string, and render a boxed callout to stdout.

#### Scenario: Note with title

- **WHEN** code calls `log.note("Run axm skills install to add skills", "Next steps")`
- **THEN** a boxed callout SHALL render with `Next steps` as title and the message as body

#### Scenario: Note without title

- **WHEN** code calls `log.note("Operation complete")`
- **THEN** a boxed callout SHALL render with the message body and no title

#### Scenario: Note test layer records calls

- **WHEN** code calls `log.note(...)` using the clack log test layer
- **THEN** the mock service SHALL record the note call for assertion

#### Scenario: Handler depends only on ClackLog for notes

- **WHEN** a handler uses only note output behavior
- **THEN** its Effect type signature SHALL require `ClackLog`, not a separate Note service

### Requirement: Dev demo for note

The dev command at `src/dev-cli-commands/tui/note/command.ts` SHALL provide a note demo backed by `ClackLog` and `ClackLive`.

#### Scenario: Run note demo

- **WHEN** a developer runs the dev CLI note demo command
- **THEN** the command SHALL render a boxed note with title and body

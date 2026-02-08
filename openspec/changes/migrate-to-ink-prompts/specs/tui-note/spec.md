## ADDED Requirements

### Requirement: Note service displays boxed informational callouts

The Note service SHALL be a self-contained module under `src/tui/note/` with its own Effect service tag, live layer, and test layer factory. It SHALL provide a method that accepts a message string and an optional title string, and renders a boxed callout to stdout.

#### Scenario: Note with title

- **WHEN** a handler calls `note.display("Run axm skills install to add skills", "Next steps")`
- **THEN** a boxed callout SHALL render with "Next steps" as the title and the message as the body

#### Scenario: Note without title

- **WHEN** a handler calls `note.display("Operation complete")`
- **THEN** a boxed callout SHALL render with the message as the body and no title

#### Scenario: Note test layer records calls

- **WHEN** a handler calls `note.display(...)` using the test layer
- **THEN** the mock service SHALL record the message and title for assertion

#### Scenario: Handler depends only on Note

- **WHEN** a handler uses only the Note service
- **THEN** its Effect type signature SHALL require only `Note` — not all TUI services

### Requirement: Dev demo for note

The dev entry point at `src/dev/tui.ts` SHALL include a `note` sub-command for manually testing note display.

#### Scenario: Run note demo

- **WHEN** a developer runs `pnpm tui note`
- **THEN** the dev entry point SHALL render a boxed note with a title and body

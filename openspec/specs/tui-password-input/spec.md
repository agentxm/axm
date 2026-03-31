## MODIFIED Requirements

### Requirement: Password input collects masked text

The password input prompt SHALL collect masked text from the user. It SHALL display a required message and MAY allow a custom mask character or validation feedback.

#### Scenario: Basic password input

- **WHEN** a handler calls `input.password({ message: "Enter token:" })`
- **AND** the user types `abc123`
- **THEN** terminal display SHALL show masked characters
- **WHEN** the user submits
- **THEN** the prompt SHALL return `"abc123"`

#### Scenario: Custom mask character

- **WHEN** a handler calls `input.password({ message: "Token:", mask: "*" })`
- **AND** the user types characters
- **THEN** the displayed characters SHALL use the configured mask

#### Scenario: Password input cancelled

- **WHEN** the user presses Escape or Ctrl+C during password input
- **THEN** the prompt SHALL cancel cleanly

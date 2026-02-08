## MODIFIED Requirements

### Requirement: Settings service provides addAgent mutation

The system SHALL provide an `addAgent` method that validates the agent ID against `AgentIdSchema` and appends it if not already present, serialized by semaphore.

#### Scenario: Add a new agent

- **WHEN** a caller invokes `addAgent("cursor")`
- **THEN** the service appends `"cursor"` to the agents array and writes to disk

#### Scenario: Agent already present

- **WHEN** a caller invokes `addAgent("cursor")` and `"cursor"` is already in the agents array
- **THEN** the service completes without error (no-op, no write)

#### Scenario: Invalid agent ID

- **WHEN** a caller invokes `addAgent("not-a-real-agent")` with a string that is not a valid `AgentId`
- **THEN** the service SHALL fail with a `SettingsParseError` indicating the agent ID is invalid
- **AND** no changes SHALL be written to disk

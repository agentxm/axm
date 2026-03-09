## Requirements

### Requirement: CodingAgent MCP lifecycle delegation

The system SHALL define a coding-agent MCP lifecycle delegation contract that supports server add/remove operations for configured agents.

Each delegated operation SHALL return one tagged outcome: `success`, `unsupported`, `disabled`, `misconfigured`, or `failed`.

#### Scenario: Add MCP server delegation succeeds

- **WHEN** an MCP server install operation delegates add to a configured agent that supports MCP server management
- **THEN** the delegated add operation SHALL return `success`

#### Scenario: Remove MCP server delegation succeeds

- **WHEN** an MCP server uninstall operation delegates remove to a configured agent that supports MCP server management
- **THEN** the delegated remove operation SHALL return `success`

#### Scenario: Delegation returns unsupported

- **WHEN** an agent does not support MCP server lifecycle management
- **THEN** delegated add/remove operations SHALL return `unsupported` with actionable reason

#### Scenario: Delegation returns misconfigured

- **WHEN** an agent configuration required for MCP add/remove is invalid
- **THEN** delegated add/remove operations SHALL return `misconfigured` with actionable reason

### Requirement: Dual-status reporting for MCP lifecycle operations

MCP lifecycle operations SHALL report both canonical operation status and agent-sync status.

#### Scenario: Full success includes both statuses

- **WHEN** canonical lifecycle steps and required agent-sync steps succeed
- **THEN** operation output SHALL indicate canonical success and agent-sync success

#### Scenario: Best-effort degraded sync

- **WHEN** canonical lifecycle succeeds
- **AND** best-effort policy allows skipped/degraded agent outcomes
- **THEN** operation output SHALL indicate canonical success and degraded agent-sync status

#### Scenario: Strict mode enforces sync failures

- **WHEN** strict policy is enabled
- **AND** agent-sync receives a policy-failing outcome
- **THEN** operation output SHALL fail

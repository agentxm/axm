## Requirements

### Requirement: CodingAgent service contract

The system SHALL provide a `CodingAgent` service contract for skills installation concerns and MCP server lifecycle concerns.

Each supported agent implementation SHALL expose its canonical `AgentId`, a `resolveEffectiveSkillsDir` operation, an MCP add operation, and an MCP remove operation.

`resolveEffectiveSkillsDir` SHALL return a tagged outcome, not a nullable/optional path, using one of: `supported`, `unsupported`, `disabled`, or `misconfigured`.

MCP add/remove operations SHALL return one of: `success`, `unsupported`, `disabled`, `misconfigured`, or `failed`.

#### Scenario: Agent supports skills installation

- **WHEN** `resolveEffectiveSkillsDir` runs for an agent/workspace combination that supports skills installation
- **THEN** it SHALL return outcome `_tag: "supported"` with a resolved directory path

#### Scenario: Agent does not support skills installation

- **WHEN** `resolveEffectiveSkillsDir` runs for an agent that does not support skills installation
- **THEN** it SHALL return outcome `_tag: "unsupported"`

#### Scenario: Agent support is disabled by configuration

- **WHEN** `resolveEffectiveSkillsDir` runs for an agent that supports skills but has the feature disabled in effective config
- **THEN** it SHALL return outcome `_tag: "disabled"`
- **AND** it SHALL include a human-readable reason

#### Scenario: Agent configuration is invalid

- **WHEN** `resolveEffectiveSkillsDir` runs for an agent with invalid skills-path configuration
- **THEN** it SHALL return outcome `_tag: "misconfigured"`
- **AND** it SHALL include a human-readable reason

#### Scenario: Agent MCP add operation succeeds

- **WHEN** MCP add is delegated for an agent that supports MCP server configuration
- **THEN** the MCP add operation SHALL return `success`

#### Scenario: Agent MCP remove operation succeeds

- **WHEN** MCP remove is delegated for an agent that supports MCP server configuration
- **THEN** the MCP remove operation SHALL return `success`

#### Scenario: Agent MCP operation unsupported

- **WHEN** an agent does not support MCP server configuration
- **THEN** delegated MCP add/remove SHALL return `unsupported` with actionable reason

#### Scenario: Agent MCP operation failed

- **WHEN** delegated MCP add/remove command exits with non-recoverable error
- **THEN** the operation SHALL return `failed` with normalized error summary

### Requirement: Effective skills directory precedence

For outcomes with `_tag: "supported"`, path resolution SHALL apply precedence in this order: runtime override, validated docs mapping, descriptor fallback.

#### Scenario: Runtime override wins

- **WHEN** an agent exposes a runtime override for skills directory (for example, config/env/flag)
- **THEN** the resolved directory SHALL use that override
- **AND** docs mapping and descriptor fallback SHALL NOT override it

#### Scenario: Docs mapping wins when no override

- **WHEN** no runtime override is present
- **AND** validated docs mapping exists for the agent
- **THEN** the resolved directory SHALL use the docs-mapped location

#### Scenario: Descriptor fallback is last resort

- **WHEN** no runtime override is present
- **AND** no validated docs mapping is available
- **THEN** the resolved directory SHALL fall back to the descriptor-defined location

### Requirement: CodingAgentRepository configured-agent access

The system SHALL provide a `CodingAgentRepository` service that returns configured agents for installation orchestration and surfaces unknown configured agent ids for policy evaluation.

#### Scenario: Repository returns configured supported implementations

- **WHEN** `getConfiguredAgents` is called
- **THEN** it SHALL return only configured agents that have known service implementations

#### Scenario: Repository surfaces unknown configured agents

- **WHEN** configured agent ids include unsupported/unknown values
- **THEN** unknown agent ids SHALL be surfaced (directly or via equivalent companion query) to the install orchestration layer for policy evaluation

### Requirement: Agent MCP CLI/config execution safety

Agent MCP add/remove integrations SHALL enforce deterministic and safe execution semantics.

#### Scenario: CLI invocation uses argument arrays

- **WHEN** an agent adapter invokes a CLI command for MCP add/remove
- **THEN** invocation SHALL use executable + argument array semantics
- **AND** shell-interpolated command strings SHALL NOT be used

#### Scenario: Sensitive output is redacted

- **WHEN** process output includes secrets/tokens
- **THEN** output SHALL be redacted before logging or error propagation

#### Scenario: CLI unavailable on platform

- **WHEN** the required agent CLI is unavailable on current platform
- **THEN** adapter outcome SHALL be `unsupported`
- **AND** the reason SHALL include actionable remediation guidance

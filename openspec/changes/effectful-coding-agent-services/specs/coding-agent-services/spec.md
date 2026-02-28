## ADDED Requirements

### Requirement: CodingAgent service contract

The system SHALL provide a `CodingAgent` service contract for skills installation concerns. Each supported agent implementation SHALL expose its canonical `AgentId` and a `resolveEffectiveSkillsDir` operation.

`resolveEffectiveSkillsDir` SHALL return a tagged outcome, not a nullable/optional path, using one of: `supported`, `unsupported`, `disabled`, or `misconfigured`.

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

The system SHALL provide a `CodingAgentRepository` service that returns configured agents for installation orchestration.

#### Scenario: Repository returns configured supported implementations

- **WHEN** `getConfiguredAgents` is called
- **THEN** it SHALL return only configured agents that have known service implementations

#### Scenario: Repository surfaces unknown configured agents

- **WHEN** configured agent ids include unsupported/unknown values
- **THEN** unknown agent ids SHALL be surfaced (directly or via equivalent companion query) to the install orchestration layer for policy evaluation

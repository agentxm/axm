## ADDED Requirements

### Requirement: MCP server install operations declare lockfile materialization policy

`install-mcp-server` operations SHALL declare lockfile policy metadata as `materialize_if_missing` so missing/invalid lockfile reconciliation is triggered consistently during plan augmentation.

#### Scenario: MCP server install policy is materialize

- **WHEN** a plan includes `install-mcp-server`
- **THEN** operation metadata SHALL expose `lockfilePolicy: "materialize_if_missing"`

### Requirement: MCP server install execution is gated by reconciliation failures

When reconciliation operations are injected before `install-mcp-server` under `materialize_if_missing`, failures in injected reconciliation steps MUST prevent execution of requested MCP server install steps.

#### Scenario: Reconciliation failure blocks MCP server install

- **WHEN** a plan includes `install-mcp-server`
- **AND** an injected reconciliation step returns `error`
- **THEN** `install-mcp-server` SHALL NOT execute

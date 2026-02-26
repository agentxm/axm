## Requirements

### Requirement: Install MCP server operation handler

The `installMcpServer` operation handler SHALL implement `OperationHandler<InstallMcpServerOperation, R>` and orchestrate installation of an MCP server extension to the workspace. MCP servers are workspace-level extensions — no agent symlinks are needed.

The handler SHALL:

1. Fetch the MCP server archive from the registry
2. Extract to the canonical location (`.axm/extensions/@<namespace>/mcp-servers/<name>/`)
3. Update the lockfile MCP server entry
4. Update the settings MCP server entry (unless `skipSettings` is true)

For registry-sourced MCP servers, any `resolvedVersion` written to lockfile MUST be an exact semver version and MUST NOT be a semver range.

#### Scenario: Install MCP server from registry

- **WHEN** executing an install-mcp-server operation with a registry ref
- **THEN** the MCP server archive SHALL be fetched from the registry
- **AND** extracted to `.axm/extensions/@<namespace>/mcp-servers/<name>/`
- **AND** an MCP server lock entry SHALL be written to the lockfile `mcpServers` section
- **AND** an MCP server entry SHALL be written to `settings.json` `mcp-servers` section

#### Scenario: Install MCP server with skipSettings

- **WHEN** executing an install-mcp-server operation with `skipSettings: true`
- **THEN** only the lockfile MCP server entry SHALL be written
- **AND** no settings entry SHALL be added

#### Scenario: MCP server already installed at canonical location

- **WHEN** the canonical directory already exists
- **THEN** existing files SHALL be removed before extracting the new archive

#### Scenario: Registry lockfile resolvedVersion is exact

- **WHEN** executing an install-mcp-server operation for a registry source
- **THEN** the written lockfile entry's `resolvedVersion` SHALL be an exact version (for example, `1.2.3`)
- **AND** the operation SHALL fail if a range value (for example, `^1.2.0`) would be written

### Requirement: MCP server canonical path

MCP server extensions SHALL be stored at `.axm/extensions/@<namespace>/mcp-servers/<name>/`.

#### Scenario: Canonical path structure

- **WHEN** installing MCP server `db-connector` from namespace `@acme`
- **THEN** the canonical path SHALL be `.axm/extensions/@acme/mcp-servers/db-connector/`

### Requirement: Empty integrity skips validation

When an MCP server ref has empty integrity (pack dependency), the handler SHALL skip integrity validation.

#### Scenario: Empty integrity with existing canonical

- **WHEN** installing an MCP server ref with empty integrity
- **AND** the canonical path already exists on disk
- **THEN** the handler SHALL skip fetching and use existing files

#### Scenario: Empty integrity without existing canonical

- **WHEN** installing an MCP server ref with empty integrity
- **AND** the canonical path does not exist on disk
- **THEN** the handler SHALL fetch from the registry without integrity validation

#### Scenario: Non-empty integrity validated

- **WHEN** installing an MCP server ref with non-empty integrity
- **THEN** the computed integrity of the fetched archive SHALL be compared to the ref integrity
- **AND** a mismatch SHALL fail with an integrity error

### Requirement: Lockfile and settings write failure handling

Metadata write failures SHALL be logged as warnings but SHALL NOT fail the installation.

#### Scenario: Lockfile write failure

- **WHEN** the lockfile write fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still return success

#### Scenario: Settings write failure

- **WHEN** the settings write fails
- **THEN** the failure SHALL be logged as a warning
- **AND** the installation SHALL still return success

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

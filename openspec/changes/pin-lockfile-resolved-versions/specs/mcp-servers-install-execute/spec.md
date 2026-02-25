## MODIFIED Requirements

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

## Requirements

### Requirement: Uninstall MCP server operation handler

The `uninstallMcpServer` operation handler SHALL implement `OperationHandler<UninstallMcpServerOperation, R>` and orchestrate full removal of an MCP server extension from the workspace.

The handler SHALL:

1. Remove the canonical directory from disk
2. Remove the lockfile MCP server entry
3. Remove the settings MCP server entry

#### Scenario: Full uninstall — MCP server in lockfile

- **WHEN** the operation targets an MCP server present in the lockfile
- **THEN** the handler SHALL remove the canonical directory from disk
- **AND** remove the MCP server entry from the lockfile `mcpServers` section
- **AND** remove the MCP server entry from `settings.json` `mcp-servers` section
- **AND** return `{ result: "success", message: "Uninstalled <server-name>" }`

#### Scenario: MCP server not installed

- **WHEN** the operation targets an MCP server not in the lockfile and no canonical directory exists on disk
- **THEN** the handler SHALL return `{ result: "no-op", message: "not installed" }`

### Requirement: Canonical directory lookup

When a lockfile entry exists, the canonical directory SHALL be computed from the lock entry's namespace and name. When no lockfile entry exists, the handler SHALL scan `.axm/extensions/@*/mcp-servers/<name>/` for matching directories.

#### Scenario: Lockfile entry provides namespace

- **WHEN** the lockfile contains an MCP server entry with namespace `@acme` and name `db-connector`
- **THEN** the canonical directory SHALL be `.axm/extensions/@acme/mcp-servers/db-connector/`

#### Scenario: No lockfile entry — scan for orphaned directories

- **WHEN** the MCP server is not in the lockfile
- **AND** `.axm/extensions/@acme/mcp-servers/db-connector/` exists on disk
- **THEN** the handler SHALL remove that directory

### Requirement: Graceful handling of missing files

The handler SHALL NOT fail if files or directories are already absent from disk.

#### Scenario: Canonical directory already missing

- **WHEN** the canonical directory does not exist on disk
- **THEN** the handler SHALL skip removal without error and continue

### Requirement: Settings and lockfile write failure handling

Metadata removal failures SHALL be logged as warnings but SHALL NOT fail the uninstall.

#### Scenario: Settings removal failure

- **WHEN** `removeMcpServer()` fails for settings
- **THEN** the failure SHALL be logged as a warning
- **AND** the uninstall SHALL still return success

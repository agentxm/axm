## Requirements

### Requirement: Uninstall MCP server operation handler

The `uninstallMcpServer` operation handler SHALL implement `OperationHandler<UninstallMcpServerOperation, R>` and orchestrate full removal of an MCP server extension from the workspace.

The handler SHALL:

1. Remove the canonical directory from disk
2. Remove the lockfile MCP server entry
3. Remove the settings MCP server entry
4. Synchronize configured agents through `CodingAgent` MCP remove delegation with policy-aware outcome handling
5. Return dual-status output: canonical lifecycle status + agent-sync status

#### Scenario: Full uninstall — MCP server in lockfile

- **WHEN** the operation targets an MCP server present in the lockfile
- **THEN** the handler SHALL remove the canonical directory from disk
- **AND** remove the MCP server entry from the lockfile `mcpServers` section
- **AND** remove the MCP server entry from `settings.json` `mcp-servers` section
- **AND** return canonical uninstall success with agent-sync status

#### Scenario: MCP server not installed

- **WHEN** the operation targets an MCP server not in the lockfile and no canonical directory exists on disk
- **THEN** the handler SHALL return `{ result: "no-op", message: "not installed" }`

#### Scenario: Configured agents are synchronized on uninstall

- **WHEN** canonical uninstall steps succeed
- **THEN** the operation SHALL delegate MCP remove to configured agents through `CodingAgent` services

#### Scenario: Best-effort mode skips unsupported agents

- **WHEN** agent MCP remove outcome is `unsupported` or `disabled`
- **AND** strict mode is not enabled
- **THEN** those agents SHALL be skipped with warnings
- **AND** canonical uninstall status MAY remain success

#### Scenario: Strict mode fails on unknown configured agent

- **WHEN** strict mode is enabled
- **AND** configured agent list includes unknown agent ids
- **THEN** the operation SHALL fail

#### Scenario: Misconfigured agent remove fails operation

- **WHEN** any delegated MCP remove returns `misconfigured`
- **THEN** the operation SHALL fail

#### Scenario: Failed agent remove degrades best-effort sync

- **WHEN** delegated MCP remove returns `failed`
- **AND** strict mode is not enabled
- **THEN** canonical uninstall status MAY remain success
- **AND** agent-sync status SHALL be degraded/non-green

#### Scenario: Required support set enforced

- **WHEN** configured agents include any of `claude-code`, `opencode`, `github-copilot`, `cursor`, `gemini-cli`, `codex`
- **THEN** MCP remove synchronization for those agents SHALL be attempted in this change

### Requirement: Canonical directory lookup

When a lockfile entry exists, the canonical directory SHALL be computed from the lock entry's profile and name. When no lockfile entry exists, the handler SHALL scan `.axm/extensions/@*/mcp-servers/<name>/` for matching directories.

#### Scenario: Lockfile entry provides profile

- **WHEN** the lockfile contains an MCP server entry with profile `@acme` and name `db-connector`
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

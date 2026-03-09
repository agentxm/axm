## MODIFIED Requirements

### Requirement: Install MCP server operation handler

The `installMcpServer` operation handler SHALL implement `OperationHandler<InstallMcpServerOperation, R>` and orchestrate installation of an MCP server extension to the workspace.

The handler SHALL:

1. Fetch the MCP server archive from the registry
2. Extract to the canonical location (`.axm/extensions/@<namespace>/mcp-servers/<name>/`)
3. Update the lockfile MCP server entry
4. Update the settings MCP server entry (unless `skipSettings` is true)
5. Synchronize configured agents through `CodingAgent` MCP add delegation with policy-aware outcome handling
6. Return dual-status output: canonical lifecycle status + agent-sync status

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

#### Scenario: Configured agents are synchronized on install

- **WHEN** canonical install steps succeed
- **THEN** the operation SHALL delegate MCP add to configured agents through `CodingAgent` services

#### Scenario: Best-effort mode skips unsupported agents

- **WHEN** agent MCP add outcome is `unsupported` or `disabled`
- **AND** strict mode is not enabled
- **THEN** those agents SHALL be skipped with warnings
- **AND** canonical install status MAY remain success

#### Scenario: Strict mode fails on unknown configured agent

- **WHEN** strict mode is enabled
- **AND** configured agent list includes unknown agent ids
- **THEN** the operation SHALL fail

#### Scenario: Misconfigured agent add fails operation

- **WHEN** any delegated MCP add returns `misconfigured`
- **THEN** the operation SHALL fail

#### Scenario: Failed agent add degrades best-effort sync

- **WHEN** delegated MCP add returns `failed`
- **AND** strict mode is not enabled
- **THEN** canonical install status MAY remain success
- **AND** agent-sync status SHALL be degraded/non-green

#### Scenario: Required support set enforced

- **WHEN** configured agents include any of `claude-code`, `opencode`, `github-copilot`, `cursor`, `gemini-cli`, `codex`
- **THEN** MCP add synchronization for those agents SHALL be attempted in this change

### Requirement: Chrome DevTools MCP validation path

The install execution path SHALL include deterministic coverage for the `chrome-devtools-mcp` registry server flow.

#### Scenario: Hermetic install validation

- **WHEN** CI runs default install operation tests
- **THEN** `chrome-devtools-mcp` behavior SHALL be covered by hermetic tests without live network dependency

#### Scenario: Optional live smoke validation

- **WHEN** optional live smoke validation is enabled
- **THEN** `chrome-devtools-mcp` install path MAY run against live network
- **AND** this smoke check SHALL be non-blocking for default CI unless explicitly configured as required

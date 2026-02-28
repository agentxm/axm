## Why

MCP server install/uninstall currently does not guarantee that configured coding agents are updated to reflect registry-driven server lifecycle changes. We need consistent agent-facing behavior so installed servers are immediately usable and uninstalled servers are reliably removed across supported agents.

## What Changes

- Update MCP server install behavior so registry installs add the server to configured agents via `CodingAgent` service delegation.
- Update MCP server uninstall behavior so registry uninstalls remove the server from configured agents via `CodingAgent` service delegation.
- Define deterministic outcome/reporting behavior for partial agent support, unsupported agents, unknown configured agents, and agent-level failures during MCP server sync.
- Define dual-status reporting: canonical registry operation result and agent-sync result.
- Add explicit functional coverage for `chrome-devtools-mcp` (`https://github.com/ChromeDevTools/chrome-devtools-mcp`) as the validation scenario.
- Scope required support in this change to: `claude-code`, `opencode`, `github-copilot`, `cursor`, `gemini-cli`, and `codex`.

## Capabilities

### New Capabilities

- `coding-agent-mcp-server-sync`: Defines agent-facing MCP server add/remove behavior contract delegated through coding-agent services.

### Modified Capabilities

- `mcp-servers-install-execute`: Install requirements will include configured-agent synchronization on successful registry install.
- `mcp-servers-uninstall-execute`: Uninstall requirements will include configured-agent synchronization on successful registry uninstall.
- `coding-agent-services`: Service requirements will expand beyond skills directory resolution to include MCP server add/remove operations and outcomes.

## Impact

- Affected code: MCP server install/uninstall execution flows, coding-agent service interfaces, and agent-specific service implementations.
- Affected APIs: internal `CodingAgent` service contract for MCP server lifecycle operations.
- Dependencies/systems: workspace configured agents, MCP server registry lifecycle operations, and agent configuration surfaces.
- Test strategy: hermetic unit/integration tests in CI plus optional live smoke validation for `chrome-devtools-mcp`.

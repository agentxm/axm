## Why

axm manages skills, commands, and packs but has no user-facing way to manage MCP servers. The low-level infrastructure exists (install/uninstall/publish operation handlers, lockfile/settings schemas) but there are no CLI commands, no transport configuration in manifests, and — critically — no ability to configure MCP servers for target agents. As MCP adoption accelerates across Claude Code, Gemini CLI, Copilot, Cursor, Codex, and OpenCode, axm needs first-class MCP server management to be useful as a cross-agent extension manager.

## What Changes

- **MCP manifest gains transport and runtime config** — `axm-mcp-server.json` adds transport type (stdio/http), command/args/cwd, URL/headers, and environment variable declarations so axm knows how to run and configure each server for agents.
- **Agent MCP configuration** — New capability to write/remove MCP server entries in each agent's native config format (Claude Code `.mcp.json`, Cursor `.cursor/mcp.json`, Gemini CLI `settings.json`, Codex `config.toml`, Copilot `.vscode/mcp.json`, OpenCode `opencode.json`).
- **CLI commands** — `axm mcps install|uninstall|list|enable|disable|update|publish` commands for the full MCP server lifecycle.
- **Install/uninstall operations extended** — Existing operation handlers gain an agent configuration step: install writes server config to agent files, uninstall removes it.
- **Enable/disable** — Installed MCP servers can be toggled on/off without uninstalling. Disabled servers remain in the lockfile. Agents with native `enabled` support (Codex, OpenCode) use their built-in toggle; others have entries added/removed from agent config files.

## Capabilities

### New Capabilities

- `mcp-server-transport-config`: Transport and runtime configuration in MCP server manifests — transport type (stdio/http), command/args/cwd for local servers, URL/headers for remote servers, environment variable declarations.
- `mcp-server-agent-config`: Reading and writing MCP server configuration to/from agent-specific config files. Covers Claude Code, Gemini CLI, GitHub Copilot (VS Code), Cursor, Codex, and OpenCode. Each agent has a different config format, key name, and file location.
- `mcp-server-cli`: CLI commands for the full MCP server lifecycle — install, uninstall, list, enable, disable, update, publish. Follows existing patterns from skill/pack CLI commands.

### Modified Capabilities

- `mcp-servers-install-execute`: Add agent configuration step — after archive extraction and lockfile/settings update, write server config to each configured agent's config file.
- `mcp-servers-uninstall-execute`: Add agent configuration cleanup — after lockfile/settings removal, remove server config from each configured agent's config file.

## Impact

- **Manifest schema** (`packages/cli/src/extensions/mcp-servers/manifest-schema.ts`) — extended with transport and env vars
- **Lockfile schema** (`packages/cli/src/lockfile/schema.ts`) — no changes expected (transport lives in manifest, enable/disable in settings)
- **Settings schema** (`packages/cli/src/settings/schema.ts`) — `mcpServers` entry upgraded to support enabled/disabled state
- **New module** — agent config readers/writers for 6 target agents
- **New commands** (`packages/cli/src/cli-commands/mcps/`) — command tree with install, uninstall, list, enable, disable, update, publish subcommands
- **Operations** (`packages/cli/src/extensions/mcp-servers/operations/`) — install/uninstall handlers extended with agent config step
- **Builtin skill** (`axm-manage-mcp-servers`) — updated with actual command documentation
- **Test case** — Chrome DevTools MCP server (`npx chrome-devtools-mcp@latest`, stdio transport) as end-to-end validation target

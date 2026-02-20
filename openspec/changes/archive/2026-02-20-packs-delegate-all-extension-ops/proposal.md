## Why

Pack operations handle skills, commands, and MCP servers inconsistently. Pack install records resolved extensions in lockfile metadata but never actually installs them — skills from packs are never materialized to disk or symlinked to agents. Pack uninstall delegates skill removal via plan steps (after `packs-uninstall-delegate-skill-removal`) but has no equivalent for commands or MCP servers. Pack unpack promotes skills to direct settings entries inline rather than using explicit install operations. The result: packs promise to manage three extension types but only partially deliver on one.

## What Changes

- **BREAKING** Pack install plan SHALL emit `install-skill` steps for each skill in the pack's `resolvedSkills`, delegating to the existing `installSkill` operation handler
- Pack install plan SHALL emit `install-command` steps for each command in the pack's `resolvedCommands`
- Pack install plan SHALL emit `install-mcp-server` steps for each MCP server in the pack's `resolvedMcpServers`
- Pack uninstall plan SHALL emit `uninstall-command` steps for orphaned commands (same pattern as existing skill orphan computation)
- Pack uninstall plan SHALL emit `uninstall-mcp-server` steps for orphaned MCP servers (same pattern as existing skill orphan computation)
- Pack unpack plan SHALL emit explicit `install-skill`, `install-command`, and `install-mcp-server` steps to promote pack dependencies to direct entries, instead of inline `ws.setSkill()` calls
- New `install-command` and `uninstall-command` operation handlers
- New `install-mcp-server` and `uninstall-mcp-server` operation handlers
- Orphan detection functions for commands and MCP servers (`findOrphanedCommands`, `findOrphanedMcpServers`) are removed — computation moves to the plan builder (same approach as skill orphan detection in `packs-uninstall-delegate-skill-removal`)

## Capabilities

### New Capabilities

- `commands-install-execute`: Install a command extension to the workspace (disk, settings, lockfile)
- `commands-uninstall-execute`: Remove a command extension from the workspace (disk, settings, lockfile)
- `mcp-servers-install-execute`: Install an MCP server extension to the workspace (disk, settings, lockfile)
- `mcp-servers-uninstall-execute`: Remove an MCP server extension from the workspace (disk, settings, lockfile)

### Modified Capabilities

- `cli-packs-install`: Plan now includes `install-skill`, `install-command`, and `install-mcp-server` steps for pack dependencies; handler generates skill/command/MCP server operations from the pack ref's resolved extensions
- `cli-packs-uninstall`: Plan now includes `uninstall-command` and `uninstall-mcp-server` steps for orphaned extensions (in addition to existing `uninstall-skill` steps)
- `cli-packs-unpack`: Plan now emits explicit install operations for promoted extensions instead of inline settings manipulation

## Impact

- `packages/cli/src/cli-commands/packs/install/plan.ts` — Union type expands to include all extension operation types; plan builder generates ops from pack ref's resolved extensions
- `packages/cli/src/cli-commands/packs/install/handler.ts` — Wire all operation handlers in `resolvePlan`; generate skill/command/MCP server ops from discovered pack ref
- `packages/cli/src/cli-commands/packs/uninstall/plan.ts` — Add orphan computation and plan steps for commands and MCP servers
- `packages/cli/src/cli-commands/packs/uninstall/handler.ts` — Wire command and MCP server uninstall handlers
- `packages/cli/src/cli-commands/packs/unpack/` — Refactor from inline settings writes to plan-based install operations
- `packages/cli/src/extensions/commands/operations/install.ts` — New file
- `packages/cli/src/extensions/commands/operations/uninstall.ts` — New file
- `packages/cli/src/extensions/mcp-servers/operations/install.ts` — New file
- `packages/cli/src/extensions/mcp-servers/operations/uninstall.ts` — New file
- `packages/cli/src/extensions/packs/operations/orphan-detection.ts` — Remove file (command/MCP server orphan logic moves to plan builder)
- Tests for all affected plan builders, operation handlers, and handlers

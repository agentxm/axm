## Context

axm has scaffolded MCP server infrastructure: install/uninstall/publish operation handlers, lockfile and settings schemas, workspace service CRUD, FQN format, and extension ref types. What's missing:

1. **No transport config in manifests** — `axm-mcp-server.json` only has common fields (name, version, description). Agents need to know _how_ to run the server (stdio command, HTTP URL, env vars).
2. **No agent config writing** — Installing an MCP server updates the axm lockfile/settings but doesn't write to any agent's native config file (`.mcp.json`, `.cursor/mcp.json`, etc.).
3. **No CLI commands** — No `axm mcp install|uninstall|list|...` commands exist.
4. **No enable/disable** — MCP servers are either installed or not; no way to temporarily disable without uninstalling.

The prior art research covers 6 target agents. Key findings:

- All use JSON config except Codex (TOML)
- stdio transport is universal; streamable HTTP is emerging
- Config key names vary: `mcpServers` (Claude Code, Cursor, Gemini), `servers` (VS Code/Copilot), `mcp` (OpenCode), `mcp_servers` (Codex)
- Server entry format is nearly identical across agents for stdio (`command`/`args`/`env`); differences are mainly in HTTP/remote transport fields

### Smithery CLI prior art

[Smithery CLI](https://smithery.ai/docs/concepts/cli) (v4.0.2) is a cloud-first MCP server manager. Key patterns relevant to axm:

- **`--client` flag** on `add`, `list`, `remove` — writes directly to an agent's native config file. Supports 20+ clients: `claude-code`, `vscode`, `gemini-cli`, `codex`, `cursor`, `opencode`, `windsurf`, `cline`, `goose`, `roocode`, `amazon-bedrock`, etc.
- **Verb set**: `add`, `list`, `get`, `remove`, `update`, `search`, `publish` — similar to our proposed commands
- **`--config <json>`** on `add` — pass server config inline to skip interactive prompts
- **`publish --config-schema`** — JSON Schema for server configuration parameters (analogous to our `env` array in the manifest)
- **Namespace scoping** — `--namespace` flag for org-level management

Key differences: Smithery is cloud-hosted (servers proxied via `server.smithery.ai`); axm is local-first (archives + manifests). Smithery tracks connections in its own backend; axm uses lockfile/settings. But the agent config writing pattern is the same problem we're solving.

### Agent MCP documentation references

- [Claude Code MCP](https://code.claude.com/docs/en/mcp) — `.mcp.json`, `mcpServers` key, stdio/http transports, `headers` for remote
- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp/) — `.codex/config.toml`, `[mcp_servers]` tables, stdio + experimental HTTP, `bearer_token_env_var`/`http_headers` for auth, native `enabled` field
- [Google Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) — `settings.json`, `mcpServers` key, stdio (`command`/`args`/`cwd`/`env`), HTTP via `httpUrl`, `headers` for remote, `trust`/`includeTools`/`excludeTools`
- [GitHub Copilot / VS Code MCP](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) — `.vscode/mcp.json`, `servers` key, stdio/http with explicit `type` discriminator, `headers`, `envFile`, `inputs` for secret prompting
- [Cursor MCP](https://cursor.com/docs/context/model-context-protocol) — `.cursor/mcp.json`, `mcpServers` key, stdio/http, `headers` for remote
- [OpenCode MCP](https://opencode.ai/docs/mcp-servers/) — `opencode.json`, `mcp` key, `local`/`remote` type discriminator, `headers` for remote, native `enabled` field
- [MCP Specification — Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — stdio and streamable HTTP are the two standard transports (SSE deprecated as of 2025-03-26)

## Goals / Non-Goals

**Goals:**

- MCP server manifest includes transport and runtime config
- Agent config writers for the 6 priority agents: Claude Code, Gemini CLI, GitHub Copilot, Cursor, Codex, OpenCode
- CLI commands: install, uninstall, list, enable, disable, update, publish, new
- Install writes to agent configs; uninstall cleans up; enable/disable toggles without re-fetching
- Chrome DevTools MCP as end-to-end validation target

**Non-Goals:**

- OAuth/auth token management for remote MCP servers
- MCP server runtime management (starting, stopping, health checking)
- MCP registry client (discovering servers from the public MCP registry)
- Remote server proxying or tunneling
- Tool-level filtering management per server (e.g., `enabledTools`/`disabledTools`) — however, existing tool filtering fields in agent configs are preserved during read-modify-write
- Per-agent server overrides (e.g., different env vars per agent)

## Decisions

### 1. Manifest transport config schema

Add transport and environment variable declarations to `axm-mcp-server.json`.

```jsonc
// stdio example: Chrome DevTools MCP (https://github.com/ChromeDevTools/chrome-devtools-mcp)
{
  "name": "@anthropic/mcp-servers/chrome-devtools",
  "version": "0.17.3",
  "description": "Chrome DevTools for coding agents",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp@latest"]
  },
  "env": []
}

// stdio with cwd and env vars:
{
  "name": "@acme/mcp-servers/db-inspector",
  "version": "1.0.0",
  "description": "Database inspector MCP server",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@acme/db-inspector-mcp"],
    "cwd": "."
  },
  "env": [
    { "name": "DATABASE_URL", "description": "PostgreSQL connection string", "required": true },
    { "name": "DB_POOL_SIZE", "description": "Connection pool size", "required": false, "default": "5" }
  ]
}

// HTTP example: remote server with auth headers
{
  "name": "@acme/mcp-servers/remote-api",
  "version": "1.0.0",
  "description": "Remote API MCP server",
  "transport": {
    "type": "http",
    "url": "https://mcp.example.com/mcp",
    "headers": {
      "Authorization": "Bearer ${API_KEY}"
    }
  },
  "env": [
    { "name": "API_KEY", "description": "API authentication key", "required": true }
  ]
}
```

Transport is a discriminated union on `type`:

- `stdio`: `{ type: "stdio", command: string, args?: string[], cwd?: string }` — local process
- `http`: `{ type: "http", url: string, headers?: Record<string, string> }` — streamable HTTP endpoint

SSE is not supported. The MCP specification (2025-03-26) deprecated SSE in favor of streamable HTTP, and Claude Code docs explicitly mark SSE as deprecated. Agents that still use SSE internally (e.g., Gemini CLI's `url` field) can be reached via their HTTP config mechanism — axm doesn't need a separate SSE transport type.

**Why this over the MCP registry `server.json` format:**

- Simpler — one transport per manifest, not an array of packages/remotes
- Self-contained — the manifest tells axm exactly how to configure the server
- Aligned with how agents actually consume config (one entry per server)
- MCP registry integration can be layered on later as a source resolver

**Alternative considered:** Store transport config in the lockfile instead of the manifest. Rejected because the manifest is the authoritative source published by the MCP server author; the lockfile should only cache what's needed for reproducibility.

### 2. Environment variable handling at install time

The manifest `env` array declares what variables the server needs (name, description, required, default). At install time, axm resolves actual values:

1. **Required env vars without defaults** — prompt the user via Bombshell text input (or accept via `--env KEY=VALUE` flag, repeatable)
2. **Required env vars with defaults** — use the default; prompt only if user wants to override
3. **Optional env vars not provided** — write `$VAR_NAME` pass-through syntax into agent config entries (most agents support env var expansion at runtime)
4. **`--non-interactive` mode** — uses defaults where available; errors if a required prompt cannot be skipped (e.g., required env var with no default and no `--env` flag). `--yes` auto-accepts confirmations but still prompts for required input.

Resolved values are written directly into agent config entries. The manifest `env` is declarative; agent configs get concrete values.

```bash
# Interactive: prompts for required vars
axm mcp install chrome-devtools

# Non-interactive: pass values via flags
axm mcp install chrome-devtools --env BROWSER_URL=ws://localhost:9222 --yes
```

### 3. Agent descriptor extension for MCP config

Extend `AgentDescriptor` with an optional `mcp` field describing where and how the agent stores MCP server config.

```typescript
interface AgentMcpDescriptor {
  /** Config file path relative to project root (e.g., ".mcp.json") — project scope */
  readonly configFile: string;
  /** Config file path for user scope (absolute, e.g., "~/.cursor/mcp.json") — optional, not all agents distinguish scopes */
  readonly userConfigFile?: string;
  /** Config file format */
  readonly format: "json" | "toml";
  /** Key under which MCP servers are stored (e.g., "mcpServers") */
  readonly serversKey: string;
  /** Whether the agent supports a native `enabled` boolean on server entries */
  readonly nativeEnabled?: boolean;
}

interface AgentDescriptor {
  readonly id: AgentId;
  readonly name: string;
  readonly skills: AgentSkillsDescriptor;
  readonly mcp?: AgentMcpDescriptor; // NEW — optional, not all agents support MCP
}
```

Agent MCP config map (6 priority agents):

| Agent          | `configFile`            | `userConfigFile`          | `format` | `serversKey`  | `nativeEnabled` | Docs                                                                         |
| -------------- | ----------------------- | ------------------------- | -------- | ------------- | --------------- | ---------------------------------------------------------------------------- |
| Claude Code    | `.mcp.json`             | _(see note)_              | json     | `mcpServers`  | —               | [docs](https://code.claude.com/docs/en/mcp)                                  |
| Cursor         | `.cursor/mcp.json`      | `~/.cursor/mcp.json`      | json     | `mcpServers`  | —               | [docs](https://cursor.com/docs/context/model-context-protocol)               |
| Gemini CLI     | `.gemini/settings.json` | `~/.gemini/settings.json` | json     | `mcpServers`  | —               | [docs](https://geminicli.com/docs/tools/mcp-server/)                         |
| GitHub Copilot | `.vscode/mcp.json`      | _(VS Code user settings)_ | json     | `servers`     | —               | [docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) |
| Codex          | `.codex/config.toml`    | `~/.codex/config.toml`    | toml     | `mcp_servers` | yes             | [docs](https://developers.openai.com/codex/mcp/)                             |
| OpenCode       | `opencode.json`         | _(none)_                  | json     | `mcp`         | yes             | [docs](https://opencode.ai/docs/mcp-servers/)                                |

**Claude Code user-scope note:** Claude Code stores user/local-scoped servers in `~/.claude.json` under project-specific paths, not in a standalone config file. This is a more complex write target — the `userConfigFile` for Claude Code requires writing into a nested structure in `~/.claude.json` keyed by project path. Initial implementation targets project scope (`.mcp.json`) only; user scope for Claude Code can be added later.

**GitHub Copilot user-scope note:** VS Code user-scoped MCP config is stored in VS Code's user `settings.json`, which is a complex multi-purpose file. Initial implementation targets project scope (`.vscode/mcp.json`) only; user scope for Copilot can be added later.

**Future agent expansion:** Smithery CLI supports 20+ MCP clients. Beyond our 6 priority agents, the `AgentMcpDescriptor` pattern naturally extends to windsurf, cline, goose, roocode, amazon-bedrock, and others — each just needs a descriptor with `mcp` config and a `buildEntry` mapper.

**Why extend `AgentDescriptor` instead of a separate registry:**

- Co-locates all agent config in one place (each agent's `descriptor.ts`)
- Follows existing pattern (skills info is already on the descriptor)
- Type system ensures agents without MCP support don't get configured

### 4. Agent config writer — read-modify-write with ownership boundaries

A new `agent-mcp-config` module that reads/modifies/writes agent config files. Core operations:

- `addMcpServerToAgent(agentId, serverName, manifest, envValues)` — Adds server entry to agent's config file
- `removeMcpServerFromAgent(agentId, serverName)` — Removes server entry from agent's config file
- `listMcpServersInAgent(agentId)` — Reads current MCP servers from agent's config file

**Ownership rule:** axm owns the entries defined in `settings.json`. Any server name present in the settings `mcpServers` map (renamed from `mcp-servers` to align with camelCase convention) is axm-managed. On uninstall/disable, axm removes that entry from agent configs. Entries not in settings are left untouched — they belong to the user or other tools.

**Transport mapping per agent:** Each agent expects a slightly different entry shape. A per-agent mapper translates the manifest transport config:

```typescript
// stdio transport:
// Claude Code: { "type": "stdio", "command": "npx", "args": [...], "env": {...} }
// Cursor:      { "command": "npx", "args": [...], "env": {...} }
// Copilot:     { "type": "stdio", "command": "npx", "args": [...], "env": {...} }
// Gemini CLI:  { "command": "npx", "args": [...], "cwd": ".", "env": {...} }
// Codex:       [mcp_servers.name] command = "npx", args = [...] (TOML table, with [mcp_servers.name.env])
// OpenCode:    { "type": "local", "command": ["npx", "-y", "..."], "environment": {...} }
```

```typescript
// HTTP transport:
// Claude Code: { "type": "http", "url": "https://...", "headers": {...} }
// Cursor:      { "url": "https://...", "headers": {...} }
// Copilot:     { "type": "http", "url": "https://...", "headers": {...} }
// Gemini CLI:  { "httpUrl": "https://...", "headers": {...} }
// Codex:       [mcp_servers.name] url = "https://...", http_headers = {...} (TOML, experimental)
// OpenCode:    { "type": "remote", "url": "https://...", "headers": {...} }
```

Each agent gets a `buildEntry(transport, envVars)` function co-located in the agent's directory alongside its descriptor. This keeps agent-specific logic contained.

**Copilot requires explicit `type` field:** Unlike Cursor and Gemini CLI, VS Code/Copilot requires a `type` discriminator on every entry (`"type": "stdio"` or `"type": "http"`). The buildEntry mapper must include it.

**Codex HTTP auth:** Codex uses `bearer_token_env_var` (env var name containing a bearer token) and `env_http_headers` (env var names mapped to header keys) in addition to `http_headers`. The Codex `buildEntry` mapper translates manifest `headers` into the appropriate Codex-native fields.

**`cwd` mapping:** Agents that support `cwd` for stdio (Gemini CLI, Codex) will receive it from the manifest. Agents without native `cwd` support silently ignore it.

**TOML support for Codex:** The agent config writer handles both JSON and TOML formats. For JSON agents, the writer uses `JSON.parse` / `JSON.stringify` with read-modify-write. For Codex TOML, the writer uses a TOML parser/serializer (e.g., `smol-toml` — zero-dependency, ~4KB) with the same read-modify-write pattern. The `format` field on `AgentMcpDescriptor` determines which serializer is used.

**Preserving unmanaged fields during read-modify-write:** Several agents support fields that axm does not manage but must not clobber:

- **Tool filtering**: Gemini CLI (`includeTools`/`excludeTools`), Codex (`enabled_tools`/`disabled_tools`), Copilot (tool approval settings)
- **Agent-specific**: Gemini CLI (`trust`, `timeout`), Codex (`startup_timeout_sec`, `tool_timeout_sec`, `required`), VS Code (`envFile`)
- **VS Code `inputs`**: The `inputs` array for secret prompting (`${input:id}` references) lives at the root of `.vscode/mcp.json`, not inside server entries — preserved by only touching the `servers` key

The read-modify-write strategy handles this: when updating an existing server entry, axm merges its managed fields (transport, env) into the existing entry, preserving any unknown/unmanaged fields. When adding a new entry, only axm-managed fields are written. On removal, the entire entry is deleted.

**Alternative considered:** A generic mapper that transforms transport config based on `AgentMcpDescriptor` metadata alone. Rejected because the differences between agents (OpenCode's `command` as array, Gemini's `httpUrl`, Copilot's required `type` discriminator, Codex's `bearer_token_env_var`/`http_headers` auth pattern, TOML tables) are too varied for a purely data-driven approach.

### 5. Install/uninstall operations gain an agent config step

Extend the existing operation handlers:

**Install flow** (after current steps):

1. Fetch archive → Extract → Update lockfile → Update settings _(existing)_
2. Read manifest from canonical location to get transport config _(new)_
3. Resolve env var values (prompt or `--env` flags) _(new)_
4. For each target agent (see agent filtering below), write server entry to agent config file _(new)_

**Uninstall flow** (before current steps):

1. For each target agent (see agent filtering below), remove server entry from agent config file _(new)_
2. Remove canonical dir → Remove lockfile entry → Remove settings entry _(existing)_

**Pack dependency installs:** When a pack installs an MCP server as a dependency, the existing `skipSettings` flag prevents writing to settings (the server is an implicit dependency, not user-managed). However, agent configs ARE written — this is what actually makes the server available to agents. The server appears in the lockfile (for reproducibility) and agent configs (for runtime), but not in settings (it's not directly user-managed).

The agent config step uses `Effect.forEach(..., { concurrency: "unbounded" })` to write to all agents concurrently, matching the skill install pattern.

**Agent filtering:** The target agent set starts from `settings.agents` (the user's configured agent list), then filters to agents whose `AgentDescriptor` has an `mcp` field (i.e., the agent supports MCP server configuration). Agents in `settings.agents` without MCP support are silently skipped. If `settings.agents` is empty or unset, no agent configs are written — the user must configure agents first via `axm init`.

**Failure handling:** Agent config write failures are logged as warnings but don't fail the operation (consistent with existing lockfile/settings write failure handling).

### 6. Enable/disable as settings flag

Enable/disable controls whether an installed MCP server is actively configured in agent config files, without removing it from the axm lockfile or deleting the canonical directory.

**State tracking:** Rename the settings key from `mcp-servers` to `mcpServers` (aligning with the lockfile key and camelCase convention for multi-word keys). Upgrade from `NonSkillExtensionsMapSchema` (`Record<string, string>`, name → version specifier) to a new `McpServersMapSchema` supporting an object form with `enabled` state and resolved env values. Follows the existing `SkillEntry` pattern:

```typescript
// New: MCP server entry in settings can be string or object
McpServerEntrySchema = Schema.Union(
  Schema.String, // "^1.0.0" — enabled by default, no env
  Schema.Struct({
    source: Schema.String, // version specifier (e.g., "^1.0.0")
    enabled: Schema.optional(Schema.Boolean), // defaults to true
    env: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  }),
);
```

**Enable operation:**

1. Validate server is installed (in lockfile)
2. Set `enabled: true` in axm settings
3. For each configured agent:
   - **Agents with `nativeEnabled` (Codex, OpenCode):** Set the native `enabled: true` field on the existing entry (preserving all other fields)
   - **Other agents:** Write server entry to agent's config file (add if missing)

**Disable operation:**

1. Validate server is installed (in lockfile)
2. Set `enabled: false` in axm settings
3. For each configured agent:
   - **Agents with `nativeEnabled` (Codex, OpenCode):** Set the native `enabled: false` field on the existing entry (preserving all other fields, including any user customizations)
   - **Other agents:** Remove server entry from agent's config file

The canonical directory with the manifest stays on disk for both operations — only uninstall removes it. Re-enabling reads the manifest transport config from the still-present canonical dir, and resolved env values from the settings entry — no re-prompting or lockfile transport caching needed.

**Env var persistence across disable/re-enable:** When an MCP server with env vars is disabled, agents without native `enabled` have their config entries removed — losing the resolved env values that were written at install time. To avoid re-prompting on re-enable, resolved env values are stored in the settings entry's `env` field at install time. Re-enable reads `env` from settings and rewrites agent config entries. `--env` flags on enable can override stored values.

**Why native `enabled` where available:** Codex and OpenCode have built-in `enabled` boolean fields on server entries. Using native toggle is less destructive than add/remove — it preserves user customizations (tool filtering, timeouts, etc.) on the entry. For agents without native `enabled`, add/remove is the only option.

**axm settings behavior is uniform across agents:** Regardless of whether the agent uses native `enabled` or add/remove, axm's own `settings.json` always tracks the enabled/disabled state the same way. The agent-specific strategy is an implementation detail of the config writer.

**Why a settings flag over a lockfile flag:** Settings is the user-facing, editable config. Lockfile is the resolved, reproducible state. Enable/disable is a user preference, not a resolution detail.

**Normalized entry pattern:** Following the `SkillEntry` → `NormalizedSkillEntry` pattern, introduce `NormalizedMcpServerEntry` as the canonical internal representation:

```typescript
interface NormalizedMcpServerEntry {
  readonly source: Option.Option<string>;
  readonly enabled: boolean;
  readonly env: Record.ReadonlyRecord<string, string>;
}
```

With `normalizeMcpServerEntry` (settings form → normalized) and `collapseMcpServerEntry` (normalized → settings form) functions. The collapsed form uses the compact string when `enabled: true` and `env` is empty. Scope (project vs user) is determined by the workspace service's `global` flag, not stored per-entry.

**Workspace service methods:** New methods on `WorkspaceContextService` following the existing skill pattern:

```typescript
// Reading
readonly getConfiguredMcpServers: () => Effect<Record.ReadonlyRecord<string, NormalizedMcpServerEntry>, CliError>;
readonly getLockedMcpServers: () => Effect<McpServersLockMap, CliError>;
readonly getLockedMcpServer: (name: string) => Effect<Option<McpServerLockEntry>, CliError>;

// Writing (all semaphore-protected)
readonly setMcpServer: (args: SetMcpServerArgs) => Effect<void, CliError>;
readonly setMcpServerLock: (args: SetMcpServerArgs) => Effect<void, CliError>;
readonly removeMcpServer: (name: string) => Effect<void, CliError>;
readonly updateMcpServerEntry: (name: string, updater: (entry: NormalizedMcpServerEntry) => NormalizedMcpServerEntry) => Effect<void, CliError>;
readonly setMcpServerEntry: (name: string, entry: NormalizedMcpServerEntry) => Effect<void, CliError>;
```

`setMcpServer` and `setMcpServerLock` already exist in the workspace service. New additions: `getConfiguredMcpServers`, `getLockedMcpServers`, `getLockedMcpServer`, `updateMcpServerEntry`, and `setMcpServerEntry`. `updateMcpServerEntry` is the key method for enable/disable — it normalizes, applies the updater, and collapses back to settings form.

### 7. CLI command structure

CLI command is `mcp`. Registered in `main.ts` via `.command(mcpCommand)`. Follows existing patterns: `skills` and `packs` command trees.

#### Example walkthrough: Chrome DevTools MCP

[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) (`chrome-devtools-mcp` on npm, v0.17.3) is a stdio MCP server that gives coding agents access to Chrome DevTools — browser automation, debugging, performance tracing, and network inspection. It's the end-to-end validation target for this change.

**Manifest** (`axm-mcp-server.json`):

```jsonc
{
  "name": "@anthropic/mcp-servers/chrome-devtools",
  "version": "0.17.3",
  "description": "Chrome DevTools for coding agents",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "chrome-devtools-mcp@latest"],
  },
  "env": [],
}
```

**1. Install** — fetches archive, writes config to all active agents:

```bash
axm mcp install chrome-devtools
```

This writes the following to each agent's project-level config:

```jsonc
// .mcp.json (Claude Code)
{ "mcpServers": { "chrome-devtools": { "type": "stdio", "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] } } }

// .cursor/mcp.json (Cursor)
{ "mcpServers": { "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] } } }

// .vscode/mcp.json (GitHub Copilot) — note: requires explicit type
{ "servers": { "chrome-devtools": { "type": "stdio", "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] } } }

// .gemini/settings.json (Gemini CLI) — only mcpServers key touched
{ "mcpServers": { "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] } } }

// opencode.json (OpenCode) — command as array
{ "mcp": { "chrome-devtools": { "type": "local", "command": ["npx", "-y", "chrome-devtools-mcp@latest"] } } }
```

```toml
# .codex/config.toml (Codex) — TOML table
[mcp_servers.chrome-devtools]
command = "npx"
args = ["-y", "chrome-devtools-mcp@latest"]
```

**2. List** — shows installed servers:

```bash
axm mcp list
# NAME               VERSION  TRANSPORT  STATUS
# chrome-devtools    0.17.3   stdio      enabled
```

**3. Disable** — temporarily removes from agent configs without uninstalling:

```bash
axm mcp disable chrome-devtools
```

For most agents, this removes the `chrome-devtools` entry from the config file. For Codex and OpenCode (which have native `enabled` fields), it sets `enabled = false` instead, preserving any user customizations (timeouts, tool filtering, etc.).

```bash
axm mcp list
# NAME               VERSION  TRANSPORT  STATUS
# chrome-devtools    0.17.3   stdio      disabled
```

**4. Enable** — re-adds config to agent files (or sets native `enabled: true`):

```bash
axm mcp enable chrome-devtools
```

Reads the still-present manifest from the canonical directory — no re-fetch needed.

**5. Update** — checks for newer version, re-installs if available:

```bash
# Preview what would change
axm mcp update chrome-devtools --preview

# Apply the update
axm mcp update chrome-devtools
```

Re-resolves from the registry, downloads the new archive, and rewrites all agent config files with any updated transport config.

**6. Uninstall** — removes config from all agents, deletes canonical dir, cleans lockfile/settings:

```bash
axm mcp uninstall chrome-devtools
```

#### `axm mcp install <source>`

Install an MCP server from a registry and configure it for all active agents. Fetches the archive, extracts to canonical location, updates lockfile/settings, prompts for required env vars, and writes transport config to each agent's MCP config file.

| Arg/Flag            | Type                | Required | Description                                                                           |
| ------------------- | ------------------- | -------- | ------------------------------------------------------------------------------------- |
| `<source>`          | positional          | yes      | Registry ref (`@ns/mcp-servers/name`, `@ns/mcp-servers/name@version`, or bare `name`) |
| `--env`             | string (repeatable) | no       | Environment variable value (`KEY=VALUE`, can repeat)                                  |
| `--yes`, `-y`       | boolean             | no       | Skip confirmation prompts (default: false)                                            |
| `--force`, `-f`     | boolean             | no       | Overwrite if already installed (default: false)                                       |
| `--preview`         | boolean             | no       | Display plan without applying (default: false)                                        |
| `--non-interactive` | boolean             | no       | Suppress all prompts; errors if required input missing                                |

```bash
axm mcp install chrome-devtools                     # bare name, latest version
axm mcp install chrome-devtools@0.17.3              # pinned version
axm mcp install chrome-devtools --preview           # dry run
axm mcp install chrome-devtools --force             # overwrite existing
axm mcp install chrome-devtools --yes               # skip confirmation (CI)
```

#### `axm mcp uninstall <name>`

Remove an installed MCP server. Removes transport config from all agent config files, deletes the canonical directory, and cleans up lockfile/settings entries.

| Arg/Flag            | Type       | Required | Description                                            |
| ------------------- | ---------- | -------- | ------------------------------------------------------ |
| `<name>`            | positional | yes      | Server name (e.g., `chrome-devtools`)                  |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts (default: false)             |
| `--preview`         | boolean    | no       | Display plan without applying (default: false)         |
| `--non-interactive` | boolean    | no       | Suppress all prompts; errors if required input missing |

```bash
axm mcp uninstall chrome-devtools                   # with confirmation prompt
axm mcp uninstall chrome-devtools --yes             # skip confirmation
axm mcp uninstall chrome-devtools --preview         # preview removal plan
```

#### `axm mcp list`

List all installed MCP servers with their version, transport type, and enabled/disabled status.

_(No flags)_

```bash
axm mcp list
# NAME               VERSION  TRANSPORT  STATUS
# chrome-devtools    0.17.3   stdio      enabled
```

#### `axm mcp enable <name>`

Enable a previously disabled MCP server. Sets `enabled: true` in settings and writes transport config to all active agents' config files.

| Arg/Flag            | Type       | Required | Description                                            |
| ------------------- | ---------- | -------- | ------------------------------------------------------ |
| `<name>`            | positional | yes      | Server name to enable                                  |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts (default: false)             |
| `--preview`         | boolean    | no       | Display plan without applying (default: false)         |
| `--non-interactive` | boolean    | no       | Suppress all prompts; errors if required input missing |

```bash
axm mcp enable chrome-devtools                      # re-enable, writes config back
axm mcp enable chrome-devtools --preview            # preview what would be written
```

#### `axm mcp disable <name>`

Disable an installed MCP server without uninstalling. Sets `enabled: false` in settings and removes transport config from all active agents' config files. The canonical directory and lockfile entry remain intact for quick re-enable.

| Arg/Flag            | Type       | Required | Description                                            |
| ------------------- | ---------- | -------- | ------------------------------------------------------ |
| `<name>`            | positional | yes      | Server name to disable                                 |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts (default: false)             |
| `--preview`         | boolean    | no       | Display plan without applying (default: false)         |
| `--non-interactive` | boolean    | no       | Suppress all prompts; errors if required input missing |

```bash
axm mcp disable chrome-devtools                     # disable, keeps lockfile intact
axm mcp disable chrome-devtools --preview           # preview what would be removed
```

#### `axm mcp update <name..>`

Update one or more installed MCP servers to the latest version matching their version constraint. Re-resolves from the registry, re-installs if newer, and rewrites agent config files with updated transport config.

| Arg/Flag            | Type                  | Required | Description                                            |
| ------------------- | --------------------- | -------- | ------------------------------------------------------ |
| `<name..>`          | positional (variadic) | yes      | One or more server names to update                     |
| `--yes`, `-y`       | boolean               | no       | Skip confirmation prompts (default: false)             |
| `--preview`         | boolean               | no       | Display plan without applying (default: false)         |
| `--non-interactive` | boolean               | no       | Suppress all prompts; errors if required input missing |

```bash
axm mcp update chrome-devtools                      # update single server
axm mcp update chrome-devtools --preview            # preview what would change
axm mcp update chrome-devtools --yes                # auto-accept (CI)
```

#### `axm mcp publish <extensions..>`

Publish one or more MCP server extensions to a registry. Reads the manifest, builds an archive, computes integrity hash, and publishes.

| Arg/Flag            | Type                  | Required | Description                                            |
| ------------------- | --------------------- | -------- | ------------------------------------------------------ |
| `<extensions..>`    | positional (variadic) | yes      | Extension names or glob patterns                       |
| `--registry`        | string                | no       | Named registry source to publish to                    |
| `--yes`, `-y`       | boolean               | no       | Skip confirmation prompts (default: false)             |
| `--preview`         | boolean               | no       | Display plan without applying (default: false)         |
| `--non-interactive` | boolean               | no       | Suppress all prompts; errors if required input missing |

```bash
axm mcp publish chrome-devtools                     # publish to default registry
axm mcp publish chrome-devtools --registry internal  # publish to named registry
axm mcp publish '*'                                 # publish all MCP server extensions
```

#### `axm mcp new <name>`

Scaffold a new MCP server extension with a manifest template (`axm-mcp-server.json`) including transport and environment variable placeholders.

| Arg/Flag            | Type       | Required | Description                                            |
| ------------------- | ---------- | -------- | ------------------------------------------------------ |
| `<name>`            | positional | yes      | Server name (kebab-case)                               |
| `--namespace`       | string     | no       | Override the workspace namespace (e.g., `@acme`)       |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts (default: false)             |
| `--preview`         | boolean    | no       | Display plan without applying (default: false)         |
| `--non-interactive` | boolean    | no       | Suppress all prompts; errors if required input missing |

```bash
axm mcp new my-devtools-wrapper                     # scaffold new MCP server
axm mcp new my-devtools-wrapper --namespace @acme   # with custom namespace
# Creates: mcp-servers/my-devtools-wrapper/axm-mcp-server.json
```

**File structure:**

```
packages/cli/src/cli-commands/mcp/
├── command.ts                    # Parent command with subcommands
├── install/
│   ├── command.ts                # yargs definition
│   └── handler.ts                # Effect handler
├── uninstall/
│   ├── command.ts
│   └── handler.ts
├── list/
│   ├── command.ts
│   └── handler.ts
├── enable/
│   ├── command.ts
│   └── handler.ts
├── disable/
│   ├── command.ts
│   └── handler.ts
├── update/
│   ├── command.ts
│   └── handler.ts
├── publish/
│   ├── command.ts
│   └── handler.ts
└── new/
    ├── command.ts
    └── handler.ts
```

### 8. Update command strategy

`axm mcp update <name..>` re-resolves version constraints and re-installs if a newer version is available. Follows the same approach as `axm skills update`:

1. Read lockfile to get current version and source
2. Re-resolve from source with version constraint from settings
3. If newer version available, run install operation with `force: true`
4. If already at latest, return no-op

Supports variadic names for batch updates.

## Risks / Trade-offs

**[Agent config file conflicts]** → axm and users both write to `.mcp.json` and other agent config files. Mitigation: read-modify-write preserves existing entries and unmanaged fields (tool filtering, timeouts, etc.); axm only touches entries present in its settings `mcpServers` map. Users can manually edit around axm-managed entries. When updating an existing entry, axm merges managed fields into the existing entry rather than replacing it wholesale.

**[Config file creation]** → Some agent config files may not exist yet. Mitigation: create the file with minimal structure if it doesn't exist (e.g., `{ "mcpServers": {} }`). Only create if axm actually has servers to write.

**[Gemini CLI settings.json overlap]** → Gemini CLI uses `settings.json` for general settings, not just MCP. Mitigation: read-modify-write only touches the `mcpServers` key; preserve all other keys and formatting.

**[Transport config drift]** → If an MCP server changes its startup command between versions, the manifest transport config may not match what's written in agent configs. Mitigation: `update` command re-reads manifest and rewrites agent configs.

**[TOML dependency for Codex]** → Codex is the only TOML-based agent, requiring a TOML parser/serializer. Mitigation: use `smol-toml` (zero-dependency, well-maintained, ~4KB). Only imported when writing Codex config — no impact on other agents.

**[No per-agent customization]** → All agents get the same env vars and transport config. Mitigation: users can override in agent config files after axm writes the base entry. Per-agent overrides can be added later if needed.

**[Tool filtering clobbering]** → Several agents support tool-level filtering (Gemini `includeTools`/`excludeTools`, Codex `enabled_tools`/`disabled_tools`) and other agent-specific fields (`trust`, `timeout`, `required`, `envFile`). Mitigation: read-modify-write merges only axm-managed fields; unknown fields on existing entries are preserved. Deletion removes the entire entry (acceptable since the server is being uninstalled).

**[User vs project scope complexity]** → Some agents have complex user-scope config mechanisms (Claude Code nests in `~/.claude.json` by project path, VS Code uses user `settings.json`). Mitigation: initial implementation supports user scope for agents with straightforward user config files (Cursor, Gemini CLI, Codex). Claude Code and Copilot user scope deferred.

**[VS Code input variables]** → VS Code supports `inputs` array for secret prompting via `${input:id}` references. axm doesn't manage this mechanism but must preserve the `inputs` array at the root of `.vscode/mcp.json` during read-modify-write. Future consideration: axm could generate `inputs` entries for env vars that need secret prompting.

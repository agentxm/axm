## Context

axm has scaffolded MCP server infrastructure: install/uninstall/publish operation handlers, lockfile and settings schemas, workspace service CRUD, FQN format, and extension ref types. What's missing:

1. **No transport config in manifests** — `mcp-server.json` only has common fields (name, version, description). Agents need to know _how_ to run the server (stdio command, HTTP URL, env vars).
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
- **Profile scoping** — `--profile` flag for org-level management

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

Add transport and environment variable declarations to `mcp-server.json`.

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

**Agent filtering:** The target agent set starts from `settings.agents` (the user's configured agent list), then filters to agents whose `AgentDescriptor` has an `mcp` field (i.e., the agent supports MCP server configuration). Agents in `settings.agents` without MCP support are silently skipped. If `settings.agents` is empty or unset, no agent configs are written — the user must configure agents first via `axm setup`.

**Failure handling:** Agent config write failures are logged as warnings but don't fail the operation (consistent with existing lockfile/settings write failure handling).

### 6. Enable/disable as settings flag

Enable/disable controls whether an installed MCP server is actively configured in agent config files, without removing it from the axm lockfile or deleting the canonical directory.

**State tracking:** Rename the settings key from `mcp-servers` to `mcpServers` (aligning with the lockfile key and camelCase convention for multi-word keys). Upgrade from `NonSkillExtensionsMapSchema` (`Record<string, string>`, name → version specifier) to a new `McpServerSettingsEntrySchema` supporting an object form with `enabled` state and resolved env values. Each extension type defines its own entry schema aligned on the `string | { source, enabled? }` baseline; MCP servers extend it with `env`:

```typescript
// New: MCP server entry in settings can be string or object
McpServerSettingsEntrySchema = Schema.Union(
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

**Normalized entry pattern:** Following the normalize/collapse pattern established for skills, introduce `NormalizedMcpServerSettingsEntry` as the canonical internal representation:

```typescript
interface NormalizedMcpServerSettingsEntry {
  readonly source: Option.Option<string>;
  readonly enabled: boolean;
  readonly env: Record.ReadonlyRecord<string, string>;
}
```

With `normalizeMcpServerSettingsEntry` (settings form → normalized) and `collapseMcpServerSettingsEntry` (normalized → settings form) functions. The collapsed form uses the compact string when `enabled: true` and `env` is empty. Scope (project vs user) is determined by the workspace service's `global` flag, not stored per-entry.

**Workspace service methods:** New methods on `WorkspaceContextService` following the existing skill pattern:

```typescript
// Reading
readonly getConfiguredMcpServers: () => Effect<Record.ReadonlyRecord<string, NormalizedMcpServerSettingsEntry>, AppError>;
readonly getLockedMcpServers: () => Effect<McpServersLockMap, AppError>;
readonly getLockedMcpServer: (name: string) => Effect<Option<McpServerLockEntry>, AppError>;

// Writing (all semaphore-protected)
readonly setMcpServer: (args: SetMcpServerArgs) => Effect<void, AppError>;
readonly setMcpServerLock: (args: SetMcpServerArgs) => Effect<void, AppError>;
readonly removeMcpServer: (name: string) => Effect<void, AppError>;
readonly updateMcpServerSettingsEntry: (name: string, updater: (entry: NormalizedMcpServerSettingsEntry) => NormalizedMcpServerSettingsEntry) => Effect<void, AppError>;
readonly setMcpServerSettingsEntry: (name: string, entry: NormalizedMcpServerSettingsEntry) => Effect<void, AppError>;
```

`setMcpServer` and `setMcpServerLock` already exist in the workspace service. New additions: `getConfiguredMcpServers`, `getLockedMcpServers`, `getLockedMcpServer`, `updateMcpServerSettingsEntry`, and `setMcpServerSettingsEntry`. `updateMcpServerSettingsEntry` is the key method for enable/disable — it normalizes, applies the updater, and collapses back to settings form.

### 7. CLI command structure

CLI command is `mcp`. Registered in `main.ts` via `.command(mcpCommand)`. Follows existing patterns: `skills` and `packs` command trees.

#### Example walkthrough: Chrome DevTools MCP

[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) (`chrome-devtools-mcp` on npm, v0.17.3) is a stdio MCP server that gives coding agents access to Chrome DevTools — browser automation, debugging, performance tracing, and network inspection. It's the end-to-end validation target for this change.

**Manifest** (`mcp-server.json`):

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

Scaffold a new MCP server extension with a manifest template (`mcp-server.json`) including transport and environment variable placeholders.

| Arg/Flag            | Type       | Required | Description                                            |
| ------------------- | ---------- | -------- | ------------------------------------------------------ |
| `<name>`            | positional | yes      | Server name (kebab-case)                               |
| `--profile`         | string     | no       | Override the workspace profile (e.g., `@acme`)         |
| `--yes`, `-y`       | boolean    | no       | Skip confirmation prompts (default: false)             |
| `--preview`         | boolean    | no       | Display plan without applying (default: false)         |
| `--non-interactive` | boolean    | no       | Suppress all prompts; errors if required input missing |

```bash
axm mcp new my-devtools-wrapper                     # scaffold new MCP server
axm mcp new my-devtools-wrapper --profile @acme   # with custom profile
# Creates: mcp-servers/my-devtools-wrapper/mcp-server.json
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

### 9. Handler pseudo-code

Pseudo-code for all new handlers, grouped by command. Uses Effect patterns consistent with the codebase (`Effect.gen`, `yield*`, services via `Workspace`/`Log`/`Spinner`, `AppError` for failures, `Effect.forEach` with `concurrency: "unbounded"` for parallelism).

#### Agent config writer module (`agent-mcp-config`)

Shared module used by operation handlers for reading/writing agent MCP config files.

```typescript
// agent-mcp-config/writer.ts — read-modify-write for agent config files

const readAgentConfig = (agentId, scope) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;

    const agent = yield* getAgentById(agentId); // returns Option
    const mcpDesc = agent.mcp; // AgentMcpDescriptor | undefined
    if (!mcpDesc) return Option.none(); // agent doesn't support MCP

    const configPath =
      scope === "user" && mcpDesc.userConfigFile
        ? resolveHome(mcpDesc.userConfigFile)
        : path.join(ws.baseDir, mcpDesc.configFile);

    const exists = yield* fs.exists(configPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (!exists) return Option.some({ path: configPath, content: {}, mcpDesc });

    const raw = yield* fs.readFileString(configPath);
    const parsed =
      mcpDesc.format === "toml"
        ? yield* Effect.try(() => TOML.parse(raw))
        : yield* Effect.try(() => JSON.parse(raw) as unknown);

    return Option.some({ path: configPath, content: parsed, mcpDesc });
  });

const writeAgentConfig = (configPath, content, format) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Ensure parent directory exists
    yield* fs.makeDirectory(path.dirname(configPath), { recursive: true }).pipe(Effect.ignore);

    const serialized =
      format === "toml" ? TOML.stringify(content) : JSON.stringify(content, null, 2) + "\n";

    yield* fs.writeFileString(configPath, serialized);
  });

const addMcpServerToAgent = (agentId, serverName, transport, envValues, scope) =>
  Effect.gen(function* () {
    const configOption = yield* readAgentConfig(agentId, scope);
    if (Option.isNone(configOption)) return; // agent doesn't support MCP

    const { path: configPath, content, mcpDesc } = configOption.value;
    const agent = yield* getAgentById(agentId);

    // Build agent-specific entry via per-agent mapper
    const entry = agent.mcp.buildEntry(transport, envValues);

    // Read-modify-write: merge into existing servers map
    const serversKey = mcpDesc.serversKey;
    const existingServers = content[serversKey] ?? {};
    const existingEntry = existingServers[serverName] ?? {};

    // Merge: axm-managed fields overwrite, unknown fields preserved
    const mergedEntry = { ...existingEntry, ...entry };
    const updated = { ...content, [serversKey]: { ...existingServers, [serverName]: mergedEntry } };

    yield* writeAgentConfig(configPath, updated, mcpDesc.format);
  });

const removeMcpServerFromAgent = (agentId, serverName, scope) =>
  Effect.gen(function* () {
    const configOption = yield* readAgentConfig(agentId, scope);
    if (Option.isNone(configOption)) return;

    const { path: configPath, content, mcpDesc } = configOption.value;
    const serversKey = mcpDesc.serversKey;
    const existingServers = content[serversKey] ?? {};

    if (!(serverName in existingServers)) return; // nothing to remove

    const { [serverName]: _, ...remaining } = existingServers;
    const updated = { ...content, [serversKey]: remaining };

    yield* writeAgentConfig(configPath, updated, mcpDesc.format);
  });

const setNativeEnabled = (agentId, serverName, enabled, scope) =>
  Effect.gen(function* () {
    const configOption = yield* readAgentConfig(agentId, scope);
    if (Option.isNone(configOption)) return;

    const { path: configPath, content, mcpDesc } = configOption.value;
    const serversKey = mcpDesc.serversKey;
    const existingServers = content[serversKey] ?? {};
    const existingEntry = existingServers[serverName];

    if (!existingEntry) return; // entry doesn't exist, nothing to toggle

    const updated = {
      ...content,
      [serversKey]: { ...existingServers, [serverName]: { ...existingEntry, enabled } },
    };

    yield* writeAgentConfig(configPath, updated, mcpDesc.format);
  });
```

#### `axm mcp install`

**CLI handler** — orchestrates source resolution, env prompts, and delegates to install operation.

```typescript
// cli-commands/mcp/install/handler.ts

interface InstallHandlerArgs {
  readonly source: string
  readonly env: ReadonlyArray<string>         // KEY=VALUE pairs from --env
  readonly yes: boolean
  readonly force: boolean
  readonly preview: boolean
  readonly nonInteractive: Option<boolean>
}

const handleInstall = Effect.fn("McpInstall.handle")(function* (args: InstallHandlerArgs) {
  const ws = yield* Workspace
  const sources = yield* SourceHostProviders
  const log = yield* Log
  const spinnerSvc = yield* Spinner

  yield* log.info("axm mcp install")

  // Step 1: Parse source string
  const parsedSource = yield* parseInputPattern(args.source)
  const versionConstraint = /* extract from registry pattern if present */

  // Step 2: Registry guard — ensure a registry source is configured
  yield* registryGuard

  // Step 3: Resolve source and discover MCP server
  const handle = yield* spinnerSvc.start("Resolving...")
  const discoveredRefs = yield* sources.find(resolvedSource, {
    type: "mcp-server",
    owner: requestedNamespace,
    versionConstraint,
    skillNames: requestedNames,
  })
  const mcpServerRefs = Array.filter(discoveredRefs, (r) => r.type === "mcp-server")
  yield* handle.stop(`Found ${mcpServerRefs.length} server(s)`)

  if (mcpServerRefs.length === 0) {
    return yield* makeAppError({ code: "NO_MCP_SERVERS_FOUND", what: "No MCP servers found" })
  }
  const ref = mcpServerRefs[0]

  // Step 4: Read manifest to get transport config and env declarations
  // (After install, manifest is at canonical path)
  // For now, ref carries transport info from the manifest

  // Step 5: Resolve env var values
  const manifest = /* read from ref or fetched archive manifest */
  const envValues = yield* resolveEnvValues(manifest.env, args.env, args.nonInteractive)

  // Step 6: Build plan with install-mcp-server operation
  const plan = yield* buildMcpInstallPlan({
    ref,
    force: args.force,
    versionConstraint,
    envValues,
  })

  // Step 7: Resolve plan (display, confirm, apply)
  yield* ws.resolvePlan(plan, { "install-mcp-server": installMcpServer })

  yield* log.success("Done")
})

// Env resolution helper
const resolveEnvValues = (envDeclarations, cliEnvFlags, nonInteractive) =>
  Effect.gen(function* () {
    // Parse --env KEY=VALUE flags into a map
    const cliValues = parseEnvFlags(cliEnvFlags)
    const resolved: Record<string, string> = {}

    for (const decl of envDeclarations) {
      if (cliValues[decl.name]) {
        resolved[decl.name] = cliValues[decl.name]
      } else if (decl.default) {
        resolved[decl.name] = decl.default
      } else if (decl.required) {
        if (Option.isSome(nonInteractive) && nonInteractive.value) {
          return yield* makeAppError({
            code: "MCP_ENV_REQUIRED",
            what: `Required env var ${decl.name} not provided`,
            howToFix: `Use --env ${decl.name}=VALUE`,
          })
        }
        // Interactive prompt via Bombshell
        resolved[decl.name] = yield* promptForEnvVar(decl)
      }
      // Optional vars not provided: write $VAR_NAME pass-through
    }

    return resolved
  })
```

**Operation handler** — extended from existing `installMcpServer` with agent config step.

```typescript
// extensions/mcp-servers/operations/install.ts — EXTENDED

const installMcpServer: OperationHandler<InstallMcpServerOperation, ...> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace
    const log = yield* Log

    // --- Existing steps (unchanged) ---
    // 1. Fetch archive from registry
    // 2. Validate integrity
    // 3. Extract to canonical path
    // 4. Build lock entry and persist to lockfile/settings
    yield* installFromRegistry(ref)
    const lockEntry = buildLockEntry(ref, new Date())
    yield* writeEffect // setMcpServer or setMcpServerLock

    // --- NEW: Agent config writing step ---
    // 5. Read manifest from canonical path to get transport config
    const manifest = yield* readManifestFromCanonical(ref)

    // 6. Get env values from operation args (resolved at CLI handler level)
    const envValues = op.args.envValues ?? {}

    // 7. Store resolved env values in settings entry
    if (Object.keys(envValues).length > 0) {
      yield* ws.updateMcpServerSettingsEntry(ref.server.name, (e) => ({ ...e, env: envValues }))
    }

    // 8. Write to all configured agents (concurrent)
    const configuredAgents = yield* ws.getConfiguredAgents()
    yield* Effect.forEach(
      configuredAgents,
      (agentId) =>
        addMcpServerToAgent(agentId, ref.server.name, manifest.transport, envValues, "project")
          .pipe(Effect.catchAll((e) => log.warn(`Agent config write failed for ${agentId}: ${e}`))),
      { concurrency: "unbounded" },
    )

    return { result: "success", message: `Installed ${ref.server.name}` } satisfies OperationResult
  })
```

#### `axm mcp uninstall`

**CLI handler** — validates server exists, builds plan, resolves.

```typescript
// cli-commands/mcp/uninstall/handler.ts

interface UninstallHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly nonInteractive: Option<boolean>;
}

const handleUninstall = Effect.fn("McpUninstall.handle")(function* (args: UninstallHandlerArgs) {
  const ws = yield* Workspace;
  const log = yield* Log;

  yield* log.info("axm mcp uninstall");

  // Step 1: Validate server exists
  const lockEntry = yield* ws.getLockedMcpServer(args.name);
  if (Option.isNone(lockEntry)) {
    return yield* makeAppError({
      code: "MCP_SERVER_NOT_FOUND",
      what: `MCP server '${args.name}' is not installed`,
      howToFix: "Run `axm mcp list` to see installed servers",
    });
  }

  // Step 2: Build operation
  const op = {
    name: "uninstall-mcp-server",
    args: { serverName: args.name },
  } satisfies UninstallMcpServerOperation;

  // Step 3: Build and resolve plan
  const plan = buildSingleStepPlan({
    operation: op,
    name: "Uninstall MCP server",
    description: `Uninstall ${args.name}`,
    label: args.name,
  });

  yield* ws.resolvePlan(plan, { "uninstall-mcp-server": uninstallMcpServer });

  yield* log.success("Done");
});
```

**Operation handler** — extended from existing `uninstallMcpServer` with agent config removal.

```typescript
// extensions/mcp-servers/operations/uninstall.ts — EXTENDED

const uninstallMcpServer: OperationHandler<UninstallMcpServerOperation, ...> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace

    // --- NEW: Remove from agent configs FIRST (before removing files) ---
    const configuredAgents = yield* ws.getConfiguredAgents()
    yield* Effect.forEach(
      configuredAgents,
      (agentId) =>
        removeMcpServerFromAgent(agentId, op.args.serverName, "project")
          .pipe(Effect.catchAll(() => Effect.void)),
      { concurrency: "unbounded" },
    )

    // --- Existing steps (unchanged) ---
    // 1. Read lockfile
    // 2. Remove canonical directory from disk
    // 3. Remove lockfile + settings entry
    yield* /* existing removal logic */

    return { result: "success", message: `Uninstalled ${op.args.serverName}` } satisfies OperationResult
  })
```

#### `axm mcp list`

**CLI handler** — reads settings and lockfile, displays table.

```typescript
// cli-commands/mcp/list/handler.ts

const handleList = Effect.fn("McpList.handle")(function* () {
  const ws = yield* Workspace;
  const log = yield* Log;

  // Step 1: Read configured MCP servers (settings) and locked MCP servers (lockfile)
  const configuredServers = yield* ws.getConfiguredMcpServers();
  const lockedServers = yield* ws.getLockedMcpServers();

  const entries = Object.entries(configuredServers);

  if (entries.length === 0) {
    yield* log.info("No MCP servers installed");
    return;
  }

  // Step 2: Build display rows by joining settings + lockfile data
  yield* log.message("NAME               VERSION  TRANSPORT  STATUS");
  yield* Effect.forEach(
    entries,
    ([name, entry]) => {
      const locked = lockedServers[name];
      const version = locked?.resolvedVersion ?? "unknown";
      // Read manifest to get transport type (or cache in lock entry)
      const transport = locked ? "stdio" : "unknown"; // simplified; real impl reads manifest
      const status = entry.enabled ? "enabled" : "disabled";
      return log.message(`${name.padEnd(19)}${version.padEnd(9)}${transport.padEnd(11)}${status}`);
    },
    { discard: true },
  );
});
```

#### `axm mcp enable`

**CLI handler** — validates state, builds single-step plan.

```typescript
// cli-commands/mcp/enable/handler.ts

interface EnableHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly nonInteractive: Option<boolean>;
}

const handleEnable = Effect.fn("McpEnable.handle")(function* (args: EnableHandlerArgs) {
  const ws = yield* Workspace;
  const log = yield* Log;

  yield* log.info("axm mcp enable");

  // Step 1: Validate server is installed
  const configuredServers = yield* ws.getConfiguredMcpServers();
  const entry = configuredServers[args.name];
  if (entry === undefined) {
    return yield* makeAppError({
      code: "MCP_SERVER_NOT_FOUND",
      what: `MCP server '${args.name}' not found`,
      howToFix: "Run `axm mcp list` to see installed servers",
    });
  }

  // Step 2: Validate server is currently disabled
  if (entry.enabled) {
    yield* log.info(`MCP server '${args.name}' is already enabled`);
    yield* log.success("Nothing to do.");
    return;
  }

  // Step 3: Validate lockfile entry exists (server files on disk)
  const lockEntry = yield* ws.getLockedMcpServer(args.name);
  if (Option.isNone(lockEntry)) {
    return yield* makeAppError({
      code: "MCP_SERVER_NOT_INSTALLED",
      what: `MCP server '${args.name}' has no lockfile entry`,
      howToFix: "Try reinstalling with `axm mcp install`",
    });
  }

  // Step 4: Build and resolve plan
  const op = {
    name: "enable-mcp-server",
    args: { serverName: args.name },
  } satisfies EnableMcpServerOperation;

  const plan = buildSingleStepPlan({
    operation: op,
    name: "Enable MCP server",
    description: `Enable ${args.name}`,
    label: args.name,
  });

  yield* ws.resolvePlan(plan, { "enable-mcp-server": enableMcpServer });

  yield* log.success("Done");
});
```

**Operation handler** — reads manifest, writes to agent configs or sets native enabled.

```typescript
// extensions/mcp-servers/operations/enable.ts — NEW

type EnableMcpServerOperation = Operation<"enable-mcp-server", { readonly serverName: string }>

const enableMcpServer: OperationHandler<EnableMcpServerOperation, ...> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace
    const log = yield* Log

    // 1. Read manifest from canonical dir to get transport config
    const manifest = yield* readManifestFromCanonical(op.args.serverName)

    // 2. Read stored env values from settings entry
    const configuredServers = yield* ws.getConfiguredMcpServers()
    const entry = configuredServers[op.args.serverName]
    const envValues = entry?.env ?? {}

    // 3. Get configured agents
    const configuredAgents = yield* ws.getConfiguredAgents()

    // 4. Write to each agent (concurrent)
    yield* Effect.forEach(
      configuredAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId)
        if (Option.isNone(maybeAgent)) return Effect.void
        const agent = maybeAgent.value

        if (!agent.mcp) return Effect.void // agent doesn't support MCP

        if (agent.mcp.nativeEnabled) {
          // Codex, OpenCode: set native enabled: true (preserves user customizations)
          return setNativeEnabled(agentId, op.args.serverName, true, "project")
            .pipe(Effect.catchAll((e) => log.warn(`Failed to enable in ${agentId}: ${e}`)))
        } else {
          // Other agents: write full entry (add if missing)
          return addMcpServerToAgent(agentId, op.args.serverName, manifest.transport, envValues, "project")
            .pipe(Effect.catchAll((e) => log.warn(`Failed to enable in ${agentId}: ${e}`)))
        }
      },
      { concurrency: "unbounded" },
    )

    // 5. Update settings: set enabled: true
    yield* ws.updateMcpServerSettingsEntry(op.args.serverName, (e) => ({ ...e, enabled: true }))
      .pipe(Effect.catchAll(() => Effect.void))

    return { result: "success", message: `Enabled ${op.args.serverName}` } satisfies OperationResult
  })
```

#### `axm mcp disable`

**CLI handler** — validates state, builds single-step plan.

```typescript
// cli-commands/mcp/disable/handler.ts

interface DisableHandlerArgs {
  readonly name: string;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly nonInteractive: Option<boolean>;
}

const handleDisable = Effect.fn("McpDisable.handle")(function* (args: DisableHandlerArgs) {
  const ws = yield* Workspace;
  const log = yield* Log;

  yield* log.info("axm mcp disable");

  // Step 1: Validate server exists in settings
  const configuredServers = yield* ws.getConfiguredMcpServers();
  const entry = configuredServers[args.name];
  if (entry === undefined) {
    return yield* makeAppError({
      code: "MCP_SERVER_NOT_FOUND",
      what: `MCP server '${args.name}' not found`,
      howToFix: "Run `axm mcp list` to see installed servers",
    });
  }

  // Step 2: Validate server is currently enabled
  if (!entry.enabled) {
    yield* log.info(`MCP server '${args.name}' is already disabled`);
    yield* log.success("Nothing to do.");
    return;
  }

  // Step 3: Build and resolve plan
  const op = {
    name: "disable-mcp-server",
    args: { serverName: args.name },
  } satisfies DisableMcpServerOperation;

  const plan = buildSingleStepPlan({
    operation: op,
    name: "Disable MCP server",
    description: `Disable ${args.name}`,
    label: args.name,
  });

  yield* ws.resolvePlan(plan, { "disable-mcp-server": disableMcpServer });

  yield* log.success("Done");
});
```

**Operation handler** — removes from agent configs or sets native enabled: false.

```typescript
// extensions/mcp-servers/operations/disable.ts — NEW

type DisableMcpServerOperation = Operation<"disable-mcp-server", { readonly serverName: string }>

const disableMcpServer: OperationHandler<DisableMcpServerOperation, ...> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace
    const log = yield* Log

    // 1. Get configured agents
    const configuredAgents = yield* ws.getConfiguredAgents()

    // 2. Remove from each agent or set native enabled: false (concurrent)
    yield* Effect.forEach(
      configuredAgents,
      (agentId) => {
        const maybeAgent = getAgentById(agentId)
        if (Option.isNone(maybeAgent)) return Effect.void
        const agent = maybeAgent.value

        if (!agent.mcp) return Effect.void

        if (agent.mcp.nativeEnabled) {
          // Codex, OpenCode: set native enabled: false (preserves user customizations)
          return setNativeEnabled(agentId, op.args.serverName, false, "project")
            .pipe(Effect.catchAll((e) => log.warn(`Failed to disable in ${agentId}: ${e}`)))
        } else {
          // Other agents: remove entry entirely
          return removeMcpServerFromAgent(agentId, op.args.serverName, "project")
            .pipe(Effect.catchAll((e) => log.warn(`Failed to disable in ${agentId}: ${e}`)))
        }
      },
      { concurrency: "unbounded" },
    )

    // 3. Update settings: set enabled: false
    yield* ws.updateMcpServerSettingsEntry(op.args.serverName, (e) => ({ ...e, enabled: false }))
      .pipe(Effect.catchAll(() => Effect.void))

    return { result: "success", message: `Disabled ${op.args.serverName}` } satisfies OperationResult
  })
```

#### `axm mcp update`

**CLI handler** — re-resolves from registry, detects version changes, builds plan.

```typescript
// cli-commands/mcp/update/handler.ts

interface UpdateHandlerArgs {
  readonly names: ReadonlyArray<string>    // variadic positional
  readonly yes: boolean
  readonly preview: boolean
  readonly nonInteractive: Option<boolean>
}

const handleUpdate = Effect.fn("McpUpdate.handle")(function* (args: UpdateHandlerArgs) {
  const ws = yield* Workspace
  const sources = yield* SourceHostProviders
  const log = yield* Log
  const spinnerSvc = yield* Spinner

  yield* log.info("axm mcp update")

  // Step 1: Load configured + locked MCP servers
  const configuredServers = yield* ws.getConfiguredMcpServers()
  const lockedServers = yield* ws.getLockedMcpServers()

  // Step 2: Filter to requested names, validate all exist
  const targets = yield* Effect.forEach(args.names, (name) =>
    Effect.gen(function* () {
      const entry = configuredServers[name]
      if (entry === undefined) {
        return yield* makeAppError({
          code: "MCP_SERVER_NOT_FOUND",
          what: `MCP server '${name}' not found`,
        })
      }
      if (!entry.enabled) {
        yield* log.warn(`Skipping ${name} (disabled)`)
        return Option.none()
      }
      return Option.some({ name, entry, locked: lockedServers[name] })
    }),
  ).pipe(Effect.map(Array.getSomes))

  if (targets.length === 0) {
    yield* log.info("Nothing to update.")
    return
  }

  // Step 3: Re-resolve each from registry with version constraint from settings
  const resolveHandle = yield* spinnerSvc.start("Checking for updates...")
  const results = yield* Effect.forEach(
    targets,
    (target) =>
      Effect.gen(function* () {
        const versionConstraint = Option.fromNullable(target.entry.source)
        const newRefs = yield* sources.find(/* registry source */, {
          type: "mcp-server",
          owner: Option.some(target.locked.owner),
          versionConstraint,
          skillNames: [target.name],
        })
        const newRef = newRefs.find((r) => r.type === "mcp-server")
        if (!newRef) return Option.none()

        // Compare versions — skip if already at latest
        if (newRef.version === target.locked.resolvedVersion) {
          yield* log.info(`${target.name} already at ${target.locked.resolvedVersion}`)
          return Option.none()
        }

        return Option.some({ name: target.name, ref: newRef, envValues: target.entry.env })
      }).pipe(Effect.catchAll((e) => {
        return log.warn(`Failed to resolve ${target.name}: ${e}`)
          .pipe(Effect.map(() => Option.none()))
      })),
    { concurrency: "unbounded" },
  )
  yield* resolveHandle.stop("Sources resolved")

  const updates = Array.getSomes(results)
  if (updates.length === 0) {
    yield* log.info("All servers up to date.")
    return
  }

  // Step 4: Build install operations with force: true
  const ops = updates.map((u) => ({
    name: "install-mcp-server",
    args: {
      ref: u.ref,
      force: true,
      versionConstraint: Option.none(),
      skipSettings: Option.none(),
      envValues: u.envValues,
    },
  }) satisfies InstallMcpServerOperation)

  // Step 5: Build and resolve plan
  const plan = buildUpdatePlan(ops, "Update MCP server(s)")
  yield* ws.resolvePlan(plan, { "install-mcp-server": installMcpServer })

  yield* log.success("Done")
})
```

#### `axm mcp publish`

**CLI handler** — validates extensions, builds multi-step plan.

```typescript
// cli-commands/mcp/publish/handler.ts

interface PublishHandlerArgs {
  readonly extensions: ReadonlyArray<string>;
  readonly registry: Option<string>;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly nonInteractive: Option<boolean>;
}

const handlePublish = Effect.fn("McpPublish.handle")(function* (args: PublishHandlerArgs) {
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;
  const base = ws.baseDir;

  yield* log.info("axm mcp publish");

  // Step 1: Registry guard
  yield* registryGuard;

  // Step 2: Resolve extension inputs (expand globs)
  const resolvedNames = yield* resolveExtensionInputs(args.extensions, "mcp-server");
  if (resolvedNames.length === 0) return;

  // Step 3: Resolve each name to FQN
  const extensionNames = yield* Effect.forEach(resolvedNames, (name) =>
    name.startsWith("@") && name.includes("/")
      ? Effect.succeed(name)
      : ws.getConfiguredProfile().pipe(Effect.map((owner) => `${owner}/mcp-servers/${name}`)),
  );

  // Step 4: Validate each extension exists on disk with manifest
  const handle = yield* spinnerSvc.start("Validating extensions...");
  yield* Effect.forEach(extensionNames, (extName) =>
    Effect.gen(function* () {
      const fqn = yield* parseFqn(extName);
      const extensionDir = path.join(
        base,
        REGISTRY_EXTENSIONS_DIR,
        fqn.handle,
        "mcp-servers",
        fqn.name,
      );
      const manifestPath = path.join(extensionDir, MCP_SERVER_MANIFEST_FILENAME);

      const exists = yield* fs
        .exists(manifestPath)
        .pipe(Effect.catchAll(() => Effect.succeed(false)));
      if (!exists) {
        yield* handle.stop("Failed");
        return yield* makeAppError({
          code: "EXTENSION_NOT_FOUND",
          what: `Managed MCP server not found: ${extName}`,
          details: [`Expected manifest at: ${manifestPath}`],
        });
      }
    }),
  );
  yield* handle.stop(`Validated ${extensionNames.length} extension(s)`);

  // Step 5: Determine target registry
  const registrySources = yield* ws.getConfiguredRegistrySources(Option.none());
  const registryName = Option.match(args.registry, {
    onNone: () => registrySources[0].name,
    onSome: (name) => name,
  });

  // Step 6: Build multi-step plan
  const steps = extensionNames.map((extName) => ({
    _tag: "PlannedJobStep" as const,
    operation: {
      name: "publish-mcp-server",
      args: { name: extName, registryName },
    } satisfies PublishMcpServerOperation,
    readiness: { status: "ready" as const, message: Option.none() },
    label: `Publish ${extName}`,
  }));

  const plan = {
    name: "Publish MCP server",
    description: Option.some(`Publish ${extensionNames.length} server(s) to "${registryName}"`),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  yield* ws.resolvePlan(plan, { "publish-mcp-server": publishMcpServer });

  yield* log.success("Done");
});
```

#### `axm mcp new`

**CLI handler** — scaffolds manifest with transport template, registers in settings.

```typescript
// cli-commands/mcp/new/handler.ts

interface McpNewHandlerArgs {
  readonly name: string;
  readonly owner: Option<string>;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly nonInteractive: Option<boolean>;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NAME_LENGTH = 64;

const handleMcpNew = Effect.fn("McpNew.handle")(function* (args: McpNewHandlerArgs) {
  const ws = yield* Workspace;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const log = yield* Log;

  yield* log.info("axm mcp new");

  // 1. Resolve profile
  const owner = Option.isSome(args.profile)
    ? normalizeProfile(args.profile.value)
    : yield* ws.getConfiguredProfile().pipe(
        Effect.flatMap((s) =>
          s === "@community"
            ? Effect.fail(
                makeAppError({
                  code: "NAMESPACE_REQUIRED",
                  what: "No profile configured for MCP server creation",
                  howToFix: "Use --profile or configure via `axm setup`",
                }),
              )
            : Effect.succeed(s),
        ),
      );

  // 2. Validate name
  if (!NAME_PATTERN.test(args.name) || args.name.length > MAX_NAME_LENGTH) {
    return yield* makeAppError({
      code: "MCP_SERVER_NAME_INVALID",
      what: `Invalid MCP server name: "${args.name}"`,
      howToFix: "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
    });
  }

  const fqn = `${owner}/mcp-servers/${args.name}`;
  const base = ws.baseDir;

  // 3. Check existence
  const configuredServers = yield* ws.getConfiguredMcpServers();
  if (args.name in configuredServers) {
    return yield* makeAppError({
      code: "MCP_SERVER_ALREADY_EXISTS",
      what: `MCP server '${args.name}' already exists in settings`,
    });
  }

  // 4. Compute paths
  const canonicalPath = path.join(base, REGISTRY_EXTENSIONS_DIR, owner, "mcp-servers", args.name);

  // 5. Create directory
  yield* fs.makeDirectory(canonicalPath, { recursive: true });

  // 6. Write manifest template with transport placeholder
  const manifest = {
    name: fqn,
    version: "0.0.1",
    description: `A new MCP server`,
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", `${args.name}@latest`],
    },
    env: [],
  };

  yield* fs.writeFileString(
    path.join(canonicalPath, MCP_SERVER_MANIFEST_FILENAME),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // 7. Register in settings
  yield* ws.setMcpServerSettingsEntry(args.name, {
    source: Option.some(fqn),
    enabled: true,
    env: {},
  });

  yield* log.success(`Created MCP server ${fqn}`);
});
```

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

## Appendix: Agent MCP Configuration References

### Claude Code

[Documentation](https://code.claude.com/docs/en/mcp)

Config file: `.mcp.json` (project scope) or `~/.claude.json` (local/user scope). JSON format, `mcpServers` key. Supports stdio, HTTP, and SSE transports. Environment variable expansion with `${VAR}` and `${VAR:-default}` syntax.

Scopes: `local` (default, per-user per-project in `~/.claude.json`), `project` (shared `.mcp.json` at project root), `user` (cross-project in `~/.claude.json`).

```jsonc
// .mcp.json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
    },
    "remote-api": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}",
      },
    },
  },
}
```

### Gemini CLI

[Documentation](https://geminicli.com/docs/tools/mcp-server/)

Config file: `.gemini/settings.json` (project) or `~/.gemini/settings.json` (user). JSON format, `mcpServers` key. Supports stdio (`command`), SSE (`url`), and HTTP (`httpUrl`) transports. Environment variable pass-through with `$VAR_NAME` syntax in `env`.

Agent-specific fields: `cwd` (working directory for stdio), `timeout` (request timeout in ms, default 600000), `trust` (bypass tool confirmations), `includeTools`/`excludeTools` (tool filtering).

```jsonc
// .gemini/settings.json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
      "cwd": ".",
      "env": {
        "API_KEY": "$MY_API_TOKEN",
      },
      "timeout": 30000,
      "trust": false,
    },
    "remote-api": {
      "httpUrl": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer token",
      },
    },
  },
}
```

### GitHub Copilot (VS Code)

[Documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)

Config file: `.vscode/mcp.json` (project) or VS Code user settings (user scope). JSON format, `servers` key. Requires explicit `type` discriminator on HTTP entries. Supports `inputs` array for secret prompting via `${input:id}` references and `envFile` for loading environment files.

```jsonc
// .vscode/mcp.json
{
  "servers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
      "env": {
        "API_KEY": "${input:apiKey}",
      },
    },
    "remote-api": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
    },
  },
  "inputs": [
    {
      "id": "apiKey",
      "type": "promptString",
      "description": "API Key",
      "password": true,
    },
  ],
}
```

### Codex CLI

[Documentation](https://developers.openai.com/codex/mcp/)

Config file: `.codex/config.toml` (project) or `~/.codex/config.toml` (user). TOML format, `[mcp_servers.<name>]` tables. Native `enabled` field for toggling without deletion. HTTP auth via `bearer_token_env_var` and `env_http_headers`.

Agent-specific fields: `enabled`, `required` (fail startup if unavailable), `startup_timeout_sec` (default 10), `tool_timeout_sec` (default 60), `enabled_tools`/`disabled_tools` (tool filtering), `cwd`.

```toml
# .codex/config.toml

# stdio server
[mcp_servers.chrome-devtools]
command = "npx"
args = ["-y", "chrome-devtools-mcp@latest"]
enabled = true

[mcp_servers.chrome-devtools.env]
API_KEY = "value"

# HTTP server with auth
[mcp_servers.remote-api]
url = "https://mcp.example.com/mcp"
bearer_token_env_var = "API_KEY"
http_headers = { "X-Custom" = "value" }
startup_timeout_sec = 20
tool_timeout_sec = 45
```

### OpenCode

[Documentation](https://opencode.ai/docs/mcp-servers/)

Config file: `opencode.jsonc` (project only, no user scope). JSON format, `mcp` key. Uses `local`/`remote` type discriminator. Command is an array of strings (not separate `command`/`args`). Native `enabled` field. Environment variables via `environment` key (not `env`).

```jsonc
// opencode.jsonc
{
  "mcp": {
    "chrome-devtools": {
      "type": "local",
      "command": ["npx", "-y", "chrome-devtools-mcp@latest"],
      "enabled": true,
      "environment": {
        "API_KEY": "value",
      },
      "timeout": 5000,
    },
    "remote-api": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer token",
      },
    },
  },
}
```

### Cursor

[Documentation](https://cursor.com/docs/context/mcp)

Config file: `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user). JSON format, `mcpServers` key. Supports stdio and SSE transports via `transport` field. No explicit `type` field on entries — uses `command` (stdio) or `url` (remote) to distinguish.

```jsonc
// .cursor/mcp.json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
      "env": {
        "API_KEY": "value",
      },
    },
    "remote-api": {
      "url": "https://mcp.example.com/mcp",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer token",
      },
    },
  },
}
```

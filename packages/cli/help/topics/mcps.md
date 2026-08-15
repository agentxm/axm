# MCP servers

An MCP server extension registers a Model Context Protocol server that your
coding agents connect to for extra tools and resources. AXM tracks the server
once and writes it into every configured agent's native MCP config, so you do
not hand-maintain `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, and
friends in parallel.

MCP server packages live in
`./.axm/extensions/<@owner>/mcps/<name>/mcp.json`. Unlike skills and
subagents, an MCP server has no `src/` body — the whole definition lives in the
manifest.

The governing standard for this extension type is the
[Model Context Protocol](https://modelcontextprotocol.io). AXM stores server
definitions in the protocol's own registry shape rather than an AXM-specific
one, so a manifest stays portable across agents and registries.

## mcp.json

[`mcp.json`](https://axm.sh/schemas/mcp.schema.json)

Run `axm help mcp-schema` to print the raw JSON Schema.

The manifest's `server` field embeds a verbatim MCP registry `server.json`
[ServerDetail](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json),
which holds the actual transports:

- **`packages`** — local transports the agent launches itself, such as an `npx`
  stdio process. Each declares its `environmentVariables`, marking secrets with
  `isSecret`.
- **`remotes`** — remote transports the agent connects to over HTTP, such as a
  `streamable-http` or `sse` URL.

```json
{
  "owner": "@acme",
  "type": "mcp-server",
  "name": "database",
  "version": "1.0.0",
  "server": {
    "name": "io.github.acme/database",
    "description": "MCP server for database operations",
    "version": "1.0.0",
    "packages": [
      {
        "registryType": "npm",
        "identifier": "@acme/database-mcp",
        "transport": { "type": "stdio" },
        "environmentVariables": [{ "name": "DATABASE_URL", "isRequired": true, "isSecret": true }]
      }
    ],
    "remotes": [{ "type": "streamable-http", "url": "https://mcp.acme.com/database" }]
  }
}
```

## Installing and managing

All commands live under `axm mcps` and accept `--scope project` (default) or
`--scope user`.

- `axm mcps install @owner/mcps/<name>` — install a registry MCP server. Pass
  `--env KEY=VALUE` to supply declared inputs, or `--non-interactive` to use
  defaults and placeholders instead of prompting.
- `axm mcps add <name> --command "npx -y linear-mcp-server"` — add an inline
  stdio server you define yourself. Use `--url` for a remote server, plus
  `--env` and `--header` for its inputs.
- `axm mcps import` — adopt MCP servers already present in your agent configs as
  inline AXM entries.
- `axm mcps update [@owner/mcps/<name>]` — update registry servers to their
  latest resolved version.
- `axm mcps list` (`ls`) — show installed servers and their state.
- `axm mcps enable <name>` / `axm mcps disable <name>` — keep a server installed
  while toggling whether AXM materializes it.
- `axm mcps uninstall <name>` — remove a server and its AXM-owned agent entries.

Authoring commands mirror the other extension types:

- `axm mcps new <name>` — scaffold an `mcp.json` under your workspace
  owner.
- `axm version @owner/mcps/<name> <patch|minor|major>` — bump the manifest
  version.
- `axm mcps publish @owner/mcps/<name>` — validate and upload a new version to
  the registry.

## Materialization

MCP servers are not symlinked like skills. `axm sync` and the `axm mcps`
commands write each server into the configured agents' native MCP config files
under that agent's servers key:

- **Claude Code** — `.mcp.json`, key `mcpServers`
- **Cursor** — `.cursor/mcp.json`, key `mcpServers`
- **VS Code (Copilot)** — `.vscode/mcp.json`, key `servers`
- **Codex** — TOML, key `mcp_servers`

The key and dialect vary per agent (`mcpServers`, `servers`, `mcp`,
`mcp_servers`, `context_servers`). Local transports render as `command`/`args`;
remote transports render as `url`/`headers`. AXM only edits entries whose
ownership it can prove and preserves servers added by other tools. `axm sync`
restores missing or stale AXM-owned entries and blocks the affected server on
unowned or ambiguous collisions.

## Settings and lockfile

Installed servers are tracked in `.axm/settings.json` under `mcpServers`, with
shared resolution state in `.axm/axm-lock.yaml` under `mcpServers`. The lockfile
does not persist which agents received materialized configuration. Every entry
declares exactly one transport — `source`, `command`, or `url`:

```jsonc
{
  "mcpServers": {
    // Registry server, compact form
    "database": "@acme/mcps/database@^1.0.0",
    // Registry server with inputs and an opt-out
    "search": {
      "source": "@acme/mcps/search@^2.0.0",
      "enabled": false,
      "env": { "SEARCH_API_KEY": "${SEARCH_API_KEY}" },
    },
    // Inline stdio server
    "linear": { "command": "npx", "args": ["-y", "linear-mcp-server"], "env": ["LINEAR_API_KEY"] },
    // Inline remote server
    "sentry": {
      "url": "https://mcp.sentry.dev/sse",
      "headers": { "Authorization": "Bearer ${SENTRY_TOKEN}" },
    },
  },
}
```

- **`enabled: false`** keeps a server installed but omits it from agent configs.
- **`env`** accepts a `{ KEY: value }` map or an array of names; `["VAR"]`
  decodes to a `${VAR}` reference.
- Agent-native entries without AXM ownership metadata remain unowned and are
  never deleted by reconciliation.

Prefer the CLI over hand-editing — it normalizes the shape and reconciles agent
configs through `axm sync`.

## Secrets

Never store literal tokens in `.axm/settings.json`. Put secrets in `env` or
`headers` as `${VAR}` references and let each agent resolve them from the
environment at runtime. `axm lint` flags secret-looking literals through
`workspace/mcps-no-secret-literal`, and `mcp.json` marks sensitive
inputs with `isSecret` so installers prompt for them instead of hardcoding.

## Recommended packs

Name the pack(s) your server ships with in `mcp.json` `recommendedPacks`,
using the bare pack reference — no version range:

```json
{
  "recommendedPacks": ["@acme/packs/bricks"]
}
```

When a pack lists this server as a dependency and the server lists that pack as
recommended, the registry marks both sides of the relationship **official**.
Keep the MCP server self-contained. `recommendedPacks` does not install the pack
or its members. If the server requires another extension, follow
`axm help packs` for the only supported direct-sibling pack composition.

## Where to go next

- `axm mcps --help` — full MCP server subcommand surface
- `axm help mcp-schema` — raw `mcp.json` JSON Schema
- `axm help settings` — workspace state, `mcpServers`, and `mcpServersConfig`
- `axm help workspace-state` — packaged and inline MCP observation semantics
- `axm help packs` — bundling MCP server extensions with extension packs

# MCP servers

Before distributing package-root files, read `axm help publish` for the
Registry-only archive policy and effective preview.

An MCP server extension registers a Model Context Protocol server that your
coding agents connect to for extra tools and resources. AXM tracks the server
once and writes it into the native MCP config of every configured agent that
can represent it, so you do not hand-maintain `.mcp.json`, `.cursor/mcp.json`,
`.vscode/mcp.json`, and friends in parallel.

AXM manages the connection definition and its lifecycle, including command or
URL, arguments, environment-variable references, headers, installation,
projection, packaging, and publication. It does not implement or debug the MCP
server software behind that connection.

MCP server packages live in
`./mcps/<name>/mcp.json`; acquired packages live under
`./agent_extensions/registry.agentxm.ai/<@owner>/mcps/<name>`. This is the Registry case of
the source-addressed retained-package scheme. Unlike skills and
subagents, an MCP server has no `src/` body — the whole definition lives in the
manifest.

The governing standard for this extension type is the
[Model Context Protocol](https://modelcontextprotocol.io). AXM stores server
definitions in the protocol's own registry shape rather than an AXM-specific
one, so a manifest stays portable across agents and registries.

## Install a portable plugin connection

Agent Plugins 1.0 packages from local directories and Git can expose remote
connections in their root `mcp.json`. Select the upstream connection name and
optionally give it a local alias:

```sh
axm mcps install ./plugin --mcp-server context --as work-context --agent claude-code
```

Use `--preview` first. On first install, repeat `--agent` for each destination;
existing workspaces retain their configured agents. No Registry account or AXM
manifest is required. For duplicate names in a repository, select
`--mcp-server plugins/review#context` with the exact package path.

AXM retains the complete package unchanged and activates only selected
connections. Several aliases share the accepted package snapshot; updating one
advances the shared source and reconciles its connections. Reinstall restores
the accepted snapshot. Removing the last connection releases its package.

Supported portable connections declare `streamable-http` or `sse` explicitly.
AXM preserves that transport and literal URL/header values, and reports a host
as unsupported if its configuration would change those values. Portable stdio
connections are currently unsupported because their plugin working directory
and variable semantics require runtime support. Vendor-specific MCP manifest
loaders and unknown plugin runtime components are not activated. Retaining
those files does not claim runtime compatibility.

## Registry mcp.json

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

Installed-state commands accept `--scope project` (default) or `--scope user`.
Package creation and conversion use the project workspace.

- `axm mcps install @owner/mcps/<name>` — install a Registry MCP server.
  Use `--as <local-name>` for another connection to the same package. Select
  one distribution with `--distribution <id>` when the manifest offers several;
  a single candidate can be selected automatically by install. Sync never
  makes a new selection.
- Bind selected inputs with `--bind environment/REGION=west` for literals or
  `--bind-env environment/API_TOKEN=API_TOKEN` for host environment references.
  Input locations are distinct; use the input identifiers reported by
  inspection. Required missing inputs, invalid choices and unknown bindings
  block settlement. AXM never prompts for secret values.
- `axm mcps add linear --command npx --arg=-y --arg=linear-mcp-server --env LINEAR_API_KEY`
  — declare an executable token, ordered arguments and a host environment reference.
  `--command` does not parse a shell command. `--cwd` resolves relative to the
  selected scope root (project root or user home); omission retains the host default.
- `axm mcps add service --url https://example.com/mcp --native-oauth` — declare
  Streamable HTTP with native authentication. SSE requires `--transport sse`;
  the URL suffix never selects transport. Use `--header NAME=VALUE` for literal
  headers or `--header-env NAME=ENV_NAME` for symbolic headers. Both split on
  the first `=`. `--connection` accepts a JSON object with literal, environment-reference, or
  template values. It excludes `--transport`, `--command`, `--url`, `--arg`,
  `--cwd`, `--env`, `--header`, and `--header-env`. `--native-oauth` can
  compose with either connection form, but excludes an Authorization header.
- `axm mcps adopt --preview` — inspect native entries, fingerprints,
  desired declarations, configured readers, planned writes and blockers.
  Apply records the entire selected batch atomically without stamping native entries. Any selected blocker
  refuses the batch; repeat `--name <entry>` to select an explicit subset.
  Unsupported native fields and literal credentials remain untouched.
- `axm mcps import <name> <extension>` — convert one named native MCP server
  into a project-workspace package, disabled unless `--enable` is supplied.
  The selected name must resolve to exactly one losslessly representable
  server. `--preview` describes the conversion without changing any files.
- `axm mcps update` — advance configured servers to an eligible Registry resolution or
  the current selected Git/local source. Pass local names or globs to select connections,
  or `--source @owner/mcps/<name>` to select an exact source. Every selected
  connection that shares a source advances together.
- `axm mcps list` — show local connection names, sources, accepted resolutions,
  and state. `axm mcps show <name> --agent <agent>` separates configuration,
  projection and readiness from unchecked runtime/authentication, and supplies
  manual host instructions. Inspection never executes a host, retrieves
  credentials, starts OAuth or contacts an MCP endpoint.
- `axm mcps enable <name>` / `axm mcps disable <name>` — keep a server installed
  while toggling whether AXM materializes it.
- `axm mcps uninstall <local-name>` — remove one connection and its exact named
  entries from configured agents in the selected scope. Shared package content and resolution remain until their last
  connection or Pack route is removed.

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

- **Claude Code** — project `.mcp.json`, user `~/.claude.json`, key `mcpServers`.
- **Cursor** — `.cursor/mcp.json`, key `mcpServers`.
- **VS Code local extension host** — project `.vscode/mcp.json`, key `servers`;
  user scope requires an explicitly selected profile configuration.
- **Codex** — `.codex/config.toml`, key `mcp_servers`.
- **Copilot CLI** — project `.mcp.json`, user `~/.copilot/mcp-config.json`.
- **OpenCode V2** — `opencode.json`, key `mcp.servers`.
- **Pi 1.0+** — native MCP configuration; SSE is unsupported.

Run `axm agents capabilities <agent>` and `axm mcps show <name>` for the
resolved scope, profile, transport restrictions and native instructions.
Implemented configuration writers do not establish native runtime verification.
Remote development, containers and WSL are outside these local host claims.

The key and dialect vary per agent (`mcpServers`, `servers`, `mcp`,
`mcp_servers`, `context_servers`). Local transports render as `command`/`args`;
remote transports render as `url`/`headers`. A validated effective declaration
authorizes its named entry, including a different unmarked same-name entry.
Sync replaces the complete entry and removes fields no longer declared; equal
decoded values are a no-op. Other entries and settings remain untouched. Native
settings contain no injected AXM ownership metadata.

Every configured agent whose transport and
config capability can represent the server receives it; there is no per-server
agent list. A configured agent that cannot represent the transport or secret
reference is reported as unsupported with an explicit reason. A projection
that needs a required input is reported as blocked. Neither case is silently
skipped.

Some agents share one native config file. AXM writes one entry that every
sharing agent reads; a genuine dialect conflict between sharing agents blocks
the server with an explicit reason. Removing or renaming a declaration,
removing an agent, or losing a Pack route retains native entries and does not
prove execution stopped. Use explicit `mcps disable` or `mcps uninstall` while
the declaration exists to withdraw its exact key from configured agents. After
intent has gone, inspect the native file and manually remove only that key.
There is no global orphan cleanup. Native files and parents remain; uninstall
refuses acquired-package deletion while retained registrations reference its
code. Projection capability and actual host connection state are separate checks.

## Settings and lockfile

Installed servers are tracked in `axm.json` under `mcpServers`, with
shared resolution state in `axm-lock.yaml` under `mcpServers`. The lockfile
does not persist which agents received materialized configuration. Each entry
declares a `source` with a persisted `distribution`, or an inline `connection`:

```json
{
  "mcpServers": {
    "database": {
      "source": "@acme/mcps/database@^1.0.0",
      "distribution": {
        "kind": "package",
        "registryType": "npm",
        "identifier": "@acme/database-mcp",
        "transport": "stdio"
      },
      "bindings": [
        {
          "target": { "kind": "environment", "name": "DATABASE_URL" },
          "value": { "env": "DATABASE_URL" }
        }
      ]
    },
    "linear": {
      "connection": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "linear-mcp-server"],
        "env": { "LINEAR_API_KEY": { "env": "LINEAR_API_KEY" } }
      }
    },
    "service": {
      "connection": {
        "transport": "streamable-http",
        "url": "https://example.com/mcp"
      },
      "auth": { "type": "native-oauth" }
    }
  }
}
```

The settings key is the local connection name. Multiple names can share one
source with independent bindings and activation. Their distribution selectors
survive manifest reordering and version changes; a disappeared or ambiguous
selection blocks update. Every reachable alias is validated before the shared
source revision advances. Pack-derived members use the same connection
preferences without acquiring an independent source route.

Strings are literal, including strings spelled `${NAME}`.
`{ "env": "NAME" }` is a host environment reference;
`{ "template": ["Bearer ", { "env": "TOKEN" }] }` is bounded concatenation.
AXM never expands either using its own environment. A target that cannot
preserve the meaning is unsupported. Fixed Registry inputs cannot be overridden;
optional unset inputs are omitted and required inputs must be bound.

`enabled: false` disables the exact declared entry using a required native flag
or withdraws that entry while retaining the connection declaration. Unselected
entries remain untouched. Shared native files require agreement from all
configured applicable readers. Conflicting effective declarations and
incompatible readers block the affected write. A running host may
need reload, restart or renewed trust after any change; configuration withdrawal
does not prove disconnection, process termination or token revocation.

## Authentication and former MCP credentials

Known secrets and Authorization values require symbolic references or supported
native OAuth. Secret argument inputs and protocol-owned custom headers are
refused. Explicit native OAuth cannot coexist with an Authorization header.
The native host owns environment availability, login, tokens, helpers and
consent. An omitted auth declaration retains host defaults.

MCP operations never read, write or delete AXM's former MCP keychain entries.
Existing entries remain untouched, including on uninstall. To remove obsolete
entries, use your operating system's credential manager and select the
`axm-mcp` service; its account names are opaque connection/input digests.
Review the service identity before removal. Registry-login credentials and
native-host authentication are separate and must be retained as needed.

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
or its members. If the server requires another extension, name that sibling by
its extension identity and let the agent resolve it through its own discovery —
never by file path. See `axm help packs` for pack composition.

## Where to go next

- `axm mcps --help` — full MCP server subcommand surface
- `axm help mcp-schema` — raw `mcp.json` JSON Schema
- `axm help settings` — workspace state, `mcpServers`, and `mcpServersConfig`
- `axm help workspace-state` — packaged and inline MCP observation semantics
- `axm help packs` — bundling MCP server extensions with extension packs

# Settings

AXM workspace state lives in `.axm/settings.json`.

## `.axm/settings.json`

[`settings.json`](https://axm.sh/schemas/settings.schema.json)

Run `axm help settings-schema` to print the raw JSON Schema.

## Anatomy

`owner` is the default handle AXM uses when creating or resolving workspace-owned extensions.

`minimumReleaseAge` controls unattended registry resolution for `axm sync` and
update commands. It defaults to `"24h"` so brand-new versions are held until
they have aged for 24 hours; use `"0s"` to disable the holdback.

`agents` lists the coding agents AXM syncs into. Use `axm agents list`,
`axm agents add <id>`, and `axm agents remove <id>` instead of hand-editing
this array; the commands also reconcile per-agent managed artifacts for
installed extensions. `sources` names registries and source hosts that entries
can reference.

Extension entries live under `skills`, `commands`, `subagents`, `packs`, and `mcpServers`. Each entry can be a source string or an object with metadata such as `enabled` or `authored`.

Prefer the plain source string. Use the object form only when you need to depart from the defaults — set `enabled: false` to disable an entry, or `authored: true` to mark it as locally authored. Never write `enabled: true` or `authored: false` explicitly; those are the defaults and should be omitted.

```jsonc
{
  "skills": {
    "code-review": "@acme/skills/code-review@^1.0.0",
    "legacy-rules": { "source": "@acme/skills/legacy-rules@^1.0.0", "enabled": false },
    "house-style": { "source": "./skills/house-style", "authored": true },
  },
}
```

Feature config lives under `rulesConfig`, `skillsConfig`, `commandsConfig`, `subagentsConfig`, `packsConfig`, and `mcpServersConfig`.

`lint` configures workspace-only severity overrides for `axm lint`.

## MCP servers

Registry MCP servers use the same source-string form as other extensions. Inline
MCP servers can be declared directly with either `command`/`args` for stdio or
`url`/`headers` for a remote server. Use `axm mcps add` for both forms, `axm
mcps import` to adopt unmanaged entries from existing agent config files, and
`axm sync` to re-emit configured servers to every configured agent.

```jsonc
{
  "mcpServers": {
    "github": "@acme/mcps/github@^1.0.0",
    "linear": {
      "command": "npx",
      "args": ["-y", "linear-mcp-server"],
      "env": ["LINEAR_API_KEY"],
    },
    "sentry": {
      "url": "https://mcp.sentry.dev/sse",
      "headers": { "Authorization": "Bearer ${SENTRY_TOKEN}" },
    },
  },
}
```

MCP `env` accepts either a map or an array of variable names. Array entries
decode to `${VAR}` references. Keep secrets out of settings by storing
`${VAR}` references in `env` and `headers`; AXM preserves those references when
syncing agent config.

## Authoring

Let AXM edit settings for routine install, remove, enable, disable, agent, and
source changes. Hand-edit settings when reviewing generated changes, adding
source hosts, or adjusting `lint.rules`.

Set `authored: true` only for extensions you expect to edit in this workspace. AXM then treats the entry as locally owned and changes three behaviors:

- **Uninstall preserves files** — removing the entry leaves its directory under `.axm/extensions/` in place instead of deleting it.
- **Update keeps the local source** — install and update operations retain the entry's existing source rather than repointing it to a registry FQN.
- **Enable re-resolves locally** — re-enabling resolves the extension from the local managed copy instead of the registry.

Omit `authored` otherwise — `false` is the default and should not be written explicitly. Likewise, omit `enabled` unless you are disabling an entry with `enabled: false`.

Because authored extensions stay locally owned, keep them disabled (`enabled: false`) unless you are actively maintaining them.

## Ignoring Extensions

Use each feature's `ignore` list to leave matching pre-existing extensions unmanaged. Ignored extensions are not pruned or reconciled by AXM.

## Where to go next

- `axm help basic-usage` — workspace file overview
- `axm agents list` — configured, detected, and supported coding-agent IDs
- `axm help skills` — working with skills
- `axm help commands` — working with slash commands
- `axm help subagents` — working with subagents
- `axm help packs` — working with packs

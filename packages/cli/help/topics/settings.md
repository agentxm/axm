# Settings

Desired AXM workspace state lives in `.axm/settings.json`. Observed content,
trust, and receipt history are separate; see `axm help workspace-state`.

## `.axm/settings.json`

[`settings.json`](https://axm.sh/schemas/settings.schema.json)

Run `axm help settings-schema` to print the raw JSON Schema.

## Anatomy

`owner` is the default handle AXM uses when creating or resolving workspace-owned extensions.

`minimumReleaseAge` controls unattended Registry resolution for bare `axm
install`, `axm sync`, and update commands. It defaults to `"24h"` so brand-new
versions are held until they have aged for 24 hours; use `"0s"` to disable the
holdback.

`minimumReleaseAgeExclude` declares reviewed Registry exemptions. Each entry is
an exact FQN (`@owner/skills/name`), an owner/type pattern
(`@owner/skills/*`), or an owner pattern (`@owner/*`). Project settings take
precedence over user settings, including an explicit empty array. AXM resolves
the Registry index first and matches its authoritative owner, type, and name;
an excluded pack exempts its complete Registry dependency graph. `axm lint`
warns when an excluded publisher differs from the workspace's declared
`owner`.

An update chooses the newest version that both satisfies the configured range
and has reached the minimum age. If a newer matching version is still too new,
AXM continues with the eligible version and reports the held release. If every
matching version is too new, a workspace-wide `axm update` leaves that target
unchanged and continues with other targets. A targeted update preserves already
trusted and usable desired state; otherwise it stops without writing.

Use `--ignore-release-age` on bare `axm install`, `axm sync`, or `axm update`
for a reviewed, one-shot workspace bypass. A targeted Registry update also
accepts the flag; attended named installs accept it but already select the
requested release without the unattended gate. The flag does not change
settings. JSON and NDJSON results report the evaluation time, holdbacks,
dependency paths, eligibility times, and each bypass cause and exemption
scope.

`agents` lists the coding agents AXM syncs into. Use `axm agents list`,
`axm agents add <id>`, and `axm agents remove <id>` instead of hand-editing
this array; the commands also reconcile per-agent managed artifacts for
installed extensions. `sources` names registries and source hosts that entries
can reference.

Extension entries live under `skills`, `mcpServers`, `subagents`, `rules`,
`hooks`, `knowledge`, and `packs`. Each entry can be a source
string or an object with metadata such as `enabled`.

Prefer the plain source string. Use the object form when you need metadata such
as `enabled: false`. A workspace-authored package uses the intrinsic source
`workspace:@owner/<plural-type>/<name>`; authorship is derived from that source.

```jsonc
{
  "skills": {
    "code-review": "@acme/skills/code-review@^1.0.0",
    "legacy-rules": { "source": "@acme/skills/legacy-rules@^1.0.0", "enabled": false },
    "house-style": "workspace:@acme/skills/house-style",
  },
}
```

Feature config lives under `rulesConfig`, `skillsConfig`, `hooksConfig`,
`knowledgeConfig`, `subagentsConfig`, `packsConfig`,
and `mcpServersConfig`.

`knowledgeConfig.instructions` controls the managed `Knowledge Base` table in
the canonical instruction source. It defaults to enabled; persist only the
non-default `false`. This setting does not affect install, trust, enablement,
search, or open behavior.

```jsonc
{
  "knowledgeConfig": {
    "instructions": false,
  },
}
```

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

AXM writes new settings files in canonical key order. When editing an existing
file, it preserves the file's key order and untouched formatting.

Workspace sources are authoritative local packages. AXM protects them across
their lifecycle:

- **Install and update cannot replace source** — update reports the package unchanged and explicit refresh/constraint flags do not bypass protection.
- **Enable and sync resolve locally** — AXM validates the canonical package and never fetches the same FQN from a registry.
- **Uninstall removes owned state** — canonical source is deleted when nothing else reaches it; use disable to retain a managed package without activating it.
- **Editing requires authority** — version and pack membership commands reject non-workspace packages; use `axm adopt <fqn>` first.

The removed `authored` property is invalid. Omit `enabled` unless disabling an
entry with `enabled: false`; enabled state does not affect authored publishing.

## Where to go next

- `axm help basic-usage` — workspace file overview
- `axm help workspace-state` — reconciliation and workspace file authority
- `axm agents list` — configured, detected, and supported coding-agent IDs
- `axm help skills` — working with skills
- `axm help subagents` — working with subagents
- `axm help packs` — working with packs

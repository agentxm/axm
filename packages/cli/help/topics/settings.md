# Settings

Desired project AXM workspace state lives in `axm.json`. Accepted external
resolution and observed state are separate; see `axm help workspace-state`.
User scope uses the same filename at `~/.axm/workspace/axm.json`.

## Validity prerequisite

Every command that opens a project workspace requires each present project
`axm.json` and user `~/.axm/workspace/axm.json` file to be readable, valid JSON, and
valid against the settings schema before the command begins. A missing file
still means that scope has not expressed a choice.

An unreadable or invalid settings file stops the command without changing
workspace or user state. Force-like controls such as `--accept-warnings`,
`--reinstall`, `--refresh`, and `--ignore-version-constraints` do not bypass
this prerequisite. AXM does not rewrite, migrate, or degrade invalid settings;
repair or restore the reported file directly, then run the command again.

Telemetry is execution policy, not workspace state. A top-level `telemetry`
key is unrecognized and strict linting reports it. Use `AXM_TELEMETRY` or
`DO_NOT_TRACK`; see `axm help environment` for values and precedence.

## `axm.json`

[`axm.json`](https://axm.sh/schemas/settings.schema.json)

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
an excluded pack exempts its complete Registry dependency graph.

An update chooses the newest version that both satisfies the configured range
and has reached the minimum age. If a newer matching version is still too new,
AXM continues with the eligible version and reports the held release. If every
matching version is too new, a workspace-wide `axm update` leaves that target
unchanged and continues with other targets. A targeted update preserves already
accepted and usable desired state; otherwise it stops without writing.

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
as `enabled: false`. A project-authored package uses the exact intrinsic source
`workspace`; authorship combines the project `owner`, the map key, the
extension type, and the manifest at that type's authored root.
User scope does not accept user-authored `workspace` sources or
authoring-directory settings. The bundled AXM skill is a reserved internal
static package.

```jsonc
{
  "skills": {
    "code-review": "@acme/skills/code-review@^1.0.0",
    "disabled-review": { "source": "@acme/skills/disabled-review@^1.0.0", "enabled": false },
    "house-style": "workspace",
  },
}
```

Workspace instruction-file management lives at top-level `instructionFiles`:

```jsonc
{
  "instructionFiles": {
    "fileName": "AGENTS.md",
    "gitignoreAliases": true,
  },
}
```

The object enables propagation, `false` explicitly disables it, and absence
means it has not been configured. Use `axm instructions` to inspect the
effective state and `axm instructions enable|disable` to change it.

Knowledge-wide contribution config lives under `knowledgeConfig`.

`knowledgeConfig.instructions` controls the managed `Knowledge Bundles` table in
the canonical instruction source. It defaults to enabled; persist only the
non-default `false`. This setting does not affect install, accepted resolution, enablement, or
concept discovery.

```jsonc
{
  "knowledgeConfig": {
    "instructions": false,
  },
}
```

One Knowledge entry may override only its own compact instruction-table row:

```jsonc
{
  "knowledge": {
    "platform": {
      "source": "@acme/knowledge/platform@^1.0.0",
      "instructionEntry": false,
    },
  },
}
```

Persist either explicit boolean to override the bundle manifest; omit the field
to inherit the manifest default. This per-extension realization choice does
not disable the bundle or its Concepts corpus. Edit settings, then run `axm
sync`; see `axm help knowledge` for precedence and Pack-member behavior.

Workspace publication defaults live under `publish`. An extension manifest's
`publish.visibility` takes precedence over `publish.defaultVisibility`.

```jsonc
{
  "publish": {
    "defaultVisibility": "private",
  },
}
```

`lint.rules` maps an exact rule ID to a local severity for `axm lint`:

```jsonc
{
  "lint": {
    "rules": {
      "skill/frontmatter-standard-valid": "off",
      "workspace/instructions-target-current": "warn",
    },
  },
}
```

Use `off` to suppress the rule locally, `info` for informational findings,
`warn` for warnings, or `error` for errors. Omit a rule to use its catalog
default. The spelling in settings is `warn`; emitted findings use `warning`.
Warnings succeed normally and fail with `axm lint --strict` without becoming
errors. Informational findings succeed and keep the `clean` exit category,
which means the result has no errors or warnings.

The active project or user workspace supplies its own settings. These local
overrides do not change the Registry's fixed publication requirements.

## Official AXM skill

The official `@agentxm/skills/axm` skill is opt-in workspace intent. A direct
official `skills.axm` entry or an official Pack member declares it; when neither
exists, the workspace has not selected the skill and lint reports only an
informational discovery fact for its absence.

`axm setup` seeds the official skill when it creates a new workspace. Adopting
an existing `axm.json` preserves that workspace's declared skills. To opt in
later, run `axm skills install @agentxm/skills/axm --bundled`.

Each extension type has an optional authored-root setting such as
`skillsConfig.dir`, `rulesConfig.dir`, or `packsConfig.dir`. The value must be a
normalized workspace-relative directory contained by the project. Authored
roots cannot overlap reserved runtime, acquired-package, agent-projection, or
other authored roots, and direct package directories cannot be symlinks. The
defaults are `skills`, `mcps`, `subagents`, `rules`, `hooks`, `knowledge`, and
`packs`.

## MCP servers

Registry MCP servers use the same source-string form as other extensions. The
map key is the local connection name, so multiple keys may reference one source
while keeping separate inputs, activation, and projections.
They share one accepted source resolution. Inline
MCP servers can be declared directly with either `command`/`args` for stdio or
`url`/`headers` for a remote server. Use `axm mcps add` for both forms, `axm
mcps import` to adopt unmanaged entries from existing agent config files, and
`axm sync` to reconcile configured servers with every configured agent that can
represent them.

```jsonc
{
  "mcpServers": {
    "work-github": "@acme/mcps/github@^1.0.0",
    "personal-github": "@acme/mcps/github@^1.0.0",
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
syncing agent config and reports a configured agent that cannot represent one
as unsupported.

An MCP entry carries no agent list of its own. Every agent in the workspace
`agents` list that supports the server transport and has a native config target
for the selected scope receives the server; an agent that cannot represent it
is reported as unsupported. `axm mcps import` records each adopted server once,
and the next reconciliation writes it to every configured agent that can
represent it.

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
- **Editing requires authority** — version and pack membership commands reject non-workspace packages; use `axm adopt <extension>` first.

Omit `enabled` unless disabling an entry with `enabled: false`; enabled state
does not affect workspace-authored publishing.

## Where to go next

- `axm help basic-usage` — workspace file overview
- `axm help workspace-state` — reconciliation and workspace file authority
- `axm help environment` — process controls, precedence, and automation safety
- `axm agents list` — configured, detected, and supported coding-agent IDs
- `axm help skills` — working with skills
- `axm help subagents` — working with subagents
- `axm help packs` — working with packs

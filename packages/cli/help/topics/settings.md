# Settings

AXM workspace state lives in `.axm/settings.json`.

## `.axm/settings.json`

[`settings.json`](https://axm.sh/schemas/settings.schema.json)

Run `axm help settings-schema` to print the raw JSON Schema.

## Anatomy

`owner` is the default handle AXM uses when creating or resolving workspace-owned extensions.

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

## Authoring

Let AXM edit settings for routine install, remove, enable, disable, agent, and
source changes. Hand-edit settings when reviewing generated changes, adding
source hosts, or adjusting `lint.rules`.

Set `authored: true` only for extensions you expect to edit in this workspace. Omit `authored` otherwise — `false` is the default and should not be written explicitly. Likewise, omit `enabled` unless you are disabling an entry with `enabled: false`.

## Ignoring Extensions

Use each feature's `ignore` list to leave matching pre-existing extensions unmanaged. Ignored extensions are not pruned or reconciled by AXM.

## Where to go next

- `axm help basic-usage` — workspace file overview
- `axm agents list` — configured, detected, and supported coding-agent IDs
- `axm help skills` — working with skills
- `axm help commands` — working with slash commands
- `axm help subagents` — working with subagents
- `axm help packs` — working with packs

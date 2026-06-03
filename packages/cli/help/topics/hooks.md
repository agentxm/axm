# Hooks

Hook packages live in `./.axm/extensions/<@owner>/hooks/<hook-name>`.

A hook extension runs your code on an agent lifecycle event — `PreToolUse`,
`PostToolUse`, `SessionStart`, and friends. It is a portable manifest plus an
executable body. On install, AXM materializes the body under
`.axm/extensions/...` and merges a native hook entry into the target agent's
settings file that points at it.

The command AXM writes always targets the materialized entrypoint in your
workspace — the registry never injects an inline command string into your agent
settings.

## hook.json

[`hook.json`](https://axm.sh/schemas/hook.schema.json)

The manifest owns the binding and the entrypoint:

```json
{
  "$schema": "https://axm.sh/schemas/hook.schema.json",
  "type": "hook",
  "owner": "@acme",
  "name": "block-secrets",
  "version": "1.0.0",
  "runtime": "bash",
  "entrypoint": "src/hook.sh",
  "bindings": [{ "event": "PreToolUse", "matcher": "Write|Edit|MultiEdit" }],
  "timeoutMs": 5000,
  "blocking": true,
  "capabilities": { "network": false, "filesystemWrite": false }
}
```

Required fields:

- `runtime` — interpreter AXM writes into the generated command: `bash`, `node`,
  or `python`.
- `entrypoint` — path to the executable body, relative to the manifest
  directory. The file must exist in the archive.
- `bindings` — the lifecycle events this hook serializes into agent-native
  settings.

`timeoutMs`, `blocking`, and `capabilities` are optional. Run
`axm help hook-schema` to print the raw JSON Schema.

## `src/`

The `src/` directory holds the entrypoint named by `entrypoint`, plus any helper
files. The body is plain executable source for the declared `runtime`; AXM does
not transform it.

```text
block-secrets/
├── README.md
├── hook.json
└── src/
    └── hook.sh
```

## Bindings

Each binding is an `event` with an optional `matcher`. The supported events are:

`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `SessionStart`, `Stop`,
`SubagentStop`, and `PreCompact`.

`matcher` is valid only on `PreToolUse` and `PostToolUse` — it filters which
tools trigger the hook (for example, `Write|Edit|MultiEdit`). Other events match
by event name alone.

## Install and serialization

`axm hooks install` (or the generic `axm install`):

1. Materializes the package into `.axm/extensions/<owner>/hooks/<name>/`.
2. Records the resolved hook in `.axm/axm-lock.yaml`.
3. Merges a generated command into the target agent's settings through the
   JSONC-aware writer.

For the generated command, AXM joins the runtime and the materialized
entrypoint:

```text
bash .axm/extensions/@acme/hooks/block-secrets/src/hook.sh
```

Claude Code is the first serializer: a `PreToolUse` binding becomes a `hooks`
group in `.claude/settings.json`. AXM preserves unrelated settings and removes
only the entries it manages, so `axm sync` can always reconcile the file. Other
agents will gain serializers behind the same manifest contract.

## Configuration

Installed hooks are tracked in `.axm/settings.json` under the `hooks` map
(name → entry) and locked in `.axm/axm-lock.yaml`. An entry is a source string,
or an object with `source` plus optional flags:

```jsonc
{
  "hooks": {
    "block-secrets": {
      "source": "@acme/hooks/block-secrets@^1.0.0",
      "enabled": false,
    },
  },
}
```

Set `{ "enabled": false }` to keep a hook installed but stop serializing it into
agent settings. Prefer the CLI over hand-editing — it normalizes the shape and
reconciles on-disk settings.

## Safety metadata

`blocking` and `capabilities` (`network`, `filesystemWrite`, `exec`, `env`) are
author-declared and **advisory in v1**. AXM validates and displays them, but does
not yet use them for consent prompts, sandboxing, or capability enforcement. Read
a hook's source before installing it — a hook runs with your shell's privileges
on the events it binds.

## Commands

All commands live under `axm hooks` and accept `--scope project` (default) or
`--scope user`.

- `axm hooks install <source>` — install a hook and serialize it into agent
  settings.
- `axm hooks uninstall <name>` — remove the hook's settings entries and package
  files.
- `axm hooks list` (`ls`) — show installed hooks with status, source, and lock
  state.
- `axm hooks disable <name>` — set `enabled: false` and strip the generated
  settings entry, keeping the package.
- `axm hooks enable <name>` — re-serialize a disabled hook.
- `axm hooks update <name>` — move a configured hook to a newer version.
- `axm hooks prune` — remove stale or unmanaged hook artifacts.
- `axm hooks publish @owner/hooks/<name>` — validate and release a new version;
  add `--preview` to dry-run manifest and publish lint.

## Recommended packs

Name the pack(s) your hook ships with in `hook.json` `recommendedPacks`, using
the bare pack reference — do not include a version range:

```json
{
  "recommendedPacks": ["@acme/packs/bricks"]
}
```

When a pack lists this hook as a dependency and the hook lists that pack as
recommended, the registry marks both sides of the relationship **official**.
Either side may declare alone; the badge appears only when both agree.

See `axm help packs` for pack authoring and `standalone` semantics.

## Where to go next

- `axm hooks --help` — full hook subcommand surface
- `axm help hook-schema` — raw `hook.json` JSON Schema
- `axm help settings` — workspace state and the `hooks` map
- `axm help packs` — bundling hook extensions with extension packs

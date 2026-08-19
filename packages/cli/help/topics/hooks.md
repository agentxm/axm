# Hooks

Hook packages live in `./.axm/extensions/<@owner>/hooks/<hook-name>`.

A hook extension runs your code on an agent lifecycle event such as a tool
pre-call, tool post-call, prompt submission, or session start. It is a portable
manifest plus an executable body. On install, AXM materializes the body under
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
  "bindings": [
    {
      "on": "tool.pre",
      "match": { "tools": ["file.write", "file.edit"] },
      "requires": { "decision": { "kind": "block" } }
    }
  ],
  "timeoutMs": 5000,
  "capabilities": { "network": false, "filesystemWrite": false }
}
```

Required fields:

- `runtime` — interpreter AXM writes into the generated command: `bash`, `node`,
  or `python`.
- `entrypoint` — path to the executable body, relative to the manifest
  directory. The file must exist in the archive.
- `bindings` — canonical AXM hook events and optional canonical tool matchers
  that AXM maps through the agent capability catalog into agent-native settings.

`timeoutMs`, `requires`, and `capabilities` are optional. Run
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

Each binding uses `on` with a canonical AXM hook event:

`tool.pre`, `tool.post`, `prompt.submit`, `session.start`, `turn.end`,
`subagent.stop`, and `compaction.pre` are the current canonical event set. AXM
adds events only after at least one writer-backed native mapping can serialize
them, so authoring tooling rejects events that would resolve to nothing.

Use `match.tools` for portable tool-scoped bindings. AXM maps canonical tool IDs
such as `file.write`, `file.edit`, and `shell.exec` into each target agent's
native tool names and matcher syntax. `matcherRaw` remains available for native
long-tail cases, but lint marks it non-portable.

Use `requires.decision` when a hook depends on more than observation. For
example, `{ "kind": "block" }` requires the target event to support blocking;
install fails before settings are written if the configured agent cannot satisfy
that requirement.

## Install and serialization

`axm hooks install` (or the generic `axm install`):

1. Materializes the package into `.axm/extensions/<owner>/hooks/<name>/`.
2. Records the resolved hook in `.axm/axm-lock.yaml`.
3. Merges a generated command into the target agent's settings through the
   JSONC-aware writer.

Install and sync plans report the effective result for every configured agent:

- `projected` means preview selected a behavior-preserving projection.
- `current` means apply or inspection confirmed that projection.
- `blocked` means neither native integration nor an allowed behavior-preserving
  fallback can satisfy the hook. A blocked plan performs no writes.

The separate `mechanism` field explains how a projected or current hook is
realized: `native` writes an agent-native hook integration, while
`advisory-fallback` represents an observational hook in AXM's managed
instruction region. Every outcome also carries a stable `reasonCode` and a
human-readable reason.

Preview and apply use the same reconciliation decision. Run
`axm hooks show <name>` to inspect the current per-agent outcomes and reasons.

For the generated command, AXM joins the runtime and the materialized
entrypoint:

```text
bash .axm/extensions/@acme/hooks/block-secrets/src/hook.sh
```

Claude Code uses the catalog-driven `command-stdin` serializer: a `tool.pre`
binding becomes a native hook group in the configured agent settings file, with
native event names and matcher syntax taken from the agent capability catalog.
AXM preserves unrelated settings and removes only the entries it manages, so
`axm sync` can always reconcile the file. Other agents can declare unmodeled
native hook availability until a writer is implemented behind the same manifest
contract.

Every generated command entry carries structured `x-axm` metadata with
`v: 1`, `managed: true`, `unit: "hook:<name>"`, source, and reference. A command
that merely points into `.axm/extensions/` is not AXM-owned and is never removed
on that basis. `axm lint` reports such an unmarked entry as
`workspace/hook-ownership-ambiguous`; add or remove it manually after deciding
who owns it.

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

`requires.decision` is enforced at install because it is a hard compatibility
fact. `capabilities` (`network`, `filesystemWrite`, `exec`, `env`) are
author-declared and advisory in v1. AXM validates and displays them, but does
not yet use them for consent prompts, sandboxing, or capability enforcement.
Read a hook's source before installing it — a hook runs with your shell's
privileges on the events it binds.

## Commands

All commands live under `axm hooks` and accept `--scope project` (default) or
`--scope user`.

- `axm hooks install <source>` — install a hook and serialize it into agent
  settings.
- `axm hooks uninstall <name>` — remove the hook's settings entries and package
  files.
- `axm hooks list` — show installed hooks with status, source, and lock
  state.
- `axm hooks show <name>` — inspect one installed hook and its effective
  configured-agent outcomes.
- `axm hooks disable <name>` — set `enabled: false` and strip the generated
  settings entry, keeping the package.
- `axm hooks enable <name>` — re-serialize a disabled hook.
- `axm hooks update <name>` — move a configured hook to a newer version.
- `axm sync --preview` — preview stale hook state and remove it only when AXM ownership
  is proven.
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

Keep the hook self-contained. `recommendedPacks` does not install the pack or
its members. If the hook requires another extension, follow `axm help packs`
for the only supported direct-sibling pack composition.

## Where to go next

- `axm hooks --help` — full hook subcommand surface
- `axm help hook-schema` — raw `hook.json` JSON Schema
- `axm help settings` — workspace state and the `hooks` map
- `axm help workspace-state` — package, native-config, and fallback reconciliation
- `axm help packs` — bundling hook extensions with extension packs

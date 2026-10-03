# Subagents

Before distributing package-root files, read `axm help publish` for the
Registry-only archive policy and effective preview.

Project-authored subagent packages live in `./subagents/<subagent-name>`;
acquired packages use the source-family and identity-based canonical scheme.
For example, a Registry subagent lives under
`./agent_extensions/registry/<@owner>/subagents/<subagent-name>`.

A package declares portable instructions, explicit runtime implementations, or
both. Workspace `agents` selects the destinations; a manifest cannot declare
`agents`. Run `axm help subagent-schema` for the complete manifest schema.

## Declare implementations

```json
{
  "owner": "@acme",
  "type": "subagent",
  "name": "reviewer",
  "version": "1.0.0",
  "description": "Review changes and report evidence",
  "core": { "instructions": "src/reviewer.md", "name": "reviewer" },
  "implementations": {
    "codex": {
      "kind": "customized",
      "configuration": { "sandbox_mode": "read-only" },
      "instructions": { "mode": "append", "source": "src/codex.md" }
    },
    "cursor": { "kind": "native", "source": "native/cursor.md" }
  }
}
```

`core.instructions` names a plain instruction file. `core.name` optionally
sets the native role name; otherwise the package name supplies it. A core
requires a nonempty manifest description.

An explicit implementation wins for its catalog ID:

- `customized` requires a core. Its optional `configuration` contains opaque
  native JSON settings. Optional instructions append to or replace the core.
  Identity and instruction fields cannot be placed in `configuration`.
- `native` names a complete native definition. It preserves native settings,
  instructions, and identity independently of the package name and never merges
  the core into that definition.
- Without an explicit implementation, a compatible writer may render the core.
  Without either, that runtime is unsupported.

A native-only package may omit `core`. Invalid explicit implementations fail
validation; they never fall back to the core. AXM does not translate model,
tool, permission, sandbox, or security settings between runtimes or supply
universal defaults. Consult the selected runtime's native contract.

All declared files must be contained regular files within the package, including
references for unconfigured runtimes. Publish also validates the filtered
archive. AXM does not relocate resource trees or resolve package-relative native
runtime references. Recognized references whose original resource base would
be lost make that target unsupported. External prerequisites remain the author's
responsibility.

## Inspect before applying

```sh
axm subagents show reviewer --render codex
axm subagents show reviewer --render cursor --json
```

`--render` works for an unconfigured catalog runtime. It returns the selected
mode, native identity, source dependencies, output paths, and complete rendered
content without writing files or changing configuration. Machine output uses a
registered schema; unsupported targets return a structured result with exit 1.
Unknown runtime IDs are usage errors. Ordinary `show` remains available without
`--render`.

`install`, `sync`, and render inspection use the same selection and compiler.
Mixed target support reports every unsupported target while realizing compatible
ones. Enabling or installing an enabled package with configured targets requires
at least one compatible target. Disabled packages and workspaces without
configured targets can retain canonical packages. Sync can retire previously
owned output after accepted state loses all compatible targets. Unsupported
subagents never become Skills.

## Import native definitions

```sh
axm subagents import ./reviewer.md @acme/subagents/reviewer --source-agent claude-code --preview
axm subagents import ./reviewer.toml @acme/subagents/reviewer --source-agent codex
```

Import leaves the source unchanged and defaults to disabled. Use `--enable` to
request activation. Generic Markdown needs `--source-agent`; native locations
can identify the runtime when unambiguous. Contradictory runtime selection is
refused, and a known runtime without an importer receives an explicit
capability refusal.

An existing workspace-authored package may receive an empty runtime slot.
Import preserves its core, version, other implementations, and activation unless
activation is requested. An occupied slot, acquired package, conflicting native
destination, or changed source or destination after preview is refused. Use
`axm fork` before customizing an acquired AXM package.

## Update and remove

Edit the authored manifest or its referenced files, then run `axm sync`.
Acquired packages are accepted state; fork them before customizing. Native
output records its package source and generation. Unchanged source preserves
local edits to owned output; a changed selected implementation renders a new
generation. Editing an unused runtime implementation does not rewrite another
runtime's output.

Identity changes and removal retire only proven AXM-owned native files. Foreign
native definitions and separately authored Skills remain intact. Consumers
sharing a physical destination must require identical bytes; incompatible
claims are refused before writing.

Run `axm subagents publish` only when ready to release a version. Publication
validates the manifest and referenced content and follows the archive policy
in `axm help publish`; it never edits the manifest.

## Recommended packs

Name the pack(s) your subagent is designed to ship with in `subagent.json` `recommendedPacks`. Use the bare pack reference — do not include a version range:

```json
{
  "recommendedPacks": ["@acme/packs/bricks"]
}
```

When a pack lists this subagent as a dependency and the subagent lists that pack as recommended, the registry marks both sides of the relationship as **official**. Either side may declare alone; the badge appears only when both agree.

Always declare `recommendedPacks` for packs you publish under the same owner that bundle this subagent — it costs nothing and earns the Official badge in the registry.

Keep the subagent self-contained. `recommendedPacks` does not install the pack
or its members. If the subagent requires another extension, name that sibling by
its extension identity and let the agent resolve it through its own discovery —
never by file path. See `axm help packs` for pack composition.

## Where to go next

- `axm subagents --help` — full subagent subcommand surface
- `axm help workspace-state` — desired, accepted-resolution, and observed semantics
- `axm help packs` — bundling subagent extensions with extension packs

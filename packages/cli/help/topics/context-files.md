# Context Files

A context files package materializes one or more shared context files into a workspace.

Use them for files that should travel with a project or pack, such as
`AGENTS.md`, `CLAUDE.md`, onboarding docs, repo indexes, or managed sections
inside existing Markdown files.

Context files packages live in `./.axm/extensions/<@owner>/context-files/<package-name>`.

## context-files.json

[`context-files.json`](https://axm.sh/schemas/context-files.schema.json)

Run `axm help context-files-schema` to print the raw JSON Schema.

## Package layout

```text
.axm/extensions/@acme/context-files/workspace-baseline/
  context-files.json
  src/
    AGENTS.md
    README.md
```

`context-files.json` is the package manifest. It can declare one or more `contents`
entries; each entry reads from `src/` and writes to a workspace file or managed
region.

```jsonc
{
  "$schema": "https://axm.sh/schemas/context-files.schema.json",
  "owner": "@acme",
  "type": "file",
  "name": "workspace-baseline",
  "version": "1.0.0",
  "contents": [
    {
      "source": { "kind": "static", "path": "AGENTS.md" },
      "target": "AGENTS.md",
      "mode": "sync-once",
    },
  ],
}
```

## Materialization modes

- `sync-once` creates the target if it is missing, then preserves local edits.
- `sync-always` keeps the whole target in sync with the extension source.
- `managed-region` owns only an AXM-marked region inside the target file.

On uninstall, AXM leaves `sync-once` targets in place, removes `sync-always`
targets, and strips managed regions when it can identify the matching markers.

## Sources

Content sources can be:

- `static` - copy payload files from `src/`.
- `template` - render scalar placeholders from inputs, workspace vars, and the
  workspace root.
- `generated` - render built-in generated content such as `toc` or
  `file-index`.

Supported template placeholders are `${inputs.name}`, `${vars.name}`, and
`${workspace.root}`.

Workspace vars live in `.axm/settings.json` under `vars`. Per-package inputs
live under `files.<name>.inputs`.

## Authoring and editing files

Run `axm context-files new <name>` to scaffold a managed context files package.

Edit package source files under `.axm/extensions/.../context-files/<name>/src/`, then
run `axm sync` to materialize changes. For `sync-once` targets, local edits to
the rendered workspace file are preserved after the first write.

Install with `axm context-files install @owner/files/<name>`. Publish with
`axm context-files publish @owner/files/<name>`.

## Where to go next

- `axm context-files --help` - full context-files subcommand surface
- `axm help context-files-schema` - exact manifest fields
- `axm help settings` - workspace vars and context files inputs
- `axm help packs` - bundling context files packages with packs

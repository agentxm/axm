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

## file-index generator

`file-index` walks the workspace and emits a list, tree, or markdown table of
files. Options on `generator.options`:

- `format` — `list` (default), `tree`, or `table`.
- `include`, `exclude` — comma-separated globs.
- `maxDepth` — non-negative integer, default `5`.
- `includeHidden`, `respectGitignore` — booleans.
- `columns` — comma-separated list of columns to render. Allowed:
  `path`, `fileName`, `link`, `title`, `description`. Defaults:
  `path` for `list`, `fileName` for `tree`, `path,description` for `table`.

`title` is extracted from frontmatter `title`, the first markdown heading, or a
JSON `name` field. `description` is extracted from frontmatter
`description`/`summary` or JSON `description`/`summary`.

```jsonc
{
  "source": {
    "kind": "generated",
    "generator": {
      "name": "file-index",
      "options": {
        "include": "docs/*.md",
        "format": "table",
        "columns": "fileName,title,description",
      },
    },
  },
  "target": "AGENTS.md",
  "mode": "managed-region",
  "region": "docs-index",
}
```

## Ad-hoc generator regions

You can also drop a generator region directly into any workspace file and AXM
will keep it in sync on `axm sync`. Marker options follow the same vocabulary
as the manifest:

```markdown
<!-- axm:start region=docs-index generator=file-index include=docs/*.md format=table columns=fileName,title,description -->
<!-- axm:end region=docs-index generator=file-index -->
```

Marker options accept comma-separated values for `include`, `exclude`, and
`columns`. Spaces, quotes, and `=` are not supported inside values; declare a
context-files package entry for richer configurations.

## Authoring and editing files

Run `axm context-files new <name>` to scaffold a managed context files package.

Edit package source files under `.axm/extensions/.../context-files/<name>/src/`, then
run `axm sync` to materialize changes. For `sync-once` targets, local edits to
the rendered workspace file are preserved after the first write.

Install with `axm context-files install @owner/files/<name>`. Publish with
`axm context-files publish @owner/files/<name>`.

## Recommended packs

Name the pack(s) your context files package is designed to ship with in `context-files.json` `recommendedPacks`. Use the bare pack reference — do not include a version range:

```json
{
  "recommendedPacks": ["@acme/packs/bricks"]
}
```

When a pack lists this package as a dependency and the package lists that pack as recommended, the registry marks both sides of the relationship as **official**. Either side may declare alone; the badge appears only when both agree.

Always declare `recommendedPacks` for packs you publish under the same owner that bundle this package — it costs nothing and earns the Official badge in the registry.

See `axm help packs` for pack authoring and `standalone` semantics.

## Where to go next

- `axm context-files --help` - full context-files subcommand surface
- `axm help context-files-schema` - exact manifest fields
- `axm help settings` - workspace vars and context files inputs
- `axm help packs` - bundling context files packages with packs

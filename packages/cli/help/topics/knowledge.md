# Knowledge

Knowledge extensions package Open Knowledge Format (OKF) reference material for
progressive agent discovery. AXM keeps the canonical package under
`.axm/extensions/` and exposes only its `src/` directory through an
agent-facing projection.

## Layout

Enabled bundles are projected by manifest identity under
`.agents/knowledge/@owner/name` by default. AXM prefers relative directory
symlinks and falls back to managed copies when symlinks are unavailable. The
aggregate `.agents/knowledge/index.md` lists enabled bundles deterministically,
and a managed region in the workspace instruction file directs agents to that
index while identifying Knowledge content as untrusted reference material.

`.agents/knowledge` is an AXM convention, not a native discovery directory for
coding agents. The instruction-file bridge is what makes the aggregate index
discoverable.

## Custom directory

Set `knowledgeConfig.directory` in `.axm/settings.json` to choose another path
relative to the active project or user scope:

```jsonc
{
  "knowledgeConfig": {
    "directory": "docs/agent-knowledge",
  },
}
```

The path must remain inside the active scope and must not overlap `.axm`.
Changing it and running `axm sync` builds and verifies the new projection before
removing AXM-managed artifacts from the old location. Unknown files are never
removed.

## Lifecycle

- `axm knowledge install <source>` installs and validates a bundle.
- `axm knowledge update` updates configured bundles.
- `axm knowledge disable <name>` removes its projection but retains canonical
  content and configuration.
- `axm knowledge enable <name>` restores its projection.
- `axm knowledge uninstall <name>` removes its projection before applying the
  selected source-retention policy.
- `axm sync` restores missing canonical content from locked registry versions or
  pinned git trees, uses local and workspace sources authoritatively, and then
  reconciles projections.

Use `axm sync --dry-run` to preview creates, updates, removals, and the selected
symlink or copy mechanism without changing files.

## Browsing and validation

Use `axm knowledge list`, `search`, and `open` to inspect installed bundles.
Run `axm knowledge lint` for installed content or `axm knowledge lint --path
<directory>` while authoring a package.

## Where to go next

- `axm help settings` — configure the projection directory
- `axm help knowledge-schema` — inspect the Knowledge manifest schema
- `axm knowledge --help` — list Knowledge commands

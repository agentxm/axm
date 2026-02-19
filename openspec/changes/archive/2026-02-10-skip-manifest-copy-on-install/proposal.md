## Why

When a managed skill is installed, the entire canonical directory (`.axm/extensions/@<namespace>/skills/<name>/`) is symlinked or copied into each agent's skill folder (e.g., `.claude/skills/<name>/`). This exposes the `axm-skill.json` manifest — an axm-internal metadata file — to agents that have no use for it. The manifest contains package manager metadata (version, dependencies, scope) that pollutes the agent's skill context and may confuse agents that ingest all files in their skills directory.

## What Changes

- **BREAKING**: Managed extension layout changes to separate manifest from skill content using a `src/` subdirectory:
  ```
  .axm/extensions/@<namespace>/skills/<name>/
    axm-skill.json        # manifest (axm metadata, not exposed to agents)
    src/                   # skill content (symlinked/copied to agent dirs)
      SKILL.md
      ...
  ```
- Agent symlinks/copies now target `<canonical>/src/` instead of the entire canonical directory, so agents only see skill content.
- Fork writes skill files into the `src/` subdirectory and the manifest alongside it.
- Publish reads content from `src/` and manifest from the parent.
- Install extracts registry archives into the `src/` subdirectory layout.
- Uninstall cleanup is unaffected (already removes the entire agent skill directory and canonical directory).

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `managed-extensions`: Canonical layout adds `src/` subdirectory for skill content; manifest lives at the package root. Agent symlinks target `src/`.
- `skills-fork`: Fork copies skill content into `<canonical>/src/` and writes manifest to `<canonical>/axm-skill.json`.
- `registry-publish`: Publish archives the `src/` directory content alongside the manifest.
- `skills-install-execute`: Install symlinks/copies `<canonical>/src/` to agent directories instead of the full canonical directory.

## Impact

- `packages/cli/src/cli-commands/skills/install/install-skill.ts` — symlink/copy target changes from `canonicalPath` to `canonicalPath/src/`.
- `packages/cli/src/cli-commands/skills/fork-skill.ts` — write skill files to `src/` subdirectory, manifest to parent.
- `packages/cli/src/cli-commands/skills/publish-skill.ts` — read content from `src/`, manifest from parent.
- `packages/cli/src/extensions/skills/manifest-schema.ts` — no schema changes needed.
- E2E and unit tests for fork, install, publish, and uninstall need updating for new layout.

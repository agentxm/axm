## Why

Publishing a pack today only publishes the pack manifest itself. If the pack references locally managed extensions (skills, commands, MCP servers) that haven't been published yet, the pack's dependencies are unresolvable for consumers. Users must manually publish each dependency before publishing the pack — tedious and error-prone for packs with many extensions.

## What Changes

- Add `--include-dependencies` (`-d`) flag to `axm packs publish` (default: `false`)
- When enabled, the handler reads the pack manifest, identifies locally managed dependency extensions, and includes them in the publish plan alongside the pack
- Dependencies are published to the same target registry as the pack
- Dependencies that are already published (same version + integrity) are skipped via existing idempotent publish behavior
- Dependencies that are not locally managed (not found in `.axm/extensions/`) are skipped with a warning — they are assumed to already exist in the registry

## Capabilities

### New Capabilities

- `cli-packs-publish-with-dependencies`: Publish a pack and its locally managed dependency extensions in a single command

### Modified Capabilities

- `cli-packs-publish`: Add `--include-dependencies` flag to the command interface

## Impact

- **Code**: `packs/publish/handler.ts` (plan construction), `packs/publish/command.ts` (flag definition)
- **Dependencies**: Reuses existing skill/command/MCP server publish operations — no new publish logic needed
- **Behavior**: No change to default behavior (`--include-dependencies` defaults to `false`)

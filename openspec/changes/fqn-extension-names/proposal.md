## Why

Extension names currently use a two-segment format (`@scope/name`) which is ambiguous — you can't tell from the name alone whether `@acme/code-review` is a skill, pack, or MCP server. The extension type must be inferred from context or resolved at runtime. Moving to a three-segment fully qualified name (`@scope/skills/my-skill`, `@scope/packs/my-pack`, `@scope/mcp-servers/my-server`) makes the type explicit in the identifier itself. This simplifies parsing, storage, display, and eliminates the "legacy" fallback path that currently defaults untyped names to skills.

## What Changes

- **BREAKING**: `FQN_PATTERN` and `FullyQualifiedNameSchema` change from `@scope/name` to `@scope/type-plural/name` where type-plural is `skills | packs | mcp-servers`
- **BREAKING**: Pack manifest dependency keys (`axm-pack.json`) use new FQN format: `"@scope/skills/my-skill": "^1.0.0"` instead of `"@scope/my-skill": "^1.0.0"`
- **BREAKING**: Lockfile pack entries (`resolvedSkills`, `resolvedCommands`, `resolvedMcpServers`) use new FQN keys
- **BREAKING**: Settings storage for non-skill extensions (commands, mcp-servers) adopts FQN format
- Remove the legacy two-segment fallback in the input parser (currently defaults `@scope/name` to skills)
- `parseScopedName` and `parseScopedNameOrThrow` updated to parse three-segment FQNs into `{ scope, type, name }`
- Display formatting across CLI output consistently uses the three-segment FQN

## Capabilities

### New Capabilities

- `fqn-format`: Defines the canonical three-segment FQN format (`@scope/type-plural/name`), its regex pattern, schema, parsing utilities, and construction/formatting helpers

### Modified Capabilities

- `managed-extensions`: Storage paths already use `@scope/skills/name/` layout — update FQN references in lock entries and settings to match
- `extension-ref-types`: `RegistryRefDetails` scope+name fields align with new FQN; ref construction uses three-segment names
- `source-domain-model`: `RegistrySourceParams` adopts explicit type segment; remove legacy two-segment fallback from parser
- `extension-sources`: Source resolution uses typed FQN for registry lookups
- `cli-packs-install`: Pack install resolves dependencies using three-segment FQN keys
- `cli-skills-install`: Skill install uses typed FQN for registry operations
- `cli-skills-list`: Display output uses three-segment FQN format
- `cli-skills-uninstall`: Uninstall matches extensions by typed FQN
- `cli-skills-update`: Update operations use typed FQN for version resolution
- `skill-name-sanitize`: Sanitization accounts for three-segment format
- `registry-client`: Registry API calls use typed FQN paths

## Impact

- **Schemas**: `FQN_PATTERN`, `FullyQualifiedNameSchema` in `extensions/common.ts`; `VersionSpecifierMapSchema` in `packs/manifest-schema.ts`
- **Parsing**: `sources/parser.ts` (remove legacy fallback), `skills/naming.ts` (three-segment parsing)
- **Storage**: Lockfile schema (`lockfile/schema.ts`), settings schema (`settings/schema.ts`) — map keys shift to new format
- **Commands**: All skill/pack/mcp-server command handlers that construct, display, or compare FQNs
- **Registry**: Client calls, resolution logic, path computation (`registry/`, `resolution/`)
- **Tests**: All tests asserting on FQN format strings need updating
- **Existing manifests**: Published pack manifests with old-format dependency keys will need migration or dual-format support during transition

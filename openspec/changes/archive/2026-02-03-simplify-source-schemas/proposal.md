## Why

The current settings schema uses complex object variants (`_tag: "GitHub"`, `_tag: "Local"`) for skill sources, which is verbose and inconsistent with how users naturally express extension sources. A simpler string-based format (`"github:owner/repo"`, `"@scope/name"`) is more ergonomic and aligns with patterns users already know from npm and other package managers.

## What Changes

- **BREAKING**: Replace `SkillSettingsEntry` union (string | GitHub object | Local object) with plain strings
- Introduce a new `extension-sources` capability that defines source string parsing and the `SourceSchema`
- Move `LockSourceTypeSchema` from lockfile schema to `extension-sources`, renamed to `SourceSchema`
- Settings `skills` field becomes `Record<string, string>` where:
  - Keys are skill names (e.g., `my-skill`)
  - Values are source strings (e.g., `@myorg/skills/abc`, `github:owner/repo`, `local:./path`)

## Capabilities

### New Capabilities

- `extension-sources`: Source string format and parsing. Defines the canonical source type discriminator (`SourceSchema`) and string format patterns for each source type (registry, github, git, local).

### Modified Capabilities

- `schema-settings`: Skills map changes from `Record<string, SkillSettingsEntry>` to `Record<string, string>`. Removes GitHub and Local object variants.
- `schema-lockfile`: Imports `SourceSchema` from `extension-sources` instead of defining `LockSourceTypeSchema` locally.

## Impact

- **Code**: `packages/core/src/experimental/schemas/settings.ts` - remove `GitHubSettingsEntrySchema`, `LocalSettingsEntrySchema`, `SkillSettingsEntrySchema`
- **Code**: `packages/core/src/experimental/schemas/lockfile.ts` - replace `LockSourceTypeSchema` with import from new module
- **Code**: New `packages/core/src/experimental/schemas/extension-sources.ts` module
- **Tests**: Update settings and lockfile schema tests
- **Users**: Existing settings files with object-form skills will need migration to string format

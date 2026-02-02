## Why

The current `cli-skills-install` spec defines source parsing inline, but the proposal establishes a formal Extension Resolution algorithm (§3.2) that will be reused across all extension types and commands (`install`, `update`, `info`, etc.). Additionally, the spec diverges from the proposal on lockfile format (YAML vs JSON), settings structure, input syntax patterns, and source types.

## What Changes

- Extract extension resolution into a standalone, reusable module with formal input syntax and resolution order
- Add support for AXM name patterns (`@scope/name`, bare names with implied scope)
- Add explicit source prefix syntax (`github:owner/repo`, `gitlab:owner/repo`)
- **BREAKING**: Change lockfile format from YAML to JSON, replace `commitSha`/`contentHash` with `folderHash`
- **BREAKING**: Change settings structure from `skills: {}` to `extensions.skills: {}`
- Add conflict detection with warn-and-skip default behavior
- Add support for additional sources (Bitbucket, Azure DevOps, generic git)
- Formalize caching strategy (shallow clone to temp, copy, cleanup)

## Capabilities

### New Capabilities

- `extension-resolution`: Resolves input strings to extension references using ordered resolution algorithm. Handles AXM names, explicit sources, ambiguous patterns, local paths, and URLs. Returns `ExtensionRef[]` with metadata. Reusable across all extension commands.

### Modified Capabilities

- `cli-skills-install`: Delegate source parsing to extension resolution module. Update lockfile schema (JSON, `folderHash`). Update settings schema (`extensions.skills`). Add conflict handling. Support new input syntax patterns.

## Impact

- **Core**: New `extension-resolution` module in `packages/core/`
- **CLI**: `skills install` handler refactored to use resolution module
- **Schemas**: `axm.lock` and `settings.json` structure changes (breaking for existing users)
- **Tests**: Existing source parsing tests migrate to resolution module; handler tests updated for new schemas

## Why

The recent `simplify-extension-sources` change removed local path support, but this was a mistake. Local paths are essential for development workflows—testing skills before publishing, using private skills, and referencing skills outside repositories. Without local source support, developers cannot easily iterate on skills during development.

## What Changes

- **BREAKING**: Restore `local` as a valid source type alongside `github`, `gitlab`, `bitbucket`, `git`, and `registry`
- Inputs starting with `./`, `/`, `~/`, or Windows drive letters (`C:\`) are recognized as local paths
- Settings format: `{ "skill-name": "~/path-to-skill" }` (no `local:` prefix needed)
- Local paths take precedence in ambiguous resolution (checked before GitHub shorthand)
- Restore local path resolver that scans directories for manifest files (SKILL.md, etc.)

## Capabilities

### New Capabilities

_None—restoring previously existing functionality._

### Modified Capabilities

- `extension-sources`: Add `local` back to the source type union; define local path formats (`./`, `/`, `~/`, Windows paths)
- `extension-resolution`: Restore local path resolver; local paths take precedence in ambiguous resolution

## Impact

- **Schemas**: `SourceSchema` in `extension-sources.ts` adds `"local"` literal
- **Types**: `ParsedSource` in `types.ts` needs `localPath` field for resolved absolute path
- **Parser**: `source-parser.ts` recognizes local path patterns instead of rejecting them
- **Resolvers**: Restore `local-path.ts` resolver and integrate into resolution pipeline
- **Ambiguous**: Update `ambiguous.ts` to try local path first before GitHub shorthand
- **Tests**: Restore `local-path.test.ts` and update other test files

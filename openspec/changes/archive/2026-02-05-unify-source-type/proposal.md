## Why

We have 4 separate `SourceType` definitions across the codebase with inconsistent values. This causes confusion, potential type mismatches, and maintenance burden. Each location defines slightly different source types, making it unclear which is authoritative.

## What Changes

- **BREAKING**: Consolidate to single canonical `SourceType` in `extensions/sources.ts`
- Remove duplicate type alias from `resolution/types.ts` (import from canonical location)
- Extend base type in `extensions/skills/types.ts` for skill-specific `wellknown` source
- Reconcile `extensions/common.ts` divergence (has azuredevops/url/path, missing local)

Current state:
| Location | Values |
|----------|--------|
| `extensions/sources.ts` | github, gitlab, bitbucket, git, registry, local |
| `extensions/common.ts` | github, gitlab, bitbucket, azuredevops, git, url, path, registry |
| `resolution/types.ts` | github, gitlab, bitbucket, git, registry, local |
| `extensions/skills/types.ts` | github, gitlab, bitbucket, git, registry, local, wellknown |

## Capabilities

### New Capabilities

None - this is a consolidation refactor.

### Modified Capabilities

None - no spec-level behavior changes, only internal type organization.

## Impact

- `extensions/sources.ts` - becomes the canonical source, may need to add missing values
- `extensions/common.ts` - remove `SourceTypeSchema` or align with canonical
- `resolution/types.ts` - remove local `SourceType`, import from `extensions/sources.ts`
- `extensions/skills/types.ts` - change to extend base type with `| "wellknown"`
- All importers of these types need import path updates
- No runtime behavior changes - purely compile-time type consolidation

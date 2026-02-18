## Why

`axm skills install https://github.com/vercel-labs/agent-skills` fails with `INVALID_SOURCE` because `resolveSkillInstallSource` treats `url-input` as unsupported — it falls into a catch-all error branch. The built-in source defaults (github.com, gitlab.com, bitbucket.org) exist in `BUILT_IN_SOURCES` and `routeUrlInput` handles URL resolution correctly, but `resolveSkillInstallSource` never delegates to it.

## What Changes

- `resolveSkillInstallSource` delegates `url-input` to `routeUrlInput` — the same resolution function used by `resolveSource`

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `resolve-source`: `resolveSkillInstallSource` routes URL patterns through the standard resolution pipeline instead of rejecting them

## Impact

- `packages/cli/src/cli-commands/skills/install/resolve-skill-install-source.ts` — route `url-input` through `routeUrlInput`
- No breaking changes — previously rejected inputs now resolve correctly

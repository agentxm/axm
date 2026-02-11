## Why

`printSource` accepts `Source | SourceInput` but only has descriptor-based print implementations for 5 of 7 source types. `git` and `registry` fall through to ad-hoc switch cases — `registry` just prints the unhelpful literal `"registry"`. The print functions only use input fields (owner, repo, ref, subPath, etc.), never config fields, so the `Source` half of the union is unnecessary. The function should be renamed to `printSourceInput`, accept only `SourceInput`, and have proper print implementations for all 7 source types. Additionally, `resolution/types.ts` re-exports `SourceType` as `Source`, which is confusing since `Source` is a different type in `sources/types.ts`.

## What Changes

- **BREAKING**: Rename `printSource` to `printSourceInput` and narrow signature to `(source: SourceInput) => string`
- Add proper print for `git` sources (URL href)
- Add proper print for `registry` sources (`@scope/name`)
- Remove the `Source` re-export alias from `resolution/types.ts` — consumers should import `SourceType` directly from `sources/`
- Remove the `Source` re-export from `resolution/index.ts` barrel

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `extension-sources`: `printSource` renamed to `printSourceInput`, narrows to `SourceInput`-only input, adds complete print coverage for all 7 source types

## Impact

- `packages/cli/src/sources/printer.ts` — rename, narrow signature, remove fallback switch, add git/registry print
- `packages/cli/src/sources/index.ts` — update barrel export name
- `packages/cli/src/resolution/types.ts` — remove `Source` re-export
- `packages/cli/src/resolution/index.ts` — remove `Source` from barrel export
- `packages/cli/src/extensions/skills/index.ts` — update re-export
- Call sites in install/fork handlers — rename `printSource` → `printSourceInput`
- `packages/cli/src/sources/parser.test.ts` — rename calls

## Why

The `SourceDescriptor` interface bundles unrelated concerns (printing, shorthand parsing, URL parsing) into a single configuration object per provider, adding indirection without value. Each provider already has standalone functions (`print`, `parseShorthand`, `parseUrl`, `parseScp`) — the descriptor just wraps them in an object that the parser immediately destructures. Removing the descriptor layer simplifies the codebase by letting the parser and printer import provider functions directly.

## What Changes

- **BREAKING**: Remove the `SourceDescriptor`, `ShorthandDescriptor`, and `UrlParseDescriptor` interfaces from `sources/types.ts`
- **BREAKING**: Delete all `descriptor.ts` files from provider folders (`github/`, `gitlab/`, `bitbucket/`, `azurerepos/`, `local/`)
- Refactor `parser.ts` to build its lookup maps (`DESCRIPTOR_BY_PREFIX`, `DESCRIPTOR_BY_HOSTNAME`) directly from provider-exported functions instead of descriptor objects
- Refactor `printer.ts` to import provider `print` functions directly (it already does this through descriptors)
- Update barrel exports (`index.ts` files) to remove descriptor re-exports

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `extension-sources`: Source parsing and printing behavior is unchanged, but the internal architecture shifts from descriptor objects to direct function imports. No spec-level requirement changes.

## Impact

- `packages/cli/src/sources/types.ts` — remove `SourceDescriptor`, `ShorthandDescriptor`, `UrlParseDescriptor` interfaces
- `packages/cli/src/sources/parser.ts` — replace descriptor-based lookup maps with inline switch dispatch
- `packages/cli/src/sources/printer.ts` — already uses a switch; just remove descriptor imports
- `packages/cli/src/sources/resolve-source.ts` — replace `DESCRIPTOR_BY_TYPE` map with inline switch dispatch in `tryConfigNameParse` and `tryUrlHostnameMatch`
- `packages/cli/src/sources/{github,gitlab,bitbucket,azurerepos,local}/descriptor.ts` — delete
- `packages/cli/src/sources/{github,gitlab,bitbucket,azurerepos,local}/index.ts` — remove descriptor re-exports
- No behavioral changes — all existing parsing and printing behavior is preserved
- No spec changes needed — this is a pure internal refactor

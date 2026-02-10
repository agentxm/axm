## Why

`determineSourceInput` returns a `SourceInput` (parsed coordinates only), but downstream consumers need the full `Source` (coordinates + provider config from settings). Today, handlers pass `SourceInput` to `SourceProviders.resolve`, and config lookup is scattered — `buildCloneUrl` hardcodes base URLs, registry providers fetch config internally, and there's no single place that marries input with config. A dedicated `resolveSource` function fills this gap, giving handlers a fully-resolved `Source` and enabling providers to use config fields like custom base URLs.

## What Changes

- New `resolveSource` function in `sources/resolve-source.ts` that calls `determineSourceInput`, matches the result against configured sources from `Workspace`, and returns a `Source` (input + config)
- Multi-config matching: when multiple configs share the same source type (e.g., two GitHub Enterprise instances), `resolveSource` selects the right one by matching the config's base URL against the parsed input's coordinates
- **BREAKING**: `SourceProviders` service method `resolve` renamed to `resolveExtension` and accepts `Source` instead of `SourceInput`
- Handlers (`install`, `fork`) call `resolveSource` instead of `determineSourceInput`, then pass the result to `SourceProviders.resolveExtension`
- `determineSourceInput` remains as the lower-level pure parser — `resolveSource` builds on it

## Capabilities

### New Capabilities

- `resolve-source`: Combines source input parsing with config matching to produce a fully-resolved `Source`. Handles multi-config disambiguation for git hosting providers and scope-based registry selection.

### Modified Capabilities

- `source-provider`: `resolve` renamed to `resolveExtension`, accepts `Source` instead of `SourceInput`. Providers receive config fields (base URL, registry location) via the `Source` type rather than looking them up internally.

## Impact

- `packages/cli/src/sources/` — new `resolve-source.ts` file, updated `index.ts` barrel
- `packages/cli/src/sources/service.ts` — `SourceProvidersService` interface change (`resolve` → `resolveExtension`, `Source` parameter)
- `packages/cli/src/sources/providers/` — providers updated to consume `Source` fields (e.g., use `source.url` for clone URLs instead of hardcoding)
- `packages/cli/src/sources/clone-url.ts` — `buildCloneUrl` updated to use config `url` field
- `packages/cli/src/cli-commands/skills/install/handler.ts` — calls `resolveSource` instead of `determineSourceInput`
- `packages/cli/src/cli-commands/skills/fork/handler.ts` — same
- `packages/cli/src/resolution/resolvers/` — `explicit-source.ts` and `url.ts` updated for new service method name
- Test files co-located with all changed modules

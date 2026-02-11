## Why

`@scope/name` inputs (e.g., `@community/brand-guidelines`) fail with "Registry source input is not yet supported" because `routeRegistryInput` is stubbed. This is the most natural way to install registry extensions and the only input pattern that doesn't resolve.

## What Changes

- **Implement `routeRegistryInput`** to parse `@scope/name` patterns into a `RegistrySource` with `type: "registry"`, `scope`, and `name` fields
- **Simplify `RegistrySource` type** from `RegistrySourceInput & RegistrySourceConfig` to just `RegistrySourceInput` — the registry meta-provider already handles config lookup internally via scope routing
- **Update registry provider interface** to accept the simplified `RegistrySource` (no config fields on the source itself)

## Capabilities

### New Capabilities

_None — the resolve-source spec already defines registry input routing behavior._

### Modified Capabilities

- `resolve-source`: Implement the existing "Registry input passes through without config" scenario and the `RegistrySource` type simplification requirement. No spec changes needed — the spec already defines the target behavior.

## Impact

- `packages/cli/src/sources/resolve-source.ts` — implement `routeRegistryInput`
- `packages/cli/src/sources/types.ts` — simplify `RegistrySource` type alias
- `packages/cli/src/sources/service.ts` — update registry meta-provider to work with simplified source type
- `packages/cli/src/sources/resolve-source.test.ts` — add test cases for `@scope/name` resolution
- `packages/cli/src/cli-commands/skills/install/handler.ts` — should work as-is (already has registry guard)

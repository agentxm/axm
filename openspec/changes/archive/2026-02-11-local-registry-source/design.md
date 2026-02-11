## Context

`routeRegistryInput` in `resolve-source.ts` is the only unimplemented input pattern router. All infrastructure it depends on already exists:

- **Parser**: `parseInputPattern` classifies `@scope/name` as `RegistryPatternInput` with `scope` and `name` fields
- **Meta-provider**: `createRegistryMetaProvider()` handles scope routing, config lookup, and fallthrough — it ignores the `_source` parameter entirely, deriving scope from `options.names`
- **Registry guard**: The install handler already calls `registryGuard` when `source.type === "registry"`, prompting for config if missing
- **Resolve-source spec**: Already defines the target behavior — registry inputs pass through without config

The `RegistrySource` type is currently `RegistrySourceInput & RegistrySourceConfig`, but the spec requires it to be just `RegistrySourceInput`. This intersection also creates a `name` field collision (`RegistrySourceInput.name` = extension name vs `RegistrySourceConfig.name` = config name).

## Goals / Non-Goals

**Goals:**

- `@scope/name` inputs resolve to a `RegistrySource` and flow through install
- Align `RegistrySource` type with the resolve-source spec (no config intersection)

**Non-Goals:**

- Version pinning in registry input (`@scope/name@1.0.0`) — parser doesn't capture version yet
- Remote registry support — already stubbed separately
- Changes to the registry meta-provider's scope routing logic

## Decisions

### 1. Simplify `RegistrySource` to `RegistrySourceInput` (like `LocalSource`)

**Choice**: `RegistrySource = RegistrySourceInput` (drop `& RegistrySourceConfig`)

**Rationale**: The meta-provider never reads config from the source object — it calls `workspace.getConfiguredRegistrySources()` lazily on each find/fetch. The config intersection is vestigial and creates a `name` field collision. The spec already mandates this simplification.

**Alternative**: Keep the intersection, add config at routing time. Rejected — the meta-provider would still ignore it, and which config to attach is ambiguous (multiple registries may match a scope).

### 2. Pass parsed pattern to `routeRegistryInput`, not raw string

**Choice**: Change `routeRegistryInput(input: string)` to accept `{ scope, name }` from the parsed `RegistryPatternInput`.

**Rationale**: Other routers receive parsed pattern data (`routeSlashInput` gets `{ owner, repo }`, `routeFilePathInput` gets `path`). Passing parsed fields avoids re-parsing and follows the established pattern.

### 3. No workspace dependency in `routeRegistryInput`

**Choice**: `routeRegistryInput` constructs a `RegistrySourceInput` directly — no config lookup needed.

**Rationale**: The meta-provider handles config lookup lazily. The registry guard (called by the install handler) handles the "no registry configured" case. Adding config lookup here would duplicate responsibility.

## Risks / Trade-offs

- **Type narrowing in consumers** → Any code that pattern-matches on `RegistrySource` and accesses config fields (`url`, `scopes`) will fail to compile. Grep for `RegistrySource` usage to find these. Mitigation: the meta-provider is the only consumer and already ignores these fields.
- **`name` field semantics** → After simplification, `RegistrySource.name` unambiguously means extension name. Code that assumed it was config name needs updating. Mitigation: search for `source.name` on registry-typed sources.

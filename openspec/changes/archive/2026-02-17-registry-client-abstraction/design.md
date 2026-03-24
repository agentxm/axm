## Context

`RegistrySourceProvider` (in `sources/providers/registry.ts`) serves two roles:

1. **Registry client** — low-level operations against the registry layout: `namespaceExists`, `fetchIndex`, `getExtension`, `publishExtension`, `extensionExists`, `getExtensions`
2. **Source host provider** — discovery and materialization for `SourceHostProvider`: `find` (wraps `getExtensions`), `fetch` (archive extraction + integrity verification)

These are conflated into a single 7-method interface. The host provider wrapper (`createRegistrySourceHostProvider`) delegates everything to the inner `RegistrySourceProvider`, making it a thin pass-through. The registry meta-provider in `service.ts` creates `RegistrySourceProvider` instances directly.

Currently `RemoteRegistrySourceProvider` stubs all methods with errors. The split will maintain this — remote variants remain placeholders.

## Goals / Non-Goals

**Goals:**

- Separate registry client operations from source host provider operations into distinct interfaces
- `RegistryClient` is usable independently of the source provider dispatch (e.g., for publish commands)
- `LocalRegistrySourceHostProvider` and `RemoteRegistrySourceHostProvider` follow the same `SourceHostProvider` pattern as other providers, delegating to their respective `RegistryClient`
- Remote variants (`RemoteRegistryClient`, `RemoteRegistrySourceHostProvider`) are stubs with not-implemented errors

**Non-Goals:**

- Implementing remote registry support
- Changing the registry layout or index schema
- Modifying `SourceHostProvider` or `PublishableSourceHostProvider` interfaces
- Changing the meta-provider's scope routing or lazy config behavior
- Changing version resolution, integrity verification, or archive extraction logic

## Decisions

### 1. RegistryClient uses registry-domain types

The `RegistryClient` interface uses its own types, not source-domain types. This keeps `registry/` as a leaf module with zero imports from `sources/`.

**Registry-domain types** (defined in `registry/`):

- `RegistrySearchOptions` — what to search for: `{ names, agents, type }`. Mirrors the shape of `FindOptions` but lives in the registry domain.
- `RegistryExtensionEntry` — a discovered extension: `{ scope, type, name, version, checksum }`. The registry-domain equivalent of `SourceExtensionRef`, without source-provider concerns like `source` or `location`.

The host provider maps at the boundary:

- Inbound: `FindOptions → RegistrySearchOptions`
- Outbound: `RegistryExtensionEntry → SourceExtensionRef` (stamps with `source`, `RegistryRefDetails`)

**RegistryClient interface with 6 methods:**

```
getExtensions(options: RegistrySearchOptions) → Effect<ReadonlyArray<RegistryExtensionEntry>, AppError, FileSystem | Path>
namespaceExists(scope) → Effect<boolean, AppError, FileSystem | Path>
fetchIndex(scope, type, name) → Effect<ExtensionIndex, AppError, FileSystem | Path>
getExtension(scope, type, name, version) → Effect<Uint8Array, AppError, FileSystem | Path>
publishExtension(scope, type, name, version, archive, metadata) → Effect<void, AppError, FileSystem | Path>
extensionExists(scope, type, name) → Effect<boolean, AppError, FileSystem | Path>
```

**`source` parameter removed from client methods.** The current `RegistrySourceProvider.getExtensions(source, options)` and `fetch(source, ref)` accept a `RegistrySourceParams` first argument. `RegistrySourceParams` is `{ type: "registry" }` — it carries no data beyond a type tag. Since `RegistryClient` is scoped to a specific registry root at construction time, this parameter is redundant and dropped. The registry root (passed to the factory) replaces what `source` provided. Callers that currently pass `source` (e.g., `service.ts` meta-provider, `resolve-source.ts`, publish commands) will instead create a `RegistryClient` via the factory and call methods directly. No information is lost. **`RegistrySourceParams` is removed** as it becomes unused.

**Scope-scanning dropped.** The current `fetch` defensively scans all `@*` scope directories to locate the archive. This is unnecessary — `RegistryRefDetails.scope` is a required field on `SourceExtensionRef`, and `RegistryExtensionEntry.scope` is required on the client side. Scope is always known. The defensive scanning is removed entirely, not moved.

**Rationale:** These methods map 1:1 to registry layout operations (read index, read archive, write archive, check existence). `getExtensions` is included here because it scans the registry layout directly — it reads scope directories and index files. The host provider's `find` delegates to `getExtensions` and maps the results.

Registry-domain types prevent circular dependencies between `registry/` and `sources/`. Without them, `registry/client.ts` would import `FindOptions` and `SourceExtensionRef` from `sources/types.ts`, while `sources/types.ts` already imports `RegistryExtensionType` from `registry/` — creating a cycle through barrel files.

**Alternative considered:** Keeping `getExtensions` only on the host provider. Rejected because `getExtensions` is a pure registry scan operation — it reads index files and applies version/agent filtering. The host provider's `find` just wraps it with type mapping.

### 2. Host providers delegate to RegistryClient and map types at the boundary

`LocalRegistrySourceHostProvider` and `RemoteRegistrySourceHostProvider` implement `SourceHostProvider` (and `PublishableSourceHostProvider` for publish support). Each receives a `RegistryClient` at construction and delegates:

- `find(source, options)` → maps `FindOptions → RegistrySearchOptions`, calls `client.getExtensions(searchOptions)`, maps each `RegistryExtensionEntry → SourceExtensionRef` (stamps with `source`, builds `RegistryRefDetails` from entry's scope/version/checksum)
- `fetch(source, ref)` → extracts `scope`, `type`, `name`, `version` from the ref's `RegistryRefDetails`, calls `client.getExtension(scope, type, name, version)` to get archive bytes, verifies checksum via `computeChecksum`, extracts zip via `extractZip`
- `publishExtension(...)` → delegates to `client.publishExtension(...)`

**Rationale:** Keeps the host provider as a thin adapter between the `SourceHostProvider` contract and the `RegistryClient`. Type mapping at the boundary keeps the two domains cleanly separated. Archive extraction and integrity verification stay in the host provider since they're materialization concerns (same as git providers doing clone + scan).

**Alternative considered:** Moving archive extraction into `RegistryClient`. Rejected because extraction is a materialization concern — other host providers also handle materialization (git clone, local copy). Keeping it in the host provider maintains consistency across provider types.

### 3. File organization: RegistryClient in registry/, host providers stay in sources/providers/

The `RegistryClient` abstraction and implementations live in the existing `registry/` feature folder (alongside the existing schema):

```
registry/
  client.ts              # RegistryClient interface, RegistrySearchOptions, RegistryExtensionEntry,
                         #   LocalRegistryClient, RemoteRegistryClient, createRegistryClient factory
  utils.ts               # Shared helpers: selectVersion, computeChecksum, extractZip, path builders
  schema.ts              # Existing registry schemas (ExtensionIndex, etc.)
  schema.test.ts         # Existing schema tests
  client.test.ts         # Client tests (migrated from sources/providers/registry.test.ts)
  index.ts               # Barrel exports (updated)
```

The registry-specific host providers remain in `sources/providers/` where other host providers live:

```
sources/providers/
  registry/
    host-provider.ts       # LocalRegistrySourceHostProvider + RemoteRegistrySourceHostProvider + factory
    index.ts               # Barrel exports
```

Shared helpers (`selectVersion`, `computeChecksum`, `extractZip`, path-building functions) live in `registry/utils.ts`. `client.ts` uses `selectVersion` and path builders; `host-provider.ts` uses `computeChecksum` and `extractZip`. Both import from `@/registry`.

**Delete `sources/providers/registry.ts`** — the existing ~860-line file is fully replaced by the new modules. Its contents split as follows:

- `RegistrySourceProvider` interface → `RegistryClient` in `registry/client.ts`
- `createLocalRegistryProvider` → `createLocalRegistryClient` in `registry/client.ts`
- `createRemoteRegistryProvider` → `createRemoteRegistryClient` in `registry/client.ts`
- `createRegistryProvider` factory → `createRegistryClient` in `registry/client.ts`
- `createRegistrySourceHostProvider` → `registry/host-provider.ts` in `sources/providers/registry/host-provider.ts`
- Helper functions (`selectVersion`, `computeChecksum`, `extractZip`, `buildExtensionPath`, etc.) → `registry/utils.ts`
- `sources/providers/registry.test.ts` → migrated to `registry/client.test.ts` (tests inner provider logic directly)
- New `sources/providers/registry/host-provider.test.ts` — written fresh (no existing host provider tests to migrate)

**Consuming files that need import updates** (7 files):

| File                                                          | Current import                                                                    | New import                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `sources/service.ts`                                          | `createRegistryProvider`                                                          | `createRegistrySourceHostProvider` from `@/sources/providers/registry` (meta-provider now creates host providers)       |
| `sources/resolve-source.ts`                                   | `createRegistryProvider`                                                          | `createRegistryClient` from `@/registry` (uses `extensionExists` / `namespaceExists` directly)                          |
| `cli-commands/skills/publish-skill.ts`                        | `createRegistryProvider`                                                          | `createRegistryClient` from `@/registry` (uses `publishExtension` directly)                                             |
| `cli-commands/packs/publish/publish-pack.ts`                  | `createRegistryProvider`                                                          | `createRegistryClient` from `@/registry` (uses `publishExtension` directly)                                             |
| `cli-commands/skills/install/resolve-skill-install-source.ts` | `createRegistryProvider`                                                          | `createRegistryClient` from `@/registry` (uses `namespaceExists` directly)                                              |
| `sources/providers/index.ts`                                  | re-exports `RegistrySourceProvider` type + factory functions from `./registry.js` | re-exports `createRegistrySourceHostProvider` from `./registry/index.js`. `RegistrySourceProvider` type export removed. |
| `sources/index.ts`                                            | re-exports `RegistrySourceProvider` via providers barrel                          | remove `RegistrySourceProvider` re-export (transitive from providers barrel update)                                     |

**Rationale:** The `registry/` folder already owns registry schemas and layout concerns — the client interface is a natural fit there. Host providers belong in `sources/providers/` alongside other providers (git-hosting, local, etc.). This keeps the separation clean: registry domain logic in `registry/`, source dispatch adapter in `sources/providers/`.

**Alternative considered:** Putting everything in `sources/providers/registry/`. Rejected because the client is a registry-domain concept, not a source-provider concept. The whole point of this change is making `RegistryClient` usable independently of the source provider dispatch.

### 4. Meta-provider creates host providers, not clients directly

The registry meta-provider in `service.ts` continues to create per-registry-source instances, but now creates `LocalRegistrySourceHostProvider` or `RemoteRegistrySourceHostProvider` (via a factory) instead of `RegistrySourceProvider`.

```
meta-provider.find(source, options):
  for each configured registry:
    provider = createRegistrySourceHostProvider(registryLocation)
    refs = provider.find(source, options)
    ...
```

**Rationale:** The meta-provider's job is orchestrating across N registries via the `SourceHostProvider` interface. It doesn't need to know about `RegistryClient` directly. Each host provider internally creates and owns its client.

### 5. RegistryClient factory mirrors current createRegistryProvider

```typescript
createRegistryClient(location: string): RegistryClient
```

`file://` or local path → `LocalRegistryClient`. `https://` → `RemoteRegistryClient`. Same protocol detection as today.

The host provider factory creates the client internally:

```typescript
createRegistrySourceHostProvider(host: RegistrySourceHost): PublishableSourceHostProvider
```

This creates the appropriate `RegistryClient` and wraps it in the matching host provider.

## Risks / Trade-offs

**[Two-step indirection for publish]** → The publish path goes `PublishableSourceHostProvider → RegistryClient → filesystem`. One more hop than today's `RegistrySourceProvider → filesystem`. Acceptable because publish is not a hot path, and the indirection maps cleanly to the separation of concerns.

**[Remote stubs duplicated]** → Both `RemoteRegistryClient` and `RemoteRegistrySourceHostProvider` are stubs. When remote is eventually implemented, both need real logic. → This is intentional — each has distinct responsibilities. The client handles HTTP transport; the host provider handles materialization.

**[Migration breadth]** → 7 consuming files need import updates, plus 2 barrel files and 1 test file. → All changes are mechanical (rename imports, swap factory calls). The migration table in Decision 3 enumerates every file. No behavioral changes to callers — just which factory they call and which module they import from.

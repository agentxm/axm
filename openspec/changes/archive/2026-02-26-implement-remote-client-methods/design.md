## Context

`RemoteRegistryClient` currently implements publish and parts of read behavior, but it still treats key reads as unsupported (`namespaceExists`, `getExtensionPackage`) and blocks list-mode discovery (`getExtensionsByScope` with `names: []`).

The remote registry service in `../agentxm-internal/apps/registry` now exposes concrete read endpoints we can consume:

- `GET /v1/extensions/{namespace}` -> namespace extension summaries
- `GET /v1/extensions/{namespace}/{type}` -> type-scoped extension summaries
- `GET /v1/extensions/{namespace}/{type}/{name}` -> full extension index (versions + metadata)
- `HEAD /v1/extensions/{namespace}/{type}/{name}` -> extension existence check
- `GET /v1/extensions/{namespace}/{type}/{name}/{version}/archive` -> ZIP bytes

This change closes remote/local parity gaps for source resolution and package retrieval without requiring caller-side special cases.

## Goals / Non-Goals

**Goals:**

- Implement all `RegistryClient` remote read methods needed for install/discovery flows.
- Preserve typed `AppError` behavior with stable error codes and request context in `details`.
- Keep remote client response decoding schema-validated before mapping to registry-domain types.
- Ensure tests cover happy-path + failure-path behavior for each new remote method.
- Keep linting green as a merge gate for this change.

**Non-Goals:**

- Backward compatibility with current remote stub behavior.
- Registry API redesign or new backend endpoints.
- Auth/session/token flows for remote reads.
- Aggressive client-side caching or retry policy changes.

## Decisions

### Decision: Implement `namespaceExists` via namespace listing endpoint

`namespaceExists(namespace)` will call `GET /v1/extensions/{namespace}`.

- If response is `200` and `extensions.length > 0`, return `{ exists: true }`.
- If response is `200` and `extensions.length === 0`, return `{ exists: false }`.
- If response is `404`, return `{ exists: false }`.
- Any other non-2xx status maps to `AppError` (`REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED`).

Rationale: There is no dedicated namespace-existence endpoint with strong semantics today. Listing is available and stable. Defining "exists" as "has at least one published extension" matches observable registry behavior and keeps callers deterministic.

Alternative considered: use `/v1/namespaces/{namespace}/profile` endpoint. Rejected because current registry route is mock-only and not authoritative for extension availability.

### Decision: Implement `getExtensionPackage` using index + archive endpoints

`getExtensionPackage({ namespace, type, name, version })` flow:

1. Fetch index from `GET /v1/extensions/{namespace}/{type}/{name}`.
2. Resolve target version:
   - `Some(version)` -> require exact match in index.
   - `None` -> pick newest index entry (`versions[0]`, server already newest-first).
3. Download archive from `GET /v1/extensions/{namespace}/{type}/{name}/{resolvedVersion}/archive`.
4. Return raw bytes as `{ archive }`.

Error mapping:

- index `404` -> `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`
- requested version missing from index -> `REGISTRY_REMOTE_VERSION_NOT_FOUND`
- archive fetch `404` -> `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`
- decode/validation failure -> `REGISTRY_REMOTE_INVALID_RESPONSE`
- network failures -> `REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR`

Rationale: Using index first keeps version selection consistent with local client semantics and avoids separate server "latest" resolution assumptions.

Alternative considered: direct archive URL only (require explicit version always). Rejected because `RegistryClient` contract supports omitted version and callers rely on latest fallback.

### Decision: Enable remote list mode in `getExtensionsByScope`

When `args.names` is empty, remote client will call namespace list endpoints instead of failing:

- If `args.types` is empty: call `GET /v1/extensions/{namespace}` once.
- If `args.types` has values: call `GET /v1/extensions/{namespace}/{type}` per requested type (parallel).

Each summary entry is expanded to a full `RegistryExtensionManifest` by calling index endpoint per `(namespace,type,name)` (parallel, bounded by existing Effect concurrency controls), then converted with current `toRegistryManifest` mapping.

Pagination behavior remains client-side (`offset`, `limit`) for now.

Rationale: Summary endpoints return latest-version metadata but not full version history/dependencies shape expected by existing manifest mapping. Hydrating via index keeps one canonical decode path and minimizes branching.

Alternative considered: map summary responses directly to manifests. Rejected because summary shape is intentionally lighter and omits data needed for strict parity.

### Decision: Keep response validation schema-first

All remote JSON payloads continue through `Schema.decodeUnknown(...)` before domain conversion.

- Add schemas for namespace/type collection responses in `packages/cli/src/registry/client-remote.ts` (or co-located schema module).
- Continue using `ExtensionIndexSchema` for index decoding.

Rationale: defensive decoding prevents malformed upstream data from leaking into source resolution.

Alternative considered: trust backend shape with manual field checks. Rejected due weaker guarantees and inconsistent error surfaces.

### Decision: Extend tests in two layers

- `packages/cli/src/registry/client-remote.test.ts`: method-level read behavior and error mapping.
- `packages/cli/src/registry/client.test.ts`: factory/integration assertions for remote client contract parity.

Coverage includes:

- namespace exists true/false
- list mode with empty names
- package fetch with explicit version and latest fallback
- 404, non-JSON error body, invalid schema, and network failures

Rationale: keeps fast unit-level diagnostics while preserving end-to-end registry-client guarantees.

## Risks / Trade-offs

- [High request fan-out in list mode] -> Mitigation: use Effect concurrency controls and preserve existing bounded patterns; optimize with backend search endpoint later.
- [Namespace existence semantics are inferred from extension presence] -> Mitigation: document semantics in spec; switch to dedicated endpoint when backend provides one.
- [Remote and local ordering differences could affect pagination windows] -> Mitigation: normalize ordering before offset/limit in remote path.
- [Backend payload drift] -> Mitigation: schema validation + targeted tests for decode failures.

## Migration Plan

1. Update `openspec` specs for `registry-client` (delta) and add new `remote-registry-read` capability spec.
2. Implement remote read methods and supporting schemas in `packages/cli/src/registry/client-remote.ts`.
3. Add/adjust tests in `packages/cli/src/registry/client-remote.test.ts` and `packages/cli/src/registry/client.test.ts`.
4. Run quality gates: `pnpm lint`, targeted tests, then broader suite as needed.
5. If regressions appear, rollback by reverting remote-read method changes while keeping publish path untouched.

## Open Questions

- Should remote list mode cap concurrency explicitly (fixed number) instead of current unbounded strategy for large namespaces?
- Do we want to preserve ETag headers from index responses for future client caching hooks?
- Should namespace existence eventually move to a dedicated backend endpoint once namespace profile is implemented?

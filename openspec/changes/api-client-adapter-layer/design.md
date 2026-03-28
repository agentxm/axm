## Context

The codebase has two generated OpenAPI clients (`registry-client.ts`, `telemetry-client.ts`) produced by `@effect/openapi-generator` from live service specs. Neither is used — three hand-written clients (`telemetry/client.ts`, `registry/remote-client.ts`, `auth/auth-client.ts`) duplicate the same HTTP transport with manual request construction, bespoke schemas, and custom response parsing.

The generated clients expose a `make(httpClient, options?)` factory returning a typed client object. Operations use relative paths (`/v1/events`, `/v1/extensions/{handle}/{type}/{name}`), return `Effect<A, HttpClientError | SchemaError>`, and use `HttpClientResponse.matchStatus` for status-code-based decoding. An optional `transformClient` hook allows middleware injection.

The domain layer expects all errors as `AppError` with codes, `howToFix`, and `details`. Registry reads return `Option<T>` for not-found. Telemetry is fire-and-forget. Auth uses form-encoded bodies and device-flow polling.

### Generated Client Capabilities

After spec and codegen patches, the generated clients now cover most operations end-to-end:

- **Auth operations** — All four auth POST operations (`AuthIssueDeviceCode`, `AuthExchangeDeviceCode`, `AuthRefreshToken`, `AuthRevokeToken`) now accept typed `FormUrlEncoded` payloads and use `HttpClientRequest.bodyUrlParams()`. This required a patch to `@effect/openapi-generator` — the `httpclient` format silently dropped `application/x-www-form-urlencoded` request bodies (upstream issue: [Effect-TS/effect-smol#1909](https://github.com/Effect-TS/effect-smol/issues/1909), fix PR: [Effect-TS/effect-smol#1910](https://github.com/Effect-TS/effect-smol/pull/1910)). A pnpm patch (`patches/@effect__openapi-generator.patch`) applies the fix locally until the upstream release. Typed error responses (400, 401) are decoded into `RegistryClientError` tags.
- **Typed error schemas** — RFC 9457 problem detail is now modeled as typed schemas (`DecodeErrorResponse`, `InvalidRequestError`, `RefreshTokenError`, `NotFoundError`, `InternalError`). Most operations have per-status error handlers (400, 401, 403, 404) that decode into tagged `RegistryClientError` values. This required a second patch to `@effect/openapi-generator` — the `httpclient` format only checked `application/json` for response schema extraction, missing `application/problem+json` and other `+json` types (upstream issue: [Effect-TS/effect-smol#1911](https://github.com/Effect-TS/effect-smol/issues/1911), fix PR: [Effect-TS/effect-smol#1912](https://github.com/Effect-TS/effect-smol/pull/1912)). The same pnpm patch includes this fix.
- **Binary streaming** — New `ExtensionsDownloadArchiveStream` operation returns `Stream<Uint8Array>` for archive downloads. The `httpclient` format previously only detected `application/octet-stream` for binary responses, missing `application/zip` and other binary types. Fixed in the same patch ([Effect-TS/effect-smol#1912](https://github.com/Effect-TS/effect-smol/pull/1912)).

### Remaining Codegen Limitations

Both previous codegen-level limitations have been addressed:

~~1. **`ExtensionsDownloadArchive` has no success handler**~~ — Fixed upstream in [Effect-TS/effect-smol#1916](https://github.com/Effect-TS/effect-smol/pull/1916) (issue [#1915](https://github.com/Effect-TS/effect-smol/issues/1915)). The generator now emits a `decodeBinary` handler in `matchStatus` that decodes binary success responses as `Uint8Array` via `response.arrayBuffer`. The non-streaming method returns `Effect<Uint8Array, ...>` while the companion `*Stream` method returns `Stream<Uint8Array>`. Also broadens `isBinaryMediaType` to recognize `application/zip`, `image/*`, etc. Already patched locally in `patches/@effect__openapi-generator.patch`.

~~2. **`ExtensionsHead` erases status codes**~~ — Fixed upstream in [Effect-TS/effect-smol#1914](https://github.com/Effect-TS/effect-smol/pull/1914) (issue [#1913](https://github.com/Effect-TS/effect-smol/issues/1913)). The generator now routes 4xx/5xx void schemas to the error channel as typed `RegistryClientError<"status", undefined>` values. Already patched locally in `patches/@effect__openapi-generator.patch`.

## Goals / Non-Goals

**Goals:**

- Rewrite existing service implementations (`remote-client.ts`, `auth-client.ts`, `client.ts`) to use generated clients as their HTTP transport instead of hand-written requests
- Generated client errors (`HttpClientError | SchemaError | RegistryClientError`) mapped to `AppError` with per-operation error codes matching the hand-written clients (no granularity loss)
- RFC 9457 problem detail → `AppError` mapping preserved in the remote registry client
- Base URL configuration via `HttpClient.mapRequest` with `prependUrl`
- Auth middleware composition via the `httpClient` parameter (already-wrapped client passed to `make()`)
- Generated schemas/types imported where they replace hand-written duplicates
- `AuthClientService` interface simplified — move `registryUrl` from per-call parameter to construction-time dependency, consistent with how `RegistryClient` already works

**Non-Goals:**

- Changing the `RegistryClient` or `TelemetryClientService` interfaces — consumers are unaffected
- Adapting the local registry client — only the remote client uses HTTP
- Backward compatibility with the hand-written client internals
- Extending the domain interfaces to cover generated operations not currently wrapped (e.g., `TokensList`, `ExtensionsDeprecate`, `SearchSearchExtensions`) — deferred to follow-up changes

## Decisions

### 1. Three implementations: registry, auth, telemetry

Each domain service is updated to use the generated client internally:

- **Remote registry client** — `registry/remote-client.ts` is rewritten to implement `RegistryClient` using extension operations from the generated registry client
- **Auth client** — `auth/auth-client.ts` is updated so `AuthClientLive` uses auth operations from the generated registry client (device flow, token exchange, refresh, revoke, me). The `AuthClientService` interface is updated to take `registryUrl` at construction time (via service layer / layer construction) instead of per-call, matching how the generated client is constructed with a fixed base URL.
- **Telemetry client** — `telemetry/client.ts` is updated so `makeTelemetryClient` uses the generated telemetry client internally

Registry and auth share the same generated `make()` instance and `HttpClient` (with base URL and auth middleware), but are separate implementations because they serve different domain interfaces with different error semantics.

**Alternatives considered:**

- (a) Two implementations (registry+auth combined, telemetry) — rejected because auth and registry have distinct domain interfaces, error codes, and testing concerns. Combining them would create a large module mixing extension CRUD with OAuth flow logic.
- (b) One unified implementation — rejected because telemetry and registry are completely independent services with different base URLs and error semantics

### 2. Base URL via HttpClient.mapRequest

The generated clients use relative paths (`/v1/...`). Rather than string-concatenating base URLs, configure the `HttpClient` with `HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))` before passing to `make()`. This keeps URL logic out of the service implementation and composes cleanly with auth middleware.

```
HttpClient (base)
  → auth middleware (injects Bearer, handles 401 refresh)
  → mapRequest(prependUrl(baseUrl))
  → make(httpClient)  // generated client sees relative paths
```

**Alternatives considered:**

- (a) Pass base URL to implementation, concatenate per-call — rejected because it duplicates what `make()` already handles and breaks the generated client's relative path convention
- (b) `transformClient` option on `make()` — rejected because `transformClient` runs per-request (unnecessary overhead) and `mapRequest` is simpler for static URL prepending

### 3. Work around remaining codegen limitations

**~~Archive download~~** — Fixed. After the local patch ([Effect-TS/effect-smol#1916](https://github.com/Effect-TS/effect-smol/pull/1916)), `ExtensionsDownloadArchive` now has a `decodeBinary` handler returning `Uint8Array`. The remote registry client can use either the non-streaming method directly or `ExtensionsDownloadArchiveStream` for large archives.

**~~HEAD status erasure~~** — Fixed. After the local patch ([Effect-TS/effect-smol#1914](https://github.com/Effect-TS/effect-smol/pull/1914)), `ExtensionsHead` routes 4xx/5xx to typed errors in the error channel. The implementation uses `Effect.catchIf` to handle 404 as `Option.none()` — no `includeResponse` workaround needed.

### 4. Error mapping strategy

Each service implementation maps generated client errors to `AppError` **per-operation**, preserving the exact error code granularity of the hand-written clients. No error codes are lost or collapsed.

#### Remote registry client — per-operation error mapping

Each method in `remote-client.ts` has its own error mapper. The three error sources are:

- `HttpClientError` — network failures, mapped per-operation with `buildNetworkHowToFix()` diagnostics (localhost+HTTPS detection)
- `SchemaError` — response decode failures
- `RegistryClientError<Tag>` — typed status-code errors from the generated client, pattern-matched on tag and `cause.code`

**`getExtensionIndex`** (generated: `ExtensionsGet`)

| Source                                    | Condition      | AppError code                                |
| ----------------------------------------- | -------------- | -------------------------------------------- |
| `HttpClientError`                         | network error  | `REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR`    |
| `RegistryClientError<"ExtensionsGet404">` | not found      | → `Option.none()` (not an error)             |
| `RegistryClientError<"ExtensionsGet401">` | 401            | `AUTH_UNAUTHENTICATED`                       |
| `RegistryClientError<"ExtensionsGet403">` | 403            | `AUTH_UNAUTHORIZED`                          |
| `RegistryClientError<"ExtensionsGet4xx">` | other 4xx      | `REGISTRY_REMOTE_DISCOVERY_FAILED`           |
| `SchemaError`                             | decode failure | `REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE` |

**`getExtensionsByScope`** (generated: `ExtensionsListByProfile` + `ExtensionsListByType`)

| Source                             | Condition      | AppError code                                |
| ---------------------------------- | -------------- | -------------------------------------------- |
| `HttpClientError`                  | network error  | `REGISTRY_REMOTE_DISCOVERY_NETWORK_ERROR`    |
| `RegistryClientError<"..401">`     | 401            | `AUTH_UNAUTHENTICATED`                       |
| `RegistryClientError<"..403">`     | 403            | `AUTH_UNAUTHORIZED`                          |
| `RegistryClientError<"..4xx/5xx">` | other errors   | `REGISTRY_REMOTE_DISCOVERY_FAILED`           |
| `SchemaError`                      | decode failure | `REGISTRY_REMOTE_DISCOVERY_INVALID_RESPONSE` |

**`profileExists`** (generated: `ExtensionsListByProfile`)

| Source                         | Condition      | AppError code                                   |
| ------------------------------ | -------------- | ----------------------------------------------- |
| `HttpClientError`              | network error  | `REGISTRY_REMOTE_NAMESPACE_CHECK_NETWORK_ERROR` |
| `RegistryClientError<"..404">` | not found      | → `{exists: false}` (not an error)              |
| `RegistryClientError<"..401">` | 401            | `AUTH_UNAUTHENTICATED`                          |
| `RegistryClientError<"..403">` | 403            | `AUTH_UNAUTHORIZED`                             |
| other status                   | unexpected     | `REGISTRY_REMOTE_NAMESPACE_CHECK_FAILED`        |
| `SchemaError`                  | decode failure | `REGISTRY_REMOTE_INVALID_RESPONSE`              |

**`getExtensionPackage`** (generated: `ExtensionsGet` + `ExtensionsDownloadArchive`)

| Source                                        | Condition                     | AppError code                                 |
| --------------------------------------------- | ----------------------------- | --------------------------------------------- |
| `HttpClientError`                             | network error (index)         | `REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR` |
| `HttpClientError`                             | network error (archive)       | `REGISTRY_REMOTE_PACKAGE_FETCH_NETWORK_ERROR` |
| `RegistryClientError<"ExtensionsGet404">`     | index not found               | `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`           |
| `RegistryClientError<"..DownloadArchive404">` | archive not found             | `REGISTRY_REMOTE_PACKAGE_NOT_FOUND`           |
| other status                                  | unexpected (index or archive) | `REGISTRY_REMOTE_PACKAGE_FETCH_FAILED`        |
| `SchemaError`                                 | decode failure                | `REGISTRY_REMOTE_INVALID_RESPONSE`            |
| —                                             | version not in index          | `REGISTRY_REMOTE_VERSION_NOT_FOUND`           |

The implementation uses `ExtensionsDownloadArchive` (non-streaming) which returns `Uint8Array` directly, matching `GetExtensionPackageResponse.archive`. The two-step process (fetch index → resolve version → download archive) is preserved.

**`extensionExists`** (generated: `ExtensionsHead`)

| Source                         | Condition     | AppError code                                   |
| ------------------------------ | ------------- | ----------------------------------------------- |
| `HttpClientError`              | network error | `REGISTRY_REMOTE_EXTENSION_CHECK_NETWORK_ERROR` |
| `RegistryClientError<"..404">` | not found     | → `{exists: false}` (not an error)              |
| `RegistryClientError<"..401">` | 401           | `AUTH_UNAUTHENTICATED`                          |
| `RegistryClientError<"..403">` | 403           | `AUTH_UNAUTHORIZED`                             |
| other status                   | unexpected    | `REGISTRY_REMOTE_EXTENSION_CHECK_FAILED`        |

**`publishExtension`** (generated: `ExtensionsPublishVersion`)

| Source                             | Condition                                | AppError code                         |
| ---------------------------------- | ---------------------------------------- | ------------------------------------- |
| `HttpClientError` (TransportError) | network error                            | `REGISTRY_PUBLISH_NETWORK_ERROR`      |
| `RegistryClientError<"..401">`     | 401                                      | `AUTH_UNAUTHENTICATED`                |
| `RegistryClientError<"..403">`     | code=`quota_exceeded`                    | `REGISTRY_PUBLISH_QUOTA_EXCEEDED`     |
| `RegistryClientError<"..403">`     | other 403                                | `AUTH_UNAUTHORIZED`                   |
| `RegistryClientError<"..409">`     | code=`publish_conflict`                  | `REGISTRY_PUBLISH_CONFLICT`           |
| `RegistryClientError<"..400">`     | code=`malformed_archive`/`empty_archive` | `REGISTRY_PUBLISH_INVALID_ARCHIVE`    |
| `RegistryClientError<"..413">`     | code=`ingest_*_too_large`                | `REGISTRY_PUBLISH_TOO_LARGE`          |
| `RegistryClientError<"..415">`     | code=`ingest_unsupported_content_type`   | `REGISTRY_PUBLISH_INVALID_ARCHIVE`    |
| `RegistryClientError<"..422">`     | code=`integrity_mismatch`                | `REGISTRY_PUBLISH_INTEGRITY_MISMATCH` |
| `RegistryClientError<"..422">`     | code=`manifest_*`                        | `REGISTRY_PUBLISH_MANIFEST_INVALID`   |
| `RegistryClientError<"..429">`     | code=`throttled`                         | `REGISTRY_PUBLISH_THROTTLED`          |
| `RegistryClientError<"..501">`     | code=`publish_type_not_implemented`      | `REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED` |
| `RegistryClientError<"..503">`     | code=`publish_disabled`                  | `REGISTRY_PUBLISH_DISABLED`           |
| `RegistryClientError<"..other">`   | fallback                                 | `REGISTRY_PUBLISH_FAILED`             |

The generated client's typed error schemas replace the hand-written `mapProblemDetailToAppError` raw JSON extraction. Instead of `getStringField(problem, "code")`, the implementation reads `cause.code` from the typed `InvalidRequestError`, `ConflictError`, etc. The typed `details` fields (`.retryAfterSeconds`, `.requiredScope`, `.tokenScopes`, `.requiredRole`) provide structured access to RFC 9457 problem detail fields.

#### Auth client — per-operation error mapping

**`initiateDeviceFlow`** (generated: `AuthIssueDeviceCode`)

| Source                                          | Condition     | AppError code       |
| ----------------------------------------------- | ------------- | ------------------- |
| `HttpClientError`                               | network error | `AUTH_LOGIN_FAILED` |
| `RegistryClientError<"AuthIssueDeviceCode400">` | bad request   | `AUTH_LOGIN_FAILED` |

**`pollDeviceToken`** (generated: `AuthExchangeDeviceCode`, called in a loop)

| Source                                             | Condition                          | AppError code                               |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `HttpClientError`                                  | network error                      | `AUTH_LOGIN_FAILED`                         |
| `RegistryClientError<"AuthExchangeDeviceCode400">` | cause.code=`authorization_pending` | → `PollResult.Pending` (continue polling)   |
| `RegistryClientError<"AuthExchangeDeviceCode400">` | cause.code=`slow_down`             | → `PollResult.SlowDown` (increase interval) |
| `RegistryClientError<"AuthExchangeDeviceCode400">` | cause.code=`access_denied`         | `AUTH_LOGIN_CANCELLED`                      |
| `RegistryClientError<"AuthExchangeDeviceCode400">` | cause.code=`expired_token`         | `AUTH_LOGIN_FAILED`                         |
| other status                                       | unexpected                         | `AUTH_LOGIN_FAILED`                         |

The polling loop with backoff (`SLOW_DOWN_INCREMENT_MS = 5000`) is preserved in the auth client.

**`refreshToken`** (generated: `AuthRefreshToken`)

| Source                                       | Condition     | AppError code         |
| -------------------------------------------- | ------------- | --------------------- |
| `HttpClientError`                            | network error | `AUTH_REFRESH_FAILED` |
| `RegistryClientError<"AuthRefreshToken400">` | bad request   | `AUTH_REFRESH_FAILED` |
| `RegistryClientError<"AuthRefreshToken401">` | unauthorized  | `AUTH_REFRESH_FAILED` |

**`revokeToken`** (generated: `AuthRevokeToken`)

| Source    | Condition   | AppError code                                                 |
| --------- | ----------- | ------------------------------------------------------------- |
| any error | any failure | swallowed (fire-and-forget, consistent with current behavior) |

**`getMe`** (generated: `AuthGetMe`)

| Source                                | Condition     | AppError code          |
| ------------------------------------- | ------------- | ---------------------- |
| `HttpClientError`                     | network error | `AUTH_UNAUTHENTICATED` |
| `RegistryClientError<"AuthGetMe401">` | 401           | `AUTH_UNAUTHENTICATED` |
| `RegistryClientError<"AuthGetMe400">` | 400           | `AUTH_UNAUTHENTICATED` |
| `RegistryClientError<"..5xx">`        | 500+          | `AUTH_SERVER_ERROR`    |
| other status                          | unexpected    | `AUTH_UNAUTHENTICATED` |

#### Telemetry client

All errors swallowed — telemetry is fire-and-forget. The `makeTelemetryClient` function wraps generated operations with the existing `swallowFailure` + `forkDetach` pattern. Mode gating (`"off"` / `"errors"` / `"all"`) and test detection remain in `makeTelemetryClient` alongside the generated client usage — the generated client only owns HTTP transport.

### 5. File changes and wiring

The generated clients are used directly inside the existing service files — no separate files or indirection layers:

```
telemetry/
  __generated__/telemetry-client.ts   # generated (unchanged)
  client.ts                           # MODIFIED: makeTelemetryClient uses generated client internally
registry/
  __generated__/registry-client.ts    # generated (unchanged)
  client.ts                           # RegistryClient interface + factory (MODIFIED: calls createRemoteRegistryClient)
  remote-client.ts                    # REWRITTEN: uses generated client instead of hand-written HTTP
  error-mapping.ts                    # NEW: shared error mapping helpers extracted from remote-client.ts
auth/
  auth-client.ts                      # MODIFIED: interface updated (no per-call registryUrl) + AuthClientLive uses generated client
```

**Wiring chain:**

```
registry/client.ts::createRegistryClient(location)
  → http/https? → registry/remote-client.ts::createRemoteRegistryClient(baseUrl, httpClient)
                    → make(httpClient.pipe(mapRequest(prependUrl(baseUrl))))
                    → returns RegistryClient implementation
  → file/local? → registry/local-client.ts (unchanged)

auth/auth-client.ts::AuthClientLive
  → make(httpClient.pipe(mapRequest(prependUrl(registryUrl))))
  → implements AuthClientService

telemetry/client.ts::makeTelemetryClient(options)
  → make(httpClient.pipe(mapRequest(prependUrl(baseUrl))))
  → wraps generated operations with metadata enrichment + swallowFailure
```

The factory in `registry/client.ts` continues to call `createRemoteRegistryClient` — the function keeps its name but is rewritten internally to use the generated client. The old hand-written HTTP logic in `remote-client.ts` is replaced entirely.

**Alternatives considered:**

- (a) Central `adapters/` directory — rejected because it violates the project's "group by feature" code organization
- (b) Separate files alongside existing ones (e.g., `registry/generated-transport.ts`) — rejected because the indirection adds no value; the generated client is just an implementation detail of the existing service file
- (c) Keep hand-written HTTP as a thin delegate to the generated client — rejected because the generated client replaces all the hand-written HTTP logic; there's nothing to delegate

### 6. Schema import strategy

Replace hand-written schemas with imports from generated clients where they match:

| Hand-written                                | Generated replacement                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| `DeviceFlowResponseSchema` (auth-client.ts) | `AuthIssueDeviceCode200`                              |
| `DeviceTokenErrorSchema` (auth-client.ts)   | `DeviceTokenOAuthError` / `AuthExchangeDeviceCode400` |
| `RegistryMeResponseSchema` (auth-client.ts) | `AuthGetMe200`                                        |
| Custom token response decoding              | `AuthExchangeDeviceCode200` / `AuthRefreshToken200`   |

Keep hand-written schemas that don't have generated equivalents (e.g., `ExtensionIndexSchema` in `registry/schema.ts` if it serves a different purpose than the generated extension types).

### 7. Remote registry client handles publish error mapping

The existing `mapProblemDetailToAppError` function moves into `registry/error-mapping.ts`, simplified to work with the generated client's typed error schemas. The generated client now decodes error responses into typed `RegistryClientError` values — for publish, these include `InvalidRequestError` with structured `details` (retryable, retryAfterSeconds) and `code` fields. The remote registry client maps these typed values to `AppError` codes (`REGISTRY_PUBLISH_CONFLICT`, `REGISTRY_PUBLISH_THROTTLED`, etc.) using the `code` field, replacing the raw JSON field extraction in the current implementation.

### 8. Telemetry client preserves metadata enrichment and mode gating

The current `makeTelemetryClient` builds a rich context object (OS name/version, runtime version, device architecture, CI detection, SHA256-hashed hostname as `distinctId`, client name/version) and embeds it in every event/error payload. This metadata enrichment stays in `makeTelemetryClient` — the generated client is only used for HTTP transport.

The generated client calls are inlined inside `makeTelemetryClient`: it receives a fully-constructed event/error payload and sends it via the generated `EventsIngest` / `ErrorsIngest` operations. Mode gating (`"off"` / `"errors"` / `"all"`) and test-environment detection also stay in `makeTelemetryClient`.

```
makeTelemetryClient(options)
  → mode gating (off/errors/all)
  → metadata enrichment (OS, runtime, CI, distinctId)
  → generated client.EventsIngest(enrichedPayload)
  → generated client.ErrorsIngest(enrichedPayload)
  → swallowFailure + forkDetach wrapping
```

### 9. AuthClientService interface change

The current `AuthClientService` takes `registryUrl` as a parameter on every method. This conflicts with the generated client's construction model (fixed `HttpClient` with base URL baked in via `mapRequest`). The interface is updated to remove per-call `registryUrl`:

```typescript
// Before (current)
interface AuthClientService {
  readonly initiateDeviceFlow: (registryUrl: string) => Effect.Effect<DeviceFlowResponse, AppError>;
  readonly pollDeviceToken: (registryUrl: string, deviceCode: string, interval: number) => ...;
  readonly refreshToken: (registryUrl: string, refreshTokenValue: string) => ...;
  readonly revokeToken: (registryUrl: string, accessToken: string) => ...;
  readonly getMe: (registryUrl: string, accessToken: string) => ...;
}

// After
interface AuthClientService {
  readonly initiateDeviceFlow: () => Effect.Effect<DeviceFlowResponse, AppError>;
  readonly pollDeviceToken: (deviceCode: string, interval: number) => ...;
  readonly refreshToken: (refreshTokenValue: string) => ...;
  readonly revokeToken: (accessToken: string) => ...;
  readonly getMe: (accessToken: string) => ...;
}
```

The `registryUrl` moves to construction time — `AuthClientLive` is constructed with a specific registry URL, just like the remote registry client. Callers already know which registry they're targeting when they construct the layer.

For `getMe` and `revokeToken`, the `accessToken` parameter is also a candidate for removal (the auth middleware already injects Bearer tokens), but that's a follow-up concern — this change only removes `registryUrl`.

## Risks / Trade-offs

~~**Archive download codegen limitation forces workaround**~~ — No longer applicable. The binary success handler fix ([Effect-TS/effect-smol#1916](https://github.com/Effect-TS/effect-smol/pull/1916)) adds `decodeBinary` to `matchStatus`, so `ExtensionsDownloadArchive` now returns `Uint8Array` on success. (The HEAD status erasure limitation was also fixed upstream in [#1914](https://github.com/Effect-TS/effect-smol/pull/1914).)

**Schema drift between generated and hand-written** — During migration, some code will import from generated clients while other code still uses hand-written schemas. Type mismatches could surface. → Mitigated by replacing hand-written schemas atomically per domain (all auth schemas at once, all registry schemas at once).

**Generated client regeneration could break implementations** — If `@effect/openapi-generator` changes its output shape or the API specs change, the service implementations break. → Mitigated by the generated client usage being a thin translation layer with tests that verify the mapping. Generated client changes surface as compile errors in the service files, not in consumers.

~~**`includeResponse: true` couples implementation to generated client internals**~~ — No longer applicable. The HEAD void-collapse fix ([Effect-TS/effect-smol#1914](https://github.com/Effect-TS/effect-smol/pull/1914)) eliminates the need for `includeResponse: true` on `ExtensionsHead`.

## Resolved Questions

1. ~~**Should the service expose the generated client instance for operations not covered by the domain interface?**~~ — **No.** The generated registry client has 33 operations but the `RegistryClient` interface only covers 6. Exposing the raw generated client would bypass error mapping and domain types. Instead, new operations (`TokensList`, `TokensCreate`, `CollaboratorsUpsertCollaborator`, `ExtensionsDeprecate`, `SearchSearchExtensions`, etc.) are added to the domain interfaces in follow-up changes, each with their own method and error mapping.

## Implementation Sketch

### Operation → Generated Client Mapping

| Domain method          | Generated operation(s)                             | Notes                                                        |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `getExtensionIndex`    | `ExtensionsGet`                                    | 404 → `Option.none()`                                        |
| `getExtensionsByScope` | `ExtensionsListByProfile` + `ExtensionsListByType` | Fan-out by type, merge results, apply limit/offset           |
| `profileExists`        | `ExtensionsListByProfile`                          | 404 → `{exists: false}`, 200 → check `extensions.length > 0` |
| `getExtensionPackage`  | `ExtensionsGet` + `ExtensionsDownloadArchive`      | Two-step: fetch index → resolve version → download binary    |
| `extensionExists`      | `ExtensionsHead`                                   | 200 → `{exists: true}`, 404 → `{exists: false}`              |
| `publishExtension`     | `ExtensionsPublishVersion`                         | multipart/form-data, typed RFC 9457 error mapping            |
| `initiateDeviceFlow`   | `AuthIssueDeviceCode`                              | form-urlencoded                                              |
| `pollDeviceToken`      | `AuthExchangeDeviceCode` (in loop)                 | RFC 8628 state machine preserved in auth client              |
| `refreshToken`         | `AuthRefreshToken`                                 | form-urlencoded                                              |
| `revokeToken`          | `AuthRevokeToken`                                  | errors swallowed                                             |
| `getMe`                | `AuthGetMe`                                        | transform `AuthGetMe200` → `MeResponse`                      |
| `trackEvent`           | `EventsIngest`                                     | fire-and-forget via swallowFailure + forkDetach              |
| `reportError`          | `ErrorsIngest`                                     | fire-and-forget via swallowFailure                           |

### Remote Registry Client Structure

```typescript
// registry/remote-client.ts (rewritten)

export const createRemoteRegistryClient = (
  baseUrl: string,
  httpClient: HttpClient.HttpClient,
): RegistryClient => {
  const client = GeneratedRegistryClient.make(
    httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))),
  );

  const getExtensionIndex = (args: GetExtensionIndexArgs) =>
    client.ExtensionsGet({ path: { handle: args.handle, type: args.type, name: args.name } }).pipe(
      Effect.map((response) => Option.some(mapToExtensionIndex(response))),
      Effect.catchIf(isRegistryClientError("ExtensionsGet404"), () =>
        Effect.succeed(Option.none()),
      ),
      Effect.catchIf(isRegistryClientError("ExtensionsGet401"), (e) =>
        Effect.fail(mapAuthUnauthenticated(e)),
      ),
      Effect.catchIf(isRegistryClientError("ExtensionsGet403"), (e) =>
        Effect.fail(mapAuthUnauthorized(e)),
      ),
      Effect.catch((e) => Effect.fail(mapRegistryError("DISCOVERY", e, baseUrl))),
    );

  const publishExtension = (args: PublishExtensionArgs) =>
    client
      .ExtensionsPublishVersion({
        path: { handle: args.handle, type: args.type, name: args.name, version: args.version },
        payload: { archive: args.archive, integrity: args.metadata.integrity },
      })
      .pipe(
        Effect.map(() => ({ published: true as const })),
        Effect.catchIf(isRegistryClientError("..401"), (e) =>
          Effect.fail(mapAuthUnauthenticated(e)),
        ),
        Effect.catchIf(isRegistryClientError("..403"), (e) => Effect.fail(mapPublish403(e))),
        Effect.catch((e) => Effect.fail(mapPublishError(e))),
      );

  // ... other methods follow the same pattern

  return {
    getExtensionIndex,
    getExtensionsByScope,
    profileExists,
    getExtensionPackage,
    publishExtension,
    extensionExists,
  };
};
```

### Auth Client Structure

```typescript
// auth/auth-client.ts (AuthClientLive updated)

const makeAuthClient = (
  registryUrl: string,
  httpClient: HttpClient.HttpClient,
): AuthClientService => {
  const client = GeneratedRegistryClient.make(
    httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(registryUrl))),
  );

  const initiateDeviceFlow = () =>
    client
      .AuthIssueDeviceCode({
        payload: { client_id: CLIENT_ID, scope: DEVICE_CODE_SCOPES },
      })
      .pipe(
        Effect.map(mapToDeviceFlowResponse),
        Effect.catch((e) =>
          Effect.fail(
            makeAppError({
              code: "AUTH_LOGIN_FAILED",
              what: "Could not connect to the registry",
              cause: e,
            }),
          ),
        ),
      );

  const pollDeviceToken = (deviceCode: string, interval: number) =>
    // Polling loop with backoff — calls pollOnce in a loop
    Effect.gen(function* () {
      let currentInterval = interval;
      while (true) {
        yield* Effect.sleep(Duration.seconds(currentInterval));
        const result = yield* pollOnce(client, deviceCode);
        // Match on PollResult: Pending → continue, SlowDown → increase interval, etc.
      }
    });

  // ... refreshToken, revokeToken, getMe follow same pattern

  return { initiateDeviceFlow, pollDeviceToken, refreshToken, revokeToken, getMe };
};
```

### Telemetry Client Structure

```typescript
// telemetry/client.ts (makeTelemetryClient updated)

export const makeTelemetryClient = (options: TelemetryClientOptions) => {
  const client = GeneratedTelemetryClient.make(
    options.httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(options.baseUrl))),
  );

  // Mode gating, metadata enrichment, etc. remain here

  const trackEvent = (event: TelemetryEvent) => {
    const enrichedPayload = enrichWithMetadata(event);
    return fireAndForget(client.EventsIngest({ payload: enrichedPayload }));
  };

  const reportError = (error: TelemetryError) => {
    const enrichedPayload = enrichWithMetadata(error);
    return swallowFailure(client.ErrorsIngest({ payload: enrichedPayload }));
  };

  // ...
};
```

### Error Mapping Helpers

```typescript
// registry/error-mapping.ts

// Predicate for matching specific RegistryClientError tags
const isRegistryClientError =
  (tag: string) =>
  (e: unknown): e is RegistryClientError<string, unknown> =>
    Predicate.isTagged(e, tag);

// Network diagnostics (extracted from remote-client.ts)
const buildNetworkHowToFix = (baseUrl: string): string => {
  /* ... */
};
const buildNetworkDiagnosis = (baseUrl: string): ReadonlyArray<string> => {
  /* ... */
};

// Auth error helpers (extracted from remote-client.ts)
const mapAuthUnauthenticated = (e: RegistryClientError<string, unknown>): AppError => {
  /* ... */
};
const mapAuthUnauthorized = (e: RegistryClientError<string, unknown>): AppError => {
  /* ... */
};
```

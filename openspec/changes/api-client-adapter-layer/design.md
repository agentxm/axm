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

One codegen-level limitation requires an adapter workaround:

1. **`ExtensionsDownloadArchive` has no success handler** — Error statuses (400, 404, 500) are properly decoded, but success responses hit `orElse: unexpectedStatus` because the codegen can't express binary (non-JSON) success bodies. The companion `ExtensionsDownloadArchiveStream` operation handles this via streaming instead.

~~2. **`ExtensionsHead` erases status codes**~~ — Fixed upstream in [Effect-TS/effect-smol#1914](https://github.com/Effect-TS/effect-smol/pull/1914) (issue [#1913](https://github.com/Effect-TS/effect-smol/issues/1913)). The generator now routes 4xx/5xx void schemas to the error channel as typed `RegistryClientError<"status", undefined>` values. Already patched locally in `patches/@effect__openapi-generator.patch`.

## Goals / Non-Goals

**Goals:**

- Adapter modules that implement the existing domain interfaces (`RegistryClient`, `TelemetryClientService`) using the generated clients as transport
- Generated client errors (`HttpClientError | SchemaError | RegistryClientError`) mapped to `AppError` with domain-specific codes and user-facing messages
- RFC 9457 problem detail → `AppError` mapping preserved in the registry adapter
- Base URL configuration via `HttpClient.mapRequest` with `prependUrl`
- Auth middleware composition via the `httpClient` parameter (already-wrapped client passed to `make()`)
- Generated schemas/types imported where they replace hand-written duplicates

**Non-Goals:**

- Changing the `RegistryClient`, `TelemetryClientService`, or `AuthClientService` interfaces — consumers are unaffected
- Fixing remaining codegen limitations (archive success handler) — the adapter works around them
- Adapting the local registry client — only the remote client uses HTTP
- Backward compatibility with the hand-written client internals

## Decisions

### 1. Three adapters: registry, auth, telemetry

Each domain service gets its own adapter module:

- **Registry adapter** — implements `RegistryClient` using extension operations from the generated registry client
- **Auth adapter** — implements `AuthClientService` using auth operations from the generated registry client (device flow, token exchange, refresh, revoke, me)
- **Telemetry adapter** — implements `TelemetryClientService` using the generated telemetry client

Registry and auth share the same generated `make()` instance and `HttpClient` (with base URL and auth middleware), but are separate adapters because they serve different domain interfaces with different error semantics.

**Alternatives considered:**

- (a) Two adapters (registry+auth combined, telemetry) — rejected because auth and registry have distinct domain interfaces, error codes, and testing concerns. Combining them would create a large module mixing extension CRUD with OAuth flow logic.
- (b) One unified adapter — rejected because telemetry and registry are completely independent services with different base URLs and error semantics

### 2. Base URL via HttpClient.mapRequest

The generated clients use relative paths (`/v1/...`). Rather than string-concatenating base URLs in the adapter, configure the `HttpClient` with `HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))` before passing to `make()`. This keeps URL logic out of the adapter and composes cleanly with auth middleware.

```
HttpClient (base)
  → auth middleware (injects Bearer, handles 401 refresh)
  → mapRequest(prependUrl(baseUrl))
  → make(httpClient)  // generated client sees relative paths
```

**Alternatives considered:**

- (a) Pass base URL to adapter, concatenate per-call — rejected because it duplicates what `make()` already handles and breaks the generated client's relative path convention
- (b) `transformClient` option on `make()` — rejected because `transformClient` runs per-request (unnecessary overhead) and `mapRequest` is simpler for static URL prepending

### 3. Work around remaining codegen limitations

**Archive download** — `ExtensionsDownloadArchive` has no success handler (success hits `orElse: unexpectedStatus`). The adapter uses `ExtensionsDownloadArchiveStream` instead, which returns `Stream<Uint8Array>` via `HttpClient.filterStatusOk`. The adapter collects the stream into a `Uint8Array` to satisfy the `GetExtensionPackageResponse` interface.

**~~HEAD status erasure~~** — Fixed. After the local patch ([Effect-TS/effect-smol#1914](https://github.com/Effect-TS/effect-smol/pull/1914)), `ExtensionsHead` routes 4xx/5xx to typed errors in the error channel. The adapter uses `Effect.catchIf` to handle 404 as `Option.none()` — no `includeResponse` workaround needed.

### 4. Error mapping strategy

Each adapter has a private `mapToAppError` function that translates generated client errors to `AppError`:

**Registry adapter:**

- `HttpClientError` (network) → `REGISTRY_NETWORK_ERROR` with connection diagnostics (localhost+HTTPS detection)
- `SchemaError` (response decode) → `REGISTRY_RESPONSE_INVALID`
- `RegistryClientError` tags — the generated client now decodes error responses into typed `RegistryClientError` values with tags like `"ExtensionsPublishVersion400"`, `"ExtensionsGet404"`, etc. The adapter pattern-matches on these tags and maps the typed cause (`InvalidRequestError`, `NotFoundError`, `DecodeErrorResponse`) to `AppError` codes. This replaces much of the hand-written RFC 9457 parsing — the generated error schemas (`InvalidRequestError.details.retryAfterSeconds`, `.requiredScope`, `.tokenScopes`, `.requiredRole`) provide structured access to problem detail fields that were previously extracted manually.
- The `mapProblemDetailToAppError` function is simplified: instead of raw JSON inspection, it receives typed error values from the generated client and maps `code` + `status` to `AppError` codes.

**Auth adapter:**

- `HttpClientError` (network) → `AUTH_LOGIN_FAILED` / `AUTH_REFRESH_FAILED` with registry URL context
- `RegistryClientError<"AuthExchangeDeviceCode400">` — the cause is now a typed union of `InvalidRequestError | DecodeErrorResponse`. The adapter checks `cause.code` for OAuth error codes (`authorization_pending`, `slow_down`, `access_denied`, `expired_token`).
- `RegistryClientError<"AuthRefreshToken401">` — typed `RefreshTokenError`, mapped to `AUTH_REFRESH_FAILED`

**Telemetry adapter:**

- All errors swallowed — telemetry is fire-and-forget. The adapter wraps generated operations with the existing `swallowFailure` + `forkDetach` pattern.

### 5. Adapter file placement

Adapters live alongside the domain code they serve, not in a separate `adapters/` directory:

```
telemetry/
  __generated__/telemetry-client.ts   # generated (unchanged)
  client.ts                           # TelemetryClient service + TelemetryClientService interface (unchanged)
  adapter.ts                          # NEW: implements makeTelemetryClient using generated client
registry/
  __generated__/registry-client.ts    # generated (unchanged)
  client.ts                           # RegistryClient interface (unchanged)
  remote-client.ts                    # MODIFIED: reimplemented using adapter
  adapter.ts                          # NEW: implements RegistryClient using generated client
auth/
  auth-client.ts                      # MODIFIED: reimplemented using generated auth operations
  adapter.ts                          # NEW: implements AuthClientService using generated registry client
```

**Alternatives considered:**

- (a) Central `adapters/` directory — rejected because it violates the project's "group by feature" code organization
- (b) Inline in existing client files — rejected because it would make the files too large and mix adapter plumbing with domain logic

### 6. Schema import strategy

Replace hand-written schemas with imports from generated clients where they match:

| Hand-written                                | Generated replacement                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| `DeviceFlowResponseSchema` (auth-client.ts) | `AuthIssueDeviceCode200`                              |
| `DeviceTokenErrorSchema` (auth-client.ts)   | `DeviceTokenOAuthError` / `AuthExchangeDeviceCode400` |
| `RegistryMeResponseSchema` (auth-client.ts) | `AuthGetMe200`                                        |
| Custom token response decoding              | `AuthExchangeDeviceCode200` / `AuthRefreshToken200`   |

Keep hand-written schemas that don't have generated equivalents (e.g., `ExtensionIndexSchema` in `registry/schema.ts` if it serves a different purpose than the generated extension types).

### 7. Registry adapter handles publish error mapping

The existing `mapProblemDetailToAppError` function moves into the registry adapter module, simplified to work with the generated client's typed error schemas. The generated client now decodes error responses into typed `RegistryClientError` values — for publish, these include `InvalidRequestError` with structured `details` (retryable, retryAfterSeconds) and `code` fields. The adapter maps these typed values to `AppError` codes (`REGISTRY_PUBLISH_CONFLICT`, `REGISTRY_PUBLISH_THROTTLED`, etc.) using the `code` field, replacing the raw JSON field extraction in the current implementation.

## Risks / Trade-offs

**Archive download codegen limitation forces workaround** — `ExtensionsDownloadArchive` can't express binary success bodies in `matchStatus`. → Mitigated by using `ExtensionsDownloadArchiveStream`. The workaround is isolated in the adapter and replaceable if the codegen improves. (The HEAD status erasure limitation has been fixed upstream.)

**Schema drift between generated and hand-written** — During migration, some code will import from generated clients while other code still uses hand-written schemas. Type mismatches could surface. → Mitigated by replacing hand-written schemas atomically per domain (all auth schemas at once, all registry schemas at once).

**Generated client regeneration could break adapters** — If `@effect/openapi-generator` changes its output shape or the API specs change, the adapters break. → Mitigated by the adapter being a thin translation layer with tests that verify the mapping. Generated client changes surface as compile errors in the adapter, not in consumers.

~~**`includeResponse: true` couples adapter to generated client internals**~~ — No longer applicable. The HEAD void-collapse fix ([Effect-TS/effect-smol#1914](https://github.com/Effect-TS/effect-smol/pull/1914)) eliminates the need for `includeResponse: true` on `ExtensionsHead`.

## Open Questions

1. **Should the adapter expose the generated client instance for operations not covered by the domain interface?** E.g., `TokensList`, `TokensCreate`, `CollaboratorsUpsertCollaborator` — operations that exist in the generated client but have no domain-level wrapper yet. Exposing them would let new features use the generated client directly without writing adapter methods first.

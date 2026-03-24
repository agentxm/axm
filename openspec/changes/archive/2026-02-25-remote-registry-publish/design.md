## Context

The CLI already has a complete publish pipeline: read manifest → build zip → compute SRI integrity → call `RegistryClient.publishExtension()`. The `RegistryClient` interface and factory dispatch on `https://` URLs, but the `RemoteRegistryClient` is a stub. The backend API (`PUT /v1/extensions/{namespace}/{type}/{name}/{version}`) is live and accepts multipart/form-data uploads with full error handling (RFC 7807).

`@effect/platform`'s `HttpClient` is already wired into the CLI runtime via `FetchHttpClient.layer`. No remote HTTP patterns exist in the codebase yet — this is the first.

## Goals / Non-Goals

**Goals:**

- Implement `publishExtension` on `RemoteRegistryClient` using `@effect/platform` HttpClient
- Map the full backend error surface to `AppError` with actionable guidance
- Handle idempotent republishes (200) and new publishes (201) as success

**Non-Goals:**

- Read-side remote operations (`getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, `extensionExists`) — remain stubs
- Automatic retry logic — surface `retryable` and `retryAfterSeconds` in error messages, let the user retry manually
- Authentication — handled in a separate change
- Streaming/chunked upload — archive sizes are small enough for single-shot upload

## Decisions

### 1. HTTP client: `@effect/platform` HttpClient

Use Effect's built-in `HttpClient` service already provided by `FetchHttpClient.layer` in the CLI runtime.

**Why over raw `fetch`:**

- Already wired as a dependency — no new layers needed
- Typed request/response, testable via service substitution
- Consistent with project convention of using `@effect/platform` for I/O

**Why over `undici` or other libraries:**

- No new dependency needed
- Effect's HttpClient composes naturally with the error channel

### 2. Multipart request construction

Build a `multipart/form-data` request matching the backend's expected shape:

```
PUT /v1/extensions/{namespace}/{type}/{name}/{version}
Content-Type: multipart/form-data

Parts:
  - archive (file): zip bytes, content-type application/zip
  - integrity (field): SRI string (sha512-<base64>)
```

Use `HttpClientRequest.formData` from `@effect/platform` to construct the multipart body. The `FormData` API is available in Bun's runtime.

### 3. No auth in this change

Authentication is out of scope. The remote client sends requests without an `Authorization` header. Auth will be added in a follow-up change. This keeps the HTTP transport and error mapping cleanly separated from token management.

### 4. Error mapping: RFC 7807 → AppError

Parse non-2xx responses as RFC 7807 problem detail JSON and map to `AppError`:

| HTTP Status | Backend Code                         | AppError Code                         | howToFix                                                                                 |
| ----------- | ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| 400         | `malformed_archive`, `empty_archive` | `REGISTRY_PUBLISH_INVALID_ARCHIVE`    | "Check the extension directory and rebuild"                                              |
| 409         | `publish_conflict`                   | `REGISTRY_PUBLISH_CONFLICT`           | "This version already exists with different content. Bump the version in your manifest." |
| 413         | `ingest_*_too_large`                 | `REGISTRY_PUBLISH_TOO_LARGE`          | "Reduce archive size or remove unnecessary files"                                        |
| 415         | `ingest_unsupported_content_type`    | `REGISTRY_PUBLISH_INVALID_ARCHIVE`    | —                                                                                        |
| 422         | `manifest_*`                         | `REGISTRY_PUBLISH_MANIFEST_INVALID`   | "Check your extension manifest"                                                          |
| 422         | `integrity_mismatch`                 | `REGISTRY_PUBLISH_INTEGRITY_MISMATCH` | —                                                                                        |
| 429         | `throttled`                          | `REGISTRY_PUBLISH_THROTTLED`          | "Rate limited. Retry after {n} seconds."                                                 |
| 403         | `quota_exceeded`                     | `REGISTRY_PUBLISH_QUOTA_EXCEEDED`     | "Storage quota exceeded for this extension"                                              |
| 501         | `publish_type_not_implemented`       | `REGISTRY_PUBLISH_TYPE_NOT_SUPPORTED` | —                                                                                        |
| 503         | `publish_disabled`                   | `REGISTRY_PUBLISH_DISABLED`           | "Publishing is temporarily disabled. Try again later."                                   |
| Other       | —                                    | `REGISTRY_PUBLISH_FAILED`             | Include response body in details                                                         |

Always preserve the backend's `detail` field and `requestId` in the AppError's `details` array for debugging.

### 5. Factory signature change

`createRemoteRegistryClient` currently takes no arguments. It needs the base URL to construct request URLs.

```typescript
// Before
createRemoteRegistryClient(): RegistryClient

// After
createRemoteRegistryClient(baseUrl: string): RegistryClient
```

The factory in `client.ts` already has `location` — pass it through. The `publishExtension` method builds the full URL: `{baseUrl}/v1/extensions/{namespace}/{type}/{name}/{version}`.

The remote client's `publishExtension` requires `HttpClient.HttpClient` from the Effect context. This means the `RegistryClient.publishExtension` return type gains an `R` requirement. Since the interface currently returns `Effect<T, AppError>` (no `R`), the remote client must access HttpClient by closing over it — accept it as a construction parameter.

```typescript
createRemoteRegistryClient(baseUrl: string, httpClient: HttpClient.HttpClient): RegistryClient
```

The factory already runs in an Effect context where HttpClient is available, so it can `yield*` the service and pass it in.

### 6. Success response handling

- **201 Created**: First publish — return `{ published: true }`
- **200 OK**: Idempotent replay (same version + same integrity) — return `{ published: true }`

Both are success from the CLI's perspective. The backend's `publish_status` field (`"created"` vs `"idempotent"`) is informational — the CLI doesn't need to distinguish.

## Risks / Trade-offs

**[FormData API availability]** → `FormData` and `Blob` are available in Bun's runtime. If the CLI ever needs to run on older Node.js (<18), this would break. Mitigation: Bun is the required runtime per CLAUDE.md.

**[No automatic retry]** → Users must manually retry on 429/503. Mitigation: Error messages include retry-after timing. Automatic retry can be added later without interface changes.

**[No auth]** → Requests are unauthenticated. The backend may reject with 401/403 until auth is added. Mitigation: Auth is a planned follow-up change. The error mapping handles unexpected status codes gracefully.

**[HttpClient as constructor arg]** → Slightly unusual to pass a service as a constructor parameter rather than accessing it from context. Mitigation: Keeps the `RegistryClient` interface clean (`Effect<T, AppError>` with no `R`), and the factory is the only call site.

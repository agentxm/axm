## Why

The codebase has OpenAPI-generated HTTP clients for registry and telemetry (via `@effect/openapi-generator`) that are completely unused. Instead, three hand-written clients (`telemetry/client.ts`, `registry/remote-client.ts`, `auth/auth-client.ts`) duplicate the same HTTP transport with manually constructed requests, hand-rolled schemas, and bespoke response parsing. This means API changes require updating both the generated code and the hand-written code, schemas drift apart, and the generated clients' typed operations and validation go to waste.

An adapter layer between the generated clients and the domain services would let us adopt the generated clients without coupling domain logic to their error types or interface shape.

## What Changes

- Introduce adapter modules that translate generated client operations into the domain interfaces the codebase already uses (`TelemetryClientService`, `RegistryClient`, `AuthClientService`)
- Adapters map `HttpClientError | SchemaError` from generated clients to `AppError` with domain-specific codes and `howToFix` messages
- Adapters handle base URL configuration, passing a pre-configured `HttpClient` (with base URL and auth middleware) to the generated `make()` factory
- Replace raw `httpClient.execute()` calls in hand-written clients with calls through the generated client operations via the adapter
- Import generated schemas/types (branded IDs, request/response types) instead of maintaining hand-written duplicates
- Remove hand-written request construction, response parsing, and duplicate schema definitions that the generated clients now cover

## Capabilities

### New Capabilities

- `api-client-adapters`: Adapter layer translating generated OpenAPI clients (registry, telemetry) into domain service interfaces with AppError mapping, base URL configuration, and Option semantics for not-found responses

### Modified Capabilities

- `core-registry`: Remote registry client switches from hand-written HTTP calls to adapter-backed generated client operations. RFC 7807 error mapping moves into the adapter. `RegistryClient` interface unchanged.
- `cli-telemetry`: Telemetry client switches from hand-written HTTP calls to adapter-backed generated client operations. Fire-and-forget and mode-switching behavior unchanged.
- `core-auth`: Auth client switches from hand-written HTTP calls to adapter-backed generated client operations. Device flow polling, token normalization, and form-encoded body handling move into or are preserved by the adapter.

## Impact

- **Packages affected**: `@axm.sh/core` (adapters, telemetry client, registry remote client, auth client)
- **No public API changes**: `TelemetryClientService`, `RegistryClient`, `AuthClientService` interfaces remain identical — consumers are unaffected
- **Schema consolidation**: Hand-written `DeviceFlowResponseSchema`, `RegistryMeResponseSchema`, `DeviceTokenErrorSchema`, `ExtensionIndexSchema` etc. replaced by imports from generated clients
- **Test impact**: Existing tests against domain service interfaces remain valid. New adapter-level tests verify error mapping and Option semantics. Hand-written client tests that assert raw HTTP construction may need updating.
- **Dependencies**: No new dependencies — `@effect/openapi-generator` is already a devDependency for codegen

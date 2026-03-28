> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. AuthClientService Interface Change

> **Subagent:** Run this entire phase in a single subagent.

Update the `AuthClientService` interface to remove per-call `registryUrl` and update all callers. This is a prerequisite for the auth client rewrite (Phase 4).

- [ ] 1.1 Update `AuthClientService` interface in `auth/auth-client.ts` — remove `registryUrl` from all five method signatures (`initiateDeviceFlow`, `pollDeviceToken`, `refreshToken`, `revokeToken`, `getMe`)
- [ ] 1.2 Update the hand-written `AuthClientLive` implementation in `auth/auth-client.ts` — accept `registryUrl` at construction time, remove it from each method's parameters
- [ ] 1.3 Find and update all callers of `AuthClientService` methods to omit the `registryUrl` argument (auth commands, login interaction, auth middleware, credential resolution, etc.)
- [ ] 1.4 Update `AuthClient` layer construction sites to provide `registryUrl` at layer build time
- [ ] 1.5 Update existing auth-client tests to reflect the new interface (no `registryUrl` per-call)
- [ ] 1.6 Run `pnpm typecheck` — fix any errors
- [ ] 1.7 Run `pnpm lint` — fix any errors
- [ ] 1.8 Run `pnpm test` — fix any failures
- [ ] 1.9 Run `pnpm test:e2e` — fix any failures
- [ ] 1.10 Kill any vitest worker processes

## 2. Remote Registry Client + Error Mapping Helpers

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (independent of Phase 1). Rewrite the remote registry client to use the generated registry client, and extract shared error mapping helpers reused by the auth client.

- [ ] 2.1 Extract shared error mapping helpers from `registry/remote-client.ts` into `registry/error-mapping.ts`: `buildNetworkHowToFix`, `buildNetworkDiagnosis`, `isLoopbackAddress`, `mapAuthUnauthenticated`, `mapAuthUnauthorized`, and the `isRegistryClientError` tag predicate
- [ ] 2.2 Write tests for `registry/remote-client.ts` — cover each of the 6 `RegistryClient` methods: success paths, 404→Option.none/exists:false, auth error mapping (401→AUTH_UNAUTHENTICATED, 403→AUTH_UNAUTHORIZED), network error codes per-operation, schema decode errors, and the full publish error mapping table (conflict, invalid archive, too large, integrity mismatch, manifest invalid, throttled, quota exceeded, type not supported, publishing disabled, fallback)
- [ ] 2.3 Rewrite `createRemoteRegistryClient` in `registry/remote-client.ts` — `getExtensionIndex` (ExtensionsGet, 404→Option.none), `getExtensionsByScope` (ExtensionsListByProfile + ExtensionsListByType fan-out with merge/filter/pagination), `profileExists` (ExtensionsListByProfile, 404→exists:false, 200→check length), `getExtensionPackage` (ExtensionsGet + ExtensionsDownloadArchive two-step), `extensionExists` (ExtensionsHead, 200→true, 404→false), `publishExtension` (ExtensionsPublishVersion with full typed RFC 9457 error mapping)
- [ ] 2.4 Run `pnpm typecheck` on the rewritten client — fix any errors
- [ ] 2.5 Run tests — iterate until green
- [ ] 2.6 Update `createRegistryClient` factory in `registry/client.ts` to use the rewritten `createRemoteRegistryClient`
- [ ] 2.7 Remove old hand-written HTTP code from `registry/remote-client.ts` (any remaining helpers that were replaced by generated client calls)
- [ ] 2.8 Run `pnpm typecheck` — fix any errors
- [ ] 2.9 Run `pnpm lint` — fix any errors
- [ ] 2.10 Run `pnpm test` — fix any failures
- [ ] 2.11 Run `pnpm test:e2e` — fix any failures
- [ ] 2.12 Kill any vitest worker processes

## 3. Telemetry Client

> **Subagent:** Run this entire phase in a single subagent.

Depends on: none (independent of Phases 1 and 2). Can run in parallel with Phase 2.

> **Parallelization:** Phases 2 and 3 are independent — launch as parallel subagents.

- [ ] 3.1 Write tests for telemetry generated client integration in `telemetry/client.ts` — cover `ingestEvents` delegates to generated `EventsIngest`, `ingestErrors` delegates to generated `ErrorsIngest`, all errors silently discarded (HttpClientError, SchemaError, TelemetryClientError)
- [ ] 3.2 Update `makeTelemetryClient` in `telemetry/client.ts` to use the generated telemetry client for HTTP transport instead of direct `httpClient.execute()` calls — thin transport layer with `ingestEvents` (fireAndForget wrapping) and `ingestErrors` (swallowFailure wrapping). Preserve mode gating, metadata enrichment, and fire-and-forget wrapping in `makeTelemetryClient`.
- [ ] 3.3 Run `pnpm typecheck` — fix any errors
- [ ] 3.4 Run tests — iterate until green
- [ ] 3.5 Update existing telemetry client tests to reflect generated client transport
- [ ] 3.6 Run `pnpm typecheck` — fix any errors
- [ ] 3.7 Run `pnpm lint` — fix any errors
- [ ] 3.8 Run `pnpm test` — fix any failures
- [ ] 3.9 Run `pnpm test:e2e` — fix any failures
- [ ] 3.10 Kill any vitest worker processes

## 4. Auth Client

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (interface change) and Phase 2 (shared helpers in `registry/error-mapping.ts`).

- [ ] 4.1 Write tests for auth generated client integration in `auth/auth-client.ts` — cover `initiateDeviceFlow` (success, network error→AUTH_LOGIN_FAILED), `pollDeviceToken` (success, authorization_pending→continue, slow_down→increase interval, access_denied→AUTH_LOGIN_CANCELLED, expired_token→AUTH_LOGIN_FAILED), `refreshToken` (success, error→AUTH_REFRESH_FAILED), `revokeToken` (success, errors swallowed), `getMe` (success with MeResponse transform, 401→AUTH_UNAUTHENTICATED, 500+→AUTH_SERVER_ERROR)
- [ ] 4.2 Update `AuthClientLive` in `auth/auth-client.ts` to use generated registry client auth operations — all five AuthClientService methods. Include RFC 8628 polling loop with backoff for `pollDeviceToken`. Import shared helpers from `registry/error-mapping.ts`.
- [ ] 4.3 Run `pnpm typecheck` — fix any errors
- [ ] 4.4 Run tests — iterate until green
- [ ] 4.5 Update existing auth-client tests to reflect generated client integration
- [ ] 4.6 Run `pnpm typecheck` — fix any errors
- [ ] 4.7 Run `pnpm lint` — fix any errors
- [ ] 4.8 Run `pnpm test` — fix any failures
- [ ] 4.9 Run `pnpm test:e2e` — fix any failures
- [ ] 4.10 Kill any vitest worker processes

## 5. Schema Consolidation + Cleanup

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3, and 4 (all generated client integrations wired in).

- [ ] 5.1 Remove hand-written `DeviceFlowResponseSchema` from `auth/auth-client.ts` — replaced by generated `AuthIssueDeviceCode200`
- [ ] 5.2 Remove hand-written `DeviceTokenErrorSchema` from `auth/auth-client.ts` — replaced by generated `AuthExchangeDeviceCode400` typed error
- [ ] 5.3 Remove hand-written `RegistryMeResponseSchema` from `auth/auth-client.ts` — replaced by generated `AuthGetMe200`
- [ ] 5.4 Remove hand-written token response decoding in `auth/auth-client.ts` where replaced by generated `AuthExchangeDeviceCode200` / `AuthRefreshToken200`
- [ ] 5.5 Verify old hand-written helpers that were replaced are fully removed from `registry/remote-client.ts` — ensure `mapProblemDetailToAppError` and other helpers that moved to `registry/error-mapping.ts` are not re-exported from barrel files
- [ ] 5.6 Verify `registry/index.ts`, `auth/index.ts`, and `telemetry/index.ts` barrel exports are clean — no dangling re-exports of removed modules
- [ ] 5.7 Run `pnpm typecheck` — fix any errors
- [ ] 5.8 Run `pnpm lint` — fix any errors
- [ ] 5.9 Run `pnpm test` — fix any failures
- [ ] 5.10 Run `pnpm test:e2e` — fix any failures
- [ ] 5.11 Kill any vitest worker processes

## 6. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: all previous phases.

- [ ] 6.1 Run `pnpm build` — verify clean build across all packages
- [ ] 6.2 Run `pnpm typecheck` — verify zero type errors
- [ ] 6.3 Run `pnpm lint` — verify zero lint errors
- [ ] 6.4 Run `pnpm test` — verify all tests pass
- [ ] 6.5 Run `pnpm test:e2e` — verify all E2E tests pass
- [ ] 6.6 Verify `HttpClientRequest.post`, `HttpClientRequest.put`, `HttpClientRequest.get` only appear in `__generated__/` files (grep across all client files — `remote-client.ts`, `auth-client.ts`, `client.ts` should use generated client operations, not raw HTTP construction)
- [ ] 6.8 Kill any vitest worker processes

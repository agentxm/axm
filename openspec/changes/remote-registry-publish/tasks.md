> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. RFC 7807 Error Mapping

> **Subagent:** Run this entire phase in a single subagent.

Implement the problem detail parser and error mapping function before the client, so the client can consume it.

- [ ] 1.1 Write tests for a `mapProblemDetailToCliError` function that parses RFC 7807 JSON and returns the appropriate `CliError` for each backend error code (409 conflict, 400 invalid archive, 413 too large, 422 manifest/integrity, 429 throttled with retry-after, 403 quota, 501 not implemented, 503 disabled, unexpected status, non-JSON body). Cover `details` array preservation of `detail` and `requestId` fields.
- [ ] 1.2 Implement `mapProblemDetailToCliError` in `packages/cli/src/registry/client-remote.ts` (or a co-located helper). Map each status/code combination per the design's error mapping table.
- [ ] 1.3 Run `pnpm typecheck`, fix any errors
- [ ] 1.4 Run `pnpm lint`, fix any errors
- [ ] 1.5 Run `pnpm test`, fix any failures
- [ ] 1.6 Kill any vitest worker processes

## 2. Remote Client Implementation

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Write tests for `createRemoteRegistryClient` — test that `publishExtension` builds the correct PUT URL (`{baseUrl}/v1/extensions/{namespace}/{type}/{name}/{version}`), sends multipart/form-data with `archive` file part and `integrity` text field, and returns `{ published: true }` on 200 and 201. Use a mock/stub HttpClient.
- [ ] 2.2 Write tests for network error handling — connection failures map to `REGISTRY_PUBLISH_NETWORK_ERROR` with `cause` preserved.
- [ ] 2.3 Write tests that read-side methods (`getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, `extensionExists`) still fail with "remote registry not yet supported".
- [ ] 2.4 Implement `createRemoteRegistryClient(baseUrl: string, httpClient: HttpClient.HttpClient): RegistryClient` — replace the stub `publishExtension` with the real multipart PUT request using `@effect/platform` HttpClient. Keep other methods as stubs.
- [ ] 2.5 Run `pnpm typecheck`, fix any errors
- [ ] 2.6 Run `pnpm lint`, fix any errors
- [ ] 2.7 Run `pnpm test`, fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Factory Update

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [ ] 3.1 Write tests for the updated `createRegistryClient` factory — verify that `https://` locations yield the HttpClient service and pass it with the base URL to `createRemoteRegistryClient`. Verify local paths still create `LocalRegistryClient`.
- [ ] 3.2 Update `createRegistryClient` in `packages/cli/src/registry/client.ts` to `yield* HttpClient.HttpClient` and pass both `location` and the client instance to `createRemoteRegistryClient(location, httpClient)`.
- [ ] 3.3 Run `pnpm typecheck`, fix any errors
- [ ] 3.4 Run `pnpm lint`, fix any errors
- [ ] 3.5 Run `pnpm test`, fix any failures
- [ ] 3.6 Run `pnpm test:e2e`, fix any failures
- [ ] 3.7 Kill any vitest worker processes

## 4. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

- [ ] 4.1 Run `pnpm typecheck` across all packages
- [ ] 4.2 Run `pnpm lint` across all packages
- [ ] 4.3 Run `pnpm test` across all packages
- [ ] 4.4 Run `pnpm test:e2e` across all packages
- [ ] 4.5 Kill any vitest worker processes

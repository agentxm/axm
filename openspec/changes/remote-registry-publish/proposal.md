## Why

The remote registry publish endpoint (`PUT /v1/extensions/{namespace}/{type}/{name}/{version}`) is now live in `agentxm-internal`. The CLI's `RemoteRegistryClient` is a stub that rejects all operations with "remote registry not yet supported." Users cannot publish skills, packs, or commands to hosted registries — only local file-based registries work. Implementing the remote client unlocks the primary distribution workflow.

## What Changes

- Implement `publishExtension` on `RemoteRegistryClient` to upload archives via multipart/form-data to `PUT /v1/extensions/{namespace}/{type}/{name}/{version}`
- All other remote client methods (`getExtensionsByScope`, `getExtensionPackage`, `namespaceExists`, `extensionExists`) remain stubs
- Handle the full error surface: 400 validation, 409 conflicts, 413 size limits, 429 throttling (with retry-after), 403 quota, 503 disabled
- Map RFC 7807 problem detail responses to `CliError` with actionable `howToFix` guidance
- Support SRI integrity assertion via the `integrity` field in the multipart request

## Capabilities

### New Capabilities

- `remote-registry-publish`: HTTPS client implementation for publishing extensions to remote registries, including multipart upload, integrity assertion, error mapping, and retry-after handling

### Modified Capabilities

- `registry-client`: Replace the `RemoteRegistryClient` stub's `publishExtension` with a real implementation. All other methods remain stubs — read-side remote operations are out of scope.

## Impact

- **Code**: `packages/cli/src/registry/client-remote.ts` — `publishExtension` implemented, other methods stay as stubs
- **Code**: `packages/cli/src/registry/client.ts` — factory passes base URL and HttpClient to remote client
- **Dependencies**: Uses `@effect/platform` HttpClient (already in runtime)
- **Testing**: New unit tests for remote client, integration tests against mock server

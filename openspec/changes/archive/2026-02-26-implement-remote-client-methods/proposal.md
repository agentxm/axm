## Why

The remote registry backend now exposes read endpoints, but `RemoteRegistryClient` still has partial/stubbed behavior for key read operations. This blocks full remote source resolution and forces inconsistent fallback behavior versus local registries.

## What Changes

- Implement `RemoteRegistryClient.namespaceExists` against the remote namespace endpoint instead of returning a not-implemented error.
- Implement `RemoteRegistryClient.getExtensionPackage` to fetch extension archives from the remote package endpoint, including latest-version resolution when version is omitted.
- Complete `RemoteRegistryClient.getExtensionsByScope` list mode (`names: []`) using remote listing/search endpoints so namespace scans work without caller-provided names.
- Align remote read error mapping with existing CLI error conventions (`AppError` codes, request context, actionable `howToFix`) for transport failures, not found cases, and invalid upstream responses.
- Add/expand tests to lock in behavior parity between local and remote registry clients for discovery, existence checks, and package retrieval.

## Capabilities

### New Capabilities

- `remote-registry-read`: Remote registry read operations for namespace existence, extension listing/discovery, and package download through the `RegistryClient` interface.

### Modified Capabilities

- `registry-client`: Update requirements so `RemoteRegistryClient` no longer declares read methods as unsupported and instead defines concrete behavior for `namespaceExists`, `getExtensionsByScope` list mode, and `getExtensionPackage`.

## Impact

- `packages/cli/src/registry/client-remote.ts` will add concrete remote implementations for all remaining read methods and endpoint/response decoding.
- `packages/cli/src/registry/client-remote.test.ts` and `packages/cli/src/registry/client.test.ts` will add regression coverage for new remote read behavior and error handling.
- `packages/cli/src/sources/providers/registry/host-provider.ts` may need small alignment updates where remote read semantics are consumed.
- OpenSpec updates include one new capability spec (`openspec/specs/remote-registry-read/spec.md`) and a delta for `openspec/specs/registry-client/spec.md`.

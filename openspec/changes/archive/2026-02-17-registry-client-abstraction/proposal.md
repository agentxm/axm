## Why

`RegistrySourceProvider` conflates two distinct concerns: low-level registry client operations (reading/writing extension archives, checking scope existence) and the `SourceHostProvider` pattern (find/fetch for extension discovery). This makes it difficult to use registry operations independently of the source provider dispatch, and the single interface carries methods that don't belong together.

## What Changes

- **BREAKING**: Remove `RegistrySourceProvider` interface and its `LocalRegistrySourceProvider`/`RemoteRegistrySourceProvider` implementations
- Introduce `RegistryClient` abstraction with registry-specific operations: `getExtensions`, `namespaceExists`, `getExtension`, `publishExtension`, `extensionExists`, `fetchIndex`
- Implement `LocalRegistryClient` (backed by filesystem) and `RemoteRegistryClient` (stubbed placeholder)
- Introduce `LocalRegistrySourceHostProvider` and `RemoteRegistrySourceHostProvider` that implement the same `SourceHostProvider` interface as other host providers, each delegating to their respective `RegistryClient`
- `RemoteRegistrySourceHostProvider` and `RemoteRegistryClient` are placeholders with not-implemented errors
- The registry meta-provider continues to orchestrate across configured registry sources, but now creates `Local/RemoteRegistrySourceHostProvider` instances instead of `RegistrySourceProvider` instances

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `registry-client`: Refactor from `RegistrySourceProvider` (which conflated client and host-provider operations) to a focused `RegistryClient` interface with `getExtensions`, `namespaceExists`, `getExtension`, `publishExtension`, `extensionExists`, and `fetchIndex`. Two implementations: `LocalRegistryClient` (filesystem-backed) and `RemoteRegistryClient` (stub). Uses registry-domain types instead of source-domain types.
- `source-provider`: Registry source host providers change from a single `RegistrySourceProvider` wrapping pattern to distinct `LocalRegistrySourceHostProvider` and `RemoteRegistrySourceHostProvider` implementations that follow the standard `SourceHostProvider` interface and delegate to `RegistryClient`.

## Impact

- `packages/cli/src/sources/providers/registry.ts` — major rewrite: split into client and host provider modules
- `packages/cli/src/sources/service.ts` — registry meta-provider updated to create new provider types
- `packages/cli/src/sources/provider.ts` — no interface changes (existing `SourceHostProvider` and `PublishableSourceHostProvider` are preserved)
- Consumers of `publishExtension` (publish command) route through the new `RegistryClient` or `PublishableSourceHostProvider`

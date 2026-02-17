## ADDED Requirements

### Requirement: LocalRegistrySourceHostProvider

The system SHALL implement `LocalRegistrySourceHostProvider` as a `PublishableSourceHostProvider` that delegates to a `LocalRegistryClient`. It maps between source-domain types and registry-domain types at the boundary.

#### Scenario: find maps FindOptions to RegistrySearchOptions

- **WHEN** `find(source, options)` is called with `FindOptions`
- **THEN** the provider maps `FindOptions` to `RegistrySearchOptions`, calls `client.getExtensions(searchOptions)`, and maps each `RegistryExtensionEntry` to a `SourceExtensionRef` stamped with the `source` and `RegistryRefDetails`

#### Scenario: fetch extracts scope from ref and delegates to client

- **WHEN** `fetch(source, ref)` is called with a registry-sourced ref
- **THEN** the provider extracts `scope`, `type`, `name`, `version` from the ref's `RegistryRefDetails`, calls `client.getExtension(scope, type, name, version)` to get archive bytes, verifies the SHA-256 checksum, and extracts the zip archive to a temporary directory

#### Scenario: publishExtension delegates to client

- **WHEN** `publishExtension(scope, type, name, version, archive, metadata)` is called
- **THEN** the provider delegates directly to `client.publishExtension(...)` with the same arguments

### Requirement: RemoteRegistrySourceHostProvider stub

The system SHALL implement `RemoteRegistrySourceHostProvider` as a `PublishableSourceHostProvider` that delegates to a `RemoteRegistryClient`. All operations fail with not-implemented errors (propagated from the client).

#### Scenario: Any operation on remote host provider

- **WHEN** `find`, `fetch`, or `publishExtension` is called on `RemoteRegistrySourceHostProvider`
- **THEN** it fails with `CliError` containing "remote registry not yet supported" (from the underlying `RemoteRegistryClient`)

### Requirement: Registry host provider factory

A factory function `createRegistrySourceHostProvider` SHALL create the appropriate host provider based on the `RegistrySourceHost` configuration. It creates the matching `RegistryClient` internally and wraps it in the corresponding host provider.

#### Scenario: Local registry creates LocalRegistrySourceHostProvider

- **WHEN** `createRegistrySourceHostProvider(host)` is called with a `file://` or local path location
- **THEN** a `LocalRegistrySourceHostProvider` backed by a `LocalRegistryClient` is created

#### Scenario: Remote registry creates RemoteRegistrySourceHostProvider

- **WHEN** `createRegistrySourceHostProvider(host)` is called with an `https://` location
- **THEN** a `RemoteRegistrySourceHostProvider` backed by a `RemoteRegistryClient` is created

## MODIFIED Requirements

### Requirement: Registry meta-provider wraps multiple registries

The provider registry SHALL contain a single `registry` entry backed by a meta-provider that wraps N configured registry sources. The meta-provider reads `workspace.getRegistrySources()` lazily on each call. The meta-provider SHALL create `LocalRegistrySourceHostProvider` or `RemoteRegistrySourceHostProvider` instances (via `createRegistrySourceHostProvider`) instead of `RegistrySourceProvider` instances.

#### Scenario: Lazy config reads

- **WHEN** a registry source is added to settings mid-handler (e.g., by the registry guard)
- **THEN** subsequent `find`/`fetch` calls on the meta-provider see the new source

#### Scenario: Meta-provider applies scope routing

- **WHEN** `find` is called for `@corp/tool`
- **THEN** the meta-provider iterates scope-matched registries first, then catch-all, per Decision 6

#### Scenario: Meta-provider creates host providers per registry

- **WHEN** the meta-provider iterates configured registry sources
- **THEN** it calls `createRegistrySourceHostProvider(host)` for each source and delegates `find`/`fetch` to the resulting host provider

### Requirement: SourceProviders Effect service

The system SHALL expose a `SourceProviders` service backed by one provider per source type. Handlers consume it via `yield* SourceProviders`. The service SHALL expose `resolveExtension` (renamed from `resolve`) and `fetch` methods.

`resolveExtension` SHALL accept a `Source` (not `SourceInput`). The `Source` type carries both parsed coordinates and provider config, giving providers access to config fields like base URLs.

The dispatch table SHALL use `source.source` to select the correct provider, which continues to work because `Source` extends `SourceInput`.

#### Scenario: resolveExtension dispatches to correct provider

- **WHEN** `sources.resolveExtension(source, options)` is called with `source.source === "github"`
- **THEN** the `GitHubSourceProvider.find` implementation is invoked

#### Scenario: resolveExtension passes Source to provider

- **WHEN** `sources.resolveExtension(source, options)` is called with a `GitHubSource`
- **THEN** the GitHub provider receives the full `Source` including config fields (`url`, `name`)

#### Scenario: Fetch dispatches by ref source

- **WHEN** `sources.fetch(ref)` is called where `ref.source.source === "registry"`
- **THEN** the registry host provider's `fetch` implementation is invoked

#### Scenario: Service constructed once at edge

- **WHEN** the CLI runtime is composed
- **THEN** `SourceProviders` is provided via a layer depending on `FileSystem`, `Path`, and `Workspace`

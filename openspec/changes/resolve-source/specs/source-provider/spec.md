## RENAMED Requirements

### Requirement: SourceProviders Effect service

- **FROM:** `resolve`
- **TO:** `resolveExtension`

## MODIFIED Requirements

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
- **THEN** the `RegistrySourceProvider.fetch` implementation is invoked

#### Scenario: Service constructed once at edge

- **WHEN** the CLI runtime is composed
- **THEN** `SourceProviders` is provided via a layer depending on `FileSystem`, `Path`, and `Workspace`

### Requirement: SourceProvider interface

The system SHALL provide a `SourceProvider` interface with `find` and `fetch` operations that all source types implement:

```
find(source, options) → Effect<ReadonlyArray<ExtensionRef>, SourceError, R>
fetch(source, extension) → Effect<ExtensionFiles, SourceError, R>
```

The `source` parameter to `find` SHALL be the specific `Source` variant (e.g., `GitHubSource`), not `SourceInput`. Providers MAY use config fields from the `Source` type (e.g., `source.url` for constructing clone URLs).

#### Scenario: Provider has type discriminator

- **WHEN** a `SourceProvider` is created for GitHub
- **THEN** its `type` field is `"github"`

#### Scenario: Find receives Source with config fields

- **WHEN** `GitHubSourceProvider.find(source, options)` is called
- **THEN** `source` includes `url` and `name` from the matched config

#### Scenario: Fetch returns extension files

- **WHEN** `provider.fetch(source, ref)` is called with a valid ref
- **THEN** it returns `ExtensionFiles` with a `directory` path to materialized files

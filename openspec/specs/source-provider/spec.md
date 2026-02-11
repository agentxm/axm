# source-provider Specification

## Purpose

Defines the SourceProvider interface and SourceProviders service for unified extension discovery and fetching across all source types.

## Requirements

### Requirement: SourceInput type replaces Source

The `Source` type SHALL be renamed to `SourceInput` to clarify it is pre-resolution input. `parseSource` SHALL be renamed to `parseSourceInput`. The 7-variant discriminated union is retained; the registry variant is simplified to carry no location fields.

#### Scenario: Registry variant carries no location

- **WHEN** `parseSourceInput("@acme/code-review")` is called
- **THEN** the result has `source: "registry"` with no `url` or `path` fields (location comes from SourceConfig)

#### Scenario: Other variants unchanged

- **WHEN** `parseSourceInput("github:owner/repo")` is called
- **THEN** the result has `source: "github"` with the same shape as the current `GitHubSource`

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

### Requirement: FindOptions separates search criteria from source identity

`FindOptions` SHALL describe what to search for, independent of source:

- `names`: extension names to match (empty = all)
- `agents`: agent compatibility filter (empty = all)
- `type`: `"skill" | "mcp-server" | "*"`

#### Scenario: Empty names returns all

- **WHEN** `find` is called with `names: []`
- **THEN** all extensions at the source are returned

#### Scenario: Agent filter restricts results

- **WHEN** `find` is called with `agents: ["claude-code"]`
- **THEN** only extensions compatible with `claude-code` are returned

### Requirement: ExtensionRef carries source and version metadata

`ExtensionRef` SHALL be a discriminated union (`SkillRef | McpServerRef`) carrying `source`, `location`, and `version`:

- `source`: the `SourceInput` that was searched
- `location`: URL where extension files are materialized (`file://` for local/git/registry, `https://` for future remote)
- `version`: `Some` for registry sources (resolved semver), `None` for git/local

#### Scenario: Git-sourced ref has no version

- **WHEN** `find` returns a ref from a GitHub source
- **THEN** `version` is `None` and `location` is a `file://` URL to the temp clone directory

#### Scenario: Registry-sourced ref has resolved version

- **WHEN** `find` returns a ref from a registry source
- **THEN** `version` is `Some("1.2.3")` with the resolved semver version

#### Scenario: Location is always populated after find

- **WHEN** `find` returns any ref
- **THEN** `location` is populated (providers materialize files before returning refs)

### Requirement: ExtensionFiles result

`fetch` SHALL return `ExtensionFiles` containing the absolute path to the directory with materialized extension files.

#### Scenario: Git source fetch returns clone path

- **WHEN** `fetch` is called for a git-sourced ref
- **THEN** `directory` points to the temp clone directory

#### Scenario: Registry source fetch extracts and verifies

- **WHEN** `fetch` is called for a registry-sourced ref
- **THEN** the archive is read, SHA-256 checksum verified, and `directory` points to the extraction path

### Requirement: SourceError for provider failures

All provider operations SHALL fail with `SourceError` (tagged error with `message` and `cause`). Existing `DiscoveryError` and `CloneUrlError` are subsumed by `SourceError`.

#### Scenario: Find failure

- **WHEN** a provider's `find` operation fails (e.g., network error, missing repo)
- **THEN** it fails with `SourceError` containing a descriptive message and the original cause

#### Scenario: Fetch failure

- **WHEN** a provider's `fetch` operation fails (e.g., checksum mismatch)
- **THEN** it fails with `SourceError`

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

### Requirement: Registry meta-provider wraps multiple registries

The provider registry SHALL contain a single `registry` entry backed by a meta-provider that wraps N configured registry sources. The meta-provider reads `workspace.getRegistrySources()` lazily on each call.

#### Scenario: Lazy config reads

- **WHEN** a registry source is added to settings mid-handler (e.g., by the registry guard)
- **THEN** subsequent `find`/`fetch` calls on the meta-provider see the new source

#### Scenario: Meta-provider applies scope routing

- **WHEN** `find` is called for `@corp/tool`
- **THEN** the meta-provider iterates scope-matched registries first, then catch-all, per Decision 6

### Requirement: Existing source types migrated to provider model

All existing source types (github, gitlab, bitbucket, azurerepos, git, local) SHALL be implemented as `SourceProvider` instances.

#### Scenario: GitHub provider implements find and fetch

- **WHEN** `GitHubSourceProvider.find` is called
- **THEN** it performs shallow clone, scans for SKILL.md, and returns `ExtensionRef[]`

#### Scenario: Local provider scans filesystem directly

- **WHEN** `LocalSourceProvider.find` is called
- **THEN** it scans the local directory using existing `discoverSkillsInDir` logic

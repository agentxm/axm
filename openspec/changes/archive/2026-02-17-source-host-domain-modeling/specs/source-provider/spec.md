## MODIFIED Requirements

### Requirement: SourceProvider interface

The `SourceProvider` interface SHALL be renamed to `SourceHostProvider`. It SHALL have `match`, `find`, and `fetch` operations. The `source` parameter to `find` SHALL be the specific `Source` variant (the flat intersection of `SourceHost & SourceParams`). The error type SHALL be `AppError` (replacing `SourceError`).

```
match(url: URL) → Effect<boolean, AppError, R>
find(source: S, options: FindOptions) → Effect<ReadonlyArray<SourceExtensionRef>, AppError, R>
fetch(source: S, ref: SourceExtensionRef) → Effect<ExtensionFiles, AppError, R>
```

The `SourceHostProvider` SHALL be parameterized on `S extends Source` to constrain the source variant the provider handles.

#### Scenario: Provider has type discriminator

- **WHEN** a `SourceHostProvider` is created for GitHub
- **THEN** its `type` field is `"github"`

#### Scenario: Find receives Source with host and params fields

- **WHEN** `GitHubSourceHostProvider.find(source, options)` is called
- **THEN** `source` includes both host fields (`url`) and params fields (`owner`, `repo`) from the flat intersection

#### Scenario: Fetch returns extension files

- **WHEN** `provider.fetch(source, ref)` is called with a valid ref
- **THEN** it returns `ExtensionFiles` with a `directory` path to materialized files

#### Scenario: Match checks URL ownership

- **WHEN** `provider.match(url)` is called with a URL
- **THEN** it returns `true` if the URL belongs to this provider, `false` otherwise

### Requirement: FindOptions separates search criteria from source identity

`FindOptions` SHALL describe what to search for, independent of source:

- `names`: extension names to match (empty = all)
- `agents`: agent compatibility filter (empty = all)
- `type`: `FindableExtensionType | "*"` (replacing the previous `"skill" | "mcp-server" | "*"`)

#### Scenario: Empty names returns all

- **WHEN** `find` is called with `names: []`
- **THEN** all extensions at the source are returned

#### Scenario: Agent filter restricts results

- **WHEN** `find` is called with `agents: ["claude-code"]`
- **THEN** only extensions compatible with `claude-code` are returned

### Requirement: ExtensionRef carries source and version metadata

`ExtensionRef` SHALL be replaced by `SourceExtensionRef` — a two-dimensional discriminated union (extension type x source type). Each ref variant carries a full `Source` object (not a `SourceType` string) and source-specific ref details.

- Git-hosted refs carry `location` (file:// URL) and `gitTreeSha: Option<string>`
- Registry refs carry `version: string` and `checksum: string`
- Local refs carry `location` (file:// URL)
- Builtin refs carry no additional fields

#### Scenario: Git-sourced ref has location and tree SHA

- **WHEN** `find` returns a ref from a GitHub source
- **THEN** it is a `GitHubSkillRef` with `location` (file:// URL to temp clone directory) and `gitTreeSha`

#### Scenario: Registry-sourced ref has version and checksum

- **WHEN** `find` returns a ref from a registry source
- **THEN** it is a `RegistrySkillRef` with `version` (resolved semver) and `checksum` (from registry index)

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

### Requirement: SourceProviders Effect service

The `SourceProviders` service SHALL be renamed to `SourceHostProviders`. It SHALL expose `find`, `fetch`, `cloneUrl`, and `origin` methods. The `resolveExtension` method is removed — callers use `resolveSource()` + `SourceHostProviders.find()` instead.

`find` SHALL accept a `Source` and `FindOptions`, dispatching to the correct provider by `source.type`. `fetch` SHALL accept a `SourceExtensionRef` and extract the source from `ref.source` for dispatch.

`cloneUrl` SHALL accept a `Source` and return `Option<string>` — the git clone URL for git-based sources, `None` for others. This replaces the standalone `buildCloneUrl` function.

`origin` SHALL accept a `Source` and return a canonical origin string for display/comparison. This replaces the standalone `getOrigin` function and `printSourceInput`.

#### Scenario: find dispatches to correct provider

- **WHEN** `sourceHostProviders.find(source, options)` is called with `source.type === "github"`
- **THEN** the GitHub provider's `find` implementation is invoked

#### Scenario: fetch dispatches by ref source type

- **WHEN** `sourceHostProviders.fetch(ref)` is called where `ref.source.type === "registry"`
- **THEN** the registry provider's `fetch` implementation is invoked

#### Scenario: cloneUrl returns URL for git-based sources

- **WHEN** `sourceHostProviders.cloneUrl(source)` is called with a `GitHubSource`
- **THEN** it returns `Some("https://github.com/owner/repo.git")`

#### Scenario: cloneUrl returns None for non-git sources

- **WHEN** `sourceHostProviders.cloneUrl(source)` is called with a `RegistrySource`
- **THEN** it returns `None`

#### Scenario: origin returns canonical display string

- **WHEN** `sourceHostProviders.origin(source)` is called with a `GitHubSource`
- **THEN** it returns a canonical string like `"github.com/owner/repo"`

#### Scenario: Service constructed once at edge

- **WHEN** the CLI runtime is composed
- **THEN** `SourceHostProviders` is provided via a layer depending on `FileSystem`, `Path`, and `Workspace`

### Requirement: Registry meta-provider wraps multiple registries

The provider registry SHALL contain a single `registry` entry backed by a meta-provider that wraps N configured registry sources. The meta-provider reads `workspace.getRegistrySources()` lazily on each call.

#### Scenario: Lazy config reads

- **WHEN** a registry source is added to settings mid-handler (e.g., by the registry guard)
- **THEN** subsequent `find`/`fetch` calls on the meta-provider see the new source

#### Scenario: Meta-provider applies scope routing

- **WHEN** `find` is called for `@corp/tool`
- **THEN** the meta-provider iterates scope-matched registries first, then catch-all

### Requirement: Existing source types migrated to provider model

All existing source types SHALL be implemented as `SourceHostProvider` instances. Providers SHALL be constructed with their `SourceHost` configuration (for configured sources) or with no constructor args (for self-describing sources).

#### Scenario: GitHub provider constructed with host config

- **WHEN** `createGitHostingProvider(host)` is called with a `GitHubSourceHost`
- **THEN** the provider's `type` is `"github"` and it uses `host.url` for clone URL construction

#### Scenario: Local provider needs no host config

- **WHEN** the local provider is created
- **THEN** it requires no constructor arguments (self-describing source)

#### Scenario: GitHub provider implements find and fetch

- **WHEN** `GitHubSourceHostProvider.find` is called
- **THEN** it performs shallow clone, scans for SKILL.md, and returns `SourceExtensionRef[]`

#### Scenario: Local provider scans filesystem directly

- **WHEN** `LocalSourceHostProvider.find` is called
- **THEN** it scans the local directory and returns `SourceExtensionRef[]`

#### Scenario: Builtin provider does in-memory lookup

- **WHEN** `BuiltinSourceHostProvider.find` is called
- **THEN** it returns bundled extensions from in-memory data

#### Scenario: Builtin provider never matches URLs

- **WHEN** `BuiltinSourceHostProvider.match(url)` is called with any URL
- **THEN** it returns `false`

### Requirement: Registry provider populates checksum during discovery

The registry provider's `find()` SHALL return `SourceExtensionRef` with `checksum` populated from the registry index metadata. Checksum is an intrinsic property of a registry ref known at discovery time.

#### Scenario: Registry find includes checksum

- **WHEN** the registry provider's `find()` discovers an extension
- **THEN** the returned `RegistrySkillRef` has a non-empty `checksum` field from the registry index

## MODIFIED Requirements

### Requirement: SourceError for provider failures

All provider operations SHALL fail with `AppError` (replacing `SourceError`). The `AppError` SHALL include an appropriate error code, descriptive message, and original cause.

#### Scenario: Find failure

- **WHEN** a provider's `find` operation fails (e.g., network error, missing repo)
- **THEN** it fails with `AppError` containing a descriptive `what` and the original `cause`

#### Scenario: Fetch failure

- **WHEN** a provider's `fetch` operation fails (e.g., checksum mismatch)
- **THEN** it fails with `AppError`

## ADDED Requirements

### Requirement: Provider URL matching via match method

Each `SourceHostProvider` SHALL implement a `match(url: URL)` method that returns `Effect<boolean, AppError, R>`. The method answers "does this URL belong to me?" — nothing more. URL-to-params parsing is handled separately by existing provider parsers.

The `match` method MAY require I/O (e.g., fetching `.well-known` for future source refinement).

#### Scenario: GitHub provider matches configured hostname

- **WHEN** `match` is called with a URL whose hostname matches the provider's configured `SourceHost.url`
- **THEN** it returns `true`

#### Scenario: GitHub provider rejects non-matching hostname

- **WHEN** `match` is called with a URL whose hostname does NOT match
- **THEN** it returns `false`

#### Scenario: Local provider matches file URLs and paths

- **WHEN** `match` is called with a `file://` URL
- **THEN** it returns `true`

#### Scenario: Git provider matches git-scheme URLs

- **WHEN** `match` is called with a `git://` or `ssh://` URL
- **THEN** it returns `true`

### Requirement: PublishableSourceHostProvider extends base provider

`PublishableSourceHostProvider` SHALL extend `SourceHostProvider` with a `publishVersion` method for registry-specific operations. Only registry providers implement this interface.

```
publishVersion(scope, type, name, version, archive, metadata) → Effect<void, AppError, R>
```

#### Scenario: Registry provider supports publish

- **WHEN** the registry provider is constructed
- **THEN** it implements `PublishableSourceHostProvider` with `publishVersion`

#### Scenario: Non-registry providers do not support publish

- **WHEN** the GitHub provider is constructed
- **THEN** it implements `SourceHostProvider` only (no `publishVersion`)

### Requirement: Operation args take SourceExtensionRef directly

`InstallSkillOperationArgs` SHALL take a `SkillExtensionRef` instead of flat fields extracted from the ref. `CopySkillOperationArgs` SHALL similarly take a `SkillExtensionRef`. Lock-entry conversion switches on `ref.source.type` and pulls all fields from the ref.

#### Scenario: Install args simplified to ref plus operational params

- **WHEN** constructing `InstallSkillOperationArgs`
- **THEN** the args contain `ref: SkillExtensionRef`, `agents`, `force`, and optional `skipSettings`

#### Scenario: Copy args simplified to ref plus target name

- **WHEN** constructing `CopySkillOperationArgs`
- **THEN** the args contain `ref: SkillExtensionRef` and `targetName`

#### Scenario: Lock entry conversion uses ref source type

- **WHEN** `sourceToLockEntry` converts a `SkillExtensionRef` to a lock entry
- **THEN** it switches on `ref.source.type` to extract source-specific fields (version, checksum, gitTreeSha, location)

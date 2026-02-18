# source-provider Specification (Delta)

## MODIFIED Requirements

### Requirement: ExtensionRef carries source and version metadata

`ExtensionRef` SHALL be a two-dimensional discriminated union with top-level discriminators `type` (extension kind) and `refType` (hosting category). Each ref variant carries a full `Source` object and ref-type-specific details.

- Git-hosted refs carry `location` (file:// URL) and `gitTreeSha: Option<string>`
- Registry refs carry `scope: string`, `name: string`, `version: string`, and `integrity: string`
- Local refs carry `location` (file:// URL)
- Builtin refs carry no additional fields

#### Scenario: Git-sourced ref has location and tree SHA

- **WHEN** `find` returns a ref from a GitHub source
- **THEN** it has `refType: "git-hosted"` with `location` (file:// URL to temp clone directory) and `gitTreeSha`

#### Scenario: Registry-sourced ref has scope, name, and version

- **WHEN** `find` returns a ref from a registry source
- **THEN** it has `refType: "registry"` with `scope`, `name`, `version`, and `integrity`

#### Scenario: Location is always populated after find

- **WHEN** `find` returns any git-hosted or local ref
- **THEN** `location` is populated (providers materialize files before returning refs)

### Requirement: SourceHostProviders Effect service

The `SourceHostProviders` service SHALL expose `find`, `fetch`, `cloneUrl`, and `origin` methods.

`find` SHALL accept a `Source` and `FindOptions`, dispatching to the correct provider by `source.type`. `find` SHALL return `ReadonlyArray<ExtensionRef>` (renamed from `SourceExtensionRef`).

`fetch` SHALL accept an `ExtensionRef` and extract the source from `ref.source` for dispatch.

`cloneUrl` SHALL accept a `Source` and return `Option<string>` — the git clone URL for git-based sources, `None` for others.

`origin` SHALL accept a `Source` and return a canonical origin string for display/comparison.

#### Scenario: find dispatches to correct provider

- **WHEN** `sourceHostProviders.find(source, options)` is called with `source.type === "github"`
- **THEN** the GitHub provider's `find` implementation is invoked

#### Scenario: find returns ExtensionRef with refType

- **WHEN** `sourceHostProviders.find(source, options)` is called with a GitHub source
- **THEN** the returned refs have `refType: "git-hosted"`

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

### Requirement: Operation args take SourceExtensionRef directly

`InstallSkillOperationArgs` SHALL take a `SkillExtensionRef` instead of flat fields extracted from the ref. `CopySkillOperationArgs` SHALL similarly take a `SkillExtensionRef`. Lock-entry conversion switches on `ref.refType` for ref detail access and `ref.source.type` for source-specific fields.

#### Scenario: Install args simplified to ref plus operational params

- **WHEN** constructing `InstallSkillOperationArgs`
- **THEN** the args contain `ref: SkillExtensionRef`, `agents`, `force`, and optional `skipSettings`

#### Scenario: Copy args simplified to ref plus target name

- **WHEN** constructing `CopySkillOperationArgs`
- **THEN** the args contain `ref: SkillExtensionRef` and `targetName`

#### Scenario: Lock entry conversion uses refType then source type

- **WHEN** `sourceToLockEntry` converts a `SkillExtensionRef` to a lock entry
- **THEN** it switches on `ref.refType` to access ref detail fields, then on `ref.source.type` within `"git-hosted"` for source-specific fields

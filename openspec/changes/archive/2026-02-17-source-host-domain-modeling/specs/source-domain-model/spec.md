## ADDED Requirements

### Requirement: SourceType includes all source variants

`SourceType` SHALL be a string literal union of all source types: `"github"`, `"gitlab"`, `"bitbucket"`, `"azurerepos"`, `"git"`, `"registry"`, `"local"`, and `"builtin"`. This is the canonical discriminator across all source-related types.

#### Scenario: SourceType includes builtin

- **WHEN** switching on a `SourceType` value
- **THEN** the exhaustive cases include `"builtin"` alongside the existing 7 types

#### Scenario: SourceType is the shared discriminator

- **WHEN** a `SourceHost`, `SourceParams`, or `Source` value is created
- **THEN** each carries a `type` field whose value is a member of `SourceType`

### Requirement: SourceHost models how to reach a source

Each `SourceHost` variant SHALL carry the access information for its source type. Configured sources (git hosting, registry) require a `url: URL`. Self-describing sources (git, local, builtin) carry no configuration beyond `type`.

All `SourceHost` types live in `sources/types.ts`.

| Source Host | Fields                                                                      | Notes                                  |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------- |
| github      | `type: "github"`, `url: URL`                                                | Instance URL (github.com or GHE)       |
| gitlab      | `type: "gitlab"`, `url: URL`                                                | Instance URL                           |
| bitbucket   | `type: "bitbucket"`, `url: URL`                                             | Instance URL                           |
| azurerepos  | `type: "azurerepos"`, `url: URL`                                            | Instance URL                           |
| git         | `type: "git"`                                                               | Self-describing; URL lives in params   |
| registry    | `type: "registry"`, `url: URL`, `namespaces: Option<ReadonlyArray<string>>` | Scopes from settings; None = catch-all |
| local       | `type: "local"`                                                             | Self-describing; path lives in params  |
| builtin     | `type: "builtin"`                                                           | Self-describing; bundled extensions    |

#### Scenario: Configured source host carries URL

- **WHEN** a `GitHubSourceHost` is created
- **THEN** it has `type: "github"` and `url` pointing to the GitHub instance

#### Scenario: Self-describing source host has no config fields

- **WHEN** a `LocalSourceHost` is created
- **THEN** it has only `type: "local"` with no additional fields

#### Scenario: Registry source host carries scopes

- **WHEN** a `RegistrySourceHost` is created with scopes `["@acme"]`
- **THEN** `scopes` is `Some(["@acme"])` indicating scope-specific routing

#### Scenario: Registry source host catch-all has no scopes

- **WHEN** a `RegistrySourceHost` is created without scopes
- **THEN** `scopes` is `None` indicating catch-all behavior

### Requirement: SourceParams models coordinates within a source

Each `SourceParams` variant SHALL carry the user-specified coordinates for locating an extension within a source. Defined as plain interfaces in `sources/types.ts`.

| Source Params | Fields                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| github        | `type`, `owner`, `repo`, `ref: Option<string>`, `subPath: Option<string>`                   |
| gitlab        | `type`, `owner`, `repo`, `ref: Option<string>`, `subPath: Option<string>`                   |
| bitbucket     | `type`, `owner`, `repo`, `ref: Option<string>`, `subPath: Option<string>`                   |
| azurerepos    | `type`, `organization`, `project`, `repo`, `ref: Option<string>`, `subPath: Option<string>` |
| git           | `type`, `url: URL`, `ref: Option<string>`                                                   |
| registry      | `type`, `scope`, `name`, `versionConstraint: Option<string>`                                |
| local         | `type`, `path: string`                                                                      |
| builtin       | `type`                                                                                      |

#### Scenario: Git hosting params carry owner and repo

- **WHEN** a `GitHubSourceParams` is created for `owner/repo`
- **THEN** it has `owner: "owner"`, `repo: "repo"`, `ref: None`, `subPath: None`

#### Scenario: Azure Repos params have organization and project

- **WHEN** an `AzureReposSourceParams` is created for `org/proj/repo`
- **THEN** it has `organization: "org"`, `project: "proj"`, `repo: "repo"`

#### Scenario: Registry params carry scope and name

- **WHEN** a `RegistrySourceParams` is created for `@acme/my-skill@^1.0.0`
- **THEN** it has `namespace: "@acme"`, `name: "my-skill"`, `versionConstraint: Some("^1.0.0")`

#### Scenario: Builtin params are trivial

- **WHEN** a `BuiltinSourceParams` is created
- **THEN** it has only `type: "builtin"` with no additional fields

### Requirement: Source is a flat intersection of SourceHost and SourceParams

Each `Source` variant SHALL be `SourceHost & SourceParams` for the same source type. `switch (source.type)` gives access to all host and params fields directly.

#### Scenario: GitHub source has all fields at top level

- **WHEN** a `GitHubSource` is created
- **THEN** `source.url`, `source.owner`, `source.repo`, `source.ref`, and `source.subPath` are all directly accessible

#### Scenario: Registry source has host and params fields

- **WHEN** a `RegistrySource` is created
- **THEN** `source.url`, `source.scopes`, `source.scope`, `source.name`, and `source.versionConstraint` are all directly accessible

#### Scenario: Switch on source type is exhaustive

- **WHEN** switching on `source.type` for a `Source` value
- **THEN** all 8 source types MUST be handled for exhaustive coverage

### Requirement: Convenience unions group related source types

The system SHALL provide convenience union types for common groupings.

| Union                      | Members                                              | Purpose                           |
| -------------------------- | ---------------------------------------------------- | --------------------------------- |
| `GitHostingSourceHost`     | GitHub, GitLab, Bitbucket, AzureRepos (hosts)        | Sources requiring configured URL  |
| `GitHostingSource`         | GitHub, GitLab, Bitbucket, AzureRepos (full sources) | Git hosting sources               |
| `GitBasedSource`           | GitHostingSource + GitSource                         | All git-based sources             |
| `ConfiguredSourceHost`     | GitHostingSourceHost + RegistrySourceHost            | Sources requiring settings config |
| `SelfDescribingSourceHost` | GitSourceHost + LocalSourceHost + BuiltinSourceHost  | Sources needing no config         |

#### Scenario: ConfiguredSourceHost matches sources needing settings

- **WHEN** checking if a source host requires settings configuration
- **THEN** `ConfiguredSourceHost` matches github, gitlab, bitbucket, azurerepos, and registry

#### Scenario: SelfDescribingSourceHost matches config-free sources

- **WHEN** checking if a source host is self-describing
- **THEN** `SelfDescribingSourceHost` matches git, local, and builtin

### Requirement: SourceParams comparison uses structural equality

`SourceParams` variants SHALL be compared using `Data.struct()` for structural equality via `Equal.equals()`. Manual field-by-field comparison logic is eliminated.

#### Scenario: Equal params compare as equal

- **WHEN** comparing two `GitHubSourceParams` with identical `owner`, `repo`, `ref`, and `subPath`
- **THEN** `Equal.equals(Data.struct(a), Data.struct(b))` returns `true`

#### Scenario: Different params compare as not equal

- **WHEN** comparing `GitHubSourceParams` with `owner: "a"` against `owner: "b"`
- **THEN** `Equal.equals(Data.struct(a), Data.struct(b))` returns `false`

#### Scenario: Azure Repos params compare all fields correctly

- **WHEN** comparing two `AzureReposSourceParams` with different `project` values
- **THEN** they compare as not equal (fixing the latent bug in manual comparison)

### Requirement: FindableExtensionType excludes unimplemented types

`FindableExtensionType` SHALL be `"skill" | "pack" | "mcp-server"`, excluding `"command"` until `CommandExtensionRef` is implemented. Defined in `sources/types.ts`.

#### Scenario: FindOptions uses FindableExtensionType

- **WHEN** constructing `FindOptions` for provider discovery
- **THEN** the `type` field accepts `FindableExtensionType | "*"`

### Requirement: Source-specific ref details carry source-appropriate metadata

The system SHALL define ref detail interfaces for each source category.

| Detail Type           | Fields                                           | Used By                                    |
| --------------------- | ------------------------------------------------ | ------------------------------------------ |
| `GitHostedRefDetails` | `location: string`, `gitTreeSha: Option<string>` | GitHub, GitLab, Bitbucket, AzureRepos, Git |
| `RegistryRefDetails`  | `version: string`, `checksum: string`            | Registry                                   |
| `LocalRefDetails`     | `location: string`                               | Local                                      |
| `BuiltinRefDetails`   | _(no additional fields)_                         | Builtin                                    |

#### Scenario: Git-hosted ref carries location and tree SHA

- **WHEN** a GitHub provider discovers an extension
- **THEN** the ref includes `location` (file:// URL to clone dir) and `gitTreeSha`

#### Scenario: Registry ref carries version and checksum

- **WHEN** a registry provider discovers an extension
- **THEN** the ref includes `version` (resolved semver) and `checksum` (archive integrity)

### Requirement: SourceExtensionRef is a two-dimensional discriminated union

`SourceExtensionRef` SHALL be discriminated by both extension type and source type. Each combination carries exactly the fields it needs — no `Option` wrappers for inapplicable fields.

The union is: `SkillExtensionRef | McpServerExtensionRef | PackExtensionRef`.

Each sub-union combines a base (e.g., `SkillRefBase`) with a `Source` variant and source-specific ref details.

#### Scenario: Skill ref from GitHub carries git-hosted details

- **WHEN** a GitHub provider discovers a skill
- **THEN** the ref is a `GitHubSkillRef` with `type: "skill"`, `source: GitHubSource`, `location`, `gitTreeSha`, and `skill` metadata

#### Scenario: Skill ref from registry carries registry details

- **WHEN** a registry provider discovers a skill
- **THEN** the ref is a `RegistrySkillRef` with `type: "skill"`, `source: RegistrySource`, `version`, `checksum`, and `skill` metadata

#### Scenario: Pack ref is registry or builtin only

- **WHEN** creating a `PackExtensionRef`
- **THEN** it is either `RegistryPackRef` or `BuiltinPackRef` (packs are not discovered from git sources)

#### Scenario: MCP server ref supports subset of sources

- **WHEN** creating an `McpServerExtensionRef`
- **THEN** it supports GitHub, Registry, Local, and Builtin source variants

#### Scenario: Ref carries full Source (not just SourceType string)

- **WHEN** inspecting any `SourceExtensionRef`
- **THEN** `ref.source` is a full `Source` object with host and params fields, not a `SourceType` string

### Requirement: Migration type aliases for incremental adoption

The system SHALL provide temporary deprecated type aliases during migration.

| Alias             | Target                | Location           |
| ----------------- | --------------------- | ------------------ |
| `SourceInput`     | `SourceParams`        | `sources/types.ts` |
| `ExtensionRef`    | `SourceExtensionRef`  | `sources/types.ts` |
| `SourceProvider`  | `SourceHostProvider`  | `sources/types.ts` |
| `SourceProviders` | `SourceHostProviders` | `sources/types.ts` |

These aliases SHALL be removed after all consumers are migrated.

#### Scenario: Existing code compiles with aliases

- **WHEN** code references `SourceInput` during migration
- **THEN** it compiles because `SourceInput` aliases `SourceParams`

#### Scenario: Aliases are marked deprecated

- **WHEN** inspecting the type alias declarations
- **THEN** each has a `@deprecated` JSDoc annotation pointing to the replacement type

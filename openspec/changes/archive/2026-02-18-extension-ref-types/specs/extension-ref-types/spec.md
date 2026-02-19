# extension-ref-types Specification

## Purpose

Defines the generic `ExtensionRef` type hierarchy used to represent discovered extensions with all data required to install or update them.

## ADDED Requirements

### Requirement: RefType discriminator

Every extension ref SHALL have a top-level `refType` field with value `"git-hosted" | "registry" | "local" | "builtin"`. The `refType` discriminator groups source types by hosting category and enables TypeScript narrowing without type assertions.

#### Scenario: Narrowing on refType reveals ref details

- **WHEN** code switches on `ref.refType === "git-hosted"`
- **THEN** TypeScript narrows the ref to include `location: string` and `gitTreeSha: Option<string>` without type assertions

#### Scenario: Narrowing on refType reveals registry fields

- **WHEN** code switches on `ref.refType === "registry"`
- **THEN** TypeScript narrows the ref to include `namespace: string`, `name: string`, `version: string`, and `integrity: string` without type assertions

#### Scenario: RefType is independent of extension type

- **WHEN** a `SkillExtensionRef` and an `McpServerExtensionRef` both have `refType: "git-hosted"`
- **THEN** both carry `GitHostedRefDetails` fields identically

### Requirement: ExtensionRefBase generic foundation

`ExtensionRefBase<TExtensionType, TRefType, TSource>` SHALL be a generic interface with three fields: `type: TExtensionType`, `refType: TRefType`, `source: TSource`. All extension refs SHALL extend this base.

#### Scenario: Base constrains type parameters

- **WHEN** defining `GitHostedSkillRef` using `ExtensionRefBase<"skill", "git-hosted", GitBasedSource>`
- **THEN** the resulting type has `type: "skill"`, `refType: "git-hosted"`, and `source: GitBasedSource`

#### Scenario: Source type is constrained by refType

- **WHEN** a ref has `refType: "git-hosted"`
- **THEN** its `source` field MUST be `GitBasedSource` (GitHub | GitLab | Bitbucket | AzureRepos | Git)

#### Scenario: Source type constrained for registry

- **WHEN** a ref has `refType: "registry"`
- **THEN** its `source` field MUST be `RegistrySource`

#### Scenario: Source type constrained for local

- **WHEN** a ref has `refType: "local"`
- **THEN** its `source` field MUST be `LocalSource`

#### Scenario: Source type constrained for builtin

- **WHEN** a ref has `refType: "builtin"`
- **THEN** its `source` field MUST be `BuiltinSource`

### Requirement: Extension-type base layer

Each extension type SHALL have a layer-2 base that adds extension-specific metadata to `ExtensionRefBase`:

- `SkillExtensionRefBase` adds `skill: { name: string; description: Option<string>; metadata: Option<ReadonlyRecord<string, unknown>> }`
- `McpServerExtensionRefBase` adds `server: { name: string }`
- `PackExtensionRefBase` adds `pack: { name: string }`

#### Scenario: Skill ref carries skill metadata

- **WHEN** any `SkillExtensionRef` variant is accessed
- **THEN** it has `skill.name`, `skill.description` (as `Option<string>`), and `skill.metadata`

#### Scenario: MCP server ref carries server metadata

- **WHEN** any `McpServerExtensionRef` variant is accessed
- **THEN** it has `server.name`

#### Scenario: Pack ref carries pack metadata

- **WHEN** any `PackExtensionRef` variant is accessed
- **THEN** it has `pack.name`

### Requirement: Concrete ref types per refType

Layer-3 concrete types SHALL compose the extension-type base with ref-type-specific detail interfaces:

- Git-hosted refs intersect with `GitHostedRefDetails` (`location: string`, `gitTreeSha: Option<string>`)
- Registry refs intersect with `RegistryRefDetails` (`namespace: string`, `name: string`, `version: string`, `integrity: string`)
- Local refs intersect with `LocalRefDetails` (`location: string`)
- Builtin refs intersect with `BuiltinRefDetails` (empty)

#### Scenario: Git-hosted skill ref shape

- **WHEN** a `GitHostedSkillRef` is constructed
- **THEN** it has `type: "skill"`, `refType: "git-hosted"`, `source: GitBasedSource`, `skill: {...}`, `location: string`, `gitTreeSha: Option<string>`

#### Scenario: Registry skill ref shape

- **WHEN** a `RegistrySkillRef` is constructed
- **THEN** it has `type: "skill"`, `refType: "registry"`, `source: RegistrySource`, `skill: {...}`, `namespace: string`, `name: string`, `version: string`, `integrity: string`

#### Scenario: Local MCP server ref shape

- **WHEN** a `LocalMcpServerRef` is constructed
- **THEN** it has `type: "mcp-server"`, `refType: "local"`, `source: LocalSource`, `server: {...}`, `location: string`

#### Scenario: Registry pack ref shape

- **WHEN** a `RegistryPackRef` is constructed
- **THEN** it has `type: "pack"`, `refType: "registry"`, `source: RegistrySource`, `pack: { name }`, `namespace: string`, `name: string`, `version: string`, `integrity: string`

### Requirement: Git-hosted refType collapses git source variants

The `"git-hosted"` ref type SHALL cover all git-based sources: GitHub, GitLab, Bitbucket, AzureRepos, and generic Git. The specific source host identity SHALL remain available via `source.type` for code that needs source-level granularity.

#### Scenario: GitHub and GitLab produce same ref type

- **WHEN** a GitHub source and a GitLab source each produce a skill ref
- **THEN** both refs have `refType: "git-hosted"` and identical ref detail fields (`location`, `gitTreeSha`)

#### Scenario: Source-level granularity still available

- **WHEN** code needs to distinguish GitHub from GitLab within a git-hosted ref
- **THEN** it switches on `ref.source.type` which narrows to the specific source variant

### Requirement: RegistryRefDetails.name is the registry package name

`RegistryRefDetails.name` SHALL be the registry package name — the identifier used for registry operations (fetch, version resolution). This MAY differ from the extension-specific display name (`skill.name`, `pack.name`, `server.name`) which is the user-facing name parsed from the extension's manifest. The implementation MUST include a code comment on `RegistryRefDetails.name` clarifying this distinction.

#### Scenario: Registry name matches extension name

- **WHEN** a registry skill's package name and manifest skill name are the same
- **THEN** `ref.name` (from `RegistryRefDetails`) equals `ref.skill.name`

#### Scenario: Registry name differs from extension name

- **WHEN** a registry skill is published under package name `"my-tool"` but its SKILL.md declares name `"My Tool"`
- **THEN** `ref.name` is `"my-tool"` and `ref.skill.name` is `"My Tool"`

### Requirement: ExtensionRef top-level union

`ExtensionRef` SHALL be the union of all per-extension-type unions: `SkillExtensionRef | McpServerExtensionRef | PackExtensionRef`. The name `SourceExtensionRef` SHALL be removed.

#### Scenario: Two-axis narrowing

- **WHEN** code receives an `ExtensionRef`
- **THEN** it can narrow on `ref.type` (extension kind) and then `ref.refType` (hosting category), or vice versa

#### Scenario: Rename from SourceExtensionRef

- **WHEN** code previously imported `SourceExtensionRef`
- **THEN** it SHALL import `ExtensionRef` instead

### Requirement: Skill description is Option

`SkillRefBase.skill.description` SHALL be `Option<string>`. Providers that lack a description for a skill SHALL return `Option.none()`.

#### Scenario: Provider with no description

- **WHEN** a git-hosted skill has no description in its SKILL.md frontmatter
- **THEN** `ref.skill.description` is `Option.none()`

#### Scenario: Provider with description

- **WHEN** a registry skill has a description in its manifest
- **THEN** `ref.skill.description` is `Option.some("the description")`

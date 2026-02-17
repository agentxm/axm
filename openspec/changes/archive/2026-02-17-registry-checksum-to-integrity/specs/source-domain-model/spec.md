## MODIFIED Requirements

### Requirement: Source-specific ref details carry source-appropriate metadata

The system SHALL define ref detail interfaces for each source category.

| Detail Type           | Fields                                           | Used By                                    |
| --------------------- | ------------------------------------------------ | ------------------------------------------ |
| `GitHostedRefDetails` | `location: string`, `gitTreeSha: Option<string>` | GitHub, GitLab, Bitbucket, AzureRepos, Git |
| `RegistryRefDetails`  | `version: string`, `integrity: string`           | Registry                                   |
| `LocalRefDetails`     | `location: string`                               | Local                                      |
| `BuiltinRefDetails`   | _(no additional fields)_                         | Builtin                                    |

#### Scenario: Git-hosted ref carries location and tree SHA

- **WHEN** a GitHub provider discovers an extension
- **THEN** the ref includes `location` (file:// URL to clone dir) and `gitTreeSha`

#### Scenario: Registry ref carries version and integrity

- **WHEN** a registry provider discovers an extension
- **THEN** the ref includes `version` (resolved semver) and `integrity` (SRI format archive hash)

### Requirement: SourceExtensionRef is a two-dimensional discriminated union

`SourceExtensionRef` SHALL be discriminated by both extension type and source type. Each combination carries exactly the fields it needs — no `Option` wrappers for inapplicable fields.

The union is: `SkillExtensionRef | McpServerExtensionRef | PackExtensionRef`.

Each sub-union combines a base (e.g., `SkillRefBase`) with a `Source` variant and source-specific ref details.

#### Scenario: Skill ref from GitHub carries git-hosted details

- **WHEN** a GitHub provider discovers a skill
- **THEN** the ref is a `GitHubSkillRef` with `type: "skill"`, `source: GitHubSource`, `location`, `gitTreeSha`, and `skill` metadata

#### Scenario: Skill ref from registry carries registry details

- **WHEN** a registry provider discovers a skill
- **THEN** the ref is a `RegistrySkillRef` with `type: "skill"`, `source: RegistrySource`, `version`, `integrity`, and `skill` metadata

#### Scenario: Pack ref is registry or builtin only

- **WHEN** creating a `PackExtensionRef`
- **THEN** it is either `RegistryPackRef` or `BuiltinPackRef` (packs are not discovered from git sources)

#### Scenario: MCP server ref supports subset of sources

- **WHEN** creating an `McpServerExtensionRef`
- **THEN** it supports GitHub, Registry, Local, and Builtin source variants

#### Scenario: Ref carries full Source (not just SourceType string)

- **WHEN** inspecting any `SourceExtensionRef`
- **THEN** `ref.source` is a full `Source` object with host and params fields, not a `SourceType` string

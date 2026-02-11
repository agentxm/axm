# resolve-source Specification

## Purpose

Defines `resolveSource` — the function that combines source string parsing with workspace config matching to produce fully-resolved `Source` values.

## Requirements

### Requirement: resolveSource combines parsing with config matching

`resolveSource(input: string)` SHALL parse the input string via `determineSourceInput`, match the result against configured sources from `Workspace`, and return a fully-resolved `Source` (coordinates + provider config).

The pipeline:

1. Parse input → `SourceInput` via `determineSourceInput`
2. Match on `source.type` discriminator
3. For git hosting types (github, gitlab, bitbucket, azurerepos): find matching `SourceConfig`, merge input + config → `Source`
4. For self-describing types (git, local, registry): pass through as-is

`resolveSource` SHALL require the `Workspace` service and MAY fail with `ParseError`.

#### Scenario: GitHub shorthand resolves to GitHubSource with config

- **WHEN** `resolveSource("github:owner/repo")` is called
- **AND** workspace has config `{ name: "github", type: "github", url: "https://github.com" }`
- **THEN** the result is a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `url: "https://github.com"`, `name: "github"`

#### Scenario: Local path passes through without config

- **WHEN** `resolveSource("./my-skills")` is called
- **THEN** the result is a `LocalSource` with `type: "local"` and `path` resolved to an absolute path
- **AND** no config fields are added

#### Scenario: Registry input resolves to scope and name

- **WHEN** `resolveSource("@acme/my-skill")` is called
- **THEN** the result has `type: "registry"`, `scope: "acme"`, `name: "my-skill"`
- **AND** no config fields are present (`url`, `scopes` are absent — the meta-provider handles config lookup internally)

#### Scenario: Git source passes through without config

- **WHEN** `resolveSource("git:https://example.com/repo.git")` is called
- **THEN** the result is a `GitRepositorySource` with no config fields

### Requirement: Multi-config matching by URL hostname

For `UrlInput` and `GitScpAddress` patterns, `resolveSource` SHALL iterate the merged sources list (project → global → built-in) and attempt to match each configured source using exhaustive pattern matching on the `source` discriminator. For each config, resolution SHALL:

1. Check if the config's URL hostname matches the input hostname (pre-filter)
2. Attempt to parse the input URL using the config's source type provider parser, parameterized with the config's hostname
3. If parse succeeds, merge the parsed `SourceInput` with the config to produce a `Source`
4. If hostname mismatches or parse fails, continue to the next configured source

The first successful match SHALL be returned. If no configured source matches, resolution SHALL fail with `ParseError`.

Source types that do not support URL resolution (e.g., registry) SHALL be skipped during iteration.

#### Scenario: Canonical GitHub URL matches built-in default

- **WHEN** `resolveSource("https://github.com/owner/repo")` is called
- **AND** built-in default config `{ name: "github", source: "github", url: "https://github.com" }` is present
- **THEN** the result is a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `name: "github"`, `url: "https://github.com"`

#### Scenario: Custom hostname URL matches user config

- **WHEN** `resolveSource("https://ghe.corp.com/team/repo")` is called
- **AND** workspace has config `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`
- **THEN** the result is a `GitHubSource` with `name: "ghe"` and `url: "https://ghe.corp.com"`

#### Scenario: Canonical and custom use same codepath

- **WHEN** `resolveSource("https://github.com/owner/repo")` is called
- **AND** `resolveSource("https://ghe.corp.com/owner/repo")` is called with matching config
- **THEN** both follow the same iteration + hostname match + provider parse path

#### Scenario: URL input matches GitHub Enterprise config among multiple configs

- **WHEN** `resolveSource("https://ghe.corp.com/team/repo")` is called
- **AND** workspace has configs:
  - `{ name: "github", source: "github", url: "https://github.com" }`
  - `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`
- **THEN** the result is a `GitHubSource` with `name: "ghe"` and `url: "https://ghe.corp.com"`

#### Scenario: SCP input matches by hostname

- **WHEN** `resolveSource("git@ghe.corp.com:team/repo.git")` is called
- **AND** workspace has config `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`
- **THEN** the result matches the `ghe` config by hostname

#### Scenario: No config matches URL hostname

- **WHEN** `resolveSource("https://unknown-host.com/owner/repo")` is called
- **AND** no configured source has a matching hostname
- **THEN** the result is a `ParseError` with message indicating no configured source matches

#### Scenario: Hostname matches but parse fails continues to next source

- **WHEN** `resolveSource("https://git.corp.com/owner/repo/-/tree/main")` is called
- **AND** workspace has configs:
  - `{ name: "gh-corp", source: "github", url: "https://git.corp.com" }`
  - `{ name: "gl-corp", source: "gitlab", url: "https://git.corp.com" }`
- **THEN** the GitHub parser fails (GitLab URL structure) and the GitLab parser succeeds
- **AND** the result is a `GitLabSource` with `name: "gl-corp"`

#### Scenario: User config takes precedence over built-in

- **WHEN** `resolveSource("https://github.com/owner/repo")` is called
- **AND** project settings has config `{ name: "github", source: "github", url: "https://github.com" }` with custom properties
- **THEN** the project config is used (appears before built-in in merged sources list)

### Requirement: Multi-config matching by shorthand prefix

When the input uses a shorthand prefix that matches a source type, `resolveSource` SHALL select the first config of that type. When the prefix matches a config name (not a source type), that specific config SHALL be used.

#### Scenario: Source-type prefix selects first config

- **WHEN** `resolveSource("github:owner/repo")` is called
- **AND** workspace has two GitHub configs
- **THEN** the first GitHub config (by merge order) is selected

#### Scenario: Config-name prefix selects specific config

- **WHEN** `resolveSource("ghe:owner/repo")` is called
- **AND** workspace has config `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`
- **THEN** the `ghe` config is selected and the input is parsed using the GitHub shorthand parser

#### Scenario: Unknown prefix fails

- **WHEN** `resolveSource("unknown:owner/repo")` is called
- **AND** no source type or config name matches `unknown`
- **THEN** the result is a `ParseError`

### Requirement: Config-name shorthand uses two-phase parse

`resolveSource` SHALL support config names as shorthand prefixes. When a `ShorthandInput` pattern has a prefix that is not a known source type, `resolveSource` SHALL check if the prefix matches a config name from `getConfiguredSources()` and parse the remainder using that config's source type shorthand parser.

#### Scenario: Config-name prefix parsed via matching config

- **WHEN** `resolveSource("ghe:owner/repo#main")` is called
- **AND** prefix `ghe` is not a known source type
- **AND** workspace has config `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`
- **THEN** `resolveSource` detects the `ghe` config, parses using the GitHub shorthand parser, and returns a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `ref: Some("main")`, `name: "ghe"`, `url: "https://ghe.corp.com"`

#### Scenario: Standard shorthand handled directly

- **WHEN** `resolveSource("github:owner/repo")` is called
- **THEN** the `github` prefix is a known source type and is dispatched directly to the GitHub shorthand parser

### Requirement: Provider URL/SCP parsers accept hostname parameter

Provider URL and SCP parsers SHALL accept a hostname parameter that defaults to the canonical hostname. This allows the same parser to handle both canonical and custom-hosted instances without URL rewriting.

#### Scenario: GitHub URL parser with default hostname

- **WHEN** `parseGitHubUrl(url)` is called without a hostname parameter
- **THEN** it parses using the default hostname `"github.com"`

#### Scenario: GitHub URL parser with custom hostname

- **WHEN** `parseGitHubUrl(url, "ghe.corp.com")` is called
- **THEN** it parses using hostname `"ghe.corp.com"`

#### Scenario: SCP parser with custom hostname

- **WHEN** `parseGitHubScp(input, "ghe.corp.com")` is called
- **THEN** it parses using hostname `"ghe.corp.com"`

### Requirement: RegistrySource type simplification

`RegistrySource` SHALL be defined as `RegistrySourceInput` (carrying `type`, `scope`, and `name`) without intersecting `RegistrySourceConfig`. The registry meta-provider handles config lookup internally.

#### Scenario: RegistrySource carries extension coordinates only

- **WHEN** `resolveSource` produces a registry `Source`
- **THEN** the result has `type: "registry"`, `scope`, and `name` (extension name)
- **AND** the result does NOT have `url` or `scopes` config fields

### Requirement: buildCloneUrl uses config url field

`buildCloneUrl` SHALL accept a `Source` (not `SourceInput`) and construct clone URLs from the config's `url` field for git hosting sources.

#### Scenario: Clone URL uses config base URL

- **WHEN** `buildCloneUrl` is called with a `GitHubSource` where `url` is `"https://ghe.corp.com"`
- **THEN** the result is `"https://ghe.corp.com/owner/repo.git"`

#### Scenario: Azure Repos clone URL uses config base URL

- **WHEN** `buildCloneUrl` is called with an `AzureReposSource` where `url` is `"https://dev.azure.com"`
- **THEN** the result is `"https://dev.azure.com/org/project/_git/repo"`

## ADDED Requirements

### Requirement: resolveSource combines parsing with config matching

`resolveSource(input: string)` SHALL parse the input string via `determineSourceInput`, match the result against configured sources from `Workspace`, and return a fully-resolved `Source` (coordinates + provider config).

The pipeline:

1. Parse input → `SourceInput` via `determineSourceInput`
2. Match on `source.source` discriminator
3. For git hosting types (github, gitlab, bitbucket, azurerepos): find matching `SourceConfig`, merge input + config → `Source`
4. For self-describing types (git, local, registry): pass through as-is

`resolveSource` SHALL require the `Workspace` service and MAY fail with `ParseError`.

#### Scenario: GitHub shorthand resolves to GitHubSource with config

- **WHEN** `resolveSource("github:owner/repo")` is called
- **AND** workspace has config `{ name: "github", source: "github", url: "https://github.com" }`
- **THEN** the result is a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `url: "https://github.com"`, `name: "github"`

#### Scenario: Local path passes through without config

- **WHEN** `resolveSource("./my-skills")` is called
- **THEN** the result is a `LocalSource` with `source: "local"` and `path` resolved to an absolute path
- **AND** no config fields are added

#### Scenario: Registry input passes through without config

- **WHEN** `resolveSource("@acme/my-skill")` is called
- **THEN** the result has `source: "registry"` with no config fields (meta-provider handles config internally)

#### Scenario: Git source passes through without config

- **WHEN** `resolveSource("git:https://example.com/repo.git")` is called
- **THEN** the result is a `GitRepositorySource` with no config fields

### Requirement: Multi-config matching by URL hostname

When multiple configs share the same source type, `resolveSource` SHALL disambiguate URL and SCP inputs by matching the hostname from the parsed URL against hostnames derived from each config's `url` field.

#### Scenario: URL input matches GitHub Enterprise config

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
- **AND** no config has a matching hostname
- **THEN** the result is a `ParseError` with message indicating the unsupported host

### Requirement: Multi-config matching by shorthand prefix

When the input uses a shorthand prefix that matches a source type, `resolveSource` SHALL select the first config of that type. When the prefix matches a config name (not a source type), that specific config SHALL be used.

#### Scenario: Source-type prefix selects first config

- **WHEN** `resolveSource("github:owner/repo")` is called
- **AND** workspace has two GitHub configs
- **THEN** the first GitHub config (by merge order) is selected

#### Scenario: Config-name prefix selects specific config

- **WHEN** `resolveSource("ghe:owner/repo")` is called
- **AND** workspace has config `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`
- **THEN** the `ghe` config is selected and the input is parsed using the GitHub descriptor

#### Scenario: Unknown prefix fails

- **WHEN** `resolveSource("unknown:owner/repo")` is called
- **AND** no source type or config name matches `unknown`
- **THEN** the result is a `ParseError`

### Requirement: Config-name shorthand uses two-phase parse

`resolveSource` SHALL support config names as shorthand prefixes without modifying the pure parser. When `determineSourceInput` fails, `resolveSource` SHALL check if the prefix before `:` matches a config name from `getConfiguredSources()` and re-parse the remainder using the config's source type descriptor.

#### Scenario: Two-phase parse for config-name prefix

- **WHEN** `resolveSource("ghe:owner/repo#main")` is called
- **AND** `determineSourceInput("ghe:owner/repo#main")` fails (prefix `ghe` is not a known source type)
- **AND** workspace has config `{ name: "ghe", source: "github", url: "https://ghe.corp.com" }`
- **THEN** `resolveSource` detects the `ghe` config, re-parses using the GitHub shorthand descriptor, and returns a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `ref: Some("main")`, `name: "ghe"`, `url: "https://ghe.corp.com"`

#### Scenario: Standard shorthand still works in first phase

- **WHEN** `resolveSource("github:owner/repo")` is called
- **THEN** `determineSourceInput` succeeds in the first phase (no fallback needed)

### Requirement: Single config fallback

When exactly one config exists for a source type, `resolveSource` SHALL use it regardless of input pattern. No disambiguation is needed.

#### Scenario: Single GitHub config always matches

- **WHEN** `resolveSource("github:owner/repo")` is called
- **AND** workspace has exactly one GitHub config
- **THEN** that config is used

#### Scenario: No config for source type fails

- **WHEN** a `SourceInput` with `source: "azurerepos"` is produced
- **AND** workspace has no Azure Repos config
- **THEN** the result is a `ParseError` indicating no configured source

### Requirement: RegistrySource type simplification

`RegistrySource` SHALL be defined as `RegistrySourceInput` without intersecting `RegistrySourceConfig`. The registry meta-provider handles config lookup internally.

#### Scenario: RegistrySource carries no config fields

- **WHEN** `resolveSource` produces a registry `Source`
- **THEN** the result has `source: "registry"` and no `name`, `location`, or `scopes` fields

### Requirement: buildCloneUrl uses config url field

`buildCloneUrl` SHALL accept a `Source` (not `SourceInput`) and construct clone URLs from the config's `url` field for git hosting sources.

#### Scenario: Clone URL uses config base URL

- **WHEN** `buildCloneUrl` is called with a `GitHubSource` where `url` is `"https://ghe.corp.com"`
- **THEN** the result is `"https://ghe.corp.com/owner/repo.git"`

#### Scenario: Azure Repos clone URL uses config base URL

- **WHEN** `buildCloneUrl` is called with an `AzureReposSource` where `url` is `"https://dev.azure.com"`
- **THEN** the result is `"https://dev.azure.com/org/project/_git/repo"`

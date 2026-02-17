# resolve-source Specification

## Purpose

Defines `resolveSource` — the function that combines source string parsing with workspace config matching to produce fully-resolved `Source` values (flat intersection of `SourceHost & SourceParams`).

## Requirements

### Requirement: resolveSource combines parsing with config matching

`resolveSource(input: string)` SHALL parse the input string, match the result against configured sources from `Workspace`, and return a fully-resolved `Source` (the flat intersection of `SourceHost & SourceParams`).

The pipeline:

1. Parse input → `SourceParams` via `determineSourceInput`
2. Match on `source.type` discriminator
3. For git hosting types (github, gitlab, bitbucket, azurerepos): find matching `SourceHostConfig`, intersect `SourceHost` + `SourceParams` → `Source`
4. For registry: find matching `RegistrySourceHostConfig` (by scope routing), intersect → `RegistrySource` (with `url` and `scopes` from host)
5. For self-describing types (git, local): pass through as-is (trivial host + params)

The intersection SHALL be type-safe — no `as Source` assertions needed because `SourceHost` and `SourceParams` share the `type` discriminator.

`resolveSource` SHALL require the `Workspace` service and MAY fail with `CliError`.

#### Scenario: GitHub shorthand resolves to GitHubSource with host config

- **WHEN** `resolveSource("github:owner/repo")` is called
- **AND** workspace has config `{ name: "github", type: "github", url: "https://github.com" }`
- **THEN** the result is a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `url: URL("https://github.com")`
- **AND** the intersection is type-safe (no assertion needed)

#### Scenario: Local path passes through with trivial host

- **WHEN** `resolveSource("./my-skills")` is called
- **THEN** the result is a `LocalSource` with `type: "local"` and `path` resolved to an absolute path
- **AND** the host is `LocalSourceHost` (just `{ type: "local" }`)

#### Scenario: Registry input resolves with host config

- **WHEN** `resolveSource("@acme/my-skill")` is called
- **AND** workspace has registry config `{ name: "default", type: "registry", url: "https://registry.example.com", scopes: None }`
- **THEN** the result is a `RegistrySource` with `type: "registry"`, `scope: "@acme"`, `name: "my-skill"`, `url: URL("https://registry.example.com")`, `scopes: None`

#### Scenario: Git source passes through with trivial host

- **WHEN** `resolveSource("git:https://example.com/repo.git")` is called
- **THEN** the result is a `GitSource` with `type: "git"`, `url: URL("https://example.com/repo.git")`, and trivial `GitSourceHost`

### Requirement: Source merging is type-safe

The intersection `SourceHost & SourceParams = Source` SHALL be type-safe by construction. The resolution layer intersects a known `SourceHost` (from settings) with `SourceParams` (from parsing) without type assertions.

#### Scenario: Type-safe GitHub merge

- **WHEN** a `GitHubSourceHost` is intersected with `GitHubSourceParams`
- **THEN** the result is a `GitHubSource` without requiring `as Source`

#### Scenario: Provider claims URL then resolution intersects

- **WHEN** a provider claims a URL via `match()`, the parser extracts params, and the host is intersected
- **THEN** the result is a concrete `Source` variant, type-safe by construction

### Requirement: Multi-config matching by URL hostname

For `UrlInput` and `GitScpAddress` patterns, `resolveSource` SHALL iterate the merged sources list and attempt to match each configured source. For each config:

1. Check if the config's URL hostname matches the input hostname
2. Attempt to parse the input URL using the config's source type provider parser
3. If parse succeeds, intersect parsed `SourceParams` with config's `SourceHost` to produce `Source`
4. If hostname mismatches or parse fails, continue to the next configured source

The first successful match SHALL be returned. If no configured source matches, the resolution pipeline SHALL ask providers via `match()` until one claims the URL (enabling future source refinement).

#### Scenario: Canonical GitHub URL matches built-in default

- **WHEN** `resolveSource("https://github.com/owner/repo")` is called
- **AND** built-in default config `{ name: "github", type: "github", url: "https://github.com" }` is present
- **THEN** the result is a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `url: URL("https://github.com")`

#### Scenario: Custom hostname URL matches user config

- **WHEN** `resolveSource("https://ghe.corp.com/team/repo")` is called
- **AND** workspace has config `{ name: "ghe", type: "github", url: "https://ghe.corp.com" }`
- **THEN** the result is a `GitHubSource` with `url: URL("https://ghe.corp.com")`

#### Scenario: No config matches URL hostname

- **WHEN** `resolveSource("https://unknown-host.com/owner/repo")` is called
- **AND** no configured source has a matching hostname
- **THEN** the result is a `CliError` with an appropriate error code

#### Scenario: Hostname matches but parse fails continues to next source

- **WHEN** `resolveSource("https://git.corp.com/owner/repo/-/tree/main")` is called
- **AND** workspace has configs for GitHub and GitLab at the same hostname
- **THEN** the GitHub parser fails (GitLab URL structure) and the GitLab parser succeeds

### Requirement: Multi-config matching by shorthand prefix

When the input uses a shorthand prefix that matches a source type, `resolveSource` SHALL select the first config of that type. When the prefix matches a config name (not a source type), that specific config SHALL be used.

#### Scenario: Source-type prefix selects first config

- **WHEN** `resolveSource("github:owner/repo")` is called
- **AND** workspace has two GitHub configs
- **THEN** the first GitHub config (by merge order) is selected

#### Scenario: Config-name prefix selects specific config

- **WHEN** `resolveSource("ghe:owner/repo")` is called
- **AND** workspace has config `{ name: "ghe", type: "github", url: "https://ghe.corp.com" }`
- **THEN** the `ghe` config is selected and the input is parsed using the GitHub shorthand parser

### Requirement: Config-name shorthand uses two-phase parse

`resolveSource` SHALL support config names as shorthand prefixes. When a `ShorthandInput` pattern has a prefix that is not a known source type, `resolveSource` SHALL check if the prefix matches a config name and parse the remainder using that config's source type shorthand parser.

#### Scenario: Config-name prefix parsed via matching config

- **WHEN** `resolveSource("ghe:owner/repo#main")` is called
- **AND** prefix `ghe` is not a known source type
- **AND** workspace has config `{ name: "ghe", type: "github", url: "https://ghe.corp.com" }`
- **THEN** `resolveSource` detects the `ghe` config, parses using the GitHub shorthand parser, and returns a `GitHubSource` with `owner: "owner"`, `repo: "repo"`, `ref: Some("main")`, `url: URL("https://ghe.corp.com")`

### Requirement: Provider URL/SCP parsers accept hostname parameter

Provider URL and SCP parsers SHALL accept a hostname parameter that defaults to the canonical hostname. This allows the same parser to handle both canonical and custom-hosted instances.

#### Scenario: GitHub URL parser with default hostname

- **WHEN** `parseGitHubUrl(url)` is called without a hostname parameter
- **THEN** it parses using the default hostname `"github.com"`

#### Scenario: GitHub URL parser with custom hostname

- **WHEN** `parseGitHubUrl(url, "ghe.corp.com")` is called
- **THEN** it parses using hostname `"ghe.corp.com"`

### Requirement: RegistrySource type carries host config

`RegistrySource` SHALL be the flat intersection of `RegistrySourceHost & RegistrySourceParams`, carrying `type`, `url`, `scopes` (from host), `scope`, `name`, and `versionConstraint` (from params). The registry meta-provider no longer needs to look up config internally — the resolved `Source` already has it.

#### Scenario: RegistrySource carries full context

- **WHEN** `resolveSource` produces a registry `Source`
- **THEN** the result has `type: "registry"`, `url`, `scopes` (from host config), `scope`, `name`, and `versionConstraint` (from parsed input)

### Requirement: Name resolution through lockfile and configured skills

Bare name resolution (`my-skill`) SHALL follow a two-tier approach:

1. **Lockfile lookup**: Find the skill by name in the lockfile → resolve to `LocalSource` pointing to the installed directory
2. **Configured skills**: Find the skill in settings → recursively call `resolveSource()` on the configured source string

#### Scenario: Bare name found in lockfile

- **WHEN** `resolveSource("my-skill")` is called
- **AND** the lockfile contains an entry for `my-skill`
- **THEN** the result is a `LocalSource` pointing to the installed directory

#### Scenario: Bare name found in configured skills

- **WHEN** `resolveSource("my-skill")` is called
- **AND** the lockfile has no entry but settings has a configured skill source
- **THEN** `resolveSource` recursively resolves the configured source string

### Requirement: buildCloneUrl replaced by service method

`buildCloneUrl` SHALL be removed. Its functionality moves to `SourceHostProvidersService.cloneUrl()`, which accepts a `Source` and returns `Option<string>`. The standalone `clone-url.ts` file is eliminated.

#### Scenario: Clone URL uses source host URL

- **WHEN** `cloneUrl` is called with a `GitHubSource` where `url` is `URL("https://ghe.corp.com")`
- **THEN** the result is `Some("https://ghe.corp.com/owner/repo.git")`

#### Scenario: Azure Repos clone URL uses host URL

- **WHEN** `cloneUrl` is called with an `AzureReposSource` where `url` is `URL("https://dev.azure.com")`
- **THEN** the result is `Some("https://dev.azure.com/org/project/_git/repo")`

#### Scenario: Non-git source returns None

- **WHEN** `cloneUrl` is called with a `RegistrySource` or `LocalSource`
- **THEN** the result is `None`

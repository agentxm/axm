## MODIFIED Requirements

### Requirement: resolveSource combines parsing with config matching

`resolveSource(input: string)` SHALL classify the input string via `parseInputPattern`, then route the classified pattern to the appropriate resolution logic. For URL and SCP patterns, resolution SHALL iterate configured sources and match by hostname + provider parse. For other patterns (shorthand, file path, registry, name), resolution SHALL handle them directly.

The pipeline:

1. Classify input → `InputPattern` via `parseInputPattern` (pure, no config)
2. Match on pattern tag (`UrlInput`, `GitScpAddress`, `ShorthandInput`, `FilePathPattern`, `RegistryPatternInput`, `NameInput`, `SlashPattern`)
3. For `UrlInput` and `GitScpAddress`: iterate configured sources, match hostname, parse with provider, merge config → `Source`
4. For `ShorthandInput`: dispatch to provider shorthand parser, then find matching config
5. For `FilePathPattern`, `RegistryPatternInput`, `NameInput`: resolve directly (no config matching needed for self-describing types)

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

## REMOVED Requirements

### Requirement: Single config fallback

**Reason**: Subsumed by the unified routing mechanism. For shorthand inputs, the first config of that type is selected (per "Multi-config matching by shorthand prefix"). For URL/SCP inputs, hostname matching is always used — there is no separate "single config regardless of pattern" behavior. With built-in defaults, a config always exists for canonical hostnames.

**Migration**: Shorthand inputs continue to select the first config of that type. URL/SCP inputs require the config's hostname to match the input hostname.

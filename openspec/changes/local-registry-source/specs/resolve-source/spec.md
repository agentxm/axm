## MODIFIED Requirements

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

### Requirement: RegistrySource type simplification

`RegistrySource` SHALL be defined as `RegistrySourceInput` (carrying `type`, `scope`, and `name`) without intersecting `RegistrySourceConfig`. The registry meta-provider handles config lookup internally.

#### Scenario: RegistrySource carries extension coordinates only

- **WHEN** `resolveSource` produces a registry `Source`
- **THEN** the result has `type: "registry"`, `scope`, and `name` (extension name)
- **AND** the result does NOT have `url` or `scopes` config fields

## Requirements

### Requirement: Source string format

Source strings SHALL follow these formats:

| Source   | Format                                 | Examples                                         |
| -------- | -------------------------------------- | ------------------------------------------------ |
| registry | `@scope/name` or `@scope/name@version` | `@acme/my-skill`, `@acme/my-skill@1.0.0`         |
| github   | `github:owner/repo[/path][#ref]`       | `github:acme/skills`, `github:acme/repo/path#v1` |
| git      | `git:url[#ref]`                        | `git:https://example.com/repo.git#main`          |
| local    | bare path (no prefix)                  | `./skills`, `~/my-skills`, `/absolute/path`      |
| local    | `file://` URL                          | `file:///absolute/path/to/skill`                 |

Bare paths starting with `./`, `../`, `/`, `~/`, or Windows drive letters (e.g., `C:\`) are recognized as local sources and stored as-is (not normalized with a prefix).

`file://` URLs SHALL be classified as local file paths by extracting the URL pathname. They are handled at the input classification layer and never reach URL-based source routing.

The `~` prefix represents the user's home directory and is expanded at resolution time.

The registry source string no longer carries location information — `url` and `scopes` are resolved from the `RegistrySourceHost` (via `SourceHostConfig` in settings) instead of being absent from the resolved `Source`.

HTTPS and SSH URLs (e.g., `https://github.com/owner/repo`, `git@github.com:owner/repo.git`) are classified as URL or SCP patterns by `parseInputPattern` but are NOT resolved to a specific source type at classification time. Source type determination for URLs and SCPs happens in `resolveSource` via config-driven hostname matching.

The `RegistrySourceParams.scope` field SHALL always be `@`-prefixed (e.g., `"@acme"`, not `"acme"`). The parser SHALL preserve the `@` prefix from the input pattern. No downstream normalization SHALL be required.

#### Scenario: Registry source string

- **WHEN** parsing source string `@acme/my-skill@^1.0.0`
- **THEN** source type is `registry` with scope `@acme`, name `my-skill`, versionConstraint `^1.0.0`

#### Scenario: Registry source scope is @-prefixed

- **WHEN** parsing source string `@community/my-skill`
- **THEN** the `RegistrySourceParams` has `scope: "@community"` (not `"community"`)

#### Scenario: Registry source resolves host from config

- **WHEN** a `RegistrySource` is fully resolved
- **THEN** it has `url` and `scopes` from the matched `RegistrySourceHost` config, plus `scope`, `name`, and `versionConstraint` from parsed params

#### Scenario: GitHub source string with path and ref

- **WHEN** parsing source string `github:wayne-industries/skills/batcave#main`
- **THEN** source type is `github` with owner `wayne-industries`, repo `skills`, path `batcave`, ref `main`

#### Scenario: Git source string

- **WHEN** parsing source string `git:https://example.com/repo.git#v2.0.0`
- **THEN** source type is `git` with url `https://example.com/repo.git`, ref `v2.0.0`

#### Scenario: Local source string stored without prefix

- **WHEN** installing a skill from local path `./my-skills/dev-skill`
- **THEN** settings records `./my-skills/dev-skill` (not `local:./my-skills/dev-skill`)

#### Scenario: Local source string with absolute path

- **WHEN** installing a skill from local path `/Users/dev/skills`
- **THEN** settings records `/Users/dev/skills`

#### Scenario: Local source string with home directory

- **WHEN** parsing source string `~/path/to/skill`
- **THEN** source type is `local` with path containing `~` (expanded at resolution time)

#### Scenario: file:// URL classified as local path

- **WHEN** parsing source string `file:///Users/dev/skills/my-skill`
- **THEN** the input is classified as a file path with path `/Users/dev/skills/my-skill`
- **AND** it resolves as a local source

#### Scenario: HTTPS URL classified as UrlInput

- **WHEN** classifying input `https://github.com/owner/repo`
- **THEN** the input is classified as `UrlInput` (not resolved to a source type)
- **AND** source type determination happens in `resolveSource` via config matching

#### Scenario: SCP address classified as GitScpAddress

- **WHEN** classifying input `git@github.com:owner/repo.git`
- **THEN** the input is classified as `GitScpAddress` (not resolved to a source type)
- **AND** source type determination happens in `resolveSource` via config matching

### Requirement: Source configuration schema

Settings SHALL use a `sources` array of named entries. Each entry is a `SourceHostConfig` — the settings `name` wrapping a `ConfiguredSourceHost`. The on-disk format is unchanged. `SourceConfig` is renamed to `SourceHostConfig`.

`SourceHostConfig` is defined in `settings/schema.ts` and wraps `ConfiguredSourceHost` (from `sources/types.ts`) with a user-assigned `name` label.

Supported config types: `github`, `gitlab`, `bitbucket`, `azurerepos`, `registry`. Self-describing types (`git`, `local`, `builtin`) do not appear in settings.

#### Scenario: Array replaces object

- **WHEN** settings has `"sources": [{ "name": "local", "type": "registry", "url": "file:///path/to/registry" }]`
- **THEN** the sources are parsed as a `SourceHostConfig` array

#### Scenario: Git and local sources not in config

- **WHEN** the sources array is configured
- **THEN** `git`, `local`, and `builtin` source types do not appear (coordinates come from the source string)

#### Scenario: Config name stays in settings layer

- **WHEN** a `SourceHostConfig` is created
- **THEN** `name` is a settings concern — it does NOT appear on the domain `SourceHost` type

### Requirement: Registry SourceHost schema with scopes

The `RegistrySourceHostConfig` schema SHALL encode/decode registry scopes using `Schema.optionFromNullishOr`. The on-disk format is unchanged — `scopes` remains an optional JSON array. The schema handles `undefined | string[] ↔ Option<ReadonlyArray<string>>` conversion.

#### Scenario: Registry config with scopes

- **WHEN** settings JSON has `{ "name": "corp", "type": "registry", "url": "https://registry.corp.com", "scopes": ["@corp"] }`
- **THEN** the decoded `RegistrySourceHost` has `scopes: Some(["@corp"])`

#### Scenario: Registry config without scopes

- **WHEN** settings JSON has `{ "name": "public", "type": "registry", "url": "https://registry.example.com" }`
- **THEN** the decoded `RegistrySourceHost` has `scopes: None`

#### Scenario: URL fields decoded as URL objects

- **WHEN** a `SourceHostConfig` is decoded from settings JSON
- **THEN** the `url` field is a `URL` object (decoded from string via `Schema.URL` or `Schema.transform`)

### Requirement: Scope field in settings

Settings SHALL support a top-level `scope` field providing the default scope for extension identity.

#### Scenario: Scope used by fork and publish

- **WHEN** settings has `"scope": "@acme"`
- **THEN** `getScope()` returns `"@acme"` without prompting

### Requirement: Print source input canonical string

`printSourceInput` SHALL be replaced by `SourceHostProvidersService.origin()`. The service method SHALL accept a `Source` and return a human-readable canonical string for all 8 source types.

| Source     | Origin format                                           | Example                           |
| ---------- | ------------------------------------------------------- | --------------------------------- |
| github     | `github:<owner>/<repo>[/<subPath>][@<ref>]`             | `github:acme/skills/batcave@main` |
| gitlab     | `gitlab:<owner>/<repo>[/<subPath>][@<ref>]`             | `gitlab:acme/skills@v2`           |
| bitbucket  | `bitbucket:<owner>/<repo>[/<subPath>][@<ref>]`          | `bitbucket:acme/repo`             |
| azurerepos | `azurerepos:<org>/<project>/<repo>[/<subPath>][@<ref>]` | `azurerepos:acme/proj/repo@main`  |
| git        | URL href                                                | `https://example.com/repo.git`    |
| registry   | `<scope>/<name>`                                        | `@acme/my-skill`                  |
| local      | path as-is                                              | `./my-skills/dev-skill`           |
| builtin    | `builtin`                                               | `builtin`                         |

#### Scenario: Origin for GitHub source

- **WHEN** `origin` is called with a `GitHubSource` with owner `acme`, repo `skills`, subPath `batcave`, ref `main`
- **THEN** the result is `github:acme/skills/batcave@main`

#### Scenario: Origin for registry source

- **WHEN** `origin` is called with a `RegistrySource` with scope `@acme` and name `my-skill`
- **THEN** the result is `@acme/my-skill`

#### Scenario: Origin for builtin source

- **WHEN** `origin` is called with a `BuiltinSource`
- **THEN** the result is `builtin`

### Requirement: No Source re-export from resolution module

The `resolution` module SHALL NOT re-export `SourceType` as `Source`. Consumers that need `SourceType` SHALL import it from `sources/`.

#### Scenario: Resolution types do not alias Source

- **WHEN** inspecting `resolution/types.ts` exports
- **THEN** there is no `Source` type export

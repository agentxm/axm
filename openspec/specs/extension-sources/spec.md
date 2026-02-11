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

The registry source string no longer carries location information — location is resolved from `SourceConfig` (named source configuration). The parser returns `{ source: "registry" }` without `url` or `path` fields.

HTTPS and SSH URLs (e.g., `https://github.com/owner/repo`, `git@github.com:owner/repo.git`) are classified as URL or SCP patterns by `parseInputPattern` but are NOT resolved to a specific source type at classification time. Source type determination for URLs and SCPs happens in `resolveSource` via config-driven hostname matching.

#### Scenario: Registry source string

- **WHEN** parsing source string `@acme/my-skill@^1.0.0`
- **THEN** source type is `registry` with scope `@acme`, name `my-skill`, version `^1.0.0`

#### Scenario: Registry source has no location fields

- **WHEN** parsing source string `@acme/my-skill`
- **THEN** the result is `{ source: "registry" }` (no `url` or `path` — location comes from SourceConfig)

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

Settings SHALL use a `sources` array of named entries replacing the current per-provider-key object. Each entry is a `SourceConfig` discriminated by `source` field.

#### Scenario: Array replaces object

- **WHEN** settings has `"sources": [{ "name": "local", "source": "registry", "location": "~/registry" }]`
- **THEN** the sources are parsed as a `SourceConfig` array

#### Scenario: Git and local sources not in config

- **WHEN** the sources array is configured
- **THEN** `git` and `local` source types do not appear (URLs/paths come from the source string)

### Requirement: Scope field in settings

Settings SHALL support a top-level `scope` field providing the default scope for extension identity.

#### Scenario: Scope used by fork and publish

- **WHEN** settings has `"scope": "@acme"`
- **THEN** `getScope()` returns `"@acme"` without prompting

### Requirement: Print source input canonical string

`printSourceInput` SHALL accept a `SourceInput` and return a human-readable canonical string for all 7 source types.

| Source     | Print format                                            | Example                           |
| ---------- | ------------------------------------------------------- | --------------------------------- |
| github     | `github:<owner>/<repo>[/<subPath>][@<ref>]`             | `github:acme/skills/batcave@main` |
| gitlab     | `gitlab:<owner>/<repo>[/<subPath>][@<ref>]`             | `gitlab:acme/skills@v2`           |
| bitbucket  | `bitbucket:<owner>/<repo>[/<subPath>][@<ref>]`          | `bitbucket:acme/repo`             |
| azurerepos | `azurerepos:<org>/<project>/<repo>[/<subPath>][@<ref>]` | `azurerepos:acme/proj/repo@main`  |
| git        | URL href                                                | `https://example.com/repo.git`    |
| registry   | `@<scope>/<name>`                                       | `@acme/my-skill`                  |
| local      | path as-is                                              | `./my-skills/dev-skill`           |

#### Scenario: Print GitHub source input

- **WHEN** printing a GitHub source input with owner `acme`, repo `skills`, subPath `batcave`, ref `main`
- **THEN** the result is `github:acme/skills/batcave@main`

#### Scenario: Print GitHub source input without optional fields

- **WHEN** printing a GitHub source input with owner `acme`, repo `skills`, no subPath, no ref
- **THEN** the result is `github:acme/skills`

#### Scenario: Print git source input

- **WHEN** printing a git source input with url `https://example.com/repo.git`
- **THEN** the result is `https://example.com/repo.git`

#### Scenario: Print registry source input

- **WHEN** printing a registry source input with scope `acme` and name `my-skill`
- **THEN** the result is `@acme/my-skill`

#### Scenario: Print local source input

- **WHEN** printing a local source input with path `./my-skills/dev-skill`
- **THEN** the result is `./my-skills/dev-skill`

### Requirement: No Source re-export from resolution module

The `resolution` module SHALL NOT re-export `SourceType` as `Source`. Consumers that need `SourceType` SHALL import it from `sources/`.

#### Scenario: Resolution types do not alias Source

- **WHEN** inspecting `resolution/types.ts` exports
- **THEN** there is no `Source` type export

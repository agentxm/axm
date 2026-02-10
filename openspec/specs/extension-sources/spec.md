## Requirements

### Requirement: Source string format

Source strings SHALL follow these formats:

| Source   | Format                                 | Examples                                         |
| -------- | -------------------------------------- | ------------------------------------------------ |
| registry | `@scope/name` or `@scope/name@version` | `@acme/my-skill`, `@acme/my-skill@1.0.0`         |
| github   | `github:owner/repo[/path][#ref]`       | `github:acme/skills`, `github:acme/repo/path#v1` |
| git      | `git:url[#ref]`                        | `git:https://example.com/repo.git#main`          |
| local    | bare path (no prefix)                  | `./skills`, `~/my-skills`, `/absolute/path`      |

Bare paths starting with `./`, `../`, `/`, `~/`, or Windows drive letters (e.g., `C:\`) are recognized as local sources and stored as-is (not normalized with a prefix).

The `~` prefix represents the user's home directory and is expanded at resolution time.

The registry source string no longer carries location information — location is resolved from `SourceConfig` (named source configuration). The parser (`parseSourceInput`, renamed from `parseSource`) returns `{ source: "registry" }` without `url` or `path` fields.

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

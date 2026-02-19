## MODIFIED Requirements

### Requirement: Source string format

Source strings SHALL follow these formats:

| Source   | Format                                                                 | Examples                                              |
| -------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| registry | `@namespace/type-plural/name` or `@namespace/type-plural/name@version` | `@acme/skills/my-skill`, `@acme/packs/frontend@1.0.0` |
| github   | `github:owner/repo[/path][#ref]`                                       | `github:acme/skills`, `github:acme/repo/path#v1`      |
| git      | `git:url[#ref]`                                                        | `git:https://example.com/repo.git#main`               |
| local    | bare path (no prefix)                                                  | `./skills`, `~/my-skills`, `/absolute/path`           |
| local    | `file://` URL                                                          | `file:///absolute/path/to/skill`                      |

Bare paths starting with `./`, `../`, `/`, `~/`, or Windows drive letters (e.g., `C:\`) are recognized as local sources and stored as-is (not normalized with a prefix).

`file://` URLs SHALL be classified as local file paths by extracting the URL pathname. They are handled at the input classification layer and never reach URL-based source routing.

The `~` prefix represents the user's home directory and is expanded at resolution time.

The registry source string no longer carries location information — `url` and `namespaces` are resolved from the `RegistrySourceHost` (via `SourceHostConfig` in settings) instead of being absent from the resolved `Source`.

HTTPS and SSH URLs (e.g., `https://github.com/owner/repo`, `git@github.com:owner/repo.git`) are classified as URL or SCP patterns by `parseInputPattern` but are NOT resolved to a specific source type at classification time. Source type determination for URLs and SCPs happens in `resolveSource` via config-driven hostname matching.

The `RegistrySourceParams.namespace` field SHALL always be `@`-prefixed (e.g., `"@acme"`, not `"acme"`). The parser SHALL preserve the `@` prefix from the input pattern. No downstream normalization SHALL be required.

Registry source strings SHALL always include the type segment (`skills`, `packs`, or `mcp-servers`). The legacy two-segment format `@namespace/name` SHALL NOT be recognized as a registry pattern. Input matching this legacy format SHALL fall through to other pattern matchers (e.g., slash pattern for `owner/repo`).

#### Scenario: Registry source string with type segment

- **WHEN** parsing source string `@acme/skills/my-skill@^1.0.0`
- **THEN** source type is `registry` with namespace `@acme`, name `my-skill`, type `skills`, versionConstraint `^1.0.0`

#### Scenario: Registry source namespace is @-prefixed

- **WHEN** parsing source string `@community/skills/my-skill`
- **THEN** the `RegistrySourceParams` has `namespace: "@community"` (not `"community"`)

#### Scenario: Registry source resolves host from config

- **WHEN** a `RegistrySource` is fully resolved
- **THEN** it has `url` and `namespaces` from the matched `RegistrySourceHost` config, plus `namespace`, `name`, and `versionConstraint` from parsed params

#### Scenario: Registry namespace-only pattern

- **WHEN** parsing source string `@acme`
- **THEN** the result is a registry pattern with namespace `@acme`, type `None`, name `None`

#### Scenario: Registry namespace+type pattern

- **WHEN** parsing source string `@acme/skills`
- **THEN** the result is a registry pattern with namespace `@acme`, type `Some("skills")`, name `None`

#### Scenario: Two-segment input not recognized as registry

- **WHEN** parsing source string `@acme/my-skill` (no type segment)
- **THEN** the input SHALL NOT be classified as a registry pattern
- **AND** SHALL fall through to other pattern matchers

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

### Requirement: Print source input canonical string

`printSourceInput` SHALL be replaced by `SourceHostProvidersService.origin()`. The service method SHALL accept a `Source` and return a human-readable canonical string for all 8 source types.

| Source     | Origin format                                           | Example                           |
| ---------- | ------------------------------------------------------- | --------------------------------- |
| github     | `github:<owner>/<repo>[/<subPath>][@<ref>]`             | `github:acme/skills/batcave@main` |
| gitlab     | `gitlab:<owner>/<repo>[/<subPath>][@<ref>]`             | `gitlab:acme/skills@v2`           |
| bitbucket  | `bitbucket:<owner>/<repo>[/<subPath>][@<ref>]`          | `bitbucket:acme/repo`             |
| azurerepos | `azurerepos:<org>/<project>/<repo>[/<subPath>][@<ref>]` | `azurerepos:acme/proj/repo@main`  |
| git        | URL href                                                | `https://example.com/repo.git`    |
| registry   | `<namespace>/<type-plural>/<name>`                      | `@acme/skills/my-skill`           |
| local      | path as-is                                              | `./my-skills/dev-skill`           |
| builtin    | `builtin`                                               | `builtin`                         |

#### Scenario: Origin for GitHub source

- **WHEN** `origin` is called with a `GitHubSource` with owner `acme`, repo `skills`, subPath `batcave`, ref `main`
- **THEN** the result is `github:acme/skills/batcave@main`

#### Scenario: Origin for registry source

- **WHEN** `origin` is called with a `RegistrySource` with namespace `@acme`, type `skills`, and name `my-skill`
- **THEN** the result is `@acme/skills/my-skill`

#### Scenario: Origin for builtin source

- **WHEN** `origin` is called with a `BuiltinSource`
- **THEN** the result is `builtin`

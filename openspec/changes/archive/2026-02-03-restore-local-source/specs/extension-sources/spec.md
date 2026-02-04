## MODIFIED Requirements

### Requirement: Source string format

Source strings SHALL follow these formats:

| Source   | Format                                 | Examples                                         |
| -------- | -------------------------------------- | ------------------------------------------------ |
| registry | `@scope/name` or `@scope/name@version` | `@acme/my-skill`, `@acme/my-skill@1.0.0`         |
| github   | `github:owner/repo[/path][#ref]`       | `github:acme/skills`, `github:acme/repo/path#v1` |
| git      | `git:url[#ref]`                        | `git:https://example.com/repo.git#main`          |
| local    | `local:path` or bare path              | `local:./skills`, `~/my-skills`, `./dev-skill`   |

Bare paths starting with `./`, `../`, `/`, `~/`, or Windows drive letters (e.g., `C:\`) are recognized as local sources and normalized to `local:path` format internally.

The `~` prefix represents the user's home directory and is expanded at resolution time.

#### Scenario: Registry source string

- **WHEN** parsing source string `@acme/my-skill@^1.0.0`
- **THEN** source type is `registry` with scope `@acme`, name `my-skill`, version `^1.0.0`

#### Scenario: GitHub source string with path and ref

- **WHEN** parsing source string `github:wayne-industries/skills/batcave#main`
- **THEN** source type is `github` with owner `wayne-industries`, repo `skills`, path `batcave`, ref `main`

#### Scenario: Git source string

- **WHEN** parsing source string `git:https://example.com/repo.git#v2.0.0`
- **THEN** source type is `git` with url `https://example.com/repo.git`, ref `v2.0.0`

#### Scenario: Local source string with explicit prefix

- **WHEN** parsing source string `local:./my-skills/dev-skill`
- **THEN** source type is `local` with path `./my-skills/dev-skill`

#### Scenario: Local source string with bare path

- **WHEN** parsing source string `~/my-skills/dev-skill`
- **THEN** source type is `local` with path `~/my-skills/dev-skill`

#### Scenario: Local source string with home directory

- **WHEN** parsing source string `~/path/to/skill`
- **THEN** source type is `local` with path containing `~` (expanded at resolution time)

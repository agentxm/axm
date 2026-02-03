### Requirement: Source type schema

The `SourceSchema` SHALL define the canonical source types as a literal union:

- `"github"` - GitHub repository source
- `"git"` - Generic git repository source
- `"local"` - Local filesystem source
- `"registry"` - Package registry source

#### Scenario: Valid source types

- **WHEN** validating source type `"github"`
- **THEN** validation succeeds

#### Scenario: Invalid source type

- **WHEN** validating source type `"invalid"`
- **THEN** validation fails with error indicating invalid literal

### Requirement: Source string format

Source strings SHALL follow these formats:

| Source   | Format                                 | Examples                                         |
| -------- | -------------------------------------- | ------------------------------------------------ |
| registry | `@scope/name` or `@scope/name@version` | `@acme/my-skill`, `@acme/my-skill@1.0.0`         |
| github   | `github:owner/repo[/path][#ref]`       | `github:acme/skills`, `github:acme/repo/path#v1` |
| git      | `git:url[#ref]`                        | `git:https://example.com/repo.git#main`          |
| local    | `local:path`                           | `local:./my-skills/foo`, `local:/abs/path`       |

#### Scenario: Registry source string

- **WHEN** parsing source string `@acme/my-skill@^1.0.0`
- **THEN** source type is `registry` with scope `@acme`, name `my-skill`, version `^1.0.0`

#### Scenario: GitHub source string with path and ref

- **WHEN** parsing source string `github:wayne-industries/skills/batcave#main`
- **THEN** source type is `github` with owner `wayne-industries`, repo `skills`, path `batcave`, ref `main`

#### Scenario: Git source string

- **WHEN** parsing source string `git:https://example.com/repo.git#v2.0.0`
- **THEN** source type is `git` with url `https://example.com/repo.git`, ref `v2.0.0`

#### Scenario: Local source string

- **WHEN** parsing source string `local:./my-skills/dev-skill`
- **THEN** source type is `local` with path `./my-skills/dev-skill`

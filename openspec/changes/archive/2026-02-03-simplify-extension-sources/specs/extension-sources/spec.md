## MODIFIED Requirements

### Requirement: Source type schema

The `SourceSchema` SHALL define the canonical source types as a literal union:

- `"github"` - GitHub repository source
- `"gitlab"` - GitLab repository source
- `"bitbucket"` - Bitbucket repository source
- `"git"` - Generic git repository source
- `"registry"` - Package registry source

#### Scenario: Valid source types

- **WHEN** validating source type `"github"`
- **THEN** validation succeeds

#### Scenario: Valid GitLab source type

- **WHEN** validating source type `"gitlab"`
- **THEN** validation succeeds

#### Scenario: Valid Bitbucket source type

- **WHEN** validating source type `"bitbucket"`
- **THEN** validation succeeds

#### Scenario: Invalid source type

- **WHEN** validating source type `"invalid"`
- **THEN** validation fails with error indicating invalid literal

#### Scenario: Removed local source type

- **WHEN** validating source type `"local"`
- **THEN** validation fails with error indicating invalid literal

### Requirement: Source string format

Source strings SHALL follow these formats:

| Source    | Format                                 | Examples                                         |
| --------- | -------------------------------------- | ------------------------------------------------ |
| registry  | `@scope/name` or `@scope/name@version` | `@acme/my-skill`, `@acme/my-skill@1.0.0`         |
| github    | `github:owner/repo[/path][@ref]`       | `github:acme/skills`, `github:acme/repo/path@v1` |
| gitlab    | `gitlab:owner/repo[/path][@ref]`       | `gitlab:acme/skills`, `gitlab:acme/repo/path@v1` |
| bitbucket | `bitbucket:owner/repo[/path][@ref]`    | `bitbucket:acme/skills@main`                     |
| git       | `git:url[#ref]`                        | `git:https://example.com/repo.git#main`          |

#### Scenario: Registry source string

- **WHEN** parsing source string `@acme/my-skill@^1.0.0`
- **THEN** source type is `registry` with scope `@acme`, name `my-skill`, version `^1.0.0`

#### Scenario: GitHub source string with path and ref

- **WHEN** parsing source string `github:wayne-industries/skills/batcave@main`
- **THEN** source type is `github` with owner `wayne-industries`, repo `skills`, path `batcave`, ref `main`

#### Scenario: GitLab source string with path and ref

- **WHEN** parsing source string `gitlab:wayne-industries/skills/batcave@main`
- **THEN** source type is `gitlab` with owner `wayne-industries`, repo `skills`, path `batcave`, ref `main`

#### Scenario: Bitbucket source string with ref

- **WHEN** parsing source string `bitbucket:wayne-industries/skills@main`
- **THEN** source type is `bitbucket` with owner `wayne-industries`, repo `skills`, ref `main`

#### Scenario: Git source string

- **WHEN** parsing source string `git:https://example.com/repo.git#v2.0.0`
- **THEN** source type is `git` with url `https://example.com/repo.git`, ref `v2.0.0`

#### Scenario: Local source string rejected

- **WHEN** parsing source string `local:./my-skills/dev-skill`
- **THEN** parsing fails with error indicating unrecognized source format

## REMOVED Requirements

### Requirement: Local source string

**Reason**: Local sources conflate installation with development workflows. Development will use different mechanisms.

**Migration**: Use git sources to reference extensions. For local development, use workspace linking (future feature).

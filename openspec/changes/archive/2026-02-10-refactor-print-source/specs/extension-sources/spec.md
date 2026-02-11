## ADDED Requirements

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

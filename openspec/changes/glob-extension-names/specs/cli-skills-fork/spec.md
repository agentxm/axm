## MODIFIED Requirements

### Requirement: Fork command accepts source and optional skill filter

The fork command SHALL accept a `<source>` positional argument that supports both source strings (same formats as install) and glob patterns. When the `<source>` value contains `*`, it SHALL be treated as a glob pattern and expanded against installed skill names from the lockfile. The optional `--skill` flag remains available for additional filtering.

#### Scenario: Fork from a source string

- **WHEN** running `axm skills fork github:owner/repo`
- **THEN** the handler SHALL parse the source string via `resolveSource`
- **AND** discover skills via `SourceProviders.resolveExtension()`
- **AND** fork all discovered skills

#### Scenario: Fork from a local path

- **WHEN** running `axm skills fork ./local/skills`
- **THEN** the handler SHALL parse `./local/skills` as a local source
- **AND** discover and fork skills from that directory

#### Scenario: Fork with skill filter

- **WHEN** running `axm skills fork github:owner/repo --skill "effect-*"`
- **THEN** the handler SHALL discover all skills from the source
- **AND** filter to only skills matching `effect-*`
- **AND** fork only the matched skills

#### Scenario: Fork with glob as positional argument

- **WHEN** running `axm skills fork "effect-*"`
- **AND** the lockfile contains skills `["effect-basics", "effect-stream", "effect-testing", "commit", "testing-unit"]`
- **THEN** the handler SHALL expand `"effect-*"` against all installed skill names
- **AND** resolve each matched name (`effect-basics`, `effect-stream`, `effect-testing`) via `resolveSource`
- **AND** discover and fork all matched skills

#### Scenario: Glob positional with no matches

- **WHEN** running `axm skills fork "nonexistent-*"`
- **AND** no installed skill names match the pattern
- **THEN** the command SHALL fail with a `NO_SKILLS_MATCHED` error
- **AND** the error SHALL list available installed skill names

#### Scenario: Glob positional combined with --skill filter

- **WHEN** running `axm skills fork "effect-*" --skill "effect-basics"`
- **AND** the lockfile contains `["effect-basics", "effect-stream", "effect-testing"]`
- **THEN** the handler SHALL first expand `"effect-*"` to `["effect-basics", "effect-stream", "effect-testing"]`
- **AND** then apply `--skill "effect-basics"` filter
- **AND** fork only `effect-basics`

### Requirement: Fork orchestration pipeline

The fork handler SHALL follow this pipeline. When the source is a glob pattern, the "parse source → discover" phase SHALL expand against the lockfile and resolve each match individually.

#### Scenario: Full fork pipeline with glob source

- **WHEN** running `axm skills fork "effect-*" --yes`
- **AND** the lockfile contains matching skills
- **THEN** the handler SHALL detect the glob pattern
- **AND** expand against installed skill names from the lockfile
- **AND** resolve each matched name to a local source via `resolveSource`
- **AND** discover skills at each resolved source concurrently
- **AND** merge all discovered skills into a single list
- **AND** ensure a registry is configured
- **AND** resolve the user's scope
- **AND** build a plan with fork + publish + install steps for each skill
- **AND** resolve the plan (display, confirm, apply)

#### Scenario: Full fork pipeline with source string

- **WHEN** running `axm skills fork github:owner/repo --skill "effect-*" --yes`
- **THEN** the handler SHALL parse the source
- **AND** ensure a registry is configured
- **AND** resolve the user's scope
- **AND** discover skills from the source
- **AND** filter to skills matching `effect-*`
- **AND** build a plan with fork + publish steps for each matched skill
- **AND** resolve the plan (display, confirm, apply)

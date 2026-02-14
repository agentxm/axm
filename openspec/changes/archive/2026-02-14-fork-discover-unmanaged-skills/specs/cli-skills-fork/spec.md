## MODIFIED Requirements

### Requirement: Fork command accepts source and optional skill filter

The fork command SHALL accept a `<source>` positional argument that supports both source strings (same formats as install) and glob patterns. When the `<source>` value contains `*`, it SHALL be treated as a glob pattern and expanded against a combined local skill candidate set. The optional `--skill` flag remains available for additional filtering.

The combined local candidate set SHALL include:

- installed skill names from lockfile
- configured skill names from settings (including unmanaged entries)
- unmanaged on-disk skill names under configured agent skill directories

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
- **AND** the combined local candidate set contains `effect-basics`, `effect-errors`, `effect-stream`
- **THEN** the handler SHALL expand `"effect-*"` against that full candidate set
- **AND** resolve each matched name for discovery
- **AND** discover and fork all matched skills

#### Scenario: Glob positional with no matches

- **WHEN** running `axm skills fork "nonexistent-*"`
- **AND** no local candidate names match the pattern
- **THEN** the command SHALL fail with a `NO_SKILLS_MATCHED` error
- **AND** the error SHALL list available names from the combined local candidate set

#### Scenario: Glob positional combined with --skill filter

- **WHEN** running `axm skills fork "effect-*" --skill "effect-basics"`
- **AND** the combined candidate set contains `effect-basics`, `effect-stream`, `effect-testing`
- **THEN** the handler SHALL first expand `"effect-*"` to all three matches
- **AND** then apply `--skill "effect-basics"` filter
- **AND** fork only `effect-basics`

### Requirement: Fork orchestration pipeline

The fork handler SHALL follow this pipeline: registry guard -> resolve scope -> discover skills -> filter by --skill -> build fork+publish+install plan -> resolve plan.

When the source is a glob pattern, the discover phase SHALL:

- collect the combined local candidate set
- expand the glob against that set
- resolve each match and discover skill references
- merge discovered skills into a single deduplicated list

#### Scenario: Full fork pipeline with glob source

- **WHEN** running `axm skills fork "effect-*" --yes`
- **AND** the combined local candidate set contains matching names
- **THEN** the handler SHALL detect the glob pattern
- **AND** expand against the combined local candidate set
- **AND** resolve each matched name
- **AND** discover skills for each match
- **AND** merge and dedupe discovered skills
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
- **AND** build a plan with fork + publish + install steps for each matched skill
- **AND** resolve the plan (display, confirm, apply)

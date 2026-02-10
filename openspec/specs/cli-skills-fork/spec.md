## Requirements

### Requirement: Fork command accepts source and optional skill filter

The fork command SHALL accept a `<source>` positional argument (same formats as install) and an optional `--skill` flag for name filtering. The `<source>` positional SHALL NOT accept glob patterns directly.

#### Scenario: Fork from a source string

- **WHEN** running `axm skills fork github:owner/repo`
- **THEN** the handler SHALL parse the source string via `determineSourceInput`
- **AND** discover skills via `SourceProviders.resolve()`
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

### Requirement: Fork resolves installed skill names via source parsing

When the `<source>` argument is a bare name (e.g. `my-skill`), `determineSourceInput` SHALL resolve it against the lockfile to determine the installed location and treat it as a local source.

#### Scenario: Fork an installed skill by name

- **WHEN** running `axm skills fork my-skill`
- **AND** `my-skill` exists in the lockfile
- **THEN** `determineSourceInput` SHALL resolve `my-skill` to a local source pointing at the installed location
- **AND** the fork handler SHALL discover and fork from that location

#### Scenario: Fork a non-existent skill name

- **WHEN** running `axm skills fork nonexistent`
- **AND** `nonexistent` is not in the lockfile
- **AND** `nonexistent` does not match any other source format
- **THEN** the command SHALL fail with an error indicating the skill was not found
- **AND** the error SHALL suggest checking `axm skills list`

### Requirement: Fork uses shared source resolution with install

The fork handler SHALL use `determineSourceInput` and `SourceProviders.resolve()` for source resolution — the same path used by the install handler. The fork handler SHALL NOT implement its own source resolution logic.

#### Scenario: Fork handler uses determineSourceInput

- **WHEN** the fork handler receives a source argument
- **THEN** it SHALL call `determineSourceInput(source)` to parse the source
- **AND** it SHALL call `SourceProviders.resolve()` to discover skills
- **AND** it SHALL NOT contain inline lockfile lookups for source resolution

### Requirement: Fork command includes --skill flag

The fork command SHALL accept a `--skill` option identical to the install command's `--skill` option. It SHALL accept an array of strings, each of which may be an exact name or a glob pattern.

#### Scenario: Fork command --skill flag definition

- **WHEN** the fork command is defined
- **THEN** it SHALL include a `--skill` option of type `string[]`
- **AND** the option SHALL default to an empty array
- **AND** the option description SHALL indicate it accepts skill names or glob patterns

### Requirement: Fork orchestration pipeline

The fork handler SHALL follow this pipeline: parse source → registry guard → resolve scope → discover skills → filter by --skill → build fork+publish plan → resolve plan → update lockfile + create symlinks.

#### Scenario: Full fork pipeline with filtering

- **WHEN** running `axm skills fork github:owner/repo --skill "effect-*" --yes`
- **THEN** the handler SHALL parse the source
- **AND** ensure a registry is configured
- **AND** resolve the user's scope
- **AND** discover skills from the source
- **AND** filter to skills matching `effect-*`
- **AND** build a plan with fork + publish steps for each matched skill
- **AND** resolve the plan (display, confirm, apply)
- **AND** update the lockfile and create agent symlinks for each forked skill

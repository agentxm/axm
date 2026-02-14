## MODIFIED Requirements

### Requirement: Fork command input

`skills fork` SHALL accept a skill reference as input: an installed skill name, a source string, or a glob pattern.

#### Scenario: Fork by installed skill name

- **WHEN** `skills fork frontend-design` is called and `frontend-design` is in the lockfile
- **THEN** the skill's files are read from the current canonical location

#### Scenario: Fork by source string

- **WHEN** `skills fork github:owner/repo` is called
- **THEN** the source is resolved using the same discovery pipeline as `skills install`

#### Scenario: Fork by glob pattern

- **WHEN** `skills fork "effect-*"` is called
- **THEN** local skills matching the glob are identified from the combined candidate set
- **AND** a plan with fork operations for each match is built

### Requirement: Glob-based batch forking

When the input is a glob pattern, the handler SHALL match against a combined local candidate set and build a plan for all matches. The candidate set SHALL include:

- installed skill names from lockfile
- configured skill names from settings (including unmanaged entries)
- unmanaged skill names discovered on disk under configured agent skill directories

#### Scenario: Multiple matches across sources

- **WHEN** `skills fork "effect-*"` is called
- **AND** lockfile contains `effect-basics`
- **AND** settings contains unmanaged `effect-errors`
- **AND** an unmanaged on-disk skill `effect-streams` exists in a configured agent skills directory
- **THEN** the command SHALL match all three names
- **AND** the plan contains fork operations for all matched skills

#### Scenario: Dedupe across discovery sources

- **WHEN** `skills fork "effect-*"` is called
- **AND** `effect-basics` exists in both lockfile and settings candidate sources
- **THEN** `effect-basics` SHALL appear only once in the matched skill set
- **AND** the fork plan SHALL include a single fork sequence for `effect-basics`

#### Scenario: Full plan displayed for confirmation

- **WHEN** a glob matches multiple skills
- **THEN** the full plan (all matched skills) is displayed for user confirmation before execution

#### Scenario: No matches

- **WHEN** `skills fork "nonexistent-*"` is called and no local candidates match
- **THEN** the command reports no matching skills and exits
- **AND** the error output SHALL include available names from the combined local candidate set

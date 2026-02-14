# source-aware-glob Specification

## Purpose

Define shared glob-matching behavior for skill-name filtering used by install and fork flows.

## Requirements

### Requirement: Filter discovered skills by glob pattern

After skills are discovered from a source via `SourceProviders.resolve()`, the handler SHALL apply glob filtering to the discovered skill names using `expandGlob`. The filtering SHALL occur before skill selection or plan building.

#### Scenario: Glob filters discovered skills from a source

- **WHEN** `SourceProviders.resolve()` discovers skills `["effect-basics", "effect-stream", "testing-unit", "commit"]` from a source
- **AND** the `--skill` flag contains `"effect-*"`
- **THEN** only `["effect-basics", "effect-stream"]` SHALL be passed to skill selection

#### Scenario: Multiple skill patterns combine matches

- **WHEN** `SourceProviders.resolve()` discovers skills `["effect-basics", "effect-stream", "testing-unit", "commit"]`
- **AND** the `--skill` flag contains `["effect-*", "commit"]`
- **THEN** `["effect-basics", "effect-stream", "commit"]` SHALL be passed to skill selection

#### Scenario: No glob matches produces error

- **WHEN** `SourceProviders.resolve()` discovers skills `["testing-unit", "commit"]`
- **AND** the `--skill` flag contains `"effect-*"`
- **THEN** the command SHALL fail with an error indicating no skills matched the pattern
- **AND** the error SHALL list the available skill names from the source

### Requirement: Glob and exact name patterns coexist in --skill

The `--skill` flag SHALL accept both exact names and glob patterns. A value containing `*` SHALL be treated as a glob pattern. A value without `*` SHALL be treated as an exact name match.

#### Scenario: Mix of exact names and glob patterns

- **WHEN** `--skill` contains `["effect-*", "commit"]`
- **AND** discovered skills are `["effect-basics", "effect-stream", "commit", "testing-unit"]`
- **THEN** matched skills SHALL be `["effect-basics", "effect-stream", "commit"]`

#### Scenario: Exact name not found among discovered skills

- **WHEN** `--skill` contains `["nonexistent"]`
- **AND** discovered skills are `["effect-basics", "commit"]`
- **THEN** the command SHALL fail with an error indicating the skill was not found
- **AND** the error SHALL list available skill names

### Requirement: Glob filtering applies to both install and fork

Both the install handler and fork handler SHALL use the same glob filtering logic after source discovery. The filtering SHALL use `expandGlob` from the shared skill-name-glob module. Additionally, the fork handler SHALL use `isGlobPattern` and `expandGlobs` for positional argument glob expansion before source resolution.

#### Scenario: Install with glob filter

- **WHEN** running `axm skills install github:owner/repo --skill "effect-*"`
- **THEN** skills SHALL be discovered from the GitHub source
- **AND** only skills matching `effect-*` SHALL be presented for installation

#### Scenario: Fork with glob filter

- **WHEN** running `axm skills fork github:owner/repo --skill "effect-*"`
- **THEN** skills SHALL be discovered from the GitHub source
- **AND** only skills matching `effect-*` SHALL be forked

#### Scenario: Fork with glob as positional source

- **WHEN** running `axm skills fork "effect-*"`
- **THEN** `isGlobPattern` SHALL detect the glob
- **AND** `expandGlobs` SHALL expand against lockfile skill names
- **AND** each matched name SHALL be resolved and forked

### Requirement: Glob pattern detection utility

The shared skill-name-glob module SHALL export an `isGlobPattern` predicate that returns `true` when an input string contains `*`.

#### Scenario: Input with wildcard detected as glob

- **WHEN** `isGlobPattern` is called with `"effect-*"`
- **THEN** it SHALL return `true`

#### Scenario: Input without wildcard is not a glob

- **WHEN** `isGlobPattern` is called with `"effect-basics"`
- **THEN** it SHALL return `false`

#### Scenario: Standalone wildcard detected as glob

- **WHEN** `isGlobPattern` is called with `"*"`
- **THEN** it SHALL return `true`

### Requirement: Positional argument glob expansion against lockfile

When a command's positional name argument contains `*`, the handler SHALL expand it against installed skill names from the lockfile using `expandGlobs`. This expansion occurs before source resolution — matched names are then resolved individually via `resolveSource`.

#### Scenario: Glob expands against lockfile names

- **WHEN** a positional argument is `"effect-*"`
- **AND** the lockfile contains skills `["effect-basics", "effect-stream", "commit"]`
- **THEN** expansion SHALL produce `["effect-basics", "effect-stream"]`

#### Scenario: Non-glob passes through unchanged

- **WHEN** a positional argument is `"my-skill"` (no `*`)
- **THEN** it SHALL NOT be expanded against the lockfile
- **AND** it SHALL be passed directly to `resolveSource`

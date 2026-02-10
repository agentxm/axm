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

Both the install handler and fork handler SHALL use the same glob filtering logic after source discovery. The filtering SHALL use `expandGlob` from the shared skill-name-glob module.

#### Scenario: Install with glob filter

- **WHEN** running `axm skills install github:owner/repo --skill "effect-*"`
- **THEN** skills SHALL be discovered from the GitHub source
- **AND** only skills matching `effect-*` SHALL be presented for installation

#### Scenario: Fork with glob filter

- **WHEN** running `axm skills fork github:owner/repo --skill "effect-*"`
- **THEN** skills SHALL be discovered from the GitHub source
- **AND** only skills matching `effect-*` SHALL be forked

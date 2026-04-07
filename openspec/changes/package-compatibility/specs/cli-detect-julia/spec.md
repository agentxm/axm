## ADDED Requirements

### Requirement: Parse Project.toml for Julia dependencies

The Julia detector SHALL parse `Project.toml` in the project directory and extract dependencies from the `[deps]` section. Each dependency SHALL be converted to a `pkg:julia` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from deps section

- **WHEN** `Project.toml` contains `[deps]` with `JSON = "682c06a0-de6a-54ab-a142-c8b1cf79cde6"` and `HTTP = "cd3eb016-35fb-5094-929b-558a96fad6f3"`
- **THEN** the detector SHALL produce purls for `JSON` and `HTTP`

#### Scenario: Missing Project.toml

- **WHEN** the project directory does not contain a `Project.toml` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed Project.toml

- **WHEN** `Project.toml` contains invalid TOML
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No deps section

- **WHEN** `Project.toml` exists but contains no `[deps]` section
- **THEN** the detector SHALL return an empty array

### Requirement: All purls are versionless

Julia dependencies in `Project.toml` are identified by UUID, not version. The detector SHALL produce versionless purls for all dependencies.

#### Scenario: Dependency produces versionless purl

- **WHEN** `[deps]` contains `JSON = "682c06a0-de6a-54ab-a142-c8b1cf79cde6"`
- **THEN** the detector SHALL produce `pkg:julia/JSON` (versionless)

#### Scenario: Compat section does not add versions

- **WHEN** `Project.toml` contains `[deps]` with `JSON = "682c06a0-..."` and `[compat]` with `JSON = "0.21"`
- **THEN** the detector SHALL produce `pkg:julia/JSON` (versionless)
- **AND** the `[compat]` section SHALL NOT influence purl version

### Requirement: Compat section is informational only

The `[compat]` section specifies version bounds but SHALL NOT be used for dependency detection. Only the `[deps]` section determines which packages are dependencies.

#### Scenario: Package in compat but not deps

- **WHEN** `Project.toml` contains `[compat]` with `julia = "1.6"` but no `[deps]` section
- **THEN** the detector SHALL return an empty array
- **AND** no purl SHALL be produced from `[compat]` entries

#### Scenario: Compat entries for deps

- **WHEN** `Project.toml` contains `[deps]` with `HTTP = "cd3eb016-..."` and `[compat]` with `HTTP = "1.0"`
- **THEN** the detector SHALL produce a purl for `HTTP` from the `[deps]` section only

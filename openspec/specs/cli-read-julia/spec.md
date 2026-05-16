## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Julia packages

The Julia reader SHALL inspect `Project.toml` files at `~/.julia/packages/<pkg>/<hash>/Project.toml` for an `[axm]` custom section containing recommendation metadata. Julia's Project.toml supports arbitrary TOML sections. The `<hash>` directory requires scanning to find the correct version.

#### Scenario: Package with valid [axm] section

- **WHEN** `~/.julia/packages/DataFrames/abcde/Project.toml` contains `[axm]` with `extensions = [{ ref = "@julialang/skills/dataframes", versionRange = "^1.0.0" }]`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@julialang/skills/dataframes", "versionRange": "^1.0.0" }]`

#### Scenario: Package without [axm] section

- **WHEN** `~/.julia/packages/Plots/fghij/Project.toml` does not contain an `[axm]` section
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Hash directory scanned for correct version

- **WHEN** `~/.julia/packages/Flux/` contains multiple hash directories
- **THEN** the reader SHALL scan available hash directories to locate the matching version

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `[axm]` section contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed [axm] section warned and skipped

- **WHEN** `Project.toml` contains `[axm]` with `extensions = "not-an-array"`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `Project.toml` contains `[axm]` with `extensions` and `futureField`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Missing Julia packages directory handled gracefully

When the Julia packages directory does not exist or the specific package directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without Julia installed.

#### Scenario: Julia packages directory does not exist

- **WHEN** `~/.julia/packages/` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory absent from packages

- **WHEN** `~/.julia/packages/` exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

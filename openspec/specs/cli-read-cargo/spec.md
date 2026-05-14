## ADDED Requirements

### Requirement: Read axm recommendation metadata from `[package.metadata.axm]` in cached Cargo.toml

The Cargo reader SHALL inspect each detected Rust crate's cached `Cargo.toml` for axm recommendation data. For each detected crate, the reader SHALL parse the `[package.metadata.axm]` table from `$CARGO_HOME/registry/src/<index>/<crate>-<version>/Cargo.toml` and extract the `recommendedExtensions` array when present and valid. The `[package.metadata]` table is the standard Rust extensibility mechanism used by docs.rs, cargo-deb, cargo-bundle, and other ecosystem tools.

#### Scenario: Crate with valid `[package.metadata.axm]`

- **WHEN** the cached `Cargo.toml` for `serde@1.0.193` contains `[package.metadata.axm]\nrecommendedExtensions = ["@serde/skills/serde@^1.0.0"]`
- **THEN** the reader SHALL return the extension refs `["@serde/skills/serde@^1.0.0"]`

#### Scenario: Crate without `[package.metadata.axm]`

- **WHEN** the cached `Cargo.toml` for `tokio` has no `[package.metadata.axm]` table
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Crate with empty recommendedExtensions

- **WHEN** the cached `Cargo.toml` contains `[package.metadata.axm]\nrecommendedExtensions = []`
- **THEN** the reader SHALL return an empty array of recommendations

#### Scenario: Section parsing stops at the next table header

- **WHEN** `[package.metadata.axm]` is followed by another section such as `[package.metadata.docs.rs]`
- **THEN** the reader SHALL only read keys between the two headers and SHALL NOT treat keys under sibling `[package.metadata.*]` tables as part of `axm`

### Requirement: Locate cached Cargo.toml under `$CARGO_HOME`

The reader SHALL resolve `CARGO_HOME` (defaulting to `~/.cargo`) and read the crate's cached `Cargo.toml` at `<CARGO_HOME>/registry/src/<index>/<crate>-<version>/Cargo.toml`. When the detected purl has no version, the reader SHALL scan registry index directories for any directory whose name equals the crate name or begins with `<crate>-`.

#### Scenario: Exact-version purl

- **WHEN** the detected purl is `pkg:cargo/serde@1.0.193`
- **THEN** the reader SHALL look for `<CARGO_HOME>/registry/src/<index>/serde-1.0.193/Cargo.toml` across all index directories

#### Scenario: Versionless purl

- **WHEN** the detected purl is `pkg:cargo/serde` (no version)
- **THEN** the reader SHALL scan each index directory for an entry equal to `serde` or beginning with `serde-` and read its `Cargo.toml`

#### Scenario: Missing registry cache

- **WHEN** `<CARGO_HOME>/registry/src` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the extracted `axm` metadata object against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm metadata warned and skipped

- **WHEN** `[package.metadata.axm]` contains `recommendedExtensions = 42`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `[package.metadata.axm]` contains `recommendedExtensions = ["@acme/skills/foo@^1.0.0"]` and an additional unrecognized key
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

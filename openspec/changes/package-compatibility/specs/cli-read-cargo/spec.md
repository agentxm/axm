## ADDED Requirements

### Requirement: Read axm recommendation metadata from Rust crate metadata

The Cargo reader SHALL inspect Rust crate metadata for axm recommendation data. For each detected cargo package, the reader SHALL use `cargo metadata` JSON output to locate the `[package.metadata.axm]` section and extract the `recommendedExtensions` array when present and valid. The `[package.metadata]` table is the standard Rust extensibility mechanism used by docs.rs, cargo-deb, cargo-bundle, and other ecosystem tools.

#### Scenario: Crate with valid axm metadata section

- **WHEN** `cargo metadata` output for crate `serde` includes `"metadata": { "axm": { "recommendedExtensions": ["@serde/skills/serde@^1.0.0"] } }`
- **THEN** the reader SHALL return the extension refs `["@serde/skills/serde@^1.0.0"]`

#### Scenario: Crate without axm metadata section

- **WHEN** `cargo metadata` output for crate `tokio` has no `"axm"` key in its `"metadata"` field
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Crate with no metadata field at all

- **WHEN** `cargo metadata` output for crate `rand` has `"metadata": null`
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Crate with empty recommendedExtensions

- **WHEN** `cargo metadata` output for a crate includes `"metadata": { "axm": { "recommendedExtensions": [] } }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Use cargo metadata subprocess to locate package metadata

The reader SHALL invoke `cargo metadata --format-version 1` as a subprocess to obtain package metadata. The reader SHALL extract the `axm` key from the `metadata` field of the matching package in the JSON output.

#### Scenario: cargo metadata returns valid JSON

- **WHEN** `cargo metadata --format-version 1` succeeds
- **THEN** the reader SHALL parse the JSON output and locate the detected crate in the `packages` array

#### Scenario: cargo metadata invoked for workspace context

- **WHEN** the detected crate is a dependency in the current Cargo workspace
- **THEN** the reader SHALL use the `cargo metadata` output to locate metadata for that specific crate

### Requirement: Handle cargo unavailability gracefully

When the `cargo` binary is not available on PATH, the reader SHALL return no recommendations with a warning. This is the normal case for systems without the Rust toolchain installed.

#### Scenario: cargo not on PATH

- **WHEN** the `cargo` binary is not found on PATH
- **THEN** the reader SHALL log a warning that cargo is unavailable
- **AND** return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: cargo metadata command fails

- **WHEN** `cargo metadata` exits with a non-zero status
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Missing metadata section handled gracefully

When the package exists in `cargo metadata` output but has no `metadata` field or no `axm` key within metadata, the reader SHALL return no recommendations without raising an error.

#### Scenario: Package found but no metadata section

- **WHEN** the crate appears in `cargo metadata` output with no `metadata` field
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the extracted `axm` metadata object against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm metadata warned and skipped

- **WHEN** the `axm` metadata contains `{ "recommendedExtensions": "not-an-array" }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** the `axm` metadata contains `{ "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

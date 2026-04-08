## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Hex packages via sidecar

The Hex reader SHALL inspect `deps/<package-name>/axm.json` as the primary source for recommendation metadata. Hex packages install dependencies into `deps/` after `mix deps.get` or `gleam deps download`. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm.json sidecar

- **WHEN** `deps/phoenix/axm.json` contains `{ "recommendedExtensions": ["@phoenixframework/skills/phoenix@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@phoenixframework/skills/phoenix@^1.0.0"]`

#### Scenario: Package without axm.json sidecar

- **WHEN** `deps/ecto/` exists but contains no `axm.json`
- **THEN** the reader SHALL fall back to hex_metadata.config inspection

#### Scenario: Package with empty recommendedExtensions

- **WHEN** `deps/plug/axm.json` contains `{ "recommendedExtensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Fall back to hex_metadata.config extra field

When no `axm.json` sidecar is found, the reader SHALL parse `deps/<package-name>/hex_metadata.config` and extract the `axm` key from the `extra` field. The `extra` field in Hex metadata is specified but Hex API does not return it, so local inspection is the reliable path. The file uses Erlang term format.

#### Scenario: Metadata found in hex_metadata.config extra field

- **WHEN** `deps/jason/axm.json` does not exist
- **AND** `deps/jason/hex_metadata.config` contains an `extra` field with `axm` key holding `{ "recommendedExtensions": ["@hex/skills/jason@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@hex/skills/jason@^1.0.0"]`

#### Scenario: No metadata in either location

- **WHEN** `deps/telemetry/axm.json` does not exist
- **AND** `deps/telemetry/hex_metadata.config` has no `extra` field or no `axm` key within `extra`
- **THEN** the reader SHALL return no recommendations (Option.none)

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate metadata from either source against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed sidecar metadata warned and skipped

- **WHEN** `deps/some-lib/axm.json` contains `{ "recommendedExtensions": "not-an-array" }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `deps/some-lib/axm.json` contains `{ "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing deps directory handled gracefully

When the package is not installed (missing `deps` directory or missing package directory), the reader SHALL return no recommendations without raising an error. This is the normal case for projects that haven't fetched dependencies.

#### Scenario: deps directory does not exist

- **WHEN** the project directory has no `deps` folder
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory does not exist

- **WHEN** `deps` exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

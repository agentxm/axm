## ADDED Requirements

### Requirement: Read axm recommendation metadata from Bazel module cache

The Bazel reader SHALL inspect `axm.json` sidecar files in the Bazel external repository directory under the output base (`external/<repo>/`) and in the Bzlmod module cache if available. The output base is queryable via `bazel info output_base`. Module cache location varies and SHALL be scanned on a best-effort basis. When present and valid, the reader SHALL extract the `extensions` array.

#### Scenario: Package with valid axm.json in external repository

- **WHEN** `<output_base>/external/com_google_protobuf/axm.json` contains `{ "extensions": [{ "ref": "@google/skills/protobuf", "versionRange": "^1.0.0" }] }`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@google/skills/protobuf", "versionRange": "^1.0.0" }]`

#### Scenario: Package without axm.json sidecar

- **WHEN** the external repository directory for the package does not contain an `axm.json` file
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package in Bzlmod module cache

- **WHEN** the Bzlmod module cache contains `axm.json` for a module
- **THEN** the reader SHALL extract recommendations from the sidecar file

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm.json` sidecar contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `axm.json` contains `{ "extensions": 42 }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `axm.json` contains `{ "extensions": [{ "ref": "@acme/skills/foo", "versionRange": "^1.0.0" }], "futureField": true }`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Missing Bazel cache handled gracefully

When the Bazel output base does not exist or the specific external repository directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without Bazel installed or projects that haven't run a build.

#### Scenario: Bazel output base does not exist

- **WHEN** the Bazel output base directory does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: External repository directory absent

- **WHEN** the Bazel output base exists but the specific external repository directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Bzlmod module cache unavailable

- **WHEN** the Bzlmod module cache location cannot be determined
- **THEN** the reader SHALL skip the module cache scan
- **AND** no error SHALL be raised

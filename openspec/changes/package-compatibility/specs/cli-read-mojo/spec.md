## ADDED Requirements

### Requirement: Read axm recommendation metadata from pixi environment cache

The Mojo reader SHALL inspect `axm.json` sidecar files in the pixi environment cache at `.pixi/envs/<env>/` in the project directory. Mojo packages are managed via pixi (conda-based). When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm.json in pixi environment

- **WHEN** `.pixi/envs/default/conda-meta/max-24.6.0/axm.json` contains `{ "recommendedExtensions": ["@modular/skills/max@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@modular/skills/max@^1.0.0"]`

#### Scenario: Package without axm.json sidecar

- **WHEN** the pixi environment cache entry for the package does not contain an `axm.json` file
- **THEN** the reader SHALL return no recommendations (Option.none)

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm.json` sidecar contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `axm.json` contains `{ "recommendedExtensions": "not-an-array" }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `axm.json` contains `{ "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing pixi environment handled gracefully

When the `.pixi` directory does not exist or the specific environment cache entry is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for projects that haven't run `pixi install`.

#### Scenario: .pixi directory does not exist

- **WHEN** the project directory has no `.pixi` directory
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Environment cache entry absent

- **WHEN** `.pixi/envs/` exists but the specific package cache entry is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

## ADDED Requirements

### Requirement: Read axm recommendation metadata from Zig package cache

The Zig reader SHALL inspect `axm.json` sidecar files in the Zig package cache at `~/.cache/zig/`. The exact cache structure depends on Zig version, so the reader SHALL perform a best-effort scan. When present and valid, the reader SHALL extract the `extensions` array.

#### Scenario: Package with valid axm.json in cache

- **WHEN** `~/.cache/zig/p/<hash>/axm.json` contains `{ "extensions": [{ "ref": "@zig/skills/zap", "versionRange": "^1.0.0" }] }`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@zig/skills/zap", "versionRange": "^1.0.0" }]`

#### Scenario: Package without axm.json sidecar

- **WHEN** the Zig cache entry for the package does not contain an `axm.json` file
- **THEN** the reader SHALL return no recommendations (Option.none)

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm.json` sidecar contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `axm.json` contains `{ "extensions": "not-an-array" }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `axm.json` contains `{ "extensions": [{ "ref": "@acme/skills/foo", "versionRange": "^1.0.0" }], "futureField": true }`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Missing Zig cache handled gracefully

When the Zig cache directory does not exist or the specific package cache entry is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without Zig installed or projects that haven't fetched dependencies.

#### Scenario: Zig cache does not exist

- **WHEN** `~/.cache/zig/` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package cache entry absent

- **WHEN** the Zig cache exists but the specific package cache entry is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

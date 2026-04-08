## ADDED Requirements

### Requirement: Read axm recommendation metadata from Deno module cache

The Deno reader SHALL inspect cached module metadata in Deno's module cache for an `axm` custom field. The cache location is `$DENO_DIR/` (default `~/.cache/deno/` on Linux, `~/Library/Caches/deno/` on macOS). When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Module with valid axm field in cache

- **WHEN** the cached metadata for `@std/fs` in `$DENO_DIR/` contains `"axm": { "recommendedExtensions": ["@deno/skills/fs@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@deno/skills/fs@^1.0.0"]`

#### Scenario: Module without axm field

- **WHEN** the cached metadata for a module does not contain an `"axm"` field
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Platform-specific cache location

- **WHEN** `$DENO_DIR` is not set on macOS
- **THEN** the reader SHALL check `~/Library/Caches/deno/`

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm metadata warned and skipped

- **WHEN** the cached module metadata contains `"axm": { "recommendedExtensions": 42 }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** the cached module metadata contains `"axm": { "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing Deno cache handled gracefully

When the Deno cache directory does not exist or the specific module cache entry is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without Deno installed or modules that haven't been cached.

#### Scenario: Deno cache does not exist

- **WHEN** neither `$DENO_DIR` nor the default cache location exists
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Module cache entry absent

- **WHEN** the Deno cache exists but the specific module cache entry is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

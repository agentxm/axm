## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Haskell packages

The Hackage reader SHALL inspect `.cabal` files for `x-axm` prefixed custom fields. The Cabal spec allows `x-` prefixed custom fields. The reader SHALL check `~/.cabal/store/ghc-<version>/<pkg>-<version>/` and `dist-newstyle/` locations. When `x-axm` fields are present and valid, the reader SHALL parse them and reconstruct the data into `AxmPackageMeta` shape.

#### Scenario: Package with valid x-axm custom fields

- **WHEN** `~/.cabal/store/ghc-9.6.3/aeson-2.2.1.0/aeson.cabal` contains `x-axm-extensions: [{"ref":"@hackage/skills/aeson","versionRange":"^1.0.0"}]`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@hackage/skills/aeson", "versionRange": "^1.0.0" }]`

#### Scenario: Package without x-axm custom fields

- **WHEN** the `.cabal` file does not contain any `x-axm` prefixed fields
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Multiple x-axm fields reconstructed

- **WHEN** the `.cabal` file contains multiple `x-axm` prefixed custom fields
- **THEN** the reader SHALL parse all fields and reconstruct them into the `AxmPackageMeta` shape

#### Scenario: Package in dist-newstyle

- **WHEN** the package `.cabal` file is found under `dist-newstyle/` with valid `x-axm` fields
- **THEN** the reader SHALL extract recommendations from the `x-axm` fields

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the reconstructed `x-axm` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed x-axm metadata warned and skipped

- **WHEN** the `.cabal` file contains `x-axm-extensions` with an unparseable value
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra x-axm fields tolerated

- **WHEN** the `.cabal` file contains `x-axm-extensions` and `x-axm-futureField`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Missing Cabal store handled gracefully

When the Cabal store directory does not exist or the specific package directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without Haskell installed.

#### Scenario: Cabal store does not exist

- **WHEN** `~/.cabal/store/` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory absent from store

- **WHEN** the Cabal store exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

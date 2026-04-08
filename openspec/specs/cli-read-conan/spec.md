## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Conan packages

The Conan reader SHALL inspect Conan package cache directories for axm recommendation metadata. For Conan 2.x, the reader SHALL check `extension_properties` in the package cache under `~/.conan2/p/`. For Conan 1.x, the reader SHALL check `conandata.yml` in the recipe export cache under `~/.conan/data/`. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm metadata in Conan 2.x cache

- **WHEN** `~/.conan2/p/<hash>/e/conandata.yml` contains an `axm` key with `recommendedExtensions: ["@conan-center/skills/boost@^1.0.0"]`
- **THEN** the reader SHALL return the extension refs `["@conan-center/skills/boost@^1.0.0"]`

#### Scenario: Package without axm metadata

- **WHEN** the Conan cache entry for the package does not contain axm metadata in `conandata.yml` or `extension_properties`
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Conan 1.x cache location

- **WHEN** the package is cached under `~/.conan/data/<pkg>/<version>/<user>/<channel>/export/conandata.yml` with valid axm metadata
- **THEN** the reader SHALL extract recommendations from the `axm` key in `conandata.yml`

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate axm metadata contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm metadata warned and skipped

- **WHEN** `conandata.yml` contains `axm: "invalid"`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `conandata.yml` contains `axm: { recommendedExtensions: ["@acme/skills/foo@^1.0.0"], futureField: true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing Conan cache handled gracefully

When the Conan cache directory does not exist or the specific package directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without Conan installed.

#### Scenario: Conan 2.x cache does not exist

- **WHEN** `~/.conan2/p/` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Conan 1.x cache does not exist

- **WHEN** `~/.conan/data/` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory absent from cache

- **WHEN** the Conan cache exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

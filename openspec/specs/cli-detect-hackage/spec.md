## ADDED Requirements

### Requirement: Parse cabal files for Haskell dependencies

The Hackage detector SHALL parse `*.cabal` files in the project directory and extract dependencies from `build-depends` fields. Each dependency SHALL be converted to a `pkg:hackage` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from build-depends

- **WHEN** a `.cabal` file contains `build-depends: base >=4.7 && <5, aeson >=2.0, text`
- **THEN** the detector SHALL produce purls for `base`, `aeson`, and `text`

#### Scenario: Missing cabal files

- **WHEN** the project directory does not contain any `.cabal` files
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed cabal file

- **WHEN** a `.cabal` file contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No build-depends fields

- **WHEN** a `.cabal` file exists but contains no `build-depends` fields
- **THEN** the detector SHALL return an empty array

### Requirement: Handle conditional blocks in cabal files

The detector SHALL extract dependencies from `build-depends` across all conditional branches (e.g., `if`/`else` blocks) in cabal files. The detector MUST NOT evaluate conditions but SHALL collect dependencies from all branches.

#### Scenario: Dependencies inside conditional

- **WHEN** a `.cabal` file contains `if os(windows)` with `build-depends: Win32` and an `else` with `build-depends: unix`
- **THEN** the detector SHALL produce purls for both `Win32` and `unix`

#### Scenario: Dependencies in library and executable sections

- **WHEN** a `.cabal` file contains a `library` section with `build-depends: aeson` and an `executable` section with `build-depends: optparse-applicative`
- **THEN** the detector SHALL produce purls for both `aeson` and `optparse-applicative`

### Requirement: Parse stack.yaml for extra dependencies

The Hackage detector SHALL parse `stack.yaml` and extract dependencies from the `extra-deps` list. Entries in `package-version` format SHALL be parsed into package name and version.

#### Scenario: Extra-deps with versions

- **WHEN** `stack.yaml` contains `extra-deps: [aeson-2.1.0.0, text-2.0.1]`
- **THEN** the detector SHALL produce purls for `aeson` and `text`

#### Scenario: Missing stack.yaml

- **WHEN** the project directory does not contain a `stack.yaml` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: No extra-deps

- **WHEN** `stack.yaml` exists but contains no `extra-deps` field
- **THEN** the detector SHALL return an empty array

### Requirement: Cabal constraint ranges produce versionless purls

Cabal version constraint ranges SHALL produce versionless purls. Exact version pins SHALL produce versioned purls.

#### Scenario: Version range

- **WHEN** `build-depends` contains `aeson >=2.0 && <3`
- **THEN** the detector SHALL produce `pkg:hackage/aeson` (versionless)

#### Scenario: Exact version pin

- **WHEN** `build-depends` contains `aeson ==2.1.0.0`
- **THEN** the detector SHALL produce `pkg:hackage/aeson@2.1.0.0`

#### Scenario: No version constraint

- **WHEN** `build-depends` contains `text`
- **THEN** the detector SHALL produce `pkg:hackage/text` (versionless)

#### Scenario: Extra-deps version

- **WHEN** `extra-deps` contains `aeson-2.1.0.0`
- **THEN** the detector SHALL produce `pkg:hackage/aeson@2.1.0.0`

### Requirement: Both sources processed and deduplicated

When both `.cabal` and `stack.yaml` files exist, the detector SHALL process all files and deduplicate results by package name.

#### Scenario: Dependencies from both sources

- **WHEN** a `.cabal` file lists `aeson` in `build-depends` and `stack.yaml` lists `aeson-2.1.0.0` in `extra-deps`
- **THEN** the detector SHALL produce a single purl for `aeson`

## ADDED Requirements

### Requirement: Parse conanfile.txt for Conan dependencies

The Conan detector SHALL parse `conanfile.txt` in the project directory and extract dependencies from the `[requires]` section. Each entry in `name/version` format SHALL be converted to a `pkg:conan` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from requires section

- **WHEN** `conanfile.txt` contains a `[requires]` section with `boost/1.82.0` and `zlib/1.3`
- **THEN** the detector SHALL produce purls for `boost` and `zlib`

#### Scenario: Missing conanfile.txt

- **WHEN** the project directory does not contain a `conanfile.txt` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed conanfile.txt

- **WHEN** `conanfile.txt` contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No requires section

- **WHEN** `conanfile.txt` exists but contains no `[requires]` section
- **THEN** the detector SHALL return an empty array

### Requirement: Parse conanfile.py for Conan dependencies

The Conan detector SHALL parse `conanfile.py` using regex on common patterns to extract dependency references. The detector SHALL match `self.requires("name/version")` and similar invocations without performing full Python evaluation.

#### Scenario: Dependencies from self.requires calls

- **WHEN** `conanfile.py` contains `self.requires("boost/1.82.0")` and `self.requires("zlib/1.3")`
- **THEN** the detector SHALL produce purls for `boost` and `zlib`

#### Scenario: Missing conanfile.py

- **WHEN** the project directory does not contain a `conanfile.py` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: No matching requires patterns

- **WHEN** `conanfile.py` exists but contains no recognizable `requires` patterns
- **THEN** the detector SHALL return an empty array

### Requirement: Handle Conan 2.x reference format

The detector SHALL handle Conan 2.x reference format where dependencies use `name/version` without a channel by default.

#### Scenario: Conan 2.x reference without channel

- **WHEN** `conanfile.txt` contains `fmt/10.1.1` in the `[requires]` section
- **THEN** the detector SHALL produce `pkg:conan/fmt@10.1.1`

#### Scenario: Legacy reference with channel

- **WHEN** `conanfile.txt` contains `boost/1.82.0@` or `boost/1.82.0@user/channel`
- **THEN** the detector SHALL produce `pkg:conan/boost@1.82.0` (channel information is not included in the purl)

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version, the detector SHALL include the version in the purl. When a dependency specifies a version range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `[requires]` contains `boost/1.82.0`
- **THEN** the detector SHALL produce `pkg:conan/boost@1.82.0`

#### Scenario: Version range

- **WHEN** `[requires]` contains `boost/[>=1.80.0 <1.83.0]`
- **THEN** the detector SHALL produce `pkg:conan/boost` (versionless)

### Requirement: Both files processed and deduplicated

When both `conanfile.txt` and `conanfile.py` exist, the detector SHALL process both files and deduplicate results by package name.

#### Scenario: Dependencies from both files

- **WHEN** `conanfile.txt` contains `boost/1.82.0` and `conanfile.py` contains `self.requires("boost/1.82.0")`
- **THEN** the detector SHALL produce a single purl for `boost`

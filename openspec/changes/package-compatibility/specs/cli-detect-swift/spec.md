## ADDED Requirements

### Requirement: Parse Package.swift dependencies via swift package dump-package

The Swift detector SHALL invoke `swift package dump-package` in the project directory and parse the resulting JSON to extract dependencies. Each `.package(url:)` dependency SHALL be converted to a `pkg:swift` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from dump-package output

- **WHEN** `Package.swift` exists and `swift package dump-package` produces JSON containing dependencies with url `"https://github.com/Alamofire/Alamofire.git"`
- **THEN** the detector SHALL produce a purl for Alamofire

#### Scenario: Missing Package.swift

- **WHEN** the project directory does not contain a `Package.swift` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed dump-package output

- **WHEN** `swift package dump-package` produces invalid JSON
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependencies in package

- **WHEN** `Package.swift` exists but declares no dependencies
- **THEN** the detector SHALL return an empty array

### Requirement: Swift not available on PATH

If the `swift` command is not available on PATH, the detector SHALL return an empty array and log a warning. The detector MUST NOT raise a typed error.

#### Scenario: swift command not found

- **WHEN** `Package.swift` exists but `swift` is not available on PATH
- **THEN** the detector SHALL log a warning and return an empty array

### Requirement: Namespace derived from dependency URL

The detector SHALL derive the purl namespace from the host and organization segments of the dependency URL. The `.git` suffix SHALL be stripped from the repository name.

#### Scenario: GitHub URL

- **WHEN** a dependency has url `"https://github.com/Alamofire/Alamofire.git"`
- **THEN** the detector SHALL produce a purl with `type: "swift"`, `namespace: "github.com/Alamofire"`, `name: "Alamofire"`

#### Scenario: GitHub URL without .git suffix

- **WHEN** a dependency has url `"https://github.com/apple/swift-argument-parser"`
- **THEN** the detector SHALL produce a purl with `namespace: "github.com/apple"`, `name: "swift-argument-parser"`

#### Scenario: Custom host URL

- **WHEN** a dependency has url `"https://gitlab.example.com/team/MyLibrary.git"`
- **THEN** the detector SHALL produce a purl with `namespace: "gitlab.example.com/team"`, `name: "MyLibrary"`

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version via `exact:` or a resolved single version from `from:`, the detector SHALL include the version in the purl. When a dependency specifies a range via `from:`, `.upToNextMajor`, or `.upToNextMinor`, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** a dependency specifies `exact: "5.6.2"`
- **THEN** the detector SHALL produce `pkg:swift/github.com/Alamofire/Alamofire@5.6.2`

#### Scenario: From range

- **WHEN** a dependency specifies `from: "5.6.0"`
- **THEN** the detector SHALL produce `pkg:swift/github.com/Alamofire/Alamofire` (versionless)

#### Scenario: upToNextMajor range

- **WHEN** a dependency specifies `.upToNextMajor(from: "1.0.0")`
- **THEN** the detector SHALL produce a versionless purl

#### Scenario: upToNextMinor range

- **WHEN** a dependency specifies `.upToNextMinor(from: "1.2.0")`
- **THEN** the detector SHALL produce a versionless purl

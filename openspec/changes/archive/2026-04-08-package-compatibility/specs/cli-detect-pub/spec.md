## ADDED Requirements

### Requirement: Parse pubspec.yaml for Dart/Flutter dependencies

The Pub detector SHALL parse `pubspec.yaml` in the project directory and extract dependencies from the `dependencies` and `dev_dependencies` maps. Each dependency SHALL be converted to a `pkg:pub` purl with typed `PackageUrlParts`. Package names SHALL be lowercase and match the `[a-z0-9_]` Dart/Flutter convention.

#### Scenario: Dependencies from both sections

- **WHEN** `pubspec.yaml` contains `dependencies: { http: ^1.0.0 }` and `dev_dependencies: { test: ^1.24.0 }`
- **THEN** the detector SHALL produce purls for `http` and `test`

#### Scenario: Missing pubspec.yaml

- **WHEN** the project directory does not contain a `pubspec.yaml` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed pubspec.yaml

- **WHEN** `pubspec.yaml` contains invalid YAML
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependency sections

- **WHEN** `pubspec.yaml` exists but contains no `dependencies` or `dev_dependencies`
- **THEN** the detector SHALL return an empty array

### Requirement: Hosted dependencies extracted

The detector SHALL extract hosted dependencies specified as a simple version string or as a map with a `version:` key.

#### Scenario: Simple version string

- **WHEN** `dependencies` contains `http: ^1.0.0`
- **THEN** the detector SHALL produce a purl with `type: "pub"`, `name: "http"`

#### Scenario: Map with version key

- **WHEN** `dependencies` contains `http: { version: ^1.0.0, hosted: https://custom.pub.dev }`
- **THEN** the detector SHALL produce a purl with `type: "pub"`, `name: "http"`

### Requirement: Non-hosted dependencies skipped

Dependencies using `path:`, `git:`, or `sdk:` sources SHALL be skipped. These represent local, version-control, or SDK-bundled sources that are not meaningful for package compatibility discovery.

#### Scenario: Path dependency skipped

- **WHEN** `dependencies` contains `my_lib: { path: ../my_lib }`
- **THEN** the detector SHALL not produce a purl for `my_lib`

#### Scenario: Git dependency skipped

- **WHEN** `dependencies` contains `my_lib: { git: { url: https://github.com/org/my_lib.git } }`
- **THEN** the detector SHALL not produce a purl for `my_lib`

#### Scenario: SDK dependency skipped

- **WHEN** `dependencies` contains `flutter: { sdk: flutter }`
- **THEN** the detector SHALL not produce a purl for `flutter`

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version (no range operators), the detector SHALL include the version in the purl. When a dependency specifies a version range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `dependencies` contains `http: 1.2.0`
- **THEN** the detector SHALL produce `pkg:pub/http@1.2.0`

#### Scenario: Caret range

- **WHEN** `dependencies` contains `http: ^1.0.0`
- **THEN** the detector SHALL produce `pkg:pub/http` (versionless)

#### Scenario: Comparison range

- **WHEN** `dependencies` contains `http: ">=1.0.0 <2.0.0"`
- **THEN** the detector SHALL produce `pkg:pub/http` (versionless)

#### Scenario: Any version

- **WHEN** `dependencies` contains `http: any`
- **THEN** the detector SHALL produce `pkg:pub/http` (versionless)

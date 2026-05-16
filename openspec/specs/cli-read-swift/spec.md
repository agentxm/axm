## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed SwiftPM packages

The Swift reader SHALL inspect `.build/checkouts/<package-name>/axm.json` for each detected SwiftPM package and check for recommendation metadata. SwiftPM checks out dependencies into `.build/checkouts/` after `swift package resolve`. The sidecar approach follows the ecosystem precedent of `.spi.yml` from Swift Package Index. When present and valid, the reader SHALL extract the `extensions` array.

#### Scenario: Package with valid axm.json sidecar

- **WHEN** `.build/checkouts/swift-nio/axm.json` contains `{ "extensions": [{ "ref": "@apple/skills/swift-nio", "versionRange": "^2.0.0" }] }`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@apple/skills/swift-nio", "versionRange": "^2.0.0" }]`

#### Scenario: Package without axm.json sidecar

- **WHEN** `.build/checkouts/swift-argument-parser/` exists but contains no `axm.json`
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package with empty extensions

- **WHEN** `.build/checkouts/swift-log/axm.json` contains `{ "extensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm.json` contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `.build/checkouts/some-package/axm.json` contains `{ "extensions": 42 }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `.build/checkouts/some-package/axm.json` contains `{ "extensions": [{ "ref": "@acme/skills/foo", "versionRange": "^1.0.0" }], "futureField": true }`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Checkout path derived from package name

The reader SHALL derive the checkout directory name from the package name. The package checkout directory within `.build/checkouts/` corresponds to the package name.

#### Scenario: Package checkout path

- **WHEN** the detected package has `name: "swift-nio"`
- **THEN** the reader SHALL look for `.build/checkouts/swift-nio/axm.json`

### Requirement: Missing checkouts directory handled gracefully

When the package is not installed (missing `.build/checkouts/` directory or missing package checkout directory), the reader SHALL return no recommendations without raising an error. This is the normal case for projects that haven't run `swift package resolve`. No Swift toolchain dependency is required for reading.

#### Scenario: .build/checkouts directory does not exist

- **WHEN** the project directory has no `.build/checkouts/` folder
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package checkout directory does not exist

- **WHEN** `.build/checkouts/` exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

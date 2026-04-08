## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Dart/Flutter packages

The pub reader SHALL locate the package root via `.dart_tool/package_config.json`, find the package entry, resolve its `rootUri`, then read `pubspec.yaml` from the package root and extract the `axm` custom top-level field containing recommendation metadata. Dart/Flutter pubspec supports arbitrary custom top-level keys, following the precedent of Flutter's `flutter:` key. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm field in pubspec.yaml

- **WHEN** `.dart_tool/package_config.json` maps package `riverpod` to a root URI
- **AND** the resolved `pubspec.yaml` contains `axm: { recommendedExtensions: ["@riverpod/skills/riverpod@^2.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@riverpod/skills/riverpod@^2.0.0"]`

#### Scenario: Package without axm field

- **WHEN** `.dart_tool/package_config.json` maps package `http` to a root URI
- **AND** the resolved `pubspec.yaml` does not contain an `axm` field
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package with empty recommendedExtensions

- **WHEN** the resolved `pubspec.yaml` contains `axm: { recommendedExtensions: [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Resolve package root via package_config.json

The reader SHALL read `.dart_tool/package_config.json` to locate the package entry and resolve the `rootUri` to determine the package root directory where `pubspec.yaml` resides.

#### Scenario: Package root resolved from package_config.json

- **WHEN** `.dart_tool/package_config.json` contains a package entry for `bloc` with `rootUri: "../../.pub-cache/hosted/pub.dev/bloc-8.1.0"`
- **THEN** the reader SHALL resolve the root URI relative to `.dart_tool/` and read `pubspec.yaml` from that path

#### Scenario: Package not found in package_config.json

- **WHEN** `.dart_tool/package_config.json` does not contain an entry for the requested package
- **THEN** the reader SHALL return no recommendations (Option.none)

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the extracted `axm` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm metadata warned and skipped

- **WHEN** the resolved `pubspec.yaml` contains `axm: { recommendedExtensions: 123 }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** the resolved `pubspec.yaml` contains `axm: { recommendedExtensions: ["@acme/skills/foo@^1.0.0"], futureField: true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing .dart_tool directory handled gracefully

When the package resolution data is not available (missing `.dart_tool/` directory or missing `package_config.json`), the reader SHALL return no recommendations without raising an error. This is the normal case for projects that haven't run `dart pub get` or `flutter pub get`.

#### Scenario: .dart_tool directory does not exist

- **WHEN** the project directory has no `.dart_tool/` folder
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: package_config.json does not exist

- **WHEN** `.dart_tool/` exists but `package_config.json` is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

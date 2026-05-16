## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed CocoaPods packages

The CocoaPods reader SHALL inspect `Pods/<pod-name>/axm.json` for each detected pod and check for recommendation metadata. CocoaPods installs dependencies into the `Pods/` directory after `pod install`. The sidecar approach uses `preserve_paths` in the podspec to ship the file. When present and valid, the reader SHALL extract the `extensions` array.

#### Scenario: Pod with valid axm.json sidecar

- **WHEN** `Pods/Alamofire/axm.json` contains `{ "extensions": [{ "ref": "@alamofire/skills/alamofire", "versionRange": "^5.0.0" }] }`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@alamofire/skills/alamofire", "versionRange": "^5.0.0" }]`

#### Scenario: Pod without axm.json sidecar

- **WHEN** `Pods/SnapKit/` exists but contains no `axm.json`
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Pod with empty extensions

- **WHEN** `Pods/SwiftyJSON/axm.json` contains `{ "extensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `axm.json` contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `Pods/SomePod/axm.json` contains `{ "extensions": { "invalid": true } }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `Pods/SomePod/axm.json` contains `{ "extensions": [{ "ref": "@acme/skills/foo", "versionRange": "^1.0.0" }], "futureField": true }`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Pod path reconstructed from pod name

The reader SHALL reconstruct the `Pods/` path from the pod name. The CocoaPods convention installs each pod into `Pods/<pod-name>/`.

#### Scenario: Standard pod path

- **WHEN** the detected package has `name: "Alamofire"`
- **THEN** the reader SHALL look for `Pods/Alamofire/axm.json`

#### Scenario: Pod with organizational prefix

- **WHEN** the detected package has `name: "GoogleMaps"`
- **THEN** the reader SHALL look for `Pods/GoogleMaps/axm.json`

### Requirement: Missing Pods directory handled gracefully

When the package is not installed (missing `Pods` directory or missing pod directory), the reader SHALL return no recommendations without raising an error. This is the normal case for projects that haven't run `pod install`.

#### Scenario: Pods directory does not exist

- **WHEN** the project directory has no `Pods` folder
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Pod directory does not exist

- **WHEN** `Pods` exists but the specific pod directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

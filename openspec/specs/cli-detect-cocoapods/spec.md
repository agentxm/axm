## ADDED Requirements

### Requirement: Parse Podfile for CocoaPods dependencies

The CocoaPods detector SHALL parse `Podfile` in the project directory and extract `pod` directives. Each pod SHALL be converted to a `pkg:cocoapods` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from Podfile

- **WHEN** `Podfile` contains `pod 'Alamofire', '~> 5.0'` and `pod 'SwiftyJSON', '~> 5.0'`
- **THEN** the detector SHALL produce purls for `Alamofire` and `SwiftyJSON`

#### Scenario: Missing Podfile

- **WHEN** the project directory does not contain a `Podfile`
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed Podfile

- **WHEN** `Podfile` cannot be parsed for pod directives
- **THEN** the detector SHALL log a warning and return an empty array

### Requirement: Parse podspec files for CocoaPods dependencies

The CocoaPods detector SHALL parse `*.podspec` files in the project directory and extract `s.dependency` directives. Each dependency SHALL be converted to a `pkg:cocoapods` purl.

#### Scenario: Dependencies from podspec

- **WHEN** a `.podspec` file contains `s.dependency 'Alamofire', '~> 5.0'`
- **THEN** the detector SHALL produce a purl for `Alamofire`

#### Scenario: No podspec files

- **WHEN** the project directory does not contain any `.podspec` files
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

### Requirement: Subspecs represented via subpath

CocoaPods subspecs SHALL be represented using the purl subpath component. The root pod name is the purl name, and the subspec is the subpath.

#### Scenario: Pod with subspec

- **WHEN** `Podfile` contains `pod 'ShareKit/Twitter'`
- **THEN** the detector SHALL produce a purl with `type: "cocoapods"`, `name: "ShareKit"`, `subpath: "Twitter"`

#### Scenario: Pod with nested subspec

- **WHEN** `Podfile` contains `pod 'RestKit/Network/CoreData'`
- **THEN** the detector SHALL produce a purl with `name: "RestKit"`, `subpath: "Network/CoreData"`

#### Scenario: Pod without subspec

- **WHEN** `Podfile` contains `pod 'Alamofire', '~> 5.0'`
- **THEN** the detector SHALL produce a purl with `name: "Alamofire"` and no subpath

### Requirement: Exact versions produce versioned purls

When a pod specifies an exact version (no range operators), the detector SHALL include the version in the purl. When a pod specifies a version range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `Podfile` contains `pod 'Alamofire', '5.6.2'`
- **THEN** the detector SHALL produce `pkg:cocoapods/Alamofire@5.6.2`

#### Scenario: Optimistic range

- **WHEN** `Podfile` contains `pod 'Alamofire', '~> 5.0'`
- **THEN** the detector SHALL produce `pkg:cocoapods/Alamofire` (versionless)

#### Scenario: Comparison range

- **WHEN** `Podfile` contains `pod 'Alamofire', '>= 5.0'`
- **THEN** the detector SHALL produce `pkg:cocoapods/Alamofire` (versionless)

#### Scenario: No version specified

- **WHEN** `Podfile` contains `pod 'Alamofire'`
- **THEN** the detector SHALL produce `pkg:cocoapods/Alamofire` (versionless)

### Requirement: Path and git pods skipped

Pods using `:path` or `:git` options SHALL be skipped. These represent local or non-registry sources.

#### Scenario: Path pod skipped

- **WHEN** `Podfile` contains `pod 'MyPod', :path => '../MyPod'`
- **THEN** the detector SHALL not produce a purl for `MyPod`

#### Scenario: Git pod skipped

- **WHEN** `Podfile` contains `pod 'MyPod', :git => 'https://github.com/org/MyPod.git'`
- **THEN** the detector SHALL not produce a purl for `MyPod`

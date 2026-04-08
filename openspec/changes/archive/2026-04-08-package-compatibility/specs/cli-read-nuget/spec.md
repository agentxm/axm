## ADDED Requirements

### Requirement: Read axm recommendation metadata from NuGet global packages

The NuGet reader SHALL inspect the NuGet global packages folder for an `axm.json` file alongside each detected NuGet package. For each detected nuget package, the reader SHALL locate `<packages-folder>/{id}/{version}/axm.json` and extract the `recommendedExtensions` array when present and valid.

#### Scenario: Package with valid axm.json

- **WHEN** `~/.nuget/packages/newtonsoft.json/13.0.3/axm.json` contains `{ "recommendedExtensions": ["@newtonsoft/skills/json@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@newtonsoft/skills/json@^1.0.0"]`

#### Scenario: Package without axm.json

- **WHEN** `~/.nuget/packages/serilog/3.1.1/axm.json` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package with empty recommendedExtensions

- **WHEN** `~/.nuget/packages/some.lib/1.0.0/axm.json` contains `{ "recommendedExtensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Package ID lowercased in folder path

The reader SHALL lowercase the package ID when constructing the folder path. NuGet global packages use lowercased package IDs in directory names regardless of the original casing.

#### Scenario: Mixed-case package ID

- **WHEN** the detected package has `name: "Newtonsoft.Json"`, `version: "13.0.3"`
- **THEN** the reader SHALL look for `<packages-folder>/newtonsoft.json/13.0.3/axm.json`

#### Scenario: Already lowercase package ID

- **WHEN** the detected package has `name: "serilog"`, `version: "3.1.1"`
- **THEN** the reader SHALL look for `<packages-folder>/serilog/3.1.1/axm.json`

### Requirement: Handle NUGET_PACKAGES environment variable

The reader SHALL use the `NUGET_PACKAGES` environment variable to locate the global packages folder when set. When `NUGET_PACKAGES` is not set, the reader SHALL default to `~/.nuget/packages/`.

#### Scenario: NUGET_PACKAGES is set

- **WHEN** `$NUGET_PACKAGES` is set to `/custom/nuget/packages`
- **THEN** the reader SHALL look for packages under `/custom/nuget/packages/`

#### Scenario: NUGET_PACKAGES is not set

- **WHEN** `$NUGET_PACKAGES` is not set
- **THEN** the reader SHALL look for packages under `~/.nuget/packages/`

### Requirement: Missing packages folder handled gracefully

When the NuGet global packages folder or the specific package version directory does not exist, the reader SHALL return no recommendations without raising an error. This is the normal case for packages not yet restored.

#### Scenario: Global packages folder does not exist

- **WHEN** the packages folder directory does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package version directory does not exist

- **WHEN** the packages folder exists but the specific package version directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Validate axm.json against AxmPackageMeta schema

The reader SHALL validate `axm.json` contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm.json warned and skipped

- **WHEN** `axm.json` contains `{ "recommendedExtensions": "not-an-array" }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `axm.json` contains `{ "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Version from purl used for directory lookup

The reader SHALL use the version from `PackageUrlParts` to locate the exact version directory within the package folder.

#### Scenario: Exact version directory matched

- **WHEN** the detected package has `name: "Microsoft.Extensions.Logging"`, `version: "8.0.0"`
- **THEN** the reader SHALL look for `<packages-folder>/microsoft.extensions.logging/8.0.0/axm.json`

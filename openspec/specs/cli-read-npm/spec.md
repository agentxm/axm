## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed npm packages

The npm reader SHALL inspect `node_modules/<name>/package.json` for each detected npm package and check for an `"axm"` field containing recommendation metadata. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm metadata

- **WHEN** `node_modules/next/package.json` contains `"axm": { "recommendedExtensions": ["@vercel/skills/nextjs@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@vercel/skills/nextjs@^1.0.0"]`

#### Scenario: Package without axm metadata

- **WHEN** `node_modules/react/package.json` does not contain an `"axm"` field
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package with empty recommendedExtensions

- **WHEN** `node_modules/some-lib/package.json` contains `"axm": { "recommendedExtensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `"axm"` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm metadata warned and skipped

- **WHEN** `node_modules/some-lib/package.json` contains `"axm": { "recommendedExtensions": "not-an-array" }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `node_modules/some-lib/package.json` contains `"axm": { "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Scoped package path reconstruction from PackageUrlParts

For scoped npm packages, the reader SHALL reconstruct the `node_modules` path from the `PackageUrlParts` namespace and name fields. The purl namespace (e.g., `%40angular`) SHALL be decoded to the filesystem form (`@angular`) for path construction.

#### Scenario: Scoped package path

- **WHEN** the detected package has `namespace: "%40angular"`, `name: "core"`
- **THEN** the reader SHALL look for `node_modules/@angular/core/package.json`

#### Scenario: Unscoped package path

- **WHEN** the detected package has `namespace: undefined`, `name: "react"`
- **THEN** the reader SHALL look for `node_modules/react/package.json`

### Requirement: Missing node_modules handled gracefully

When the package is not installed (missing `node_modules` directory or missing package directory), the reader SHALL return no recommendations without raising an error. This is the normal case for projects that haven't run `npm install`.

#### Scenario: node_modules does not exist

- **WHEN** the project directory has no `node_modules` folder
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory does not exist

- **WHEN** `node_modules` exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

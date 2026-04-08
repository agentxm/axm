## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Composer packages

The Composer reader SHALL inspect `vendor/<namespace>/<name>/composer.json` for each detected Composer package and check for an `"axm"` key within the `"extra"` field containing recommendation metadata. The `extra` field is the standard Composer extensibility mechanism. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm metadata in extra field

- **WHEN** `vendor/laravel/framework/composer.json` contains `"extra": { "axm": { "recommendedExtensions": ["@laravel/skills/framework@^1.0.0"] } }`
- **THEN** the reader SHALL return the extension refs `["@laravel/skills/framework@^1.0.0"]`

#### Scenario: Package without extra.axm metadata

- **WHEN** `vendor/monolog/monolog/composer.json` does not contain an `"axm"` key in the `"extra"` field
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package without extra field

- **WHEN** `vendor/monolog/monolog/composer.json` has no `"extra"` field at all
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package with empty recommendedExtensions

- **WHEN** `vendor/phpstan/phpstan/composer.json` contains `"extra": { "axm": { "recommendedExtensions": [] } }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `"extra"."axm"` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed axm metadata warned and skipped

- **WHEN** `vendor/some/lib/composer.json` contains `"extra": { "axm": { "recommendedExtensions": "not-an-array" } }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `vendor/some/lib/composer.json` contains `"extra": { "axm": { "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true } }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Vendor path reconstruction from PackageUrlParts

The reader SHALL reconstruct the `vendor/` path from the `PackageUrlParts` namespace and name fields. The Composer convention uses `vendor/<namespace>/<name>/composer.json`.

#### Scenario: Standard package path

- **WHEN** the detected package has `namespace: "laravel"`, `name: "framework"`
- **THEN** the reader SHALL look for `vendor/laravel/framework/composer.json`

#### Scenario: Nested namespace package path

- **WHEN** the detected package has `namespace: "symfony"`, `name: "console"`
- **THEN** the reader SHALL look for `vendor/symfony/console/composer.json`

### Requirement: Missing vendor directory handled gracefully

When the package is not installed (missing `vendor` directory or missing package directory), the reader SHALL return no recommendations without raising an error. This is the normal case for projects that haven't run `composer install`. No PHP runtime dependency is required.

#### Scenario: vendor directory does not exist

- **WHEN** the project directory has no `vendor` folder
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory does not exist

- **WHEN** `vendor` exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

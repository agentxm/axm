## ADDED Requirements

### Requirement: Parse composer.json for PHP dependencies

The Composer detector SHALL parse `composer.json` in the project directory and extract dependencies from the `require` and `require-dev` objects. Each dependency SHALL be converted to a `pkg:composer` purl with typed `PackageUrlParts`. The vendor namespace SHALL be lowercased.

#### Scenario: Dependencies from require and require-dev

- **WHEN** `composer.json` contains `require: { "laravel/framework": "^10.0" }` and `require-dev: { "phpunit/phpunit": "^10.0" }`
- **THEN** the detector SHALL produce purls for `laravel/framework` and `phpunit/phpunit`

#### Scenario: Missing composer.json

- **WHEN** the project directory does not contain a `composer.json` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed composer.json

- **WHEN** `composer.json` contains invalid JSON
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependency sections

- **WHEN** `composer.json` exists but contains no `require` or `require-dev`
- **THEN** the detector SHALL return an empty array

### Requirement: Vendor namespace and name extracted from package key

Composer packages use a `vendor/name` format. The detector SHALL split the key on `/` to produce a lowercased namespace (vendor) and name.

#### Scenario: Standard vendor/name package

- **WHEN** `require` contains `"laravel/framework": "^10.0"`
- **THEN** the detector SHALL produce a purl with `type: "composer"`, `namespace: "laravel"`, `name: "framework"`

#### Scenario: Uppercase vendor normalized

- **WHEN** `require` contains `"Monolog/Monolog": "^3.0"`
- **THEN** the detector SHALL produce a purl with `namespace: "monolog"`, `name: "monolog"`

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version (no range operators), the detector SHALL include the version in the purl. When a dependency specifies a version range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `require` contains `"guzzlehttp/guzzle": "7.5.0"`
- **THEN** the detector SHALL produce `pkg:composer/guzzlehttp/guzzle@7.5.0`

#### Scenario: Caret range

- **WHEN** `require` contains `"guzzlehttp/guzzle": "^7.5.0"`
- **THEN** the detector SHALL produce `pkg:composer/guzzlehttp/guzzle` (versionless)

#### Scenario: Tilde range

- **WHEN** `require` contains `"monolog/monolog": "~3.0"`
- **THEN** the detector SHALL produce `pkg:composer/monolog/monolog` (versionless)

#### Scenario: Wildcard range

- **WHEN** `require` contains `"doctrine/dbal": "3.*"`
- **THEN** the detector SHALL produce `pkg:composer/doctrine/dbal` (versionless)

### Requirement: Platform requirements skipped

The detector SHALL skip `php` and `ext-*` entries in `require` and `require-dev` because these are platform requirements, not installable packages.

#### Scenario: php requirement skipped

- **WHEN** `require` contains `"php": ">=8.1"`
- **THEN** the detector SHALL not produce a purl for `php`

#### Scenario: ext-\* requirement skipped

- **WHEN** `require` contains `"ext-mbstring": "*"`
- **THEN** the detector SHALL not produce a purl for `ext-mbstring`

#### Scenario: ext-json requirement skipped

- **WHEN** `require` contains `"ext-json": "*"`
- **THEN** the detector SHALL not produce a purl for `ext-json`

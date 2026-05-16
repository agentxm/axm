## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Ruby gems

The gem reader SHALL inspect gemspec metadata for axm recommendation data. For each detected gem package, the reader SHALL locate the gemspec file at `<gem-dir>/specifications/<gem>.gemspec` and extract `axm_`-prefixed keys from the metadata hash. The RubyGems metadata hash supports arbitrary string key-value pairs and is the standard extensibility mechanism used for link URIs, `rubygems_mfa_required`, and other ecosystem conventions.

#### Scenario: Gem with valid axm metadata keys

- **WHEN** `<gem-dir>/specifications/rails-7.1.0.gemspec` metadata hash contains `"axm_extensions" => "[{\"ref\":\"@rails/skills/rails\",\"versionRange\":\"^1.0.0\"}]"`
- **THEN** the reader SHALL parse the value and return the extension refs `[{ "ref": "@rails/skills/rails", "versionRange": "^1.0.0" }]`

#### Scenario: Gem without axm metadata keys

- **WHEN** `<gem-dir>/specifications/nokogiri-1.15.0.gemspec` metadata hash contains no `axm_`-prefixed keys
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Gem with empty recommended extensions

- **WHEN** the gemspec metadata contains `"axm_extensions" => "[]"`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Parse gemspec metadata to extract axm fields

The reader SHALL parse the serialized gemspec file to extract metadata hash entries with the `axm_` prefix. The reader SHALL reconstruct the extracted values into the `AxmPackageMeta` shape for schema validation.

#### Scenario: Reconstruct AxmPackageMeta from prefixed keys

- **WHEN** the metadata hash contains `"axm_extensions" => "[{\"ref\":\"@acme/skills/foo\",\"versionRange\":\"^1.0.0\"},{\"ref\":\"@acme/skills/bar\",\"versionRange\":\"^2.0.0\"}]"`
- **THEN** the reader SHALL reconstruct `{ "extensions": [{ "ref": "@acme/skills/foo", "versionRange": "^1.0.0" }, { "ref": "@acme/skills/bar", "versionRange": "^2.0.0" }] }` for validation

#### Scenario: Only axm-prefixed keys extracted

- **WHEN** the metadata hash contains `"rubygems_mfa_required" => "true"` and `"axm_extensions" => "[{\"ref\":\"@acme/skills/foo\",\"versionRange\":\"^1.0.0\"}]"`
- **THEN** the reader SHALL extract only the `axm_`-prefixed keys and ignore other metadata entries

### Requirement: Missing gemspec handled gracefully

When the gemspec file does not exist or the gem is not installed, the reader SHALL return no recommendations without raising an error. This is the normal case for gems not yet installed.

#### Scenario: Gemspec file does not exist

- **WHEN** `<gem-dir>/specifications/<gem>.gemspec` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Specifications directory does not exist

- **WHEN** the gem directory has no `specifications` folder
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Missing axm metadata keys handled gracefully

When the gemspec exists but contains no `axm_`-prefixed metadata keys, the reader SHALL return no recommendations without raising an error.

#### Scenario: Gemspec exists but has no axm keys

- **WHEN** the gemspec metadata hash exists but contains no `axm_`-prefixed entries
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Gemspec has empty metadata hash

- **WHEN** the gemspec metadata hash is empty
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Validate reconstructed metadata against AxmPackageMeta schema

The reader SHALL validate the reconstructed metadata object against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed metadata warned and skipped

- **WHEN** the reconstructed metadata fails schema validation (e.g., `axm_extensions` value is unparseable)
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra axm-prefixed keys tolerated

- **WHEN** the metadata hash contains `"axm_extensions" => "[{\"ref\":\"@acme/skills/foo\",\"versionRange\":\"^1.0.0\"}]"` and `"axm_future_field" => "true"`
- **THEN** the reader SHALL extract `extensions` and ignore unknown axm fields

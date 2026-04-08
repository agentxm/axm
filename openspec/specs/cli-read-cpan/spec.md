## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed CPAN distributions

The CPAN reader SHALL inspect `MYMETA.json` files under `<lib-path>/.meta/<dist>/` for an `x_axm` key containing recommendation metadata. The `x_` prefix is the standard CPAN metadata extension mechanism. The reader SHALL check `PERL5LIB` and `@INC` standard locations. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Distribution with valid x_axm metadata

- **WHEN** `<lib-path>/.meta/Moose-2.2206/MYMETA.json` contains `"x_axm": { "recommendedExtensions": ["@cpan/skills/moose@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@cpan/skills/moose@^1.0.0"]`

#### Scenario: Distribution without x_axm metadata

- **WHEN** `<lib-path>/.meta/DBI-1.643/MYMETA.json` does not contain an `"x_axm"` field
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: MYMETA.json missing for distribution

- **WHEN** `<lib-path>/.meta/<dist>/MYMETA.json` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the `x_axm` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed x_axm metadata warned and skipped

- **WHEN** `MYMETA.json` contains `"x_axm": { "recommendedExtensions": 42 }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `MYMETA.json` contains `"x_axm": { "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing Perl library path handled gracefully

When the Perl library path does not exist or the `.meta` directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without Perl installed or without local::lib.

#### Scenario: Perl library path does not exist

- **WHEN** none of the standard Perl library paths contain a `.meta` directory
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: .meta directory absent

- **WHEN** the Perl library path exists but contains no `.meta` directory
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

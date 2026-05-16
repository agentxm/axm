## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed opam packages

The opam reader SHALL inspect `.opam` files in the opam switch for `x-axm` custom fields. The location is `~/.opam/<switch>/lib/<pkg>/opam`. Opam supports `x-` prefixed custom fields. When `x-axm` fields are present and valid, the reader SHALL parse them and reconstruct the data into `AxmPackageMeta` shape.

#### Scenario: Package with valid x-axm custom fields

- **WHEN** `~/.opam/default/lib/lwt/opam` contains `x-axm-extensions: [{"ref":"@ocaml/skills/lwt","versionRange":"^1.0.0"}]`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@ocaml/skills/lwt", "versionRange": "^1.0.0" }]`

#### Scenario: Package without x-axm custom fields

- **WHEN** `~/.opam/default/lib/core/opam` does not contain any `x-axm` prefixed fields
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Multiple x-axm fields reconstructed

- **WHEN** the opam file contains multiple `x-axm` prefixed custom fields
- **THEN** the reader SHALL parse all fields and reconstruct them into the `AxmPackageMeta` shape

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the reconstructed `x-axm` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed x-axm metadata warned and skipped

- **WHEN** the opam file contains `x-axm-extensions` with an unparseable value
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra x-axm fields tolerated

- **WHEN** the opam file contains `x-axm-extensions` and `x-axm-futureField`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Missing opam switch handled gracefully

When the opam switch directory does not exist or the specific package directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without opam installed.

#### Scenario: Opam switch does not exist

- **WHEN** `~/.opam/` does not exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory absent from switch

- **WHEN** the opam switch exists but the specific package library directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

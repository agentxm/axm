## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed R packages

The CRAN reader SHALL inspect the `DESCRIPTION` file of installed R packages for `Config/axm` prefixed fields. R packages install `DESCRIPTION` to the library path (e.g., `/usr/local/lib/R/site-library/<pkg>/DESCRIPTION`). The reader SHALL check `R_LIBS_USER`, `R_LIBS_SITE`, and `.libPaths()` standard locations. When `Config/axm` fields are present and valid, the reader SHALL parse them and reconstruct the data into `AxmPackageMeta` shape.

#### Scenario: Package with valid Config/axm fields

- **WHEN** `<lib-path>/ggplot2/DESCRIPTION` contains `Config/axm: {"extensions": [{ "ref": "@tidyverse/skills/ggplot2", "versionRange": "^1.0.0" }]}`
- **THEN** the reader SHALL return the extension refs `[{ "ref": "@tidyverse/skills/ggplot2", "versionRange": "^1.0.0" }]`

#### Scenario: Package without Config/axm fields

- **WHEN** `<lib-path>/dplyr/DESCRIPTION` does not contain any `Config/axm` prefixed fields
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Multiple Config/axm fields reconstructed

- **WHEN** `<lib-path>/shiny/DESCRIPTION` contains multiple `Config/axm` prefixed fields
- **THEN** the reader SHALL parse all fields and reconstruct them into the `AxmPackageMeta` shape

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate the reconstructed `Config/axm` field contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed Config/axm metadata warned and skipped

- **WHEN** `<lib-path>/some-pkg/DESCRIPTION` contains `Config/axm` with an unparseable value
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra Config/axm fields tolerated

- **WHEN** `<lib-path>/some-pkg/DESCRIPTION` contains `Config/axm` with `extensions` and `futureField`
- **THEN** the reader SHALL extract `extensions` and ignore unknown fields

### Requirement: Missing R library handled gracefully

When the R library path does not exist or the specific package directory is absent, the reader SHALL return no recommendations without raising an error. This is the normal case for systems without R installed.

#### Scenario: R library path does not exist

- **WHEN** none of the standard R library paths exist
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Package directory absent from library

- **WHEN** the R library path exists but the specific package directory is absent
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

## ADDED Requirements

### Requirement: Parse DESCRIPTION file for R package dependencies

The CRAN detector SHALL parse the `DESCRIPTION` file in the project directory and extract dependencies from the `Depends`, `Imports`, `Suggests`, and `LinkingTo` fields. Each dependency SHALL be converted to a `pkg:cran` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from all sections

- **WHEN** `DESCRIPTION` contains `Imports: dplyr (>= 1.0.0), ggplot2`, `Depends: R (>= 4.0.0), stats`, and `Suggests: testthat`
- **THEN** the detector SHALL produce purls for `dplyr`, `ggplot2`, `stats`, and `testthat`

#### Scenario: Missing DESCRIPTION file

- **WHEN** the project directory does not contain a `DESCRIPTION` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed DESCRIPTION file

- **WHEN** `DESCRIPTION` contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependency fields

- **WHEN** `DESCRIPTION` exists but contains no `Depends`, `Imports`, `Suggests`, or `LinkingTo` fields
- **THEN** the detector SHALL return an empty array

### Requirement: Skip R runtime from Depends

The detector SHALL skip `R` itself when it appears in the `Depends` field, as it represents the R runtime and not a package dependency.

#### Scenario: R runtime excluded

- **WHEN** `Depends` contains `R (>= 4.0.0), stats`
- **THEN** the detector SHALL produce a purl for `stats` only
- **AND** no purl SHALL be produced for `R`

#### Scenario: Only R in Depends

- **WHEN** `Depends` contains only `R (>= 4.0.0)`
- **THEN** the detector SHALL produce no purls from the `Depends` field

### Requirement: Comma-separated entries with optional version constraints

The detector SHALL parse comma-separated dependency entries where each entry is a package name optionally followed by a version constraint in parentheses (e.g., `name (>= version)`).

#### Scenario: Entries with version constraints

- **WHEN** `Imports` contains `dplyr (>= 1.0.0), tidyr (>= 1.2.0)`
- **THEN** the detector SHALL produce purls for `dplyr` and `tidyr`

#### Scenario: Entries without version constraints

- **WHEN** `Imports` contains `ggplot2, stringr`
- **THEN** the detector SHALL produce purls for `ggplot2` and `stringr`

#### Scenario: Mixed entries

- **WHEN** `Imports` contains `dplyr (>= 1.0.0), ggplot2, tidyr (== 1.3.0)`
- **THEN** the detector SHALL produce purls for `dplyr`, `ggplot2`, and `tidyr`

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version constraint, the detector SHALL include the version in the purl. When a dependency specifies a range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `Imports` contains `dplyr (== 1.1.0)`
- **THEN** the detector SHALL produce `pkg:cran/dplyr@1.1.0`

#### Scenario: Version range

- **WHEN** `Imports` contains `dplyr (>= 1.0.0)`
- **THEN** the detector SHALL produce `pkg:cran/dplyr` (versionless)

#### Scenario: No version constraint

- **WHEN** `Imports` contains `ggplot2`
- **THEN** the detector SHALL produce `pkg:cran/ggplot2` (versionless)

### Requirement: LinkingTo dependencies included

The detector SHALL include packages from the `LinkingTo` field because they represent compiled code dependencies relevant for package compatibility.

#### Scenario: LinkingTo dependencies detected

- **WHEN** `LinkingTo` contains `Rcpp, BH`
- **THEN** the detector SHALL produce purls for `Rcpp` and `BH`

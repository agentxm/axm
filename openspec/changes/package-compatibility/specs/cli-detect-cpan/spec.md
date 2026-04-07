## ADDED Requirements

### Requirement: Parse cpanfile for Perl dependencies

The CPAN detector SHALL parse `cpanfile` in the project directory and extract dependencies from `requires` and `recommends` directives. Each dependency SHALL be converted to a `pkg:cpan` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from requires directives

- **WHEN** `cpanfile` contains `requires 'Moose';` and `requires 'DBI', '1.643';`
- **THEN** the detector SHALL produce purls for `Moose` and `DBI`

#### Scenario: Dependencies from recommends directives

- **WHEN** `cpanfile` contains `recommends 'JSON::XS';`
- **THEN** the detector SHALL produce a purl for `JSON::XS`

#### Scenario: Missing cpanfile

- **WHEN** the project directory does not contain a `cpanfile`
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed cpanfile

- **WHEN** `cpanfile` contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

### Requirement: Parse Makefile.PL for Perl dependencies

The CPAN detector SHALL parse `Makefile.PL` using regex on common patterns to extract dependencies from the `PREREQ_PM` hash without performing full Perl evaluation.

#### Scenario: Dependencies from PREREQ_PM

- **WHEN** `Makefile.PL` contains `PREREQ_PM => { 'Moose' => '2.0', 'DBI' => 0 }`
- **THEN** the detector SHALL produce purls for `Moose` and `DBI`

#### Scenario: Missing Makefile.PL

- **WHEN** the project directory does not contain a `Makefile.PL` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: No PREREQ_PM section

- **WHEN** `Makefile.PL` exists but contains no `PREREQ_PM` hash
- **THEN** the detector SHALL return an empty array

### Requirement: Map module names to distribution names for purl

Perl module names use `::` separators (e.g., `Moose::Role`). The detector SHALL map module names to distribution-style names for the purl by replacing `::` with `-`.

#### Scenario: Module name with double colon

- **WHEN** `cpanfile` contains `requires 'Moose::Role';`
- **THEN** the detector SHALL produce a purl with name `Moose-Role`

#### Scenario: Simple module name

- **WHEN** `cpanfile` contains `requires 'Moose';`
- **THEN** the detector SHALL produce a purl with name `Moose`

#### Scenario: Deeply nested module

- **WHEN** `cpanfile` contains `requires 'Net::HTTP::Tiny';`
- **THEN** the detector SHALL produce a purl with name `Net-HTTP-Tiny`

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version, the detector SHALL include the version in the purl. When a dependency specifies a version range or zero, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version in cpanfile

- **WHEN** `cpanfile` contains `requires 'DBI', '== 1.643';`
- **THEN** the detector SHALL produce `pkg:cpan/DBI@1.643`

#### Scenario: Minimum version in cpanfile

- **WHEN** `cpanfile` contains `requires 'DBI', '1.643';`
- **THEN** the detector SHALL produce `pkg:cpan/DBI` (versionless, as bare versions in cpanfile denote minimums)

#### Scenario: Zero version in Makefile.PL

- **WHEN** `PREREQ_PM` contains `'DBI' => 0`
- **THEN** the detector SHALL produce `pkg:cpan/DBI` (versionless)

#### Scenario: Specific version in Makefile.PL

- **WHEN** `PREREQ_PM` contains `'DBI' => '1.643'`
- **THEN** the detector SHALL produce `pkg:cpan/DBI` (versionless, as PREREQ_PM versions denote minimums)

### Requirement: PAUSE author namespace when available

When a PAUSE author ID is available from the dependency context, the detector SHALL include it as the purl namespace.

#### Scenario: No author information

- **WHEN** `cpanfile` contains `requires 'Moose';` with no author context
- **THEN** the detector SHALL produce `pkg:cpan/Moose` (no namespace)

### Requirement: Both files processed and deduplicated

When both `cpanfile` and `Makefile.PL` exist, the detector SHALL process both files and deduplicate results by distribution name.

#### Scenario: Dependencies from both files

- **WHEN** `cpanfile` contains `requires 'Moose';` and `Makefile.PL` contains `PREREQ_PM => { 'Moose' => '2.0' }`
- **THEN** the detector SHALL produce a single purl for `Moose`

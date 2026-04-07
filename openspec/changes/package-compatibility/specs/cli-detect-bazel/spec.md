## ADDED Requirements

### Requirement: Parse MODULE.bazel for Bazel dependencies

The Bazel detector SHALL parse `MODULE.bazel` in the project directory and extract dependencies from `bazel_dep` directives. Each dependency SHALL be converted to a `pkg:bazel` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from bazel_dep directives

- **WHEN** `MODULE.bazel` contains `bazel_dep(name = "rules_go", version = "0.41.0")` and `bazel_dep(name = "gazelle", version = "0.33.0")`
- **THEN** the detector SHALL produce purls for `rules_go` and `gazelle`

#### Scenario: Missing MODULE.bazel

- **WHEN** the project directory does not contain a `MODULE.bazel` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed MODULE.bazel

- **WHEN** `MODULE.bazel` contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No bazel_dep directives

- **WHEN** `MODULE.bazel` exists but contains no `bazel_dep` directives
- **THEN** the detector SHALL return an empty array

### Requirement: Parse WORKSPACE for Bazel dependencies (best-effort)

The Bazel detector SHALL parse `WORKSPACE` and extract dependencies from `http_archive` and similar repository rules on a best-effort basis. WORKSPACE is a legacy format with less structured content.

#### Scenario: Dependencies from http_archive rules

- **WHEN** `WORKSPACE` contains `http_archive(name = "io_bazel_rules_go", ...)` and `http_archive(name = "bazel_gazelle", ...)`
- **THEN** the detector SHALL produce purls for `io_bazel_rules_go` and `bazel_gazelle`

#### Scenario: Missing WORKSPACE

- **WHEN** the project directory does not contain a `WORKSPACE` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: No recognized repository rules

- **WHEN** `WORKSPACE` exists but contains no `http_archive` or similar rules with `name` attributes
- **THEN** the detector SHALL return an empty array

### Requirement: MODULE.bazel is the preferred format

MODULE.bazel (Bzlmod) is the preferred dependency format. When both `MODULE.bazel` and `WORKSPACE` exist, the detector SHALL process both and deduplicate results by package name.

#### Scenario: Dependencies from both files

- **WHEN** `MODULE.bazel` contains `bazel_dep(name = "rules_go", version = "0.41.0")` and `WORKSPACE` contains `http_archive(name = "rules_go", ...)`
- **THEN** the detector SHALL produce a single purl for `rules_go`

### Requirement: Exact versions from bazel_dep produce versioned purls

The `bazel_dep` directive includes an explicit `version` attribute. The detector SHALL produce versioned purls from `bazel_dep` entries. WORKSPACE entries without explicit version information SHALL produce versionless purls.

#### Scenario: Versioned bazel_dep

- **WHEN** `MODULE.bazel` contains `bazel_dep(name = "rules_go", version = "0.41.0")`
- **THEN** the detector SHALL produce `pkg:bazel/rules_go@0.41.0`

#### Scenario: bazel_dep without version

- **WHEN** `MODULE.bazel` contains `bazel_dep(name = "rules_go")`
- **THEN** the detector SHALL produce `pkg:bazel/rules_go` (versionless)

#### Scenario: WORKSPACE http_archive

- **WHEN** `WORKSPACE` contains `http_archive(name = "io_bazel_rules_go")` without an explicit version attribute
- **THEN** the detector SHALL produce `pkg:bazel/io_bazel_rules_go` (versionless)

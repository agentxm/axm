## ADDED Requirements

### Requirement: Parse opam files for OCaml dependencies

The opam detector SHALL parse `*.opam` files in the project directory and extract dependencies from the `depends` field. Each dependency SHALL be converted to a `pkg:opam` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from depends field

- **WHEN** an `.opam` file contains `depends: [ "lwt" {>= "5.0"} "cohttp" "yojson" ]`
- **THEN** the detector SHALL produce purls for `lwt`, `cohttp`, and `yojson`

#### Scenario: Missing opam files

- **WHEN** the project directory does not contain any `.opam` files
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed opam file

- **WHEN** an `.opam` file contains unparseable content
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No depends field

- **WHEN** an `.opam` file exists but contains no `depends` field
- **THEN** the detector SHALL return an empty array

### Requirement: Parse dune-project for OCaml dependencies

The opam detector SHALL parse `dune-project` and extract dependencies from `(depends ...)` s-expressions.

#### Scenario: Dependencies from depends s-expression

- **WHEN** `dune-project` contains `(depends (ocaml (>= 5.0)) (lwt (>= 5.0)) yojson)`
- **THEN** the detector SHALL produce purls for `lwt` and `yojson`

#### Scenario: Missing dune-project

- **WHEN** the project directory does not contain a `dune-project` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: No depends expression

- **WHEN** `dune-project` exists but contains no `(depends ...)` expression
- **THEN** the detector SHALL return an empty array

### Requirement: Skip build tooling dependencies

The detector SHALL skip `ocaml` and `dune` when they appear in dependency lists, as they represent build tooling and not library dependencies.

#### Scenario: ocaml excluded

- **WHEN** `depends` contains `"ocaml" {>= "5.0"}` and `"lwt" {>= "5.0"}`
- **THEN** the detector SHALL produce a purl for `lwt` only
- **AND** no purl SHALL be produced for `ocaml`

#### Scenario: dune excluded

- **WHEN** `depends` contains `"dune" {>= "3.0"}` and `"yojson"`
- **THEN** the detector SHALL produce a purl for `yojson` only
- **AND** no purl SHALL be produced for `dune`

#### Scenario: Only build tooling in depends

- **WHEN** `depends` contains only `"ocaml" {>= "5.0"}` and `"dune" {>= "3.0"}`
- **THEN** the detector SHALL return an empty array

### Requirement: Opam constraint syntax determines versioned purls

Opam uses `{ >= "version" }` constraint syntax. Ranges SHALL produce versionless purls. Exact version constraints SHALL produce versioned purls.

#### Scenario: Version range

- **WHEN** `depends` contains `"lwt" {>= "5.0"}`
- **THEN** the detector SHALL produce `pkg:opam/lwt` (versionless)

#### Scenario: Exact version

- **WHEN** `depends` contains `"lwt" {= "5.7.0"}`
- **THEN** the detector SHALL produce `pkg:opam/lwt@5.7.0`

#### Scenario: No version constraint

- **WHEN** `depends` contains `"yojson"`
- **THEN** the detector SHALL produce `pkg:opam/yojson` (versionless)

### Requirement: Both sources processed and deduplicated

When both `.opam` files and `dune-project` exist, the detector SHALL process all files and deduplicate results by package name.

#### Scenario: Dependencies from both sources

- **WHEN** an `.opam` file lists `lwt` in `depends` and `dune-project` lists `lwt` in `(depends ...)`
- **THEN** the detector SHALL produce a single purl for `lwt`

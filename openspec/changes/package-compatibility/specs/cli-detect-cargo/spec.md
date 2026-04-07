## ADDED Requirements

### Requirement: Parse Cargo.toml for Rust crate dependencies

The Cargo detector SHALL parse `Cargo.toml` in the project directory and extract dependencies from `[dependencies]`, `[dev-dependencies]`, and `[build-dependencies]` sections as `pkg:cargo` purls.

#### Scenario: Dependencies from all sections

- **WHEN** `Cargo.toml` contains `[dependencies] serde = "1.0"`, `[dev-dependencies] tokio-test = "0.4"`, `[build-dependencies] cc = "1.0"`
- **THEN** the detector SHALL produce purls for `serde`, `tokio-test`, and `cc`

#### Scenario: Missing Cargo.toml

- **WHEN** the project directory does not contain a `Cargo.toml` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed Cargo.toml

- **WHEN** `Cargo.toml` contains invalid TOML
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependency sections

- **WHEN** `Cargo.toml` exists but contains no `[dependencies]`, `[dev-dependencies]`, or `[build-dependencies]` sections
- **THEN** the detector SHALL return an empty array

### Requirement: Cargo dependency format handling

The detector SHALL handle both shorthand string syntax (`foo = "1.0"`) and inline table syntax (`foo = { version = "1.0" }`). Crate names are case-sensitive and SHALL be preserved as-is in the purl.

#### Scenario: Shorthand string version

- **WHEN** `[dependencies]` contains `serde = "1.0.193"`
- **THEN** the detector SHALL produce a purl with `type: "cargo"`, `name: "serde"`

#### Scenario: Inline table with version

- **WHEN** `[dependencies]` contains `serde = { version = "1.0", features = ["derive"] }`
- **THEN** the detector SHALL produce a purl with `type: "cargo"`, `name: "serde"`

#### Scenario: Case-sensitive name preserved

- **WHEN** `[dependencies]` contains `OpenSSL = "0.10"`
- **THEN** the detector SHALL produce a purl with `name: "OpenSSL"`

### Requirement: Renamed dependencies use real package name

When a dependency specifies a `package` key to rename a crate, the detector SHALL use the real package name from the `package` key, not the local alias.

#### Scenario: Renamed dependency

- **WHEN** `[dependencies]` contains `my-serde = { package = "serde", version = "1.0" }`
- **THEN** the detector SHALL produce a purl with `name: "serde"` (not `my-serde`)

#### Scenario: Unrenamed dependency uses key name

- **WHEN** `[dependencies]` contains `tokio = { version = "1.0" }`
- **THEN** the detector SHALL produce a purl with `name: "tokio"`

### Requirement: Exact versions produce versioned purls

Exact version pins (no range operators) SHALL produce versioned purls. Version ranges, wildcard constraints, or comparison operators SHALL produce versionless purls.

#### Scenario: Exact version pin

- **WHEN** `[dependencies]` contains `serde = "=1.0.193"`
- **THEN** the detector SHALL produce `pkg:cargo/serde@1.0.193`

#### Scenario: Caret range produces versionless purl

- **WHEN** `[dependencies]` contains `serde = "1.0"`
- **THEN** the detector SHALL produce `pkg:cargo/serde` (versionless, since Cargo treats `"1.0"` as `^1.0`)

#### Scenario: Tilde range produces versionless purl

- **WHEN** `[dependencies]` contains `serde = "~1.0.0"`
- **THEN** the detector SHALL produce `pkg:cargo/serde` (versionless)

#### Scenario: Wildcard produces versionless purl

- **WHEN** `[dependencies]` contains `serde = "*"`
- **THEN** the detector SHALL produce `pkg:cargo/serde` (versionless)

### Requirement: Path and git dependencies skipped

Dependencies using `path` or `git` sources SHALL be skipped. These represent local or non-registry sources that are not meaningful for package compatibility discovery.

#### Scenario: Path dependency skipped

- **WHEN** `[dependencies]` contains `my-lib = { path = "../my-lib" }`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: Git dependency skipped

- **WHEN** `[dependencies]` contains `my-lib = { git = "https://github.com/org/my-lib" }`
- **THEN** the detector SHALL not produce a purl for `my-lib`

#### Scenario: Git dependency with version still skipped

- **WHEN** `[dependencies]` contains `my-lib = { git = "https://github.com/org/my-lib", version = "1.0" }`
- **THEN** the detector SHALL not produce a purl for `my-lib`

## ADDED Requirements

### Requirement: Parse mix.exs for Elixir/Erlang dependencies

The Hex detector SHALL parse `mix.exs` in the project directory and extract dependency tuples from the `defp deps` function. Each dependency SHALL be converted to a `pkg:hex` purl with typed `PackageUrlParts`. The detector SHALL use regex/pattern matching on common Elixir dependency tuple forms rather than full Elixir evaluation.

#### Scenario: Dependencies from deps function

- **WHEN** `mix.exs` contains `defp deps do [{:phoenix, "~> 1.7"}, {:ecto, "~> 3.10"}] end`
- **THEN** the detector SHALL produce purls for `phoenix` and `ecto`

#### Scenario: Missing mix.exs

- **WHEN** the project directory does not contain a `mix.exs` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed mix.exs

- **WHEN** `mix.exs` cannot be parsed for dependency tuples
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No deps function

- **WHEN** `mix.exs` exists but contains no `defp deps` function
- **THEN** the detector SHALL return an empty array

### Requirement: Parse gleam.toml for Gleam dependencies

The Hex detector SHALL parse `gleam.toml` in the project directory and extract entries from `[dependencies]` and `[dev-dependencies]` sections. Each dependency SHALL be converted to a `pkg:hex` purl.

#### Scenario: Dependencies from gleam.toml

- **WHEN** `gleam.toml` contains `[dependencies]` with `gleam_stdlib = ">= 0.34.0 and < 2.0.0"`
- **THEN** the detector SHALL produce a purl for `gleam_stdlib`

#### Scenario: Dev dependencies from gleam.toml

- **WHEN** `gleam.toml` contains `[dev-dependencies]` with `gleeunit = ">= 1.0.0 and < 2.0.0"`
- **THEN** the detector SHALL produce a purl for `gleeunit`

#### Scenario: Missing gleam.toml

- **WHEN** the project directory does not contain a `gleam.toml` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

### Requirement: Optional organization namespace

Hex packages MAY include an organization namespace. When present, the detector SHALL include it as the purl namespace.

#### Scenario: Package without organization

- **WHEN** a dependency is `{:phoenix, "~> 1.7"}`
- **THEN** the detector SHALL produce a purl with `type: "hex"`, no namespace, `name: "phoenix"`

#### Scenario: Package with organization

- **WHEN** a dependency specifies organization `"myorg"` for package `"private_lib"`
- **THEN** the detector SHALL produce a purl with `type: "hex"`, `namespace: "myorg"`, `name: "private_lib"`

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version (no range operators), the detector SHALL include the version in the purl. When a dependency specifies a version range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version in mix.exs

- **WHEN** `deps` contains `{:jason, "1.4.1"}`
- **THEN** the detector SHALL produce `pkg:hex/jason@1.4.1`

#### Scenario: Approximate range in mix.exs

- **WHEN** `deps` contains `{:phoenix, "~> 1.7"}`
- **THEN** the detector SHALL produce `pkg:hex/phoenix` (versionless)

#### Scenario: Comparison range in mix.exs

- **WHEN** `deps` contains `{:ecto, ">= 3.10.0"}`
- **THEN** the detector SHALL produce `pkg:hex/ecto` (versionless)

#### Scenario: Exact version in gleam.toml

- **WHEN** `[dependencies]` contains `gleam_json = "1.0.0"`
- **THEN** the detector SHALL produce `pkg:hex/gleam_json@1.0.0`

#### Scenario: Range in gleam.toml

- **WHEN** `[dependencies]` contains `gleam_stdlib = ">= 0.34.0 and < 2.0.0"`
- **THEN** the detector SHALL produce `pkg:hex/gleam_stdlib` (versionless)

### Requirement: Path and git dependencies skipped

Dependencies using `:path` or `:git` options in mix.exs SHALL be skipped. These represent local or non-registry sources.

#### Scenario: Path dependency skipped

- **WHEN** `deps` contains `{:my_lib, path: "../my_lib"}`
- **THEN** the detector SHALL not produce a purl for `my_lib`

#### Scenario: Git dependency skipped

- **WHEN** `deps` contains `{:my_lib, git: "https://github.com/org/my_lib.git"}`
- **THEN** the detector SHALL not produce a purl for `my_lib`

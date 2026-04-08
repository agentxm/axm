## ADDED Requirements

### Requirement: Parse pixi.toml and mojoproject.toml for Mojo dependencies

The Mojo detector SHALL parse `pixi.toml` and `mojoproject.toml` in the project directory and extract dependencies from the `[dependencies]` section. `mojoproject.toml` is deprecated in favor of `pixi.toml`; the detector SHALL check both. Dependencies that are conda packages SHALL produce `pkg:conda` purls. Dependencies that are Mojo-specific SHALL produce `pkg:generic` purls with a `mojo` qualifier.

#### Scenario: Dependencies extracted from pixi.toml

- **WHEN** `pixi.toml` contains `[dependencies]` with entries `max = ">=24.6"` and `numpy = ">=1.26"`
- **THEN** the detector SHALL produce `pkg:generic/mojo/max` and `pkg:conda/numpy` purls

#### Scenario: Dependencies from deprecated mojoproject.toml

- **WHEN** the project directory contains `mojoproject.toml` but no `pixi.toml`
- **AND** `mojoproject.toml` contains `[dependencies]` with entries
- **THEN** the detector SHALL extract dependencies from `mojoproject.toml`

#### Scenario: pixi.toml takes precedence over mojoproject.toml

- **WHEN** the project directory contains both `pixi.toml` and `mojoproject.toml`
- **THEN** the detector SHALL use `pixi.toml` as the primary source

#### Scenario: Missing dependency files

- **WHEN** the project directory contains neither `pixi.toml` nor `mojoproject.toml`
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed pixi.toml

- **WHEN** `pixi.toml` contains invalid TOML
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependencies section

- **WHEN** `pixi.toml` exists but contains no `[dependencies]` section
- **THEN** the detector SHALL return an empty array

### Requirement: Conda packages produce pkg:conda purls

Dependencies that are recognized conda packages (e.g., `numpy`, `scipy`, `pandas`) SHALL produce `pkg:conda` purls since they are distributed through conda channels.

#### Scenario: Conda dependency

- **WHEN** `[dependencies]` contains `"numpy": ">=1.26"`
- **THEN** the detector SHALL produce `pkg:conda/numpy` (versionless, since it's a range)

### Requirement: Mojo-specific packages produce pkg:generic purls

Dependencies that are Mojo-specific (e.g., `max`, Modular SDK packages) SHALL produce `pkg:generic` purls with a `mojo` qualifier since there is no registered purl type for Mojo.

#### Scenario: Mojo-specific dependency

- **WHEN** `[dependencies]` contains `"max": ">=24.6"`
- **THEN** the detector SHALL produce a purl with `type: "generic"`, `namespace: "mojo"`, `name: "max"`

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version (no range operators), the detector SHALL include the version in the purl. When a dependency specifies a version range, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version

- **WHEN** `[dependencies]` contains `"max": "24.6.0"`
- **THEN** the detector SHALL produce a versioned purl with `@24.6.0`

#### Scenario: Version range

- **WHEN** `[dependencies]` contains `"max": ">=24.6"`
- **THEN** the detector SHALL produce a versionless purl

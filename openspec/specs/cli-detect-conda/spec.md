## ADDED Requirements

### Requirement: Parse environment.yml for Conda dependencies

The Conda detector SHALL parse `environment.yml` in the project directory and extract entries from the `dependencies:` list. Each dependency SHALL be converted to a `pkg:conda` purl with typed `PackageUrlParts`.

#### Scenario: Dependencies from environment.yml

- **WHEN** `environment.yml` contains `dependencies: [numpy=1.24.0, pandas, scikit-learn]`
- **THEN** the detector SHALL produce purls for `numpy`, `pandas`, and `scikit-learn`

#### Scenario: Missing environment.yml

- **WHEN** the project directory does not contain an `environment.yml` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Malformed environment.yml

- **WHEN** `environment.yml` contains invalid YAML
- **THEN** the detector SHALL log a warning and return an empty array

#### Scenario: No dependencies section

- **WHEN** `environment.yml` exists but contains no `dependencies`
- **THEN** the detector SHALL return an empty array

### Requirement: Parse meta.yaml for Conda recipe dependencies

The Conda detector SHALL parse `meta.yaml` in the project directory and extract entries from the `requirements.run` and `requirements.host` lists.

#### Scenario: Dependencies from meta.yaml

- **WHEN** `meta.yaml` contains `requirements: { host: [python, numpy], run: [python, pandas] }`
- **THEN** the detector SHALL produce purls for `python`, `numpy`, and `pandas`

#### Scenario: Missing meta.yaml

- **WHEN** the project directory does not contain a `meta.yaml` file
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

### Requirement: Dependency version parsing

Conda dependencies use the format `name=version=build` or just `name`. The detector SHALL parse this format and extract name and version components.

#### Scenario: Name with version and build

- **WHEN** a dependency entry is `numpy=1.24.0=py311h54d7cd4_0`
- **THEN** the detector SHALL produce a purl with `type: "conda"`, `name: "numpy"`, `version: "1.24.0"`

#### Scenario: Name with version only

- **WHEN** a dependency entry is `pandas=2.0.0`
- **THEN** the detector SHALL produce a purl with `name: "pandas"`, `version: "2.0.0"`

#### Scenario: Name only

- **WHEN** a dependency entry is `scikit-learn`
- **THEN** the detector SHALL produce `pkg:conda/scikit-learn` (versionless)

### Requirement: Exact versions produce versioned purls

When a dependency specifies an exact version pin, the detector SHALL include the version in the purl. When a dependency specifies a version range or no version, the version SHALL be omitted (versionless purl).

#### Scenario: Exact version pin

- **WHEN** a dependency entry is `numpy=1.24.0`
- **THEN** the detector SHALL produce `pkg:conda/numpy@1.24.0`

#### Scenario: Version range

- **WHEN** a dependency entry is `numpy >=1.24`
- **THEN** the detector SHALL produce `pkg:conda/numpy` (versionless)

#### Scenario: No version

- **WHEN** a dependency entry is `numpy`
- **THEN** the detector SHALL produce `pkg:conda/numpy` (versionless)

### Requirement: Channel qualifier included when specified

When a dependency specifies a channel (e.g., via `conda-forge::numpy` syntax or the `channels:` key in environment.yml), the detector SHALL include the channel as a purl qualifier.

#### Scenario: Channel prefix on dependency

- **WHEN** a dependency entry is `conda-forge::numpy=1.24.0`
- **THEN** the detector SHALL produce a purl with `name: "numpy"`, `version: "1.24.0"`, and qualifier `channel: "conda-forge"`

#### Scenario: No channel specified

- **WHEN** a dependency entry is `numpy=1.24.0` with no channel context
- **THEN** the detector SHALL produce a purl with no channel qualifier

### Requirement: Pip sub-list items mapped to pkg:pypi

Items in the `pip:` sub-list within `dependencies:` in `environment.yml` SHALL be converted to `pkg:pypi` purls, not `pkg:conda` purls, because these are PyPI packages installed via pip within the Conda environment.

#### Scenario: Pip dependency

- **WHEN** `environment.yml` contains `dependencies: [numpy, { pip: [requests==2.31.0] }]`
- **THEN** the detector SHALL produce `pkg:conda/numpy` for the conda dependency and `pkg:pypi/requests@2.31.0` for the pip dependency

#### Scenario: Pip dependency with range

- **WHEN** the `pip:` sub-list contains `flask>=2.0`
- **THEN** the detector SHALL produce `pkg:pypi/flask` (versionless)

#### Scenario: Pip dependency exact version

- **WHEN** the `pip:` sub-list contains `requests==2.31.0`
- **THEN** the detector SHALL produce `pkg:pypi/requests@2.31.0`

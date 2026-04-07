## ADDED Requirements

### Requirement: Parse Python dependency files for pypi packages

The pypi detector SHALL parse Python dependency files in the project directory and extract direct dependencies as `pkg:pypi` purls. The following files SHALL be supported in priority order: `pyproject.toml`, `requirements.txt`, `setup.cfg`, `Pipfile`. Dependencies SHALL be deduplicated across files.

#### Scenario: pyproject.toml with project dependencies

- **WHEN** `pyproject.toml` contains `[project] dependencies = ["django>=4.0", "requests"]`
- **THEN** the detector SHALL produce purls for `django` and `requests`

#### Scenario: pyproject.toml with optional dependencies

- **WHEN** `pyproject.toml` contains `[project.optional-dependencies] dev = ["pytest>=7.0"]`
- **THEN** the detector SHALL produce a purl for `pytest`

#### Scenario: requirements.txt

- **WHEN** `requirements.txt` contains lines `flask>=2.0\nrequests==2.31.0`
- **THEN** the detector SHALL produce purls for `flask` (versionless) and `requests` (versioned at `2.31.0`)

#### Scenario: setup.cfg

- **WHEN** `setup.cfg` contains `[options] install_requires = sqlalchemy>=2.0`
- **THEN** the detector SHALL produce a purl for `sqlalchemy`

#### Scenario: Pipfile

- **WHEN** `Pipfile` contains `[packages] django = ">=4.0"`
- **THEN** the detector SHALL produce a purl for `django`

#### Scenario: No Python files present

- **WHEN** the project directory contains no Python dependency files
- **THEN** the detector SHALL return an empty array
- **AND** no error SHALL be raised

#### Scenario: Deduplication across files

- **WHEN** both `pyproject.toml` and `requirements.txt` list `requests`
- **THEN** the detector SHALL produce only one purl for `requests`

### Requirement: Python package name normalization

Python package names SHALL be normalized to lowercase with underscores replaced by dashes, per the purl spec for pypi packages. Names are case-insensitive and treat `-`, `_`, and `.` as equivalent.

#### Scenario: Mixed case normalized

- **WHEN** a dependency is listed as `Flask`
- **THEN** the detector SHALL produce `pkg:pypi/flask`

#### Scenario: Underscores replaced with dashes

- **WHEN** a dependency is listed as `Flask_RESTful`
- **THEN** the detector SHALL produce `pkg:pypi/flask-restful`

#### Scenario: Dots replaced with dashes

- **WHEN** a dependency is listed as `zope.interface`
- **THEN** the detector SHALL produce `pkg:pypi/zope-interface`

### Requirement: Version handling for PEP 440 specifiers

PEP 440 version specifiers (ranges, comparisons) SHALL produce versionless purls. Only exact pins (`==X.Y.Z` without wildcards) SHALL produce versioned purls.

#### Scenario: Exact pin produces versioned purl

- **WHEN** `requirements.txt` contains `requests==2.31.0`
- **THEN** the detector SHALL produce `pkg:pypi/requests@2.31.0`

#### Scenario: Range produces versionless purl

- **WHEN** `requirements.txt` contains `django>=4.0,<5.0`
- **THEN** the detector SHALL produce `pkg:pypi/django` (versionless)

#### Scenario: Compatible release produces versionless purl

- **WHEN** `requirements.txt` contains `flask~=2.0`
- **THEN** the detector SHALL produce `pkg:pypi/flask` (versionless)

#### Scenario: Wildcard pin produces versionless purl

- **WHEN** `requirements.txt` contains `numpy==1.24.*`
- **THEN** the detector SHALL produce `pkg:pypi/numpy` (versionless)

#### Scenario: No version specifier produces versionless purl

- **WHEN** `requirements.txt` contains `requests`
- **THEN** the detector SHALL produce `pkg:pypi/requests` (versionless)

### Requirement: requirements.txt -r include support

The detector SHALL follow `-r <file>` include directives in `requirements.txt` to resolve dependencies from referenced files.

#### Scenario: Include directive followed

- **WHEN** `requirements.txt` contains `-r requirements-dev.txt`
- **AND** `requirements-dev.txt` contains `pytest>=7.0`
- **THEN** the detector SHALL produce a purl for `pytest`

#### Scenario: Missing include file

- **WHEN** `requirements.txt` contains `-r missing.txt` and `missing.txt` does not exist
- **THEN** the detector SHALL log a warning and continue processing other lines

### Requirement: setup.py excluded

The detector SHALL NOT attempt to parse `setup.py` because it is executable Python code requiring the Python interpreter for reliable parsing. Static manifest files (`pyproject.toml`, `requirements.txt`, `setup.cfg`, `Pipfile`) provide sufficient coverage.

#### Scenario: setup.py ignored

- **WHEN** the project directory contains only `setup.py` with `install_requires=["django"]`
- **THEN** the detector SHALL return an empty array (setup.py is not parsed)

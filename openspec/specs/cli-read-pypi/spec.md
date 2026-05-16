## ADDED Requirements

### Requirement: Read axm recommendation metadata from installed Python packages

The pypi reader SHALL inspect locally installed Python packages for axm recommendation metadata. For each detected pypi package, the reader SHALL locate the `.dist-info` directory, check for an `[axm]` entry point group in `entry_points.txt`, and read `axm.json` from the package data directory.

#### Scenario: Package with valid axm metadata via entry point

- **WHEN** `site-packages/django-4.2.0.dist-info/entry_points.txt` contains an `[axm]` group
- **AND** the package data contains a valid `axm.json` with `"extensions": [{ "ref": "@django/skills/django", "versionRange": "^1.0.0" }]`
- **THEN** the reader SHALL return the extension refs

#### Scenario: Package without axm entry point

- **WHEN** `site-packages/requests-2.31.0.dist-info/entry_points.txt` does not contain an `[axm]` group
- **THEN** the reader SHALL return no recommendations (Option.none)

#### Scenario: Package not installed

- **WHEN** no `.dist-info` directory exists for the detected package
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

### Requirement: Locate dist-info by normalized package name

The reader SHALL scan the site-packages directory for a `.dist-info` directory matching the normalized package name (lowercased, underscores/dashes normalized). The reader SHALL handle name variations between the purl form and the dist-info directory name.

#### Scenario: Standard dist-info located

- **WHEN** the detected package is `pkg:pypi/flask`
- **AND** `site-packages/Flask-2.3.0.dist-info/` exists
- **THEN** the reader SHALL locate and use this dist-info directory

#### Scenario: Normalized name matching

- **WHEN** the detected package is `pkg:pypi/flask-restful`
- **AND** `site-packages/Flask_RESTful-0.3.10.dist-info/` exists
- **THEN** the reader SHALL locate and use this dist-info directory

### Requirement: Virtual environment support

The reader SHALL check `$VIRTUAL_ENV/lib/python*/site-packages/` when the `VIRTUAL_ENV` environment variable is set. When `VIRTUAL_ENV` is not set, the reader SHALL fall back to the system site-packages location.

#### Scenario: Virtual environment active

- **WHEN** `$VIRTUAL_ENV` is set to `/project/.venv`
- **THEN** the reader SHALL scan `/project/.venv/lib/python*/site-packages/` for dist-info directories

#### Scenario: No virtual environment

- **WHEN** `$VIRTUAL_ENV` is not set
- **THEN** the reader SHALL fall back to the system site-packages location

### Requirement: Validate axm.json against AxmPackageMeta schema

The reader SHALL validate `axm.json` contents against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped.

#### Scenario: Valid axm.json

- **WHEN** `axm.json` contains `{ "extensions": [{ "ref": "@acme/skills/django", "versionRange": "^1.0.0" }] }`
- **THEN** schema validation SHALL succeed and the reader SHALL return the extension refs

#### Scenario: Malformed axm.json

- **WHEN** `axm.json` contains invalid JSON or fails schema validation
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

### Requirement: No Python interpreter dependency

The reader SHALL read `entry_points.txt` (INI format) and `axm.json` (JSON) directly via filesystem operations. The reader SHALL NOT require the Python interpreter to be installed.

#### Scenario: Reader operates without Python

- **WHEN** the Python interpreter is not installed or not on PATH
- **THEN** the reader SHALL still be able to inspect `.dist-info` directories and read metadata files

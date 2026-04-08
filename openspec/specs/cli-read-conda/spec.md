## ADDED Requirements

### Requirement: Read axm recommendation metadata from conda package installations via shared data

The conda reader SHALL inspect `$CONDA_PREFIX/share/axm/<package-name>/axm.json` as the primary source for recommendation metadata. The `$CONDA_PREFIX` environment variable points to the active conda environment. This metadata is installed via a post-link script included in the conda package. When present and valid, the reader SHALL extract the `recommendedExtensions` array.

#### Scenario: Package with valid axm.json in shared data

- **WHEN** `$CONDA_PREFIX/share/axm/numpy/axm.json` contains `{ "recommendedExtensions": ["@numpy/skills/numpy@^1.0.0"] }`
- **THEN** the reader SHALL return the extension refs `["@numpy/skills/numpy@^1.0.0"]`

#### Scenario: Package without axm.json in shared data

- **WHEN** `$CONDA_PREFIX/share/axm/pandas/axm.json` does not exist
- **THEN** the reader SHALL fall back to package cache inspection

#### Scenario: Package with empty recommendedExtensions

- **WHEN** `$CONDA_PREFIX/share/axm/scipy/axm.json` contains `{ "recommendedExtensions": [] }`
- **THEN** the reader SHALL return an empty array of recommendations

### Requirement: Fall back to conda package cache about.json

When no `axm.json` is found in the shared data location, the reader SHALL inspect the conda package cache for `info/about.json` and extract the `extra.axm` key containing recommendation metadata.

#### Scenario: Metadata found in package cache about.json

- **WHEN** `$CONDA_PREFIX/share/axm/scikit-learn/axm.json` does not exist
- **AND** the package cache `info/about.json` contains `"extra": { "axm": { "recommendedExtensions": ["@sklearn/skills/sklearn@^1.0.0"] } }`
- **THEN** the reader SHALL return the extension refs `["@sklearn/skills/sklearn@^1.0.0"]`

#### Scenario: No metadata in either location

- **WHEN** `$CONDA_PREFIX/share/axm/matplotlib/axm.json` does not exist
- **AND** the package cache `info/about.json` has no `extra` field or no `axm` key within `extra`
- **THEN** the reader SHALL return no recommendations (Option.none)

### Requirement: Validate metadata against AxmPackageMeta schema

The reader SHALL validate metadata from either source against the `AxmPackageMeta` schema using `Schema.decodeUnknownResult`. Malformed metadata SHALL be warned and skipped, not cause a fatal error.

#### Scenario: Malformed metadata warned and skipped

- **WHEN** `$CONDA_PREFIX/share/axm/some-pkg/axm.json` contains `{ "recommendedExtensions": null }`
- **THEN** the reader SHALL log a warning with schema error details
- **AND** return no recommendations (Option.none)

#### Scenario: Extra fields tolerated

- **WHEN** `$CONDA_PREFIX/share/axm/some-pkg/axm.json` contains `{ "recommendedExtensions": ["@acme/skills/foo@^1.0.0"], "futureField": true }`
- **THEN** the reader SHALL extract `recommendedExtensions` and ignore unknown fields

### Requirement: Missing conda environment handled gracefully

When no conda environment is active (missing `$CONDA_PREFIX` or missing metadata locations), the reader SHALL return no recommendations without raising an error. This is the normal case when conda is not installed or no environment is activated.

#### Scenario: CONDA_PREFIX not set

- **WHEN** the `$CONDA_PREFIX` environment variable is not set
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

#### Scenario: Shared data directory does not exist

- **WHEN** `$CONDA_PREFIX` is set but `$CONDA_PREFIX/share/axm/` does not exist
- **THEN** the reader SHALL proceed to the package cache fallback

#### Scenario: Package not found in either location

- **WHEN** `$CONDA_PREFIX` is set but neither the shared data location nor the package cache contains metadata for the package
- **THEN** the reader SHALL return no recommendations (Option.none)
- **AND** no error SHALL be raised

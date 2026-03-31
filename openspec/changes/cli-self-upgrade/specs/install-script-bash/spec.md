## ADDED Requirements

### Requirement: Bash install script writes install metadata file

After placing the binary, the script SHALL write an install metadata file recording the installation method.

#### Scenario: Metadata file written after install

- **WHEN** the binary has been placed at `~/.axm/bin/axm`
- **THEN** the script SHALL write `~/.axm/install-meta.json` containing `{"method": "script", "installedAt": "<ISO 8601 timestamp>"}`

#### Scenario: Metadata file overwritten on reinstall

- **WHEN** the script runs and `~/.axm/install-meta.json` already exists
- **THEN** the script SHALL overwrite the file with fresh metadata including the current timestamp

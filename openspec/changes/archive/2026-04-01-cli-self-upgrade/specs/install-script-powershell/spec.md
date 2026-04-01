## ADDED Requirements

### Requirement: PowerShell install script writes install metadata file

After placing the binary, the script SHALL write an install metadata file recording the installation method.

#### Scenario: Metadata file written after install

- **WHEN** the binary has been placed in `%LOCALAPPDATA%\axm\`
- **THEN** the script SHALL write `%LOCALAPPDATA%\axm\install-meta.json` containing `{"method": "script", "installedAt": "<ISO 8601 timestamp>"}`

#### Scenario: Metadata file overwritten on reinstall

- **WHEN** the script runs and `%LOCALAPPDATA%\axm\install-meta.json` already exists
- **THEN** the script SHALL overwrite the file with fresh metadata including the current timestamp

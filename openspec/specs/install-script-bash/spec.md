# install-script-bash Specification

## Purpose

Define the standalone bash installer flow for downloading, placing, and verifying the axm binary on macOS and Linux.

## ADDED Requirements

### Requirement: Bash install script detects platform and architecture

The `install.sh` script SHALL detect the operating system (macOS, Linux) and architecture (x64, arm64) to determine the correct binary to download.

#### Scenario: macOS arm64 detected

- **WHEN** the script runs on an arm64 macOS system
- **THEN** it SHALL select the `axm-darwin-arm64` binary for download

#### Scenario: macOS x64 detected

- **WHEN** the script runs on an x64 macOS system
- **THEN** it SHALL select the `axm-darwin-x64` binary for download

#### Scenario: Linux x64 detected

- **WHEN** the script runs on an x64 Linux system
- **THEN** it SHALL select the `axm-linux-x64` binary for download

#### Scenario: Linux arm64 detected

- **WHEN** the script runs on an arm64 Linux system
- **THEN** it SHALL select the `axm-linux-arm64` binary for download

#### Scenario: Unsupported platform or architecture

- **WHEN** the script runs on an unsupported OS or architecture
- **THEN** it SHALL print an error message listing supported platforms and exit with exit code 1

### Requirement: Bash install script downloads standalone binary

The script SHALL download the appropriate prebuilt axm binary from the GitHub Releases URL using `curl` or `wget`. It SHALL NOT require Node.js, npm, or any runtime dependency.

#### Scenario: Successful download with curl

- **WHEN** `curl` is available and the download succeeds
- **THEN** the script SHALL save the binary to the install directory and proceed to verification

#### Scenario: Fallback to wget

- **WHEN** `curl` is not available but `wget` is
- **THEN** the script SHALL use `wget` to download the binary

#### Scenario: No download tool available

- **WHEN** neither `curl` nor `wget` is available
- **THEN** the script SHALL print an error message and exit with exit code 1

#### Scenario: Download fails

- **WHEN** the download fails (network error, 404, etc.)
- **THEN** the script SHALL print an error message and exit with a non-zero exit code

### Requirement: Bash install script places binary on PATH

The script SHALL install the binary to a well-known location and make it executable. If the location is not already on PATH, it SHALL instruct the user to add it.

#### Scenario: Binary placed and made executable

- **WHEN** the download completes
- **THEN** the script SHALL place the binary at `~/.axm/bin/axm` and `chmod +x` it

#### Scenario: PATH guidance provided

- **WHEN** `axm` is not found on PATH after placement
- **THEN** the script SHALL print instructions for adding the install directory to PATH

### Requirement: Bash install script verifies installation

After installation, the script SHALL check that the `axm` command is available and display the installed version.

#### Scenario: axm is on PATH after install

- **WHEN** `axm` is found on PATH after installation
- **THEN** the script SHALL run `axm --version` and display a success message with next steps (`axm auth login`)

#### Scenario: axm is not on PATH after install

- **WHEN** `axm` is not found on PATH after installation
- **THEN** the script SHALL print the PATH instructions and a note that a new shell session may be required

### Requirement: Bash install script is servable as a one-liner

The script SHALL be executable via `curl -fsSL https://axm.sh/install.sh | sh` without requiring the user to save the file first.

#### Scenario: One-liner execution

- **WHEN** a user runs `curl -fsSL https://axm.sh/install.sh | sh`
- **THEN** the script SHALL execute the full install flow (detect → download → place → verify)

### Requirement: Bash install script writes install metadata file

After placing the binary, the script SHALL write an install metadata file recording the installation method.

#### Scenario: Metadata file written after install

- **WHEN** the binary has been placed at `~/.axm/bin/axm`
- **THEN** the script SHALL write `~/.axm/install-meta.json` containing `{"method": "script", "installedAt": "<ISO 8601 timestamp>"}`

#### Scenario: Metadata file overwritten on reinstall

- **WHEN** the script runs and `~/.axm/install-meta.json` already exists
- **THEN** the script SHALL overwrite the file with fresh metadata including the current timestamp

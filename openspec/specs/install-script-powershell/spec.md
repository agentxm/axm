# install-script-powershell Specification

## Purpose

Define the standalone PowerShell installer flow for downloading, placing, and verifying the axm binary on Windows.

## ADDED Requirements

### Requirement: PowerShell install script detects platform and architecture

The `install.ps1` script SHALL detect the Windows architecture (x64, arm64) to determine the correct binary to download.

#### Scenario: x64 Windows detected

- **WHEN** the script runs on an x64 Windows system
- **THEN** it SHALL select the `axm-windows-x64.exe` binary for download

#### Scenario: Windows arm64 (unsupported)

- **WHEN** the script runs on an arm64 Windows system
- **THEN** it SHALL print an error message stating that Windows arm64 is not yet supported and exit with exit code 1

#### Scenario: Other unsupported architecture

- **WHEN** the script runs on any other unsupported architecture
- **THEN** it SHALL print an error message listing supported architectures and exit with exit code 1

### Requirement: PowerShell install script downloads standalone binary

The script SHALL download the appropriate prebuilt axm binary from the GitHub Releases URL. It SHALL NOT require Node.js, npm, or any runtime dependency.

#### Scenario: Successful download

- **WHEN** the script downloads the binary successfully
- **THEN** it SHALL save the binary to the install directory and proceed to verification

#### Scenario: Download fails

- **WHEN** the download fails (network error, 404, etc.)
- **THEN** it SHALL print an error message and exit with a non-zero exit code

### Requirement: PowerShell install script places binary on PATH

The script SHALL install the binary to a well-known location (e.g., `%LOCALAPPDATA%\\axm\\`) and instruct the user to add it to PATH if not already present.

#### Scenario: Install directory created and binary placed

- **WHEN** the download completes
- **THEN** the script SHALL create the install directory if needed and place the `axm.exe` binary there

#### Scenario: PATH guidance provided

- **WHEN** `axm` is not found on PATH after placement
- **THEN** the script SHALL print instructions for adding the install directory to the user's PATH

### Requirement: PowerShell install script verifies installation

After installation, the script SHALL check that the `axm` command is available and display the installed version.

#### Scenario: axm is on PATH after install

- **WHEN** `axm` is found on PATH after installation
- **THEN** the script SHALL run `axm --version` and display a success message with next steps (`axm auth login`)

#### Scenario: axm is not on PATH after install

- **WHEN** `axm` is not found on PATH after installation
- **THEN** the script SHALL print the PATH instructions and a note that a new terminal may be required

### Requirement: PowerShell install script is servable as a one-liner

The script SHALL be executable via `irm https://axm.sh/install.ps1 | iex` without requiring the user to save the file first.

#### Scenario: One-liner execution

- **WHEN** a user runs `irm https://axm.sh/install.ps1 | iex`
- **THEN** the script SHALL execute the full install flow (detect → download → place → verify)

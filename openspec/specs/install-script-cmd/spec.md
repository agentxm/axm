# install-script-cmd Specification

## Purpose

Define the standalone Windows CMD installer flow for downloading, placing, and verifying the axm binary without PowerShell or Node.js.

## ADDED Requirements

### Requirement: CMD install script downloads standalone binary

The `install.cmd` script SHALL download the prebuilt axm Windows binary from the GitHub Releases URL using `curl` (available on Windows 10+ by default). It SHALL NOT require Node.js, npm, or any runtime dependency.

#### Scenario: Successful download

- **WHEN** the script downloads the binary successfully
- **THEN** it SHALL save the binary to the install directory and proceed to verification

#### Scenario: Download fails

- **WHEN** the download fails
- **THEN** the script SHALL display an error and exit with a non-zero exit code

#### Scenario: curl not available

- **WHEN** `curl` is not found on the system (pre-Windows 10)
- **THEN** the script SHALL print an error message suggesting a manual download or using the PowerShell installer instead

### Requirement: CMD install script places binary on PATH

The script SHALL install the binary to `%USERPROFILE%\\.axm\\bin\\` and instruct the user to add it to PATH if not already present.

#### Scenario: Install directory created and binary placed

- **WHEN** the download completes
- **THEN** the script SHALL create the install directory if needed and place `axm.exe` there

#### Scenario: PATH guidance provided

- **WHEN** `axm` is not found via `where axm` after placement
- **THEN** the script SHALL print instructions for adding the install directory to PATH

### Requirement: CMD install script verifies installation

After installation, the script SHALL check that `axm` is available via `where axm` and display the installed version.

#### Scenario: axm is on PATH after install

- **WHEN** `where axm` succeeds after installation
- **THEN** the script SHALL run `axm --version` and display a success message with next steps (`axm auth login`)

#### Scenario: axm is not on PATH after install

- **WHEN** `where axm` fails after installation
- **THEN** the script SHALL print PATH instructions and note that a new terminal may be required

### Requirement: CMD install script requires no external tools beyond curl

The script SHALL use only built-in Windows CMD commands and `curl` (bundled with Windows 10+). It SHALL NOT require PowerShell, Node.js, npm, or any third-party tools.

#### Scenario: Execution on Windows 10+ with no dev tools

- **WHEN** a user runs `install.cmd` on a Windows 10+ system with no developer tools installed
- **THEN** the script SHALL complete the full install flow without errors

### Requirement: CMD install script writes install metadata file

After placing the binary, the script SHALL write an install metadata file recording the installation method.

#### Scenario: Metadata file written after install

- **WHEN** the binary has been placed in `%USERPROFILE%\.axm\bin\`
- **THEN** the script SHALL write `%USERPROFILE%\.axm\install-meta.json` containing `{"method": "script", "installedAt": "<ISO 8601 timestamp>"}`

#### Scenario: Metadata file overwritten on reinstall

- **WHEN** the script runs and `%USERPROFILE%\.axm\install-meta.json` already exists
- **THEN** the script SHALL overwrite the file with fresh metadata including the current timestamp

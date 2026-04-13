# cli-upgrade Specification

## Purpose

Define the `axm upgrade` command that detects the installation method and either self-updates the binary (native installs) or directs the user to the appropriate package manager command.

## Requirements

### Requirement: Upgrade command detects installation method

The `axm upgrade` command SHALL detect how axm was installed using the following precedence chain:

1. `process.execPath` inside `~/.axm/bin/` or `%LOCALAPPDATA%\axm\` → `script`
2. Resolved `process.execPath` contains `/Cellar/` → `homebrew`
3. `import.meta.url` resolves inside a `node_modules` path → `npm`
4. `install-meta.json` exists and contains a known method → value from file
5. None of the above → `unknown`

#### Scenario: Binary in axm install directory

- **WHEN** the resolved `process.execPath` is inside `~/.axm/bin/` (Unix) or `%LOCALAPPDATA%\axm\` (Windows)
- **THEN** the command SHALL detect the installation method as `script`

#### Scenario: Binary in Homebrew Cellar

- **WHEN** the resolved `process.execPath` contains `/Cellar/`
- **THEN** the command SHALL detect the installation method as `homebrew`

#### Scenario: Running from node_modules

- **WHEN** `import.meta.url` resolves inside a `node_modules` path
- **THEN** the command SHALL detect the installation method as `npm`

#### Scenario: Metadata file fallback

- **WHEN** path-based detection returns no match AND `install-meta.json` exists with a known method
- **THEN** the command SHALL use the method from the metadata file

#### Scenario: No detection signal

- **WHEN** no path-based signal matches AND no metadata file exists
- **THEN** the command SHALL treat the installation method as `unknown`

### Requirement: Upgrade command self-updates for script installs

When the detected method is `script`, the command SHALL download the latest binary from GitHub Releases and atomically replace the running binary.

#### Scenario: Newer version available

- **WHEN** the detected method is `script` AND a newer version exists on GitHub Releases
- **THEN** the command SHALL download the platform-appropriate binary, replace the current binary atomically, and print a success message with the new version

#### Scenario: Already up to date

- **WHEN** the detected method is `script` AND the local version matches the latest release
- **THEN** the command SHALL print a message indicating the binary is already up to date and exit with code 0

#### Scenario: Force flag overrides version check

- **WHEN** the `--force` flag is passed AND the detected method is `script`
- **THEN** the command SHALL re-download and replace the binary even if the local version matches the latest release

#### Scenario: Version transition displayed before download

- **WHEN** the detected method is `script` AND a newer version is available
- **THEN** the command SHALL print the version transition (e.g., `Upgrading: 0.0.34 → 0.1.0`) and proceed directly to download without prompting

#### Scenario: Local version unknown

- **WHEN** the local version cannot be resolved (neither `__AXM_VERSION__` nor `package.json`)
- **THEN** the command SHALL treat the local version as always-stale and proceed to download

### Requirement: Upgrade command delegates for package manager installs

When the detected method is `homebrew` or `npm`, the command SHALL print the appropriate package manager command and exit.

#### Scenario: Homebrew installation detected

- **WHEN** the detected method is `homebrew`
- **THEN** the command SHALL print `Run: brew upgrade agentxm/tap/axm` and exit with code 0

#### Scenario: npm installation detected

- **WHEN** the detected method is `npm`
- **THEN** the command SHALL print `Run: npm update -g axm.sh` and exit with code 0

#### Scenario: Unknown installation method

- **WHEN** the detected method is `unknown`
- **THEN** the command SHALL print the install script URL as a fallback and suggest re-installing

#### Scenario: Force flag ignored for non-script installs

- **WHEN** the detected method is `homebrew`, `npm`, or `unknown` AND `--force` is passed
- **THEN** the command SHALL print a note that the flag has no effect for the detected installation method before showing the delegate message

### Requirement: Self-update downloads platform-appropriate binary

The download SHALL select the correct binary based on the runtime platform and architecture.

#### Scenario: macOS arm64

- **WHEN** `process.platform` is `darwin` AND `process.arch` is `arm64`
- **THEN** the command SHALL download `axm-darwin-arm64`

#### Scenario: macOS x64

- **WHEN** `process.platform` is `darwin` AND `process.arch` is `x64`
- **THEN** the command SHALL download `axm-darwin-x64`

#### Scenario: Linux arm64

- **WHEN** `process.platform` is `linux` AND `process.arch` is `arm64`
- **THEN** the command SHALL download `axm-linux-arm64`

#### Scenario: Linux x64

- **WHEN** `process.platform` is `linux` AND `process.arch` is `x64`
- **THEN** the command SHALL download `axm-linux-x64`

#### Scenario: Windows x64

- **WHEN** `process.platform` is `win32` AND `process.arch` is `x64`
- **THEN** the command SHALL download `axm-windows-x64.exe`

#### Scenario: Unsupported platform or architecture

- **WHEN** the platform or architecture is not in the supported set
- **THEN** the command SHALL print supported targets and exit with a non-zero exit code

### Requirement: Self-update uses atomic binary replacement

The binary replacement SHALL be atomic to avoid leaving the user in a broken state.

#### Scenario: Unix atomic rename

- **WHEN** the platform is Unix (macOS or Linux)
- **THEN** the command SHALL download to a temp file in the same directory and rename it over the current binary in a single operation

#### Scenario: Windows rename-aside

- **WHEN** the platform is Windows
- **THEN** the command SHALL rename the running binary to a `.old` suffix, then rename the new binary into place, and clean up the `.old` file on the next successful run

#### Scenario: Permission denied on replace

- **WHEN** the rename fails with a permission error
- **THEN** the command SHALL print "Permission denied writing to {path}. Check directory permissions or re-run the install script." and exit with a non-zero exit code

#### Scenario: Download interrupted

- **WHEN** the user interrupts (Ctrl+C) during download
- **THEN** the command SHALL delete the temp file before exiting

#### Scenario: Download timeout

- **WHEN** the download does not complete within 60 seconds
- **THEN** the command SHALL print "Download timed out. Check your connection and try again." and exit with a non-zero exit code

### Requirement: Self-update verifies the new binary

After replacement, the command SHALL verify the new binary works.

#### Scenario: Verification succeeds

- **WHEN** the new binary is in place
- **THEN** the command SHALL run the new binary with `--version`, verify it exits with code 0, and print a success message

#### Scenario: Download produces empty file

- **WHEN** the downloaded file has zero bytes
- **THEN** the command SHALL treat it as a failed download and exit with a non-zero exit code

### Requirement: Self-update updates install metadata

After a successful upgrade, the command SHALL update the install metadata file.

#### Scenario: Metadata timestamp updated

- **WHEN** the binary replacement and verification succeed
- **THEN** the command SHALL update `installedAt` in `install-meta.json` to the current timestamp

### Requirement: Self-update resolves latest version from GitHub Releases

The command SHALL fetch the latest CLI release version from the GitHub Releases API.

#### Scenario: Release tag with cli-v prefix

- **WHEN** the latest release `tag_name` starts with `cli-v`
- **THEN** the command SHALL strip the prefix to extract the semver version (e.g., `cli-v0.1.0` → `0.1.0`)

#### Scenario: Latest release is not a CLI release

- **WHEN** the latest release `tag_name` does not start with `cli-v`
- **THEN** the command SHALL fall back to listing recent releases and use the first whose `tag_name` starts with `cli-v`

#### Scenario: Custom GitHub repo

- **WHEN** the `AXM_INSTALL_GITHUB_REPO` environment variable is set
- **THEN** the command SHALL use that repo for the GitHub Releases API request instead of the default

### Requirement: Upgrade command is in the AUTH AND CONFIG command group

The `axm upgrade` command SHALL be a root-level command in the "AUTH AND CONFIG" command group (the existing AUTHENTICATION group, renamed).

#### Scenario: Command appears in help

- **WHEN** the user runs `axm --help`
- **THEN** the output SHALL show `upgrade` under an "AUTH AND CONFIG" group heading

### Requirement: Upgrade command flags

The command SHALL accept a `--force` flag.

#### Scenario: Force flag

- **WHEN** `--force` is passed
- **THEN** the command SHALL re-download and replace even if already on the latest version (script installs only)

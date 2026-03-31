## Why

Users who installed axm via native install scripts (bash, PowerShell, CMD) have no way to update to a newer version without remembering and re-running the original install command. There is no update notification, no self-update command, and no awareness of which installation method was used. As axm ships more frequently, this friction will cause users to fall behind on versions silently.

## What Changes

- Add an `axm upgrade` command that detects how axm was installed and either self-updates the binary (native installs) or directs the user to the appropriate package manager command (Homebrew, npm)
- Install scripts write an install metadata file (`~/.axm/install-meta.json` on Unix, `%LOCALAPPDATA%\axm\install-meta.json` on Windows) recording the installation method
- Add a passive update-available notification that checks the latest release version periodically (at most once per 24 hours) and prints a one-line notice when a newer version exists
- The update check result is cached locally to avoid network overhead on every invocation

## Capabilities

### New Capabilities

- `cli-upgrade`: The `axm upgrade` command — detects installation method, self-updates for native installs, delegates to package managers otherwise
- `cli-update-check`: Periodic background version check and update notification displayed on CLI startup

### Modified Capabilities

- `install-script-bash`: Install script writes install metadata file after placing the binary
- `install-script-powershell`: Install script writes install metadata file after placing the binary
- `install-script-cmd`: Install script writes install metadata file after placing the binary

## Impact

- **New CLI command**: `axm upgrade` added to the root command group
- **Install scripts**: All three native install scripts (bash, PowerShell, CMD) gain a metadata write step
- **Filesystem**: New files in the axm data directory — `install-meta.json` (written at install time) and `update-check.json` (written at runtime as a cache)
- **Network**: One HTTPS request to GitHub Releases API per 24-hour period to check the latest version tag
- **Core package**: Install metadata reading and update-check logic added to `@axm.sh/core`

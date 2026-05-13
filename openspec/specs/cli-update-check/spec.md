# cli-update-check Specification

## Purpose

Define the periodic background version check and update notification that informs users when a newer axm version is available.

## Requirements

### Requirement: Update check compares cached version on startup

The CLI SHALL read the update check cache file on startup and queue a notification if a newer version is available.

#### Scenario: Cache contains newer version

- **WHEN** `update-check.json` exists AND `latestVersion` is newer than the local version
- **THEN** the CLI SHALL queue a notification to print to stderr before the command output

#### Scenario: Cache does not exist

- **WHEN** `update-check.json` does not exist (e.g., first run)
- **THEN** the CLI SHALL NOT show any update notification for this invocation

#### Scenario: Cache contains same or older version

- **WHEN** `update-check.json` exists AND `latestVersion` is not newer than the local version
- **THEN** the CLI SHALL NOT show any update notification

### Requirement: Update check refreshes cache via detached fiber

The CLI SHALL refresh the update check cache in the background when it is stale or missing.

#### Scenario: Cache is stale

- **WHEN** `update-check.json` exists AND `checkedAt` is more than 24 hours ago
- **THEN** the CLI SHALL spawn a detached fiber to fetch the latest version from the GitHub Releases API and write the result to `update-check.json`

#### Scenario: Cache is missing

- **WHEN** `update-check.json` does not exist
- **THEN** the CLI SHALL spawn a detached fiber to fetch the latest version and create `update-check.json`

#### Scenario: Cache is fresh

- **WHEN** `update-check.json` exists AND `checkedAt` is within the last 24 hours
- **THEN** the CLI SHALL NOT spawn a refresh fiber

#### Scenario: Refresh fetch fails

- **WHEN** the detached fiber fails to fetch from GitHub (network error, timeout)
- **THEN** the failure SHALL be silently ignored and the cache SHALL NOT be updated

#### Scenario: Refresh network timeout

- **WHEN** the GitHub API request does not complete within 3 seconds
- **THEN** the request SHALL time out and the cache SHALL NOT be updated

#### Scenario: Custom GitHub repo

- **WHEN** the `AXM_INSTALL_GITHUB_REPO` environment variable is set
- **THEN** the refresh fiber SHALL use that repo for the GitHub Releases API request

### Requirement: Update check is skipped in specific conditions

The entire update check (both compare and refresh phases) SHALL be skipped under certain conditions.

#### Scenario: JSON output mode

- **WHEN** the `--json` flag is set
- **THEN** the update check SHALL be skipped entirely

#### Scenario: Environment variable opt-out

- **WHEN** `AXM_NO_UPDATE_CHECK=1` is set
- **THEN** the update check SHALL be skipped entirely

#### Scenario: Running upgrade command

- **WHEN** the command being run is `axm upgrade`
- **THEN** the update check SHALL be skipped entirely

#### Scenario: Non-interactive mode

- **WHEN** non-interactive mode is active
- **THEN** the update check SHALL be skipped entirely

#### Scenario: stderr is not a TTY

- **WHEN** stderr is not a TTY (e.g., output is being captured)
- **THEN** the update check SHALL be skipped entirely

### Requirement: Update notification recommends `axm upgrade`

The notification message SHALL direct the user to run `axm upgrade`, regardless of installation method. The `axm upgrade` command itself detects the install method and delegates to the underlying package manager (Homebrew, npm) when appropriate.

#### Scenario: Update notification

- **WHEN** an update is available
- **THEN** the notification SHALL display the title `Update Available`
- **AND** the notification body SHALL include `{current} → {latest}`
- **AND** the notification body SHALL include `Run: axm upgrade`

### Requirement: Update notification prints to stderr before command output

The notification SHALL be printed to stderr before command output so the update prompt is immediately visible.

#### Scenario: Notification placement

- **WHEN** an update notification is queued
- **THEN** it SHALL be printed to stderr before the command emits its output

### Requirement: Update check cache file format

The cache file SHALL use a defined JSON format at `~/.axm/update-check.json`.

#### Scenario: Cache file structure

- **WHEN** the cache is written
- **THEN** it SHALL contain `latestVersion` (semver string) and `checkedAt` (ISO 8601 timestamp)

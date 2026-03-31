## Context

axm is distributed via multiple installation methods: native install scripts (bash, PowerShell, CMD), Homebrew, npm/npx. Each method has its own update path, but there is no unified update experience. Users who installed via native scripts must remember and re-run the original install command to get a newer version. There is no version check or upgrade notification.

The CLI already resolves its own version at startup via `__AXM_VERSION__` (build-time constant) with a `package.json` fallback. Install scripts download prebuilt binaries from GitHub Releases to well-known paths (`~/.axm/bin/axm` on Unix, `%LOCALAPPDATA%\axm\axm.exe` on Windows). The `~/.axm/` directory is the established user-scope data directory.

## Goals / Non-Goals

**Goals:**

- Users can run `axm upgrade` to update to the latest version regardless of how they installed
- Users are passively notified when a newer version is available
- The upgrade command is installation-method-aware and does the right thing per method
- Native-install users get a fully self-service update without leaving the CLI

**Non-Goals:**

- Auto-updating without user action (no silent background updates)
- Downgrading to older versions
- Channel/track selection (e.g., beta, nightly)
- Upgrading npm/npx or Homebrew installations directly (delegate to the package manager)

## Decisions

### 1. Install metadata file

Install scripts write `install-meta.json` to the axm data directory after placing the binary. The upgrade command reads this file to determine the installation method.

```json
{ "method": "script", "installedAt": "2026-03-31T12:00:00Z" }
```

**Location:** `~/.axm/install-meta.json` (Unix), `%LOCALAPPDATA%\axm\install-meta.json` (Windows).

**Detection fallback when file is missing:**

| Signal                                                           | Inferred method |
| ---------------------------------------------------------------- | --------------- |
| `process.execPath` inside `~/.axm/bin/` or `%LOCALAPPDATA%\axm\` | `script`        |
| `process.execPath` inside a Homebrew prefix                      | `homebrew`      |
| `process.execPath` inside a `node_modules` path                  | `npm`           |
| None of the above                                                | `unknown`       |

**Alternatives considered:**

- (a) Embed the install method in the binary at build time — rejected because the same binary is used across all install methods.
- (b) Rely solely on path-based detection — rejected as fragile; the metadata file is cheap and explicit. Path detection is kept as a fallback for installs that predate the metadata file.

### 2. Upgrade behavior per installation method

| Detected method | `axm upgrade` behavior                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `script`        | Download latest binary from GitHub Releases, verify integrity, atomic-replace the running binary |
| `homebrew`      | Print `Run: brew upgrade axm-sh/tap/axm` and exit with code 0                                    |
| `npm`           | Print `Run: npm update -g @axm.sh/cli` and exit with code 0                                      |
| `unknown`       | Print install script URL as fallback, suggest re-installing                                      |

**Alternatives considered:**

- (a) Always self-update regardless of install method — rejected because overwriting a Homebrew- or npm-managed binary causes package manager state to diverge, leading to confusing errors on subsequent `brew upgrade` or `npm update`.

### 3. Self-update mechanism (native installs)

The self-update flow for `script`-installed binaries:

1. Fetch the latest release tag from the GitHub Releases API (`GET /repos/agentxm/axm/releases/latest`)
2. Compare the remote version against the local version using semver
3. If already up to date, print a message and exit
4. Download the platform-appropriate binary to a temporary file in the same directory as the target
5. Verify the download succeeded (non-zero size, executable on Unix)
6. Atomic replace: rename the temp file over the current binary (`rename` on Unix, temp+rename on Windows)
7. Run `axm --version` on the new binary to verify, print success message

**Placing the temp file in the same directory** ensures the rename is atomic (same filesystem). The old binary is not deleted separately — `rename` overwrites it.

**Alternatives considered:**

- (a) Download to system temp directory — rejected because cross-filesystem rename falls back to copy+delete, which is not atomic and can leave a broken state on interruption.
- (b) Shell out to the install script — rejected because it adds a shell dependency and complicates error handling in Effect.

### 4. Update check notification

A lightweight version check runs early in the CLI startup path. It compares the cached latest version against the local version. If a newer version is available, it prints a single-line notice to stderr after the command completes.

**Cache file:** `~/.axm/update-check.json`

```json
{ "latestVersion": "0.1.0", "checkedAt": "2026-03-31T12:00:00Z" }
```

**Check cadence:** At most once per 24 hours. The check is skipped if:

- The cache file exists and `checkedAt` is less than 24 hours ago
- `--quiet` flag is set
- `--json` flag is set
- `AXM_NO_UPDATE_CHECK=1` environment variable is set
- The command being run is `axm upgrade` (it will check anyway)
- Non-interactive mode is active

**Network request:** When a check is needed, it runs as a fire-and-forget fiber that does not block command execution. If the request fails or times out (3-second timeout), it is silently ignored and the cache is not updated.

**Notification format** (printed to stderr after the command output):

```
Update available: 0.0.34 → 0.1.0  Run `axm upgrade` to update.
```

**Alternatives considered:**

- (a) Check on every invocation without caching — rejected for latency and rate-limit concerns.
- (b) Print the notice before command output — rejected because it adds visual noise before the user sees what they asked for. After-output placement is less disruptive.
- (c) Use a background process that persists after the CLI exits — rejected as overly complex for a simple cache-and-check.

### 5. Command placement and flags

`axm upgrade` is a root-level command in a new "SYSTEM" command group, alongside the existing groups (GETTING STARTED, EXTENSIONS, AUTHENTICATION).

**Flags:**

| Flag      | Description                                                   |
| --------- | ------------------------------------------------------------- |
| `--force` | Re-download and replace even if already on the latest version |
| `--yes`   | Skip the confirmation prompt before replacing the binary      |

No `--version` flag to pin a target version (non-goal: downgrading/pinning).

**Alternatives considered:**

- (a) `axm self-update` — rejected in favor of the shorter, more common `upgrade`. Matches `brew upgrade`, `pip install --upgrade`.
- (b) Nested under `axm system upgrade` — rejected as unnecessary nesting for a single command. Can add the `system` group later if more system commands emerge.

### 6. Service design

Two new services in `@axm.sh/core/unstable/`:

**`InstallMeta`** — reads and writes `install-meta.json`. Provides `getMethod()` returning the detected install method as a tagged union (`Script | Homebrew | Npm | Unknown`). Falls back to path-based detection when the file is missing.

**`UpdateCheck`** — manages the cached update check. Provides `getLatestVersion()` (reads cache or fetches from GitHub), `isUpdateAvailable()`, and `writeCache()`. Uses `effect/HttpClient` for the GitHub API request.

Both services depend on `Path` and `FileSystem` from Effect's platform layer. The upgrade handler additionally depends on `CliRenderer` and `CliPrompt`.

**Alternatives considered:**

- (a) Single combined service — rejected because the update check runs on every CLI invocation (lightweight, read-only) while install metadata is only needed by the upgrade command. Separating them keeps the hot path minimal.

## Risks / Trade-offs

**[Risk] Binary replacement fails mid-write on Windows** → Mitigation: Download to a temp file in the same directory, then use atomic rename. On Windows, if the running binary is locked, the rename will fail with a clear error message suggesting the user close other axm processes and retry.

**[Risk] GitHub API rate limiting on unauthenticated requests** → Mitigation: The 24-hour cache TTL means at most one request per day per machine. GitHub's unauthenticated rate limit is 60 requests/hour, well above this cadence. The check also has a 3-second timeout and fails silently.

**[Risk] Users on old versions won't have `axm upgrade`** → Mitigation: The install scripts already support re-running to update. The update check notification will not exist for old versions, but this is acceptable — users who re-run the install script once will get the upgrade command going forward.

**[Trade-off] No integrity verification via checksums** → The initial implementation verifies the download is non-empty and executable, but does not verify a SHA256 checksum against a published manifest. This simplifies the first version. Checksum verification can be added later by publishing a checksums file alongside release assets.

**[Trade-off] No rollback** → If the new binary is broken, the user must re-run the install script or manually download an older release. This is acceptable for the initial version given the existing install scripts already serve as a recovery path.

## Context

axm is distributed via multiple installation methods: native install scripts (bash, PowerShell, CMD), Homebrew, npm/npx. Each method has its own update path, but there is no unified update experience. Users who installed via native scripts must remember and re-run the original install command to get a newer version. There is no version check or upgrade notification.

The CLI already resolves its own version at startup via `__AXM_VERSION__` (build-time constant) with a `package.json` fallback. Install scripts download prebuilt binaries from GitHub Releases to well-known paths (`~/.axm/bin/axm` on Unix, `%LOCALAPPDATA%\axm\axm.exe` on Windows). The `~/.axm/` directory is the established user-scope data directory.

**Data directory convention:** All file paths in this design that reference `~/.axm/` use `%LOCALAPPDATA%\axm\` on Windows. This mapping applies to every file placed in the data directory and is not repeated per file.

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

Install scripts write `install-meta.json` to the axm data directory after placing the binary.

```json
{ "method": "script", "installedAt": "2026-03-31T12:00:00Z" }
```

**Location:** `~/.axm/install-meta.json`.

**Detection precedence:** Path-based detection runs first against the running binary. The metadata file is only consulted when path detection returns `unknown`. This ensures that a user who installs via one method and later installs via another gets the correct behavior for the binary they are actually running.

| Priority | Signal                                                                                                                                                     | Inferred method |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1        | `process.execPath` inside `~/.axm/bin/` or `%LOCALAPPDATA%\axm\`                                                                                           | `script`        |
| 2        | `fs.realpath(process.execPath)` contains `/Cellar/` (Homebrew install path; realpath is required because macOS does not resolve symlinks in the exec path) | `homebrew`      |
| 3        | `import.meta.url` resolves inside a `node_modules` path                                                                                                    | `npm`           |
| 4        | `install-meta.json` exists and contains a known method                                                                                                     | value from file |
| 5        | None of the above                                                                                                                                          | `unknown`       |

**Alternatives considered:**

- (a) Embed the install method in the binary at build time — rejected because the same binary is used across all install methods.
- (b) Rely solely on path-based detection — rejected as fragile; the metadata file provides a fallback for installs that predate path detection or use non-standard paths.
- (c) Metadata file overrides path detection — rejected because the metadata file is global and sticky. A user who installs via bash then later via Homebrew would have a stale metadata file that disagrees with the running binary, causing `axm upgrade` to self-update the wrong binary.

### 2. Upgrade behavior per installation method

| Detected method | `axm upgrade` behavior                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `script`        | Download latest binary from GitHub Releases, verify integrity, atomic-replace the running binary |
| `homebrew`      | Print `Run: brew upgrade agentxm/tap/axm` and exit with code 0                                   |
| `npm`           | Print `Run: npm update -g @axm.sh/cli` and exit with code 0                                      |
| `unknown`       | Print install script URL as fallback, suggest re-installing                                      |

**Alternatives considered:**

- (a) Always self-update regardless of install method — rejected because overwriting a Homebrew- or npm-managed binary causes package manager state to diverge, leading to confusing errors on subsequent `brew upgrade` or `npm update`.

### 3. Self-update mechanism (native installs)

The self-update flow for `script`-installed binaries:

1. Fetch the latest release from the GitHub Releases API (`GET /repos/{repo}/releases/latest`), where `{repo}` defaults to `agentxm/axm` but is overridden by the `AXM_INSTALL_GITHUB_REPO` environment variable (same env var the install scripts use). If `tag_name` has a `cli-v` prefix, strip it to extract the semver version (e.g., `cli-v0.1.0` → `0.1.0`). If the prefix is missing (e.g., a non-CLI release), fall back to listing recent releases (`GET /repos/{repo}/releases`) and use the first whose `tag_name` starts with `cli-v`
2. Compare the remote version against the local version using semver. If the local version is `"unknown"` (neither `__AXM_VERSION__` nor `package.json` resolved), treat it as always-stale and proceed to download
3. If already up to date, print a message and exit
4. Download the platform-appropriate binary to a temporary file in the same directory as the target. The download URL follows the pattern `https://github.com/{repo}/releases/download/cli-v{VERSION}/axm-{platform}-{arch}[.exe]` (where `{repo}` respects `AXM_INSTALL_GITHUB_REPO`). The download has a 60-second timeout; if exceeded, print "Download timed out. Check your connection and try again." and exit. Print a spinner or progress indicator during download. Platform and arch are mapped from Node/Bun runtime values to the binary naming convention:

   | `process.platform` | Binary platform | `process.arch` | Binary arch | Suffix |
   | ------------------ | --------------- | -------------- | ----------- | ------ |
   | `darwin`           | `darwin`        | `arm64`        | `arm64`     |        |
   | `darwin`           | `darwin`        | `x64`          | `x64`       |        |
   | `linux`            | `linux`         | `arm64`        | `arm64`     |        |
   | `linux`            | `linux`         | `x64`          | `x64`       |        |
   | `win32`            | `windows`       | `x64`          | `x64`       | `.exe` |

   Any unrecognized platform or architecture is an error — print supported targets and exit

5. Verify the download succeeded (non-zero size, executable on Unix). The download step uses `Effect.onInterrupt` to delete the temp file if the user interrupts (Ctrl+C) during download
6. Replace the current binary: on Unix, rename the temp file over the current binary (atomic). On Windows, rename the running binary to a `.old` suffix first (Windows allows renaming a running exe but not overwriting it), then rename the new binary into place. The `.old` file is cleaned up on the next successful run. If the rename fails with a permission error, print "Permission denied writing to {path}. Check directory permissions or re-run the install script." and exit. Note: the rename is the critical section — on Unix it is atomic (single syscall). On Windows, the rename-old → rename-new sequence has a brief window; if interrupted between the two renames, the user can recover by re-running `axm upgrade` or the install script
7. Run the new binary with `--version` and verify it exits with code 0. Print success message
8. Update `install-meta.json` with the current timestamp (`installedAt`) to reflect the latest binary placement

**Output sketches** for `axm upgrade` (script installs):

Successful upgrade:

```
◆  axm upgrade
│
●  Upgrading: 0.0.34 → 0.1.0
◇  Downloading axm-darwin-arm64...
│
◆  Upgraded to 0.1.0
```

Already up to date:

```
◆  axm upgrade
│
●  Already up to date (0.1.0)
```

Already up to date with `--force`:

```
◆  axm upgrade --force
│
●  Reinstalling 0.1.0
◇  Downloading axm-darwin-arm64...
│
◆  Reinstalled 0.1.0
```

Delegated installs (homebrew/npm/unknown):

```
◆  axm upgrade
│
●  Installed via Homebrew
│  Run: brew upgrade agentxm/tap/axm
```

**Placing the temp file in the same directory** ensures the rename is atomic (same filesystem). The old binary is not deleted separately — `rename` overwrites it.

**Alternatives considered:**

- (a) Download to system temp directory — rejected because cross-filesystem rename falls back to copy+delete, which is not atomic and can leave a broken state on interruption.
- (b) Shell out to the install script — rejected because it adds a shell dependency and complicates error handling in Effect.

### 4. Update check notification

A lightweight version check runs early in the CLI startup path. It operates in two phases:

1. **Compare (synchronous):** Read `update-check.json`. If the cache exists and contains a `latestVersion` newer than the local version, queue a notification to print to stderr before command output. If the cache does not exist (e.g., first run), no notification is shown for this invocation.
2. **Refresh (detached fiber):** If the cache is missing or `checkedAt` is more than 24 hours ago, spawn a detached fiber via `Effect.forkDetach` to fetch the latest version from the GitHub Releases API (using `AXM_INSTALL_GITHUB_REPO` if set) and write the result to the cache file. The detached fiber outlives the main command effect, so the process stays alive until the fiber completes or the 3-second network timeout expires. If the request fails or times out, it is silently ignored and the cache is not updated.

This means the first-ever CLI run produces no notification — it only warms the cache. Subsequent runs display the notification based on the cached value.

**Cache file:** `~/.axm/update-check.json`

```json
{ "latestVersion": "0.1.0", "checkedAt": "2026-03-31T12:00:00Z" }
```

**Skip conditions:** The entire check (both phases) is skipped if:

- `--json` flag is set
- `AXM_NO_UPDATE_CHECK=1` environment variable is set
- The command being run is `axm upgrade` (it will check anyway)
- Non-interactive mode is active
- stderr is not a TTY (e.g., output is being captured by a script or CI log)

**Notification format** (printed to stderr before command output). The notification is install-method-aware, showing the appropriate update command for the running binary. Detection uses the same path-based precedence as Decision 1. Rendered using `renderer.note()` so it appears as a titled callout before the command's own output.

```
Update Available
0.0.34 → 0.1.0
Run: axm upgrade
```

The second line varies by detected method:

| Detected method | Second line                         |
| --------------- | ----------------------------------- |
| `script`        | `Run: axm upgrade`                  |
| `homebrew`      | `Run: brew upgrade agentxm/tap/axm` |
| `npm`           | `Run: npm update -g @axm.sh/cli`    |
| `unknown`       | `Run: axm upgrade`                  |

**Alternatives considered:**

- (a) Check on every invocation without caching — rejected for latency and rate-limit concerns.
- (b) Print the notice after command output — rejected because the update prompt is easier to miss when it trails verbose command output. Before-output placement is more visible.
- (c) Use a background process that persists after the CLI exits — rejected as overly complex for a simple cache-and-check.
- (d) Always show `Run `axm upgrade`` regardless of method — rejected because it creates an unnecessary extra hop for Homebrew and npm users who would just be redirected to the package manager command.

### 5. Command placement and flags

`axm upgrade` is a root-level command in the "AUTH AND CONFIG" command group (renamed from the existing "AUTHENTICATION" group). The three root-level groups become: GETTING STARTED, EXTENSIONS, AUTH AND CONFIG.

**Flags:**

| Flag      | Description                                                   |
| --------- | ------------------------------------------------------------- |
| `--force` | Re-download and replace even if already on the latest version |

This flag applies only when the detected method is `script`. For other methods (`homebrew`, `npm`, `unknown`), if the flag is passed, print a note that it has no effect for the detected installation method before showing the delegate message.

**No confirmation prompt.** The user explicitly invoked `axm upgrade` — that is the intent signal. The command prints the version transition (e.g., `Upgrading: 0.0.34 → 0.1.0`) and proceeds directly to download. This matches `rustup update`, `deno upgrade`, `bun upgrade`, and every other peer CLI with self-update.

No `--version` flag to pin a target version (non-goal: downgrading/pinning).

**Alternatives considered:**

- (a) `axm self-update` — rejected in favor of the shorter, more common `upgrade`. Matches `brew upgrade`, `pip install --upgrade`.
- (b) Nested under `axm system upgrade` — rejected as unnecessary nesting for a single command.
- (c) New "SYSTEM" command group — rejected because a dedicated group for a single command adds noise to the help output. The AUTH AND CONFIG group is a natural home for operational commands alongside authentication.

### 6. Service design

Three new services in `@axm.sh/core/unstable/`:

**`InstallMethod`** — determines how axm was installed. Provides `detect()` returning a tagged union (`Script | Homebrew | Npm | Unknown`) using the precedence chain from Decision 1 (path-based detection first, metadata file fallback). Both the upgrade command and the update check notification depend on this service.

**`InstallMeta`** — reads and writes `install-meta.json`. Depends on `InstallMethod` for detection; owns only the metadata file I/O.

**`UpdateCheck`** — manages the cached update check. Provides `getLatestVersion()` (reads cache or fetches from GitHub), `isUpdateAvailable()`, and `writeCache()`. Depends on `InstallMethod` to produce method-aware notification messages. Uses `effect/HttpClient` for the GitHub API request.

All three services depend on `Path` and `FileSystem` from Effect's platform layer. The upgrade handler additionally depends on `CliRenderer` and `CliPrompt`.

**Alternatives considered:**

- (a) Single combined service — rejected because the update check runs on every CLI invocation (lightweight, read-only) while install metadata write is only needed by the upgrade command and install scripts. Separating them keeps the hot path minimal.
- (b) Two services with detection inlined in `InstallMeta` — rejected because `UpdateCheck` also needs method detection for the notification message, which would create a dependency from `UpdateCheck` to `InstallMeta` and conflate file I/O with detection logic. A standalone `InstallMethod` service keeps detection reusable and each service focused.

## Risks / Trade-offs

**[Risk] Binary replacement fails mid-write on Windows** → Mitigation: Download to a temp file in the same directory. On Windows, rename the running binary to a `.old` suffix before placing the new binary (Windows allows renaming a running exe but not overwriting it). The `.old` file is cleaned up on the next successful run. If the rename-aside fails, print a clear error suggesting the user close other axm processes and retry.

**[Risk] GitHub API rate limiting on unauthenticated requests** → Mitigation: The 24-hour cache TTL means at most one request per day per machine. GitHub's unauthenticated rate limit is 60 requests/hour, well above this cadence. The check also has a 3-second timeout and fails silently.

**[Risk] Users on old versions won't have `axm upgrade`** → Mitigation: The install scripts already support re-running to update. The update check notification will not exist for old versions, but this is acceptable — users who re-run the install script once will get the upgrade command going forward.

**[Trade-off] No integrity verification via checksums** → The initial implementation verifies the download is non-empty and executable, but does not verify a SHA256 checksum against a published manifest. This simplifies the first version. Checksum verification can be added later by publishing a checksums file alongside release assets.

**[Trade-off] No rollback** → If the new binary is broken, the user must re-run the install script or manually download an older release. This is acceptable for the initial version given the existing install scripts already serve as a recovery path.

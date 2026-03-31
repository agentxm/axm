> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. InstallMethod Service

> **Subagent:** Run this entire phase in a single subagent.

Implements the `InstallMethod` service in `@axm.sh/core/unstable/` that detects how axm was installed. No predecessor phases.

- [ ] 1.1 Write tests for `InstallMethod.detect()` covering all five precedence levels: script (exec path in `~/.axm/bin/`), homebrew (`/Cellar/` in path), npm (`node_modules` in import URL), metadata file fallback, and unknown
- [ ] 1.2 Create `packages/core/src/unstable/install-method/` module with `InstallMethod` Effect service, tagged union type (`Script | Homebrew | Npm | Unknown`), and `detect()` implementation using the precedence chain from the design
- [ ] 1.3 Verify typecheck passes (`pnpm typecheck`)
- [ ] 1.4 Export from `packages/core/src/unstable/install-method/index.ts` barrel
- [ ] 1.5 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — fix any failures
- [ ] 1.6 Kill any lingering vitest worker processes

## 2. InstallMeta Service

> **Subagent:** Run this entire phase in a single subagent.

Implements the `InstallMeta` service for reading/writing `install-meta.json`. Depends on Phase 1 (InstallMethod).

- [ ] 2.1 Write tests for `InstallMeta` read (file exists, file missing, invalid JSON) and write (creates file, overwrites existing)
- [ ] 2.2 Create `packages/core/src/unstable/install-meta/` module with `InstallMeta` Effect service — `read()` returning `Option<InstallMetaData>`, `write()` accepting method and timestamp. Schema for `install-meta.json` with `method` and `installedAt` fields
- [ ] 2.3 Verify typecheck passes (`pnpm typecheck`)
- [ ] 2.4 Export from `packages/core/src/unstable/install-meta/index.ts` barrel
- [ ] 2.5 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — fix any failures
- [ ] 2.6 Kill any lingering vitest worker processes

## 3. GitHub Release Version Resolution

> **Subagent:** Run this entire phase in a single subagent.

Implements the shared logic for resolving the latest CLI version from GitHub Releases. Used by both the upgrade command and update check. Can be worked in parallel with Phase 2.

- [ ] 3.1 Write tests for version resolution: tag with `cli-v` prefix, tag without prefix (fallback to listing releases), custom repo via `AXM_INSTALL_GITHUB_REPO`, network failure, semver comparison
- [ ] 3.2 Create version resolution logic within the upgrade module (or a shared helper in core) — fetch latest release, strip `cli-v` prefix, fallback to listing recent releases, semver compare against local version
- [ ] 3.3 Verify typecheck passes (`pnpm typecheck`)
- [ ] 3.4 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — fix any failures
- [ ] 3.5 Kill any lingering vitest worker processes

## 4. UpdateCheck Service

> **Subagent:** Run this entire phase in a single subagent.

Implements the `UpdateCheck` service for cached version checks and notifications. Depends on Phase 1 (InstallMethod) and Phase 3 (version resolution).

- [ ] 4.1 Write tests for `UpdateCheck`: cache read (fresh, stale, missing, invalid), cache write, skip conditions (`--json`, `AXM_NO_UPDATE_CHECK=1`, `axm upgrade` command, non-interactive, stderr not TTY), install-method-aware notification messages for all four methods
- [ ] 4.2 Create `packages/core/src/unstable/update-check/` module with `UpdateCheck` Effect service — `readCache()`, `writeCache()`, `isUpdateAvailable()`, `shouldSkip()`, `notificationMessage()`. Schema for `update-check.json` with `latestVersion` and `checkedAt` fields
- [ ] 4.3 Verify typecheck passes (`pnpm typecheck`)
- [ ] 4.4 Export from `packages/core/src/unstable/update-check/index.ts` barrel
- [ ] 4.5 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — fix any failures
- [ ] 4.6 Kill any lingering vitest worker processes

## 5. Upgrade Command

> **Subagent:** Run this entire phase in a single subagent.

Implements the `axm upgrade` CLI command. Depends on Phases 1–4.

- [ ] 5.1 Write tests for the upgrade handler: self-update flow (download, atomic replace, verify), delegation messages for homebrew/npm/unknown, `--force` override, `--yes` skip confirmation, flags ignored for non-script installs, unsupported platform error, download timeout, permission denied error, interrupted download cleanup
- [ ] 5.2 Create `packages/cli/src/root/upgrade/` directory with command definition (`upgrade.ts`) — root-level command in SYSTEM group, `--force` and `--yes` flags
- [ ] 5.3 Implement upgrade handler: detect install method, branch on method (self-update for script, delegate for homebrew/npm/unknown), download platform-appropriate binary, atomic replace, verify with `--version`, update install metadata
- [ ] 5.4 Verify typecheck passes (`pnpm typecheck`)
- [ ] 5.5 Wire the upgrade command into the root CLI app (`packages/cli/src/app.ts`) under a SYSTEM command group
- [ ] 5.6 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — fix any failures
- [ ] 5.7 Kill any lingering vitest worker processes

## 6. Update Check Integration

> **Subagent:** Run this entire phase in a single subagent.

Wires the update check into the CLI startup path so notifications appear after command output. Depends on Phase 4 (UpdateCheck) and Phase 5 (upgrade command wired).

- [ ] 6.1 Write tests for the CLI integration: notification prints to stderr after command output, notification suppressed under all skip conditions, detached fiber spawned when cache is stale/missing, no notification on first run (cache missing)
- [ ] 6.2 Integrate the update check into the CLI startup path — read cache and queue notification early, spawn detached refresh fiber if stale/missing, print notification to stderr after command completes
- [ ] 6.3 Verify typecheck passes (`pnpm typecheck`)
- [ ] 6.4 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — fix any failures
- [ ] 6.5 Kill any lingering vitest worker processes

## 7. Install Script Updates

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 7.2, 7.3, 7.4 are independent — launch as parallel subagents.

Updates the three native install scripts to write `install-meta.json`. No dependency on Phases 1–6 (these are script changes, not TypeScript).

- [ ] 7.1 Write tests verifying each install script writes `install-meta.json` with `{"method": "script", "installedAt": "<timestamp>"}` after binary placement (can use E2E-style assertions or script parsing)
- [ ] 7.2 Update `install.sh` (bash) to write `~/.axm/install-meta.json` after placing the binary — JSON with `method: "script"` and `installedAt` ISO 8601 timestamp; overwrite if exists
- [ ] 7.3 Update `install.ps1` (PowerShell) to write `%LOCALAPPDATA%\axm\install-meta.json` after placing the binary — same JSON format; overwrite if exists
- [ ] 7.4 Update `install.cmd` (CMD) to write `%LOCALAPPDATA%\axm\install-meta.json` after placing the binary — same JSON format; overwrite if exists
- [ ] 7.5 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` — fix any failures
- [ ] 7.6 Kill any lingering vitest worker processes

## 8. Final Verification

> **Subagent:** Run this entire phase in a single subagent.

End-to-end verification across all changes. Depends on all prior phases.

- [ ] 8.1 Run full CI pipeline: `pnpm run ci` — fix any failures
- [ ] 8.2 Verify `axm upgrade --help` shows correct flags and SYSTEM group placement
- [ ] 8.3 Kill any lingering vitest worker processes

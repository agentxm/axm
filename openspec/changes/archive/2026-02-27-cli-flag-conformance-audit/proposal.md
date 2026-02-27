## Why

The CLI flag conventions for `--yes`, `--non-interactive`, and `--force` were recently clarified in CLAUDE.md, but the existing command implementations predate these guidelines. Several commands have misaligned semantics, broken flag propagation, or missing behavior. This audit-driven change brings all commands into conformance.

## What Changes

- Fix `--force` semantics across all commands: change from "auto-accept warnings" to "override constraints that cause failure"
- Fix `--yes` to only skip confirmations, not supply defaults for selection prompts
- Make `--non-interactive` imply `--yes`
- Enable TTY auto-detection for `--non-interactive` (the `isInteractive()` utility exists but is unused)
- Fix broken `--force` propagation in `skills install` and `packs install` (flag accepted but never reaches plan resolution)
- Ensure all non-interactive error messages tell the user which flag to pass instead

## Conformance Audit

### `--yes` Conformance

| Command                 | Has Flag | Correct Behavior | Issue                                                                                                        |
| ----------------------- | -------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `init`                  | Y        | **NO**           | `--yes` auto-selects all detected agents (supplies defaults for selection, not just confirmation)            |
| `skills install`        | Y        | **NO**           | `--yes` auto-selects all skills when multiple found (supplies defaults for selection, not just confirmation) |
| `skills uninstall`      | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills new`            | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills fork`           | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills update`         | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills publish`        | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills enable`         | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills disable`        | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills rename`         | Y        | OK               | Skips plan confirmation only                                                                                 |
| `skills list`           | N        | OK               | Read-only, no prompts needed                                                                                 |
| `packs install`         | Y        | OK               | Skips plan confirmation only                                                                                 |
| `packs uninstall`       | Y        | OK               | Skips plan confirmation only                                                                                 |
| `packs new`             | Y        | OK               | Skips plan confirmation only                                                                                 |
| `packs add`             | Y        | OK               | Skips plan confirmation only                                                                                 |
| `packs remove`          | Y        | OK               | Skips plan confirmation only                                                                                 |
| `packs publish`         | Y        | OK               | Skips plan confirmation only                                                                                 |
| `packs unpack`          | Y        | OK               | Skips plan confirmation only                                                                                 |
| `commands install`      | Y        | OK               | Skips plan confirmation only                                                                                 |
| `commands uninstall`    | Y        | OK               | Skips plan confirmation only                                                                                 |
| `mcp-servers install`   | Y        | OK               | Skips plan confirmation only                                                                                 |
| `mcp-servers uninstall` | Y        | OK               | Skips plan confirmation only                                                                                 |

**Summary:** 2 commands non-conformant (`init`, `skills install` use `--yes` to supply selection defaults).

### `--non-interactive` Conformance

| Command                 | Has Flag | Implies --yes | TTY Auto-detect | Error Messages Actionable | Issue                                    |
| ----------------------- | -------- | ------------- | --------------- | ------------------------- | ---------------------------------------- |
| `init`                  | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills install`        | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills uninstall`      | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills new`            | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills fork`           | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills update`         | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills publish`        | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills enable`         | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills disable`        | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills rename`         | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `skills list`           | N        | N/A           | N/A             | N/A                       | Read-only, no prompts                    |
| `packs install`         | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `packs uninstall`       | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `packs new`             | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `packs add`             | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `packs remove`          | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `packs publish`         | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `packs unpack`          | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `commands install`      | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `commands uninstall`    | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `mcp-servers install`   | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |
| `mcp-servers uninstall` | Y        | **NO**        | **NO**          | YES                       | Does not imply `--yes`; no TTY detection |

**Summary:** All 20 interactive commands share two systemic issues: `--non-interactive` does not imply `--yes`, and TTY auto-detection is not wired (utility exists at `utils/tty.ts` but is unused). Both are fixable in the shared workspace service layer. Error messages are already actionable. CI env var detection (`CI=true`) works as a fallback.

### `--force` Conformance

| Command                 | Has Flag | Current Behavior                                                   | Correct Behavior                                                | Issue                                                                                |
| ----------------------- | -------- | ------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `init`                  | **NO**   | N/A                                                                | N/A                                                             | OK - no constraints to override                                                      |
| `skills install`        | Y        | **BROKEN** - flag accepted but never propagated to plan resolution | Override constraint (e.g., already installed, version conflict) | Flag is lost in intent chain; described as "Auto-accept plan warnings"               |
| `skills uninstall`      | **NO**   | N/A                                                                | N/A                                                             | OK - uninstall doesn't hit constraints                                               |
| `skills new`            | **NO**   | N/A                                                                | Consider adding                                                 | Could override "skill already exists" constraint                                     |
| `skills fork`           | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `skills update`         | Y        | Passed through but only auto-accepts warnings                      | Override version constraints                                    | Description says "Overwrite regardless of version" but it only auto-accepts warnings |
| `skills publish`        | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `skills enable`         | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `skills disable`        | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `skills rename`         | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `skills list`           | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `packs install`         | Y        | **BROKEN** - flag accepted but never propagated                    | Override constraint (e.g., already installed)                   | Flag is lost in intent building; described as "Overwrite existing pack"              |
| `packs uninstall`       | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `packs new`             | **NO**   | N/A                                                                | Consider adding                                                 | Could override "pack already exists" constraint                                      |
| `packs add`             | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `packs remove`          | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `packs publish`         | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `packs unpack`          | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `commands install`      | Y        | Carried through but only auto-accepts warnings                     | Override constraint (e.g., already installed)                   | Description says "Force reinstall" but only auto-accepts warnings                    |
| `commands uninstall`    | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |
| `mcp-servers install`   | Y        | Carried through but only auto-accepts warnings                     | Override constraint (e.g., already installed)                   | Description says "Force reinstall" but only auto-accepts warnings                    |
| `mcp-servers uninstall` | **NO**   | N/A                                                                | N/A                                                             | OK                                                                                   |

**Summary:** 5 commands have `--force`. All are non-conformant:

- 2 are **broken** (flag silently dropped: `skills install`, `packs install`)
- 3 are **semantically wrong** (auto-accept warnings instead of overriding constraints: `skills update`, `commands install`, `mcp-servers install`)
- The shared workspace service at `service.ts:651` is the root cause: `--force` only controls warning auto-acceptance, not constraint override

### Root Cause: Workspace Service Plan Resolution

The shared `workspace.resolvePlan()` in `service.ts` is the central point where `--force` and `--yes` interact with plan execution:

- **Errors** (readiness = "error"): Always block, `--force` cannot override (line 641-647)
- **Warnings** (readiness = "warn"): Prompt unless `--force` (line 651) — this is where `--force` = "auto-accept warnings"
- **Plan confirmation**: Prompt unless `--yes` (line 689)

The fix needs to happen here: `--force` should change errors from blocking to proceeding (with a warning), and warnings should be handled by `--yes` (or always shown and never block, per the severity model).

## Capabilities

### New Capabilities

_None — this is a conformance fix to existing behavior._

### Modified Capabilities

- `cli-flags`: Align `--yes`, `--non-interactive`, and `--force` flag semantics with CLAUDE.md guidelines across all commands

## Impact

- **Workspace service** (`workspace/service.ts`): Core plan resolution logic for `--force`/`--yes`/`--non-interactive` interaction
- **All command handlers**: Flag descriptions and propagation
- **`utils/tty.ts`**: Wire existing TTY detection into non-interactive resolution
- **`skills install` intent chain**: Fix `--force` propagation
- **`packs install` intent chain**: Fix `--force` propagation
- **`init` and `skills install` selection logic**: Move default-supplying behavior from `--yes` to `--non-interactive`
- **E2E tests**: Update tests that rely on current `--force`/`--yes` behavior
- **BREAKING**: `--force` will no longer auto-accept warnings (that becomes `--yes`'s job); `--force` will instead override constraints that cause errors

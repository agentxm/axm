## Why

Some command handlers perform side-effects (file I/O, settings mutations, symlink creation) directly instead of deferring them to operation handlers via `ws.resolvePlan()`. This creates inconsistency: users get plan previews and confirmations for some mutations but not others, and side-effect logic lives in two places. A comprehensive audit classifies every handler and remediates gaps where the resolve-plan pattern should be used but isn't.

## Handler Inventory

All 18 command handlers in `packages/cli/src/cli-commands/` audited against the resolve-plan architecture.

| #   | Command            | Handler               | Status                      | Side-effects      | Notes                                                                                                                                                                   |
| --- | ------------------ | --------------------- | --------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `init`             | `handleInit`          | Compliant                   | None (query-only) | Reads workspace context and displays configured agents. No mutations.                                                                                                   |
| 2   | `skills list`      | `handleList`          | Compliant                   | None (query-only) | Reads lockfile, filters, displays. No mutations.                                                                                                                        |
| 3   | `skills install`   | `handleInstall`       | Compliant                   | Via `resolvePlan` | Builds plan via `buildSkillInstallPlan` → `ws.resolvePlan()`.                                                                                                           |
| 4   | `skills uninstall` | `handleUninstall`     | Compliant                   | Via `resolvePlan` | Builds plan via `buildSkillUninstallPlan` → `ws.resolvePlan()`.                                                                                                         |
| 5   | `skills update`    | `handleUpdate`        | Compliant                   | Via `resolvePlan` | Builds plan via `buildUpdatePlan` → `ws.resolvePlan()`. Validation reads (pack manifests for constraint collection) are acceptable.                                     |
| 6   | `skills new`       | `handleSkillsNew`     | **Non-compliant**           | Direct I/O        | `fs.makeDirectory` (skill dir), `fs.writeFileString` (manifest + SKILL.md), `ws.setSkillEntry` (settings), `createSymlink` (agent links). No plan, no `resolvePlan()`.  |
| 7   | `skills enable`    | `handleEnable`        | **Partially non-compliant** | Mixed             | Promoted transitive path: directly calls `ws.updateSkillEntry()`. Configured skill path: uses `buildSingleStepPlan` → `ws.resolvePlan()`.                               |
| 8   | `skills disable`   | `handleDisable`       | **Partially non-compliant** | Mixed             | Implicit skill path: directly calls `ws.setSkillEntry()` to promote with `enabled: false`. Configured skill path: uses `buildSingleStepPlan` → `ws.resolvePlan()`.      |
| 9   | `skills fork`      | `handleFork`          | Compliant                   | Via `resolvePlan` | Builds multi-step plan (copy → publish → install) → `ws.resolvePlan()`.                                                                                                 |
| 10  | `skills publish`   | `handlePublish`       | Compliant                   | Via `resolvePlan` | Validation reads (extension/manifest existence checks) are acceptable. Builds plan with `PublishSkillOperation` steps → `ws.resolvePlan()`.                             |
| 11  | `skills rename`    | `handleRename`        | Compliant                   | Via `resolvePlan` | Builds plan via `buildSingleStepPlan` → `ws.resolvePlan()`.                                                                                                             |
| 12  | `packs install`    | `handleInstallPack`   | Compliant                   | Via `resolvePlan` | Builds plan via `buildInstallPlan` → `ws.resolvePlan()`.                                                                                                                |
| 13  | `packs uninstall`  | `handleUninstallPack` | Compliant                   | Via `resolvePlan` | Builds plan via `buildUninstallPlan` → `ws.resolvePlan()`.                                                                                                              |
| 14  | `packs unpack`     | `handleUnpack`        | Compliant                   | Via `resolvePlan` | Builds plan via `buildUnpackPlan` → `ws.resolvePlan()`.                                                                                                                 |
| 15  | `packs new`        | `handlePacksNew`      | **Non-compliant**           | Direct I/O        | `fs.makeDirectory` (pack dir), `fs.writeFileString` (manifest), `ws.setPack` (lockfile/settings). No plan, no `resolvePlan()`.                                          |
| 16  | `packs add`        | `handlePacksAdd`      | **Non-compliant**           | Direct I/O        | `fs.readFileString` + `Schema.decodeUnknown` (manifest read), mutates manifest object in-place, `fs.writeFileString` (manifest write). No plan, no `resolvePlan()`.     |
| 17  | `packs remove`     | `handlePacksRemove`   | **Non-compliant**           | Direct I/O        | `fs.readFileString` + `Schema.decodeUnknown` (manifest read), deletes keys from manifest object, `fs.writeFileString` (manifest write). No plan, no `resolvePlan()`.    |
| 18  | `packs publish`    | `handlePublishPack`   | Compliant                   | Via `resolvePlan` | Validation reads (pack dir/manifest existence, manifest parsing for `--include-dependencies`) are acceptable. Builds plan with publish operations → `ws.resolvePlan()`. |

### Summary

| Classification                | Count | Handlers                                                                                                                                                                     |
| ----------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compliant (query-only)        | 2     | `init`, `skills list`                                                                                                                                                        |
| Compliant (full resolve-plan) | 10    | `skills install`, `skills uninstall`, `skills update`, `skills fork`, `skills publish`, `skills rename`, `packs install`, `packs uninstall`, `packs unpack`, `packs publish` |
| Partially non-compliant       | 2     | `skills enable`, `skills disable`                                                                                                                                            |
| Non-compliant                 | 4     | `skills new`, `packs new`, `packs add`, `packs remove`                                                                                                                       |

## What Changes

- Remediate 6 non-compliant handlers that perform mutating side-effects directly:
  - **`skills new`**: scaffolds directories, writes files, creates symlinks, mutates settings — all directly. Should build operations and defer to `resolvePlan()`.
  - **`packs new`**: creates directories, writes manifest, mutates settings — all directly. Should build operations and defer to `resolvePlan()`.
  - **`skills enable`** (partial): directly calls `ws.updateSkillEntry()` for promoted transitive skills instead of routing through an operation. Should consistently use `resolvePlan()` for all paths.
  - **`skills disable`** (partial): directly calls `ws.setSkillEntry()` for implicit skills instead of routing through an operation. Should consistently use `resolvePlan()` for all paths.
  - **`packs add`**: reads and writes pack manifest directly. Should build an operation and defer to `resolvePlan()`.
  - **`packs remove`**: reads and writes pack manifest directly. Should build an operation and defer to `resolvePlan()`.

## Capabilities

### New Capabilities

_None — this change enforces an existing architectural pattern, not new user-facing behavior._

### Modified Capabilities

- `cli-skills-new`: handler must use resolve-plan pattern instead of direct file I/O and settings mutations
- `cli-skills-enable-disable`: handlers must route all state-changing paths through resolve-plan operations (including promoted transitive and implicit-skill paths)
- `cli-packs-new`: handler must use resolve-plan pattern instead of direct file I/O and settings mutations
- `cli-packs-add`: handler must use resolve-plan pattern instead of direct manifest file I/O
- `cli-packs-remove`: handler must use resolve-plan pattern instead of direct manifest file I/O

## Impact

- **Code**: 6 handlers modified (`skills new`, `packs new`, `skills enable`, `skills disable`, `packs add`, `packs remove`)
- **New operations**: Add operations for skill scaffolding, pack scaffolding, pack manifest add, and pack manifest remove (`NewSkillOperation`, `NewPackOperation`, `AddToPackOperation`, `RemoveFromPackOperation`, or equivalent names)
- **Existing operations**: `EnableSkillOperation` and `DisableSkillOperation` already exist — the partial handlers just need to route all paths through them
- **Tests**: Handler tests updated to verify plan construction; operation handler tests cover side-effects
- **User experience**: Users gain plan preview (`--preview`) and confirmation prompts for scaffolding, manifest editing, and the currently direct enable/disable edge paths that previously applied immediately

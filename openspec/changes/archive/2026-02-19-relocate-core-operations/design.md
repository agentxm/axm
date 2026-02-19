## Context

Business logic in `cli-commands/` falls into five categories:

| Category                          | Files                                                                                                  | Example                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Operations** (types + handlers) | `skills/operations.ts` + 7 handler files, `packs/operations.ts` + 4 handler files, 1 inline in handler | `InstallSkillOperation` + `installSkill`, `PublishPackOperation` + `publishPack` |
| **Plan builders**                 | 5 `build-plan.ts` files + `plan-helpers.ts` (command-specific, stay in place)                          | `buildSkillInstallPlan`, `buildUninstallPlan`, `buildSingleStepPlan`             |
| **Shared helpers**                | 6 utility files                                                                                        | `copySkillDirectory`, `sanitizeName`, `sourceToLockEntry`                        |
| **Constants & paths**             | 4 files                                                                                                | `MANIFEST_FILENAME`, `computePackPaths`                                          |

Cross-command imports already exist: packs imports `installSkill`, `copySkillDirectory`, `InstallSkillOperation`, `sanitizeName`, and `removeIfExists` from skills. The current organization forces these cross-boundary imports through CLI command directories.

**All operation handlers:**

| Handler            | File                                  | Used by                                         |
| ------------------ | ------------------------------------- | ----------------------------------------------- |
| `installSkill`     | `skills/install/install-skill.ts`     | skills install, update, fork; **packs install** |
| `uninstallSkill`   | `skills/uninstall/uninstall-skill.ts` | skills uninstall, update                        |
| `publishSkill`     | `skills/publish-skill.ts`             | skills publish, fork                            |
| `copySkill`        | `skills/copy-skill.ts`                | skills fork                                     |
| `enableSkill`      | `skills/enable/enable-skill.ts`       | skills enable                                   |
| `disableSkill`     | `skills/disable/disable-skill.ts`     | skills disable                                  |
| `renameSkill`      | `skills/rename/rename-skill.ts`       | skills rename                                   |
| `installPack`      | `packs/install/install-pack.ts`       | packs install                                   |
| `uninstallPack`    | `packs/uninstall/uninstall-pack.ts`   | packs uninstall                                 |
| `publishPack`      | `packs/publish/publish-pack.ts`       | packs publish                                   |
| `publishExtension` | `packs/publish-extension.ts`          | packs publish                                   |
| `unpackPack`       | `packs/unpack/handler.ts` (inline)    | packs unpack                                    |

> **Naming convention:** New operation filenames drop the type suffix (e.g., `install.ts` not `install-skill.ts`) since the directory already conveys the type. Exception: `publish-extension.ts` in packs keeps its suffix because "extension" is a distinct concept from "pack".

**All shared helpers:**

| Helper                                                                   | File                               | Used by                                                                                 |
| ------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `copySkillDirectory`                                                     | `skills/copy-skill-directory.ts`   | installSkill, copySkill, enableSkill, renameSkill, **installPack**                      |
| `removeFromAllCanonicalLocations`, `stripFileProtocol`, `removeIfExists` | `skills/fs-helpers.ts`             | installSkill, uninstallSkill, copySkill, **uninstallPack**                              |
| `sourceToLockEntry`                                                      | `skills/source-to-lock-entry.ts`   | installSkill                                                                            |
| `computeSkillPaths`                                                      | `skills/skill-paths.ts`            | skills new, rename                                                                      |
| `sanitizeName`, `getSkillDisplayName`                                    | `skills/install/skill-utils.ts`    | installSkill, uninstallSkill, enableSkill, disableSkill, renameSkill, **uninstallPack** |
| `InstallResult`                                                          | `skills/install/install-result.ts` | installSkill                                                                            |

## File Inventory

Comprehensive list of every file move. All paths relative to `packages/cli/src/`. Tests co-locate with their source.

### Operations (type definition + executor merged into one file)

The current `operations.ts` files are split apart — each operation's types merge into the file with its executor.

| Old path                                                                         | New path                                                | Rationale                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `cli-commands/skills/install/install-skill.ts`                                   | `extensions/skills/operations/install.ts`               | Skill operation; merge `InstallSkillOperation` types from `operations.ts`                |
| `cli-commands/skills/install/install-skill.test.ts`                              | `extensions/skills/operations/install.test.ts`          | Co-locate test                                                                           |
| `cli-commands/skills/uninstall/uninstall-skill.ts`                               | `extensions/skills/operations/uninstall.ts`             | Skill operation; merge `UninstallSkillOperation` types from `operations.ts`              |
| `cli-commands/skills/uninstall/uninstall-skill.test.ts`                          | `extensions/skills/operations/uninstall.test.ts`        | Co-locate test                                                                           |
| `cli-commands/skills/publish-skill.ts`                                           | `extensions/skills/operations/publish.ts`               | Skill operation; merge `PublishSkillOperation` types from `operations.ts`                |
| `cli-commands/skills/publish-skill.test.ts`                                      | `extensions/skills/operations/publish.test.ts`          | Co-locate test                                                                           |
| `cli-commands/skills/copy-skill.ts`                                              | `extensions/skills/operations/copy.ts`                  | Skill operation; merge `CopySkillOperation` types from `operations.ts`                   |
| `cli-commands/skills/copy-skill.test.ts`                                         | `extensions/skills/operations/copy.test.ts`             | Co-locate test                                                                           |
| `cli-commands/skills/enable/enable-skill.ts`                                     | `extensions/skills/operations/enable.ts`                | Skill operation; merge `EnableSkillOperation` type from `operations.ts`                  |
| `cli-commands/skills/enable/enable-skill.test.ts`                                | `extensions/skills/operations/enable.test.ts`           | Co-locate test                                                                           |
| `cli-commands/skills/disable/disable-skill.ts`                                   | `extensions/skills/operations/disable.ts`               | Skill operation; merge `DisableSkillOperation` type from `operations.ts`                 |
| `cli-commands/skills/disable/disable-skill.test.ts`                              | `extensions/skills/operations/disable.test.ts`          | Co-locate test                                                                           |
| `cli-commands/skills/rename/rename-skill.ts`                                     | `extensions/skills/operations/rename.ts`                | Skill operation; merge `RenameSkillOperation` type from `operations.ts`                  |
| `cli-commands/skills/rename/rename-skill.test.ts`                                | `extensions/skills/operations/rename.test.ts`           | Co-locate test                                                                           |
| `cli-commands/packs/install/install-pack.ts`                                     | `extensions/packs/operations/install.ts`                | Pack operation; merge `InstallPackOperation` types from `operations.ts`                  |
| `cli-commands/packs/install/install-pack.test.ts`                                | `extensions/packs/operations/install.test.ts`           | Co-locate test                                                                           |
| `cli-commands/packs/uninstall/uninstall-pack.ts`                                 | `extensions/packs/operations/uninstall.ts`              | Pack operation; merge `UninstallPackOperation` types from `operations.ts` (no test file) |
| `cli-commands/packs/publish/publish-pack.ts`                                     | `extensions/packs/operations/publish.ts`                | Pack operation; merge `PublishPackOperation` types from `operations.ts` (no test file)   |
| `cli-commands/packs/publish-extension.ts`                                        | `extensions/packs/operations/publish-extension.ts`      | Pack operation; merge `PublishExtensionOperation` types from `operations.ts`             |
| `cli-commands/packs/publish-extension.test.ts`                                   | `extensions/packs/operations/publish-extension.test.ts` | Co-locate test                                                                           |
| `UnpackPackOperation` + `unpackPack` from `cli-commands/packs/unpack/handler.ts` | `extensions/packs/operations/unpack.ts`                 | Extract inline operation from handler into its own file                                  |

### Operation-level helpers (move with operations)

| Old path                                           | New path                                              | Rationale                                     |
| -------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `cli-commands/skills/copy-skill-directory.ts`      | `extensions/skills/operations/copy-directory.ts`      | Used exclusively by skill operation executors |
| `cli-commands/skills/copy-skill-directory.test.ts` | `extensions/skills/operations/copy-directory.test.ts` | Co-locate test                                |
| `cli-commands/skills/install/install-result.ts`    | `extensions/skills/operations/install-result.ts`      | Type used only by install operation           |

### Shared helpers

| Old path                                           | New path                               | Rationale                                                        |
| -------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `cli-commands/skills/fs-helpers.ts`                | `utils/fs-helpers.ts`                  | General file system utilities, not skill-specific (no test file) |
| `cli-commands/skills/source-to-lock-entry.ts`      | `sources/source-to-lock-entry.ts`      | Maps source refs to lockfile shape — source-domain logic         |
| `cli-commands/skills/source-to-lock-entry.test.ts` | `sources/source-to-lock-entry.test.ts` | Co-locate test                                                   |
| `cli-commands/skills/skill-paths.ts`               | `extensions/skills/paths.ts`           | Skill path computation — extension-domain utility                |
| `cli-commands/skills/skill-paths.test.ts`          | `extensions/skills/paths.test.ts`      | Co-locate test                                                   |
| `cli-commands/skills/install/skill-utils.ts`       | `extensions/skills/utils.ts`           | Skill name sanitization — extension-domain utility               |
| `cli-commands/skills/install/skill-utils.test.ts`  | `extensions/skills/utils.test.ts`      | Co-locate test                                                   |

### Constants & paths

Constants co-locate with the module they're most relevant to — no standalone `constants.ts` files.

| Old path                                                        | New location                                              | Rationale                                          |
| --------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| `MANIFEST_FILENAME` from `cli-commands/skills/constants.ts`     | `extensions/skills/manifest-schema.ts`                    | Manifest filename belongs with the manifest schema |
| `UNIVERSAL_SKILLS_DIR` from `cli-commands/skills/constants.ts`  | Remove (unused) or `extensions/skills/paths.ts` if needed | Currently has no importers                         |
| `PACK_MANIFEST_FILENAME` from `cli-commands/packs/constants.ts` | `extensions/packs/manifest-schema.ts`                     | Manifest filename belongs with the manifest schema |
| `RawPackManifest` from `cli-commands/packs/constants.ts`        | `extensions/packs/manifest-schema.ts`                     | Raw manifest type complements the validated schema |
| `cli-commands/skills/constants.ts`                              | Delete                                                    | Contents distributed to relevant modules           |
| `cli-commands/packs/constants.ts`                               | Delete                                                    | Contents distributed to relevant modules           |
| `cli-commands/packs/pack-paths.ts`                              | `extensions/packs/paths.ts`                               | Pack path computation — extension-domain utility   |
| `cli-commands/packs/pack-paths.test.ts`                         | `extensions/packs/paths.test.ts`                          | Co-locate test                                     |

### Types

| Old path                                                 | New path                                                | Rationale                                                  |
| -------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `Skill` interface in `cli-commands/skills/operations.ts` | Delete (already exists in `extensions/skills/types.ts`) | Duplicate — `types.ts` already has the identical interface |

### Plan builders (rename in place, not moved)

| Old path                                           | New path                                     | Rationale                                                        |
| -------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `cli-commands/skills/install/build-plan.ts`        | `cli-commands/skills/install/plan.ts`        | Rename for consistency; stays in cli-commands (handler-specific) |
| `cli-commands/skills/install/build-plan.test.ts`   | `cli-commands/skills/install/plan.test.ts`   | Co-locate test rename                                            |
| `cli-commands/skills/uninstall/build-plan.ts`      | `cli-commands/skills/uninstall/plan.ts`      | Rename for consistency                                           |
| `cli-commands/skills/uninstall/build-plan.test.ts` | `cli-commands/skills/uninstall/plan.test.ts` | Co-locate test rename                                            |
| `cli-commands/skills/update/build-plan.ts`         | `cli-commands/skills/update/plan.ts`         | Rename for consistency                                           |
| `cli-commands/skills/update/build-plan.test.ts`    | `cli-commands/skills/update/plan.test.ts`    | Co-locate test rename                                            |
| `cli-commands/packs/install/build-plan.ts`         | `cli-commands/packs/install/plan.ts`         | Rename for consistency                                           |
| `cli-commands/packs/install/build-plan.test.ts`    | `cli-commands/packs/install/plan.test.ts`    | Co-locate test rename                                            |
| `cli-commands/packs/uninstall/build-plan.ts`       | `cli-commands/packs/uninstall/plan.ts`       | Rename for consistency                                           |
| `cli-commands/packs/uninstall/build-plan.test.ts`  | `cli-commands/packs/uninstall/plan.test.ts`  | Co-locate test rename                                            |

### Deleted (contents merged elsewhere)

| Old path                            | Disposition                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli-commands/skills/operations.ts` | Split — each operation's types merge into its `extensions/skills/operations/{verb}.ts` file; `Skill` interface → `extensions/skills/types.ts` |
| `cli-commands/packs/operations.ts`  | Split — each operation's types merge into its `extensions/packs/operations/{verb}.ts` file                                                    |
| `cli-commands/skills/index.ts`      | Remove or reduce — all re-exported items relocated                                                                                            |
| `cli-commands/packs/index.ts`       | Reduce — remove re-exports of `computePackPaths`, `PackDirPath`, and operation types (relocated); keep command re-exports                     |

## Goals / Non-Goals

**Goals:**

- Move all reusable business logic out of `cli-commands/` into general-purpose modules
- `cli-commands/` contains only: yargs definitions, arg mapping, plan building, handler invocation
- Every operation handler and shared helper has one canonical location that any command can import without crossing command boundaries
- Plan builders stay in `cli-commands/` — they are unique to each command and orchestrate that command's specific execution plan
- Tests co-locate with their source at the new locations

**Non-Goals:**

- Consolidating duplicate logic (e.g., merging `publishSkill` into `publishExtension`) — follow-up change
- Changing any user-facing behavior or CLI output
- Restructuring the general-purpose modules themselves (e.g., splitting workspace)
- Moving handler.ts files (these stay in cli-commands as the CLI entry points)

## Decisions

### 1. Cohesive operation files → `extensions/{type}/operations/{verb}.ts`

Each operation gets a single file containing both its **type definition** (operation args interface + operation type alias) and its **executor** (OperationHandler implementation). The current `operations.ts` files that bundle all types for a domain are split apart. Operations live in the feature folder for the extension type they operate on. Filenames use just the verb — the directory already conveys the type.

```
extensions/
  skills/
    operations/
      install.ts              # InstallSkillOperationArgs, InstallSkillOperation, installSkill
      uninstall.ts            # UninstallSkillOperationArgs, UninstallSkillOperation, uninstallSkill
      publish.ts              # PublishSkillOperationArgs, PublishSkillOperation, publishSkill
      copy.ts                 # CopySkillOperationArgs, CopySkillOperation, copySkill
      enable.ts               # EnableSkillOperation, enableSkill
      disable.ts              # DisableSkillOperation, disableSkill
      rename.ts               # RenameSkillOperation, renameSkill
      copy-directory.ts       # shared helper used by skill operations
      install-result.ts       # type used by install
  packs/
    operations/
      install.ts              # InstallPackOperationArgs, InstallPackOperation, installPack
      uninstall.ts            # UninstallPackOperationArgs, UninstallPackOperation, uninstallPack
      publish.ts              # PublishPackOperationArgs, PublishPackOperation, publishPack
      publish-extension.ts    # PublishExtensionOperationArgs, PublishExtensionOperation, publishExtension
      unpack.ts               # UnpackPackOperationArgs, UnpackPackOperation, unpackPack
```

**Rationale:** Follows the codebase principle "group by feature, not by type." Skill operations live with skills, pack operations live with packs. When working on a feature, everything is in one place: schemas, constants, paths, types, and operations. Co-locating the type definition with its executor makes each operation self-contained — you find the contract and the implementation in one file.

The `Skill` interface (metadata parsed from SKILL.md frontmatter) already exists in `extensions/skills/types.ts` — the duplicate in `operations.ts` is deleted.

Cross-feature imports work naturally: `extensions/packs/operations/install.ts` imports `installSkill` from `extensions/skills/operations/install.ts` — a direct cross-feature dependency within the same module layer.

**Alternative considered:** `workspace/operations/` (flat directory) — rejected because it groups by type (all operations together) rather than by feature, and grows workspace's responsibility beyond its "plan engine" role.

### 2. Plan builders stay in `cli-commands/` (rename to `plan.ts`)

Plan builders are unique to each command — they define how that specific command assembles its execution plan. They are not shared across commands and do not need to be reusable. They stay in `cli-commands/` but are renamed from `build-plan.ts` to `plan.ts` for consistency.

| Current                          | After                      |
| -------------------------------- | -------------------------- |
| `skills/install/build-plan.ts`   | `skills/install/plan.ts`   |
| `skills/uninstall/build-plan.ts` | `skills/uninstall/plan.ts` |
| `skills/update/build-plan.ts`    | `skills/update/plan.ts`    |
| `packs/install/build-plan.ts`    | `packs/install/plan.ts`    |
| `packs/uninstall/build-plan.ts`  | `packs/uninstall/plan.ts`  |

Their imports will update to point at the new locations for operation types and shared helpers.

### 3. Shared helpers → appropriate modules by domain

| Helper               | Target                                           | Rationale                                                              |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `copySkillDirectory` | `extensions/skills/operations/copy-directory.ts` | Operation-level utility, used exclusively by skill operation executors |
| `fs-helpers.ts`      | `utils/fs-helpers.ts`                            | General file system utilities (`removeIfExists`, `stripFileProtocol`)  |
| `sourceToLockEntry`  | `sources/source-to-lock-entry.ts`                | Converts source refs to lockfile shape — source-domain logic           |
| `skill-paths.ts`     | `extensions/skills/paths.ts`                     | Skill path computation, parallels `extensions/packs/paths.ts`          |
| `skill-utils.ts`     | `extensions/skills/utils.ts`                     | Skill name sanitization — extension-domain utility                     |
| `install-result.ts`  | `extensions/skills/operations/install-result.ts` | Type used only by install operation                                    |

### 4. Constants → co-locate with relevant modules

No standalone `constants.ts` files. Each constant moves to the module it's most relevant to.

| Constant                          | Target                                          | Rationale                                    |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| `MANIFEST_FILENAME`               | `extensions/skills/manifest-schema.ts`          | Filename for the schema defined in this file |
| `UNIVERSAL_SKILLS_DIR`            | Remove (unused) or `extensions/skills/paths.ts` | No current importers                         |
| `PACK_MANIFEST_FILENAME`          | `extensions/packs/manifest-schema.ts`           | Filename for the schema defined in this file |
| `RawPackManifest`                 | `extensions/packs/manifest-schema.ts`           | Raw type complements the validated schema    |
| `computePackPaths`, `PackDirPath` | `extensions/packs/paths.ts`                     | Path computation utility                     |

### 5. Barrel exports

`extensions/index.ts` expands to re-export constants, paths, utilities, and operations from the new files. Each feature folder (`extensions/skills/`, `extensions/packs/`) gets its own barrel that re-exports its operations. Existing consumers use barrel imports; direct file imports are acceptable for operation internals.

### 6. cli-commands/ after the move

After relocation, each command directory contains only:

- `command.ts` — yargs definition and arg types
- `command.test.ts` — command parsing tests
- `handler.ts` — maps CLI args to handler args, invokes operation handlers via workspace plan system
- `handler.test.ts` — handler tests
- `plan.ts` — command-specific plan builder (when present)
- `plan.test.ts` — plan builder tests (when present)
- `*.e2e.test.ts` — E2E tests (when present)

The `skills/index.ts` barrel currently exports `copySkillDirectory`, `sourceToLockEntry`, `computeSkillPaths`. After the move it is either removed or reduced to only CLI-layer re-exports if needed.

## Risks / Trade-offs

**[extensions module gains runtime dependencies]** → Operation executors depend on workspace types (`OperationHandler`), registry (client), utils (zip, integrity), sources (host providers), and agents (registry). Currently extensions is a lean types/schemas module. → These dependencies are isolated in `extensions/{type}/operations/` subdirectories and don't pollute the schema layer. The extensions module's role expands from "extension definitions" to "everything about extensions" — a cohesive feature-oriented responsibility.

**[Large number of import path updates]** → Every consumer of moved code needs updated imports. → Mechanical change, easily verified by TypeScript compiler. Run `pnpm typecheck` after each batch of moves.

**[Test disruption]** → Tests co-located with moved files must also move, and handler tests may need updated import paths for test utilities. → Tests move with their source. Run `pnpm test` after the move to verify.

## Migration Plan

Execute as a single change (no phased rollout needed — all internal).

**Order of operations** (each step must compile before proceeding):

1. **Constants, types, paths** — co-locate constants into their relevant modules (`manifest-schema.ts`, `paths.ts`). Move types to `extensions/`. Update imports. Typecheck.
2. **Shared helpers** — move `fs-helpers` to `utils/`, `sourceToLockEntry` to `sources/`, `skill-paths` and `skill-utils` to `extensions/skills/`. Update imports. Typecheck.
3. **Operations** — for each operation, merge its type definition (from `operations.ts`) and its executor into a single file under `extensions/{type}/operations/{verb}.ts`. Move `copySkillDirectory` → `copy-directory.ts` and `install-result` into `extensions/skills/operations/`. Update barrel exports and all imports. Typecheck.
4. **Rename plan builders** — rename `build-plan.ts` → `plan.ts` in each command directory. Update imports to point at new module locations. Typecheck.
5. **Clean up** — remove empty directories, old `operations.ts` files, and obsolete barrel exports from `cli-commands/skills/index.ts`. Run full test suite.
6. **Lint and format** — `pnpm lint:fix && pnpm format`.

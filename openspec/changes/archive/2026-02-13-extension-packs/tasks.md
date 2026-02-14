> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Schema & Type Foundation

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 1.1, 1.2, 1.3 are independent — launch as parallel subagents.

- [x] 1.1 Define `PackManifestSchema` in `packages/cli/src/extensions/packs/manifest-schema.ts` — extend `CommonManifestFields` with `skills`, `commands`, `mcp-servers` fields (each optional record of FQN to semver range). Add tests for valid/invalid manifests.
- [x] 1.2 Define `PackEntrySchema`, `PackEntryObjectSchema`, and `PacksMapSchema` in `packages/cli/src/settings/schema.ts` — parallel to `SkillEntrySchema`/`SkillsMapSchema`. Replace `ExtensionMapSchema` usage for `packs` field. Add tests for string entries, object entries, and invalid entries (e.g., `{ managed: false }`).
- [x] 1.3 Define `PackLockEntrySchema` in `packages/cli/src/lockfile/schema.ts` — registry lock fields plus `resolvedSkills`, `resolvedCommands`, `resolvedMcpServers` (each record of FQN to exact version). Add a `packs` top-level section to the lockfile schema. Add tests.
- [x] 1.4 Update `RegistryExtensionTypeSchema` in `packages/cli/src/extensions/common.ts` to include `"pack"`. Update `ExtensionIndex` type field to accept `"pack"`.
- [x] 1.5 Run `pnpm typecheck` — fix any errors
- [x] 1.6 Run `pnpm lint` — fix any errors
- [x] 1.7 Run `pnpm test` — fix any failures
- [x] 1.8 Run `pnpm test:e2e` — fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. Workspace Service: Pack Methods & Transitive Visibility

> **Subagent:** Run this entire phase in a single subagent.
> Depends on: Phase 1

- [x] 2.1 Add pack workspace methods to the workspace service interface: `getConfiguredPacks()`, `getInstalledPacks()`, `getLockedPacks()`, `getLockedPack(name)`, `setPack(name, source, lockEntry)`, `removePack(name)`, `getPackDir(name, scope)`. Add tests for each method.
- [x] 2.2 Expand `getInstalledSkills()` to merge direct (settings.json) and transitive (pack-provided) skills. Transitive skills derived from installed packs' `resolvedSkills` in lockfile. Direct entries take precedence. Add tests for: pack-provided skill visible, direct entry overrides transitive, multiple packs providing same skill.
- [x] 2.3 Add `computePackPaths` function (parallel to `computeSkillPaths`) — packs are always registry, no `src/` subdirectory. The canonical path is `.axm/extensions/@<scope>/packs/<name>/`. Add tests.
- [x] 2.4 Run `pnpm typecheck` — fix any errors
- [x] 2.5 Run `pnpm lint` — fix any errors
- [x] 2.6 Run `pnpm test` — fix any failures
- [x] 2.7 Run `pnpm test:e2e` — fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Pack Operations

> **Subagent:** Run this entire phase in a single subagent.
> Depends on: Phase 2

- [x] 3.1 Define pack operation types in `packages/cli/src/cli-commands/packs/operations.ts`: `InstallPackOperation`, `UninstallPackOperation`, `PublishPackOperation`. Add operation args types.
- [x] 3.2 Implement `buildInstallPlan` for packs — builds a plan with `install-pack` operation for the pack itself plus `install-skill`/`install-command`/`install-mcp-server` operations for each referenced extension not already installed. Add tests.
- [x] 3.3 Implement `buildUninstallPlan` for packs — builds a plan with `uninstall-pack` plus `uninstall-*` operations for orphaned extensions. Orphan detection: scan all other pack lock entries' `resolved*` fields and check `getConfiguredSkills()`/etc. for direct entries. Add tests for orphaned, shared, and promoted-to-direct cases.
- [x] 3.4 Run `pnpm typecheck` — fix any errors
- [x] 3.5 Run `pnpm lint` — fix any errors
- [x] 3.6 Run `pnpm test` — fix any failures
- [x] 3.7 Run `pnpm test:e2e` — fix any failures
- [x] 3.8 Kill any vitest worker processes

## 4. CLI Commands: `packs new` and `packs add`/`remove`

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1+4.2 and 4.3+4.4 are independent — launch as parallel subagents.
> Depends on: Phase 2

- [x] 4.1 Implement `packs new` command (`command.ts` + `handler.ts`) — scaffold `axm-pack.json` with workspace scope (or `--scope` override), register in settings.json. Add handler tests for: success, scope override, no scope configured, pack already exists.
- [x] 4.2 Implement `packs new` command definition (`command.ts`) with yargs args: positional `name`, `--scope`, `--yes`, `--non-interactive`. Add command parsing tests.
- [x] 4.3 Implement `packs add` command (`command.ts` + `handler.ts`) — add extension to pack manifest. Support glob expansion against managed, registry-sourced workspace extensions. Infer extension type from lockfile. Derive version range from installed version. Add handler tests for: specific name, glob match, glob no match, non-registry rejected, pack not found, extension already in pack.
- [x] 4.4 Implement `packs remove` command (`command.ts` + `handler.ts`) — remove extension from pack manifest. Support glob expansion against pack manifest entries. Add handler tests for: specific name, glob match, glob no match, extension not in pack, pack not found.
- [x] 4.5 Run `pnpm typecheck` — fix any errors
- [x] 4.6 Run `pnpm lint` — fix any errors
- [x] 4.7 Run `pnpm test` — fix any failures
- [x] 4.8 Run `pnpm test:e2e` — fix any failures
- [x] 4.9 Kill any vitest worker processes

## 5. CLI Commands: `packs install` and `packs uninstall`

> **Subagent:** Run this entire phase in a single subagent.
> Depends on: Phase 3

- [x] 5.1 Implement `packs install` command (`command.ts` + `handler.ts`) — resolve pack from registry, fetch archive, extract to managed location, build cascading install plan, resolve plan. Add handler tests for: full install, partial install (some extensions already present), force overwrite, preview mode, non-registry source rejected.
- [x] 5.2 Implement `packs install` command definition (`command.ts`) with yargs args: positional `source`, `--global`, `--yes`, `--force`, `--preview`, `--non-interactive`. Add command parsing tests.
- [x] 5.3 Implement `packs uninstall` command (`command.ts` + `handler.ts`) — build uninstall plan with orphan detection, resolve plan. Support glob patterns. Add handler tests for: uninstall with orphans, shared extensions preserved, promoted extensions preserved, glob pattern.
- [x] 5.4 Implement `packs uninstall` command definition (`command.ts`) with yargs args: positional `name`, `--yes`, `--preview`, `--non-interactive`. Add command parsing tests.
- [x] 5.5 Run `pnpm typecheck` — fix any errors
- [x] 5.6 Run `pnpm lint` — fix any errors
- [x] 5.7 Run `pnpm test` — fix any failures
- [x] 5.8 Run `pnpm test:e2e` — fix any failures
- [x] 5.9 Kill any vitest worker processes

## 6. CLI Commands: `packs publish` and `packs unpack`

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 6.1+6.2 and 6.3+6.4 are independent — launch as parallel subagents.
> Depends on: Phase 2

- [x] 6.1 Implement `packs publish` command (`command.ts` + `handler.ts`) — validate `axm-pack.json`, zip all files in pack directory, compute checksum, write to registry under `packs/` segment, update `index.json`. Add handler tests for: successful publish, missing manifest, idempotent publish, version conflict.
- [x] 6.2 Implement `packs publish` command definition (`command.ts`) with yargs args: positional `pack`, `--registry`, `--yes`, `--preview`, `--non-interactive`. Add command parsing tests.
- [x] 6.3 Implement `packs unpack` command (`command.ts` + `handler.ts`) — flatten pack's resolved extensions into settings.json as direct entries, preserve existing direct entries, remove pack entry from settings and lockfile. Add handler tests for: full unpack, existing direct entries preserved, pack not installed.
- [x] 6.4 Implement `packs unpack` command definition (`command.ts`) with yargs args: positional `name`, `--yes`, `--preview`, `--non-interactive`. Add command parsing tests.
- [x] 6.5 Run `pnpm typecheck` — fix any errors
- [x] 6.6 Run `pnpm lint` — fix any errors
- [x] 6.7 Run `pnpm test` — fix any failures
- [x] 6.8 Run `pnpm test:e2e` — fix any failures
- [x] 6.9 Kill any vitest worker processes

## 7. CLI Wiring & Parent Command

> **Subagent:** Run this entire phase in a single subagent.
> Depends on: Phases 4, 5, 6

- [x] 7.1 Create parent `packs` command (`packages/cli/src/cli-commands/packs/command.ts`) — container with `.command()` wiring for all subcommands (new, install, uninstall, add, remove, publish, unpack). Follow `skills/command.ts` pattern with `demandCommand(1)` and fail handler.
- [x] 7.2 Register `packsCommand` in the top-level CLI entry point alongside `skillsCommand`.
- [x] 7.3 Run `pnpm typecheck` — fix any errors
- [x] 7.4 Run `pnpm lint` — fix any errors
- [x] 7.5 Run `pnpm test` — fix any failures
- [x] 7.6 Run `pnpm test:e2e` — fix any failures
- [x] 7.7 Kill any vitest worker processes

## 8. Direct Entry Promotion (Disable Transitive Skills)

> **Subagent:** Run this entire phase in a single subagent.
> Depends on: Phase 2

- [x] 8.1 Update `skills disable` handler to support transitive skills — when a skill exists only transitively (via pack), create a direct settings entry `{ source: "@scope/name", enabled: false }`. Add handler tests for: disable transitive skill creates direct entry, disable direct skill works as before.
- [x] 8.2 Update `skills enable` handler to support re-enabling promoted skills. Add handler tests.
- [x] 8.3 Run `pnpm typecheck` — fix any errors
- [x] 8.4 Run `pnpm lint` — fix any errors
- [x] 8.5 Run `pnpm test` — fix any failures
- [x] 8.6 Run `pnpm test:e2e` — fix any failures
- [x] 8.7 Kill any vitest worker processes

## 9. E2E Tests

> **Subagent:** Run this entire phase in a single subagent.
> Depends on: Phases 7, 8

- [x] 9.1 Add E2E test for `packs new` — scaffold pack, verify manifest and settings entry.
- [x] 9.2 Add E2E test for `packs add`/`remove` — add extensions to pack manifest, remove them, verify manifest changes.
- [x] 9.3 Add E2E test for `packs publish` — publish pack to local registry, verify archive and index.json.
- [x] 9.4 Add E2E test for `packs install` — install pack from registry, verify pack + referenced extensions installed, settings and lockfile updated.
- [x] 9.5 Add E2E test for `packs uninstall` — uninstall pack, verify orphaned extensions removed, shared/promoted extensions preserved.
- [x] 9.6 Add E2E test for `packs unpack` — unpack pack, verify extensions promoted to direct settings entries, pack entry removed.
- [x] 9.7 Add E2E test for transitive skill disable — install pack, disable pack-provided skill, verify direct entry created, uninstall pack, verify skill preserved.
- [x] 9.8 Run `pnpm test:e2e` — fix any failures
- [x] 9.9 Kill any vitest worker processes

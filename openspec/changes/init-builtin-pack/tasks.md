> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Lockfile Schema — Add `"builtin"` source type

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Write tests for `BuiltinSkillLockEntrySchema` — decode succeeds with `type: "builtin"`, `agents`, `installedAt`, `updatedAt`; rejects entries with registry-specific fields (`checksum`, `sourceName`)
- [x] 1.2 Write tests for `BuiltinPackLockEntrySchema` — decode succeeds with `type: "builtin"`, `scope`, `name`, `resolvedVersion`, timestamps, `resolvedSkills/Commands/McpServers`; rejects entries with `checksum` or `sourceName`
- [x] 1.3 Write tests for `LockfileSchema` round-trip with builtin entries — a lockfile containing both registry and builtin packs/skills decodes and re-encodes correctly
- [x] 1.4 Add `BuiltinSkillLockEntrySchema` to `lockfile/schema.ts` — `Schema.Struct` with `type: Literal("builtin")` and `CommonFields`
- [x] 1.5 Add `BuiltinPackLockEntrySchema` to `lockfile/schema.ts` — `Schema.Struct` with `type: Literal("builtin")`, `scope`, `name`, `resolvedVersion`, timestamps, and `ResolvedExtensionMapSchema` fields (no `checksum`, no `sourceName`)
- [x] 1.6 Update `SkillLockEntrySchema` union to include `BuiltinSkillLockEntrySchema`
- [x] 1.7 Rename existing `PackLockEntrySchema` to `RegistryPackLockEntrySchema` and create new `PackLockEntrySchema` as `Schema.Union` of `RegistryPackLockEntrySchema` and `BuiltinPackLockEntrySchema`
- [x] 1.8 Run `pnpm typecheck` and fix any errors
- [x] 1.9 Run `pnpm lint` and fix any errors
- [x] 1.10 Run `pnpm test` and fix any failures
- [x] 1.11 Run `pnpm test:e2e` and fix any failures
- [x] 1.12 Kill any vitest worker processes

## 2. Builtin-Pack Module — Identity, assets, and resolution

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 2.1 Create `packages/cli/src/builtin-pack/` directory structure with `axm-pack.json` manifest (`name: "@axm/cli"`, skills referencing `@axm/axm-manage-skills`, `@axm/axm-manage-packs`, `@axm/axm-manage-mcp-servers`, `@axm/axm-manage-commands`)
- [x] 2.2 Create `packages/cli/src/builtin-pack/skills/axm-manage-skills/SKILL.md` with frontmatter (`name: "axm-manage-skills"`, `description`) and instructions covering `axm skills install/uninstall/list/update/enable/disable/fork/rename/publish`
- [x] 2.3 Create `packages/cli/src/builtin-pack/skills/axm-manage-packs/SKILL.md` with frontmatter and instructions covering `axm packs install/uninstall/new/add/remove/publish/unpack`
- [x] 2.4 Create `packages/cli/src/builtin-pack/skills/axm-manage-mcp-servers/SKILL.md` with frontmatter and instructions covering MCP server management commands
- [x] 2.5 Create `packages/cli/src/builtin-pack/skills/axm-manage-commands/SKILL.md` with frontmatter and instructions covering command management operations
- [x] 2.6 Write tests for `resolveBuiltinPack()` — returns parsed manifest with correct FQN, version matching CLI package version, and skill list; resolves asset paths correctly
- [x] 2.7 Create `packages/cli/src/builtin-pack/index.ts` — export `BUILTIN_PACK_FQN`, `BUILTIN_PACK_SCOPE`, `BUILTIN_PACK_NAME` constants and `resolveBuiltinPack()` function that reads bundled `axm-pack.json` relative to `import.meta.url` and returns manifest + CLI version
- [x] 2.8 Add a build step to copy `src/builtin-pack/**/*.{json,md}` to `dist/src/builtin-pack/` (tsc does not copy non-TS files). Update `package.json` build script accordingly.
- [x] 2.9 Run `pnpm typecheck` and fix any errors
- [x] 2.10 Run `pnpm lint` and fix any errors
- [x] 2.11 Run `pnpm test` and fix any failures
- [x] 2.12 Run `pnpm test:e2e` and fix any failures
- [x] 2.13 Kill any vitest worker processes

## 3. Init — Materialize builtin pack on first initialization

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 2

- [x] 3.1 Write handler tests for builtin pack materialization during init — verify skills are copied to `.axm/extensions/@axm/skills/<name>/`, symlinks created in agent dirs, pack and skill lock entries written with `type: "builtin"`, and settings.json has no builtin pack entry
- [x] 3.2 Write test that init is a no-op for builtin pack when already in lockfile — re-running init with builtin pack already locked does not re-materialize or overwrite lock entries
- [x] 3.3 Implement builtin pack materialization in `initializeProjectWorkspace()` — after writing settings, call `resolveBuiltinPack()`, copy skill dirs to canonical locations, create symlinks for selected agents, write builtin pack and skill lock entries
- [x] 3.4 Run `pnpm typecheck` and fix any errors
- [x] 3.5 Run `pnpm lint` and fix any errors
- [x] 3.6 Run `pnpm test` and fix any failures
- [x] 3.7 Run `pnpm test:e2e` and fix any failures
- [x] 3.8 Kill any vitest worker processes

## 4. Update — Handle `"builtin"` source type

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

- [x] 4.1 Write tests for `hasChanged()` with builtin entries — returns `true` when `resolvedVersion` differs from CLI version, `false` when equal
- [x] 4.2 Write tests for the update handler's builtin discovery — update resolves builtin manifest, builds install operations for changed builtin skills, handles new skills added and old skills removed across versions
- [x] 4.3 Add `"builtin"` branch to `hasChanged()` in `build-plan.ts` — compare `entry.resolvedVersion` against current CLI version
- [x] 4.4 Update the update handler to include builtin skills in the update candidate list — import `resolveBuiltinPack()`, compare manifest skill list against locked `resolvedSkills`, generate install/uninstall operations for changes
- [x] 4.5 Run `pnpm typecheck` and fix any errors
- [x] 4.6 Run `pnpm lint` and fix any errors
- [x] 4.7 Run `pnpm test` and fix any failures
- [x] 4.8 Run `pnpm test:e2e` and fix any failures
- [x] 4.9 Kill any vitest worker processes

## 5. E2E Tests

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [x] 5.1 Write E2E test: `axm init` in a fresh directory creates builtin pack lock entry and skill lock entries in `axm-lock.yaml`, skill files exist in `.axm/extensions/@axm/skills/`, symlinks exist in agent skill directories
- [x] 5.2 Write E2E test: `axm init` in an already-initialized directory does not duplicate or overwrite builtin lock entries
- [x] 5.3 Write E2E test: `axm skills update` with builtin skills at current version reports no-op
- [x] 5.4 Run `pnpm typecheck` and fix any errors
- [x] 5.5 Run `pnpm lint` and fix any errors
- [x] 5.6 Run `pnpm test` and fix any failures
- [x] 5.7 Run `pnpm test:e2e` and fix any failures
- [x] 5.8 Kill any vitest worker processes

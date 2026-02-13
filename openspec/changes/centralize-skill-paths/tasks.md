> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Scope alignment: always `@`-prefixed

> **Subagent:** Run this entire phase in a single subagent.

Align `RegistrySourceInput.scope` to always carry the `@` prefix from parse time. This phase has no dependencies.

- [ ] 1.1 Update parser regex in `packages/cli/src/sources/parser.ts` to keep `@` prefix in `RegistryPatternInput.scope`
- [ ] 1.2 Update tests for parser to expect `@`-prefixed scope
- [ ] 1.3 Update `printSourceInput` in `packages/cli/src/sources/printer.ts` to output `@`-prefixed scope directly (no manual `@` addition)
- [ ] 1.4 Update printer tests to expect `@`-prefixed scope input
- [ ] 1.5 Remove scope normalization (`startsWith("@")` check) in `packages/cli/src/sources/service.ts`
- [ ] 1.6 Remove defensive `@`-prefix comparison in `packages/cli/src/sources/providers/registry.ts`
- [ ] 1.7 Remove scope normalization block (lines 200-207) in `packages/cli/src/cli-commands/skills/install/install-skill.ts`
- [ ] 1.8 Update `source-to-lock-entry.ts` and its tests if scope handling is affected
- [ ] 1.9 Update any test fixtures that create `RegistrySourceInput` with bare scope (search for `scope: "` without `@`)
- [ ] 1.10 Run `pnpm typecheck` and fix any errors
- [ ] 1.11 Run `pnpm lint` and fix any errors
- [ ] 1.12 Run `pnpm test` and fix any failures
- [ ] 1.13 Run `pnpm test:e2e` and fix any failures
- [ ] 1.14 Kill any vitest worker processes

## 2. Rename `CANONICAL_SKILLS_DIR` to `UNIVERSAL_SKILLS_DIR`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [ ] 2.1 Rename constant in `packages/cli/src/cli-commands/skills/constants.ts`
- [ ] 2.2 Update all imports and usages across the codebase (install, uninstall, enable, disable, rename, resolve-source)
- [ ] 2.3 Update any test files that reference `CANONICAL_SKILLS_DIR`
- [ ] 2.4 Run `pnpm typecheck` and fix any errors
- [ ] 2.5 Run `pnpm lint` and fix any errors
- [ ] 2.6 Run `pnpm test` and fix any failures
- [ ] 2.7 Run `pnpm test:e2e` and fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Add `getSkillDir` to Workspace service

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1, Phase 2

- [ ] 3.1 Define `SkillPathSource` type and `SkillDirPaths` interface in `packages/cli/src/cli-commands/skills/skill-paths.ts` and export from barrel
- [ ] 3.2 Write unit tests for the pure path computation logic (registry vs non-registry, sanitization, all source types)
- [ ] 3.3 Implement the pure path computation function (used internally by the Workspace method)
- [ ] 3.4 Run tests to verify pure function — red, green, refactor
- [ ] 3.5 Add `getSkillDir` method signature to `WorkspaceContextService` interface in `packages/cli/src/workspace/service.ts`
- [ ] 3.6 Implement `getSkillDir` in the `make` function: name-only mode (lockfile lookup) and explicit-source mode (skip lookup)
- [ ] 3.7 Write handler-level tests for `getSkillDir` via Workspace service (name-only lookup, explicit source, missing lock entry error)
- [ ] 3.8 Run tests to verify workspace integration — red, green, refactor
- [ ] 3.9 Run `pnpm typecheck` and fix any errors
- [ ] 3.10 Run `pnpm lint` and fix any errors
- [ ] 3.11 Run `pnpm test` and fix any failures
- [ ] 3.12 Run `pnpm test:e2e` and fix any failures
- [ ] 3.13 Kill any vitest worker processes

## 4. Migrate handlers to use `getSkillDir`

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 4.1-4.2, 4.3-4.4, and 4.5-4.6 are independent — launch as parallel subagents.

Depends on: Phase 3

- [ ] 4.1 Update `packages/cli/src/cli-commands/skills/install/install-skill.ts` — replace inline path computation with `ws.getSkillDir(name, source)`, rename `contentPath` to `skillSrcPath`
- [ ] 4.2 Update install handler tests to verify `getSkillDir` is used (mock workspace service)
- [ ] 4.3 Update `packages/cli/src/cli-commands/skills/enable/enable-skill.ts` — replace inline path computation with `ws.getSkillDir(name)`, eliminate unsafe `as` cast for scope, rename `contentPath` to `skillSrcPath`
- [ ] 4.4 Update enable handler tests
- [ ] 4.5 Update `packages/cli/src/cli-commands/skills/rename/rename-skill.ts` — replace hardcoded `UNIVERSAL_SKILLS_DIR` paths with `ws.getSkillDir(oldName)` and `ws.getSkillDir(newName)`, use `skillSrcPath` for SKILL.md update and symlinks
- [ ] 4.6 Add rename handler test for registry-sourced skill (the bug fix — verify directory rename, SKILL.md path, and symlink targets all use correct registry paths)
- [ ] 4.7 Run `pnpm typecheck` and fix any errors
- [ ] 4.8 Run `pnpm lint` and fix any errors
- [ ] 4.9 Run `pnpm test` and fix any failures
- [ ] 4.10 Run `pnpm test:e2e` and fix any failures
- [ ] 4.11 Kill any vitest worker processes

## 5. Clean up remaining references

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 4

- [ ] 5.1 Update `packages/cli/src/sources/resolve-source.ts` `getInstalledSkillPath` to use `UNIVERSAL_SKILLS_DIR` and `REGISTRY_EXTENSIONS_DIR` constants instead of string literals
- [ ] 5.2 Update `packages/cli/src/cli-commands/skills/fork/handler.ts` to use constant or `getSkillDir` instead of hardcoded `.axm/extensions` string
- [ ] 5.3 Search codebase for any remaining references to `CANONICAL_SKILLS_DIR`, `contentPath` (in skill context), or bare scope normalization patterns
- [ ] 5.4 Run `pnpm typecheck` and fix any errors
- [ ] 5.5 Run `pnpm lint` and fix any errors
- [ ] 5.6 Run `pnpm test` and fix any failures
- [ ] 5.7 Run `pnpm test:e2e` and fix any failures
- [ ] 5.8 Kill any vitest worker processes

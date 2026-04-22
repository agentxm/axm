> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Enrich classifier with artifact locations

> **Subagent:** Run this entire phase in a single subagent.

Depends on: nothing (start here)

- [x] 1.1 Write tests for `ClassifierInput` accepting `detectedEntries: ReadonlyArray<{ name: string; locations: ReadonlyArray<string> }>` instead of `detectedNames: ReadonlyArray<string>`, verifying unmanaged entries carry `locations` and configured/implicit entries do not
- [x] 1.2 Update `ClassifierInput` type in `packages/core/src/unstable/workspace/classifier.ts`: replace `detectedNames` with `detectedEntries`
- [x] 1.3 Update `ClassifiedExtension` type: add `locations: ReadonlyArray<string>` to the `"unmanaged"` variant
- [x] 1.4 Update `classifyExtensions` implementation to thread locations from `detectedEntries` into unmanaged classified entries
- [x] 1.5 Update `detectSkillNamesOnDisk` in `packages/core/src/unstable/workspace/service.ts` to return `{ name, locations }` entries instead of discarding locations at dedup step (line 307)
- [x] 1.6 Update all call sites of `classifyExtensions` and `getClassifiedExtensions` to pass `detectedEntries` instead of `detectedNames`
- [x] 1.7 Run `pnpm typecheck` for all packages, fix any errors including `@effect/language-service` diagnostics
- [x] 1.8 Run `pnpm lint` for all packages, fix any errors
- [x] 1.9 Run `pnpm test` for all packages, fix any failures
- [x] 1.10 Run `pnpm test:e2e` for all packages, fix any failures
- [x] 1.11 Kill any vitest worker processes

## 2. Migrate lint stale detection to classifier

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

- [x] 2.1 Write tests for `skills-artifacts-clean` lint rule: stale detection via classifier (including universal dir artifacts flagged when no agent claims them, and universal dir artifacts not flagged when at least one agent claims them)
- [x] 2.2 Update `skills-artifacts-clean` in `packages/core/src/unstable/lint/catalog/workspace/skills-artifacts-clean.ts` to use the workspace classifier for stale (unmanaged) detection instead of inline per-agent logic
- [x] 2.3 Remove the blanket `isUniversalSkillsRelativeDir` skip from the stale check — classifier handles this correctly at the workspace level
- [x] 2.4 Update lint advisory message text for stale findings to suggest `axm prune` or `axm skills prune <name>` as remediation
- [x] 2.5 Verify existing dangling and name-mismatch detection arms are unaffected (they remain inline, only stale arm changes)
- [x] 2.6 Run `pnpm typecheck` for all packages, fix any errors including `@effect/language-service` diagnostics
- [x] 2.7 Run `pnpm lint` for all packages, fix any errors
- [x] 2.8 Run `pnpm test` for all packages, fix any failures
- [x] 2.9 Run `pnpm test:e2e` for all packages, fix any failures
- [x] 2.10 Kill any vitest worker processes

## 3. Implement `axm skills prune` command

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1

> **Parallelization:** Tasks 3.1 and 3.2 are independent — launch as parallel subagents.

- [x] 3.1 Write tests for the prune handler: unmanaged skills removed, configured/implicit/ignored skipped, glob pattern filtering, nothing-to-prune case, `--yes` bypasses confirmation, `--json` read-only mode, `--yes --json` prunes and reports, exit codes
- [x] 3.2 Create command definition at `packages/cli/src/root/skills/prune/command.ts` with `Argument.variadic` for optional patterns, `Flag.boolean` for `--yes` and `--json`
- [x] 3.3 Implement prune handler: call `getClassifiedExtensions("skill")`, filter for `lifecycle: "unmanaged"`, apply glob patterns via `expandGlob`, preview list, confirm (unless `--yes`), delete artifact directories via `effect/FileSystem` `remove` with `recursive: true`, support `--json` output
- [x] 3.4 Wire `prune` subcommand into `packages/cli/src/root/skills/command.ts`
- [x] 3.5 Run `pnpm typecheck` for all packages, fix any errors including `@effect/language-service` diagnostics
- [x] 3.6 Run `pnpm lint` for all packages, fix any errors
- [x] 3.7 Run `pnpm test` for all packages, fix any failures
- [x] 3.8 Run `pnpm test:e2e` for all packages, fix any failures
- [x] 3.9 Kill any vitest worker processes

## 4. Implement root `axm prune` command

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 3

- [x] 4.1 Write tests for the root prune command: aggregates across types (skills-only in v1), patterns applied across types, confirmation UX, JSON output
- [x] 4.2 Create command definition at `packages/cli/src/root/prune/command.ts` following the `axm install` per-type collector/aggregation pattern from `workspace-install.ts`
- [x] 4.3 Implement root prune handler: skills collector delegates to the skills prune logic, other type collectors return empty in v1
- [x] 4.4 Wire `prune` command into root command at `packages/cli/src/root/command.ts`
- [x] 4.5 Run `pnpm typecheck` for all packages, fix any errors including `@effect/language-service` diagnostics
- [x] 4.6 Run `pnpm lint` for all packages, fix any errors
- [x] 4.7 Run `pnpm test` for all packages, fix any failures
- [x] 4.8 Run `pnpm test:e2e` for all packages, fix any failures
- [x] 4.9 Kill any vitest worker processes

## 5. Final verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phases 2, 3, 4

- [x] 5.1 Run full CI pipeline: `pnpm run ci`
- [x] 5.2 Manual smoke test: create a workspace with unmanaged skills, verify `axm lint` reports stale findings with prune suggestion, verify `axm skills prune` previews and removes them, verify `axm prune` aggregates correctly
- [x] 5.3 Kill any vitest worker processes

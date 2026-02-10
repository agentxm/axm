> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Move `expandGlob` to shared module and add `expandGlobs`

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Write tests for `expandGlobs` multi-pattern function in `packages/cli/src/skills/glob.test.ts` — covers: multiple patterns produce union of matches, overlapping patterns deduplicate, empty patterns return empty, preserves original name order
- [x] 1.2 Move `expandGlob` from `packages/cli/src/cli-commands/skills/uninstall/glob.ts` to `packages/cli/src/skills/glob.ts`; add `expandGlobs` function per design (iterates patterns, deduplicates, preserves order)
- [x] 1.3 Update `packages/cli/src/skills/index.ts` barrel to export `expandGlob` and `expandGlobs`
- [x] 1.4 Update `packages/cli/src/cli-commands/skills/uninstall/handler.ts` import to use new shared path
- [x] 1.5 Update `packages/cli/src/cli-commands/skills/fork/handler.ts` import to use new shared path
- [x] 1.6 Remove old `packages/cli/src/cli-commands/skills/uninstall/glob.ts` file (if not already empty after move)
- [x] 1.7 Update any existing glob tests — move/update `packages/cli/src/cli-commands/skills/uninstall/glob.test.ts` to `packages/cli/src/skills/glob.test.ts` alongside the new tests
- [x] 1.8 Run `pnpm typecheck` — fix any errors
- [x] 1.9 Run `pnpm lint` — fix any errors
- [x] 1.10 Run `pnpm test` — fix any failures
- [x] 1.11 Run `pnpm test:e2e` — fix any failures
- [x] 1.12 Kill any vitest worker processes

## 2. Rename `parseSourceInput` → `determineSourceInput` and resolve `NameInput`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (shared glob module must exist).

- [x] 2.1 Write tests for `NameInput` resolution in `packages/cli/src/sources/parser.test.ts` — covers: installed skill name resolves to local source pointing at installed location, unknown skill name fails with descriptive error suggesting `axm skills list`
- [x] 2.2 Rename `parseSourceInput` → `determineSourceInput` in `packages/cli/src/sources/parser.ts`; update all call sites across the codebase (install handler, fork handler, any other consumers)
- [x] 2.3 Update the `NameInput` branch in `determineSourceInput` to look up the name via `LockfileService.getSkills()` — if found, resolve to a local source pointing at the installed skill path; if not found, fail with `ParseError` suggesting `axm skills list`
- [x] 2.4 Update `packages/cli/src/sources/index.ts` barrel to export `determineSourceInput` (remove old `parseSourceInput` export)
- [x] 2.5 Run `pnpm typecheck` — fix any errors
- [x] 2.6 Run `pnpm lint` — fix any errors
- [x] 2.7 Run `pnpm test` — fix any failures
- [x] 2.8 Run `pnpm test:e2e` — fix any failures
- [x] 2.9 Kill any vitest worker processes

## 3. Make install handler glob-aware via `--skill`

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (expandGlobs), Phase 2 (determineSourceInput).

- [x] 3.1 Write/update tests for `determineSkillsToInstall` in `packages/cli/src/cli-commands/skills/install/select-skills.test.ts` — covers: glob pattern filters discovered skills, multiple patterns combine matches, exact name + glob coexist, no matches produces error listing available names
- [x] 3.2 Update `determineSkillsToInstall` in `select-skills.ts` to use `expandGlobs` when any requested skill name contains `*`; keep exact matching for non-glob names (preserving current error messages for missing exact names)
- [x] 3.3 Update install handler to pass `names: []` in `findOptions` (instead of `args.skills`) so the provider discovers everything and glob filtering happens post-discovery in `determineSkillsToInstall`
- [x] 3.4 Write/update handler tests in `packages/cli/src/cli-commands/skills/install/handler.test.ts` to cover glob filtering end-to-end through the handler
- [x] 3.5 Run `pnpm typecheck` — fix any errors
- [x] 3.6 Run `pnpm lint` — fix any errors
- [x] 3.7 Run `pnpm test` — fix any failures
- [x] 3.8 Run `pnpm test:e2e` — fix any failures
- [x] 3.9 Kill any vitest worker processes

## 4. Rewrite fork handler to use shared source resolution

> **Subagent:** Run this entire phase in a single subagent.

Depends on: Phase 1 (expandGlobs), Phase 2 (determineSourceInput), Phase 3 (install pattern established).

- [x] 4.1 Write tests for the new fork handler flow in `packages/cli/src/cli-commands/skills/fork/handler.test.ts` — covers: fork from source string discovers and forks all skills, fork with `--skill` glob filters discovered skills, fork of installed skill name resolves via `determineSourceInput` to local source, fork of unknown name fails with descriptive error
- [x] 4.2 Add `--skill` option to fork command definition in `packages/cli/src/cli-commands/skills/fork/command.ts` — type `string[]`, default `[]`, description indicates skill names or glob patterns
- [x] 4.3 Update fork handler args type to include `skills: readonly string[]`; map from command args to handler args with the new `--skill` flag
- [x] 4.4 Replace `resolveInputSkills` in fork handler with shared flow: `determineSourceInput(args.source)` → `sources.resolve()` → filter by `--skill` via `expandGlobs` → build plan
- [x] 4.5 Delete `resolveInputSkills` function, `ResolvedSkill` type, `isGlobPattern` helper, and `getInstalledSkillRelativePath` helper from fork handler (now replaced by shared logic)
- [x] 4.6 Update fork command tests in `packages/cli/src/cli-commands/skills/fork/command.test.ts` to cover the new `--skill` flag parsing
- [x] 4.7 Run `pnpm typecheck` — fix any errors
- [x] 4.8 Run `pnpm lint` — fix any errors
- [x] 4.9 Run `pnpm test` — fix any failures
- [x] 4.10 Run `pnpm test:e2e` — fix any failures
- [x] 4.11 Kill any vitest worker processes

## 5. Final verification

> **Subagent:** Run this entire phase in a single subagent.

Depends on: All previous phases.

- [x] 5.1 Run `pnpm typecheck` for all packages — verify clean
- [x] 5.2 Run `pnpm lint` for all packages — verify clean
- [x] 5.3 Run `pnpm test` for all packages — verify all pass
- [x] 5.4 Run `pnpm test:e2e` — verify all pass
- [x] 5.5 Kill any vitest worker processes

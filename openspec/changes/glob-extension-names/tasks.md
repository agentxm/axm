> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Add `isGlobPattern` to shared glob module

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Add test cases for `isGlobPattern` in `packages/cli/src/skills/glob.test.ts`: returns `true` for `"effect-*"`, `"*"`, `"*-testing"`; returns `false` for `"effect-basics"`, `"my-skill"`, `""`
- [ ] 1.2 Implement `isGlobPattern` in `packages/cli/src/skills/glob.ts`: `(input: string): boolean => input.includes("*")`
- [ ] 1.3 Export `isGlobPattern` from `packages/cli/src/skills/index.ts` barrel
- [ ] 1.4 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures
- [ ] 1.5 Kill any vitest worker processes

## 2. Modify fork handler to support glob as positional source

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Add handler test cases in `packages/cli/src/cli-commands/skills/fork/handler.test.ts` for:
  - Glob source `"effect-*"` expands against lockfile and forks all matches
  - Glob source with no matches fails with `NO_SKILLS_MATCHED`
  - Glob source combined with `--skill` filter applies both (glob expands, then `--skill` filters)
  - Non-glob source (e.g. `"my-skill"`) follows existing flow unchanged
- [ ] 2.2 Implement glob branch in `handleFork` (`packages/cli/src/cli-commands/skills/fork/handler.ts`):
  - Import `isGlobPattern` from `../../../skills/index.js`
  - Before `resolveSource`, check `isGlobPattern(args.source)`
  - If glob: read lockfile via `ws.getLockedSkills()`, expand with `expandGlobs([args.source], names)`, fail if empty, resolve each match concurrently via `resolveSource` + `sources.resolveExtension`, merge all `SkillRef`s
  - If not glob: existing flow (unchanged)
  - Both paths converge at the `--skill` filter step
- [ ] 2.3 Update `ForkHandlerArgs` JSDoc to note that `source` accepts glob patterns
- [ ] 2.4 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures
- [ ] 2.5 Kill any vitest worker processes

## 3. Update fork command definition and examples

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 3.1 Update `packages/cli/src/cli-commands/skills/fork/command.ts`:
  - Update `source` positional `describe` to mention glob patterns
  - Add example: `$0 skills fork "effect-*"` — "Fork all installed skills matching the glob"
- [ ] 3.2 Add/update command parsing test in `packages/cli/src/cli-commands/skills/fork/command.test.ts` to verify glob patterns are passed through as the source arg
- [ ] 3.3 Run `pnpm typecheck && pnpm lint && pnpm test` — fix any failures
- [ ] 3.4 Kill any vitest worker processes

## 4. Replace inline glob check in packs add handler

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 4.1 In `packages/cli/src/cli-commands/packs/add/handler.ts`, replace `args.extension.includes("*")` with `isGlobPattern(args.extension)` (import from `../../../skills/index.js`)
- [ ] 4.2 Run `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` — fix any failures
- [ ] 4.3 Kill any vitest worker processes

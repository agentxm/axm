> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Update command definition to accept variadic positional arguments

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Write/update tests for `publishCommand` parsing: verify it accepts one or more positional args as an array (e.g., `["effect-*", "commit"]`) and still works with a single arg
- [x] 1.2 Update `PublishCommandArgs` to change `extension: string` to `extensions: string[]`
- [x] 1.3 Update yargs definition in `command.ts`: change `<extension>` to variadic positional `<extensions..>` with `type: "array"` and `string` items
- [x] 1.4 Update the handler call in `command.ts` to pass `argv.extensions` array and map to handler args
- [x] 1.5 Run `pnpm typecheck` and fix any errors
- [x] 1.6 Run `pnpm lint` and fix any errors

## 2. Update handler to support glob expansion and multiple extensions

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Write/update tests for `handlePublish`: glob pattern expands against installed skill names, literal names pass through, mixed glob+literal deduplicates, glob matching zero skills warns and exits, FQN input bypasses expansion, unmanaged skills excluded from glob matches
- [x] 2.2 Update `PublishHandlerArgs` to change `extension: string` to `extensions: ReadonlyArray<string>`
- [x] 2.3 Implement glob expansion logic in handler: detect glob patterns with `isGlobPattern`, call `getInstalledSkills()` to get managed skill names, expand with `expandGlobs`, warn and return on zero matches
- [x] 2.4 Resolve each matched bare name to an FQN (scope prefix + `parseFqn`), pass through FQN inputs directly
- [x] 2.5 Build a multi-step plan with one `PublishSkillOperation` per resolved extension, update plan description to reflect count (e.g., "Publish 3 skills to registry \"local\"")
- [x] 2.6 Run `pnpm typecheck` and fix any errors
- [x] 2.7 Run `pnpm lint` and fix any errors
- [x] 2.8 Run `pnpm test` and fix any failures
- [x] 2.9 Kill any lingering vitest worker processes

## 3. E2E tests

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Write E2E test: `axm skills publish "effect-*"` expands glob and publishes matching managed skills
- [x] 3.2 Write E2E test: `axm skills publish skill-a skill-b` publishes multiple literal skills
- [x] 3.3 Write E2E test: `axm skills publish "nonexistent-*"` warns and exits cleanly
- [x] 3.4 Run `pnpm test:e2e` and fix any failures
- [x] 3.5 Kill any lingering vitest worker processes

## 4. Final verification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 4.1 Run `pnpm typecheck` across all packages
- [x] 4.2 Run `pnpm lint` across all packages
- [x] 4.3 Run `pnpm test` across all packages
- [x] 4.4 Run `pnpm test:e2e` across all packages
- [x] 4.5 Kill any lingering vitest worker processes

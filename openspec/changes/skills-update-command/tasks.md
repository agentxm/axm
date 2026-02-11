> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Update Plan Builder

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 1.1 Write `build-plan.test.ts` for `buildUpdatePlan` covering all version comparison scenarios: git hash changed, git hash unchanged, registry version changed, registry version unchanged, local always updates, missing git hash, force flag, empty operations, plan name/description, label derivation
- [ ] 1.2 Implement `buildUpdatePlan` in `packages/cli/src/cli-commands/skills/update/build-plan.ts` — accepts `ReadonlyArray<InstallSkillOperation>`, `Lockfile`, `name`, `description: Option<string>`, returns `Plan<InstallSkillOperation>` with version-aware comparison logic per source type
- [ ] 1.3 Run `pnpm typecheck` and fix any errors
- [ ] 1.4 Run `pnpm lint` and fix any errors
- [ ] 1.5 Run `pnpm test` and fix any failures
- [ ] 1.6 Kill any vitest worker processes

## 2. Update Handler

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 2.1 Write `handler.test.ts` for `handleUpdate` covering: update all skills, update by source filter, `--skill` glob filtering, `--force` flag, empty lockfile (no skills installed), source re-resolution failure for one skill (continues), all re-resolutions fail (exits with error)
- [ ] 2.2 Implement `handleUpdate` in `packages/cli/src/cli-commands/skills/update/handler.ts` — orchestrates: load installed skills from settings + lockfile, optionally filter by source argument, filter by `--skill` patterns, re-resolve each source, discover skills, build `InstallSkillOperation`s, call `buildUpdatePlan`, resolve plan via `ws.resolvePlan(plan, { "install-skill": installSkill })`
- [ ] 2.3 Run `pnpm typecheck` and fix any errors
- [ ] 2.4 Run `pnpm lint` and fix any errors
- [ ] 2.5 Run `pnpm test` and fix any failures
- [ ] 2.6 Kill any vitest worker processes

## 3. Command Definition & Registration

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 3.1 Write `command.test.ts` for the update command yargs definition — verifies positional `[source]` is optional, all flags are accepted (`--skill`, `--force`, `--yes`, `--preview`, `--global`, `--non-interactive`), handler maps argv to `handleUpdate` args
- [ ] 3.2 Implement `command.ts` in `packages/cli/src/cli-commands/skills/update/command.ts` — yargs `CommandModule` with `"update [source]"`, optional positional source, flags matching install (minus `--list`, `--all`), calls `handleUpdate` via `run()`
- [ ] 3.3 Create `index.ts` barrel in `packages/cli/src/cli-commands/skills/update/` exporting `updateCommand`
- [ ] 3.4 Register `updateCommand` in `packages/cli/src/cli-commands/skills/command.ts` alongside install, uninstall, list, fork, publish
- [ ] 3.5 Run `pnpm typecheck` and fix any errors
- [ ] 3.6 Run `pnpm lint` and fix any errors
- [ ] 3.7 Run `pnpm test` and fix any failures
- [ ] 3.8 Kill any vitest worker processes

## 4. E2E Tests & Final Verification

> **Subagent:** Run this entire phase in a single subagent.

- [ ] 4.1 Write `command.e2e.test.ts` co-located at `packages/cli/src/cli-commands/skills/update/` — tests: `axm skills update` with no installed skills, `axm skills update` with a local source skill (verifies files refreshed and lockfile `updatedAt` changed), `axm skills update --preview` shows plan without applying, `axm skills update --skill <name>` filters correctly
- [ ] 4.2 Run `pnpm test:e2e` and fix any failures
- [ ] 4.3 Run `pnpm typecheck && pnpm lint && pnpm test` as final full verification
- [ ] 4.4 Kill any vitest worker processes

## 1. Relocate types and delete ideal-state

- [x] 1.1 Create `cli-commands/skills/operations.ts` with `SkillRef`, `AddSkillOperation`, `RemoveSkillOperation` moved from `workspace/ideal-state.ts` and `install/discover-skills.ts`
- [x] 1.2 Update all imports of `SkillRef` to point to `cli-commands/skills/operations.ts` (`discover-skills.ts`, `select-skills.ts`, `skill-utils.ts`, `parse-skill-md.ts`, `ideal-state.ts`, and their test files)
- [x] 1.3 Create `workspace/plan.ts` with generic `Action<Op>`, `Job<Op>`, `Plan<Op>` types (add `label` field to Action, add `name`/`description` to Plan)
- [x] 1.4 Update handler import of `AddSkillOperation`, `Plan`, `Action` to point to new locations (`operations.ts` and `plan.ts`)
- [x] 1.5 Delete `workspace/ideal-state.ts` and remove any references to it (including commented exports in `workspace/index.ts`)
- [x] 1.6 Update `workspace/index.ts` barrel to export from `plan.ts`
- [x] 1.7 Run `pnpm typecheck` — fix any errors
- [x] 1.8 Run `pnpm lint` — fix any errors
- [x] 1.9 Run `pnpm test` — fix any failures
- [x] 1.10 Run `pnpm test:e2e` — fix any failures
- [x] 1.11 Kill any vitest worker processes

## 2. Build plan (skills-specific)

- [x] 2.1 Write tests for `buildPlan` in `cli-commands/skills/install/build-plan.test.ts` covering: new skill → execute, already installed → no-op, empty ops → empty plan, label derivation, caller-provided name/description pass-through
- [x] 2.2 Implement `buildPlan` in `cli-commands/skills/install/build-plan.ts` — pure function, `(ops, lockfile, name, description) => Plan<AddSkillOperation>`
- [x] 2.3 Run `pnpm typecheck` — fix any errors
- [x] 2.4 Run `pnpm lint` — fix any errors
- [x] 2.5 Run `pnpm test` — fix any failures
- [x] 2.6 Kill any vitest worker processes

## 3. Display plan (shared)

- [x] 3.1 Write tests for `displayPlan` in `workspace/display-plan.test.ts` covering: plan name as heading, description shown when present, execute actions listed, no-op actions with reasons, summary counts, all no-ops case
- [x] 3.2 Implement `displayPlan` in `workspace/display-plan.ts` — depends on Clack service, operates on `Plan<Op>`
- [x] 3.3 Update `workspace/index.ts` barrel to export from `display-plan.ts`
- [x] 3.4 Run `pnpm typecheck` — fix any errors
- [x] 3.5 Run `pnpm lint` — fix any errors
- [x] 3.6 Run `pnpm test` — fix any failures
- [x] 3.7 Kill any vitest worker processes

## 4. Apply plan (shared stub)

- [x] 4.1 Write tests for `applyPlan` in `workspace/apply-plan.test.ts` covering: log success for execute actions, skip no-op actions, all no-ops → no success logs, job concurrency respected (unbounded vs sequential)
- [x] 4.2 Implement `applyPlan` in `workspace/apply-plan.ts` — depends on Clack service, iterates jobs using `Effect.forEach` with job concurrency setting, stub only (no file system mutations)
- [x] 4.3 Update `workspace/index.ts` barrel to export from `apply-plan.ts`
- [x] 4.4 Run `pnpm typecheck` — fix any errors
- [x] 4.5 Run `pnpm lint` — fix any errors
- [x] 4.6 Run `pnpm test` — fix any failures
- [x] 4.7 Kill any vitest worker processes

## 5. Wire handler

- [x] 5.1 Write/update handler tests in `cli-commands/skills/install/handler.test.ts` covering: build plan from ops + lockfile, display plan, --preview stops after display, --yes skips confirmation, confirm prompt → apply or exit, apply plan called after confirmation, summary outro
- [x] 5.2 Rewrite handler post-selection flow: replace inline `_plan` sketch with `buildPlan` → `displayPlan` → confirm logic → `applyPlan`, remove dead `_lockfile`/`_settings`/`_plan` bindings
- [x] 5.3 Run `pnpm typecheck` — fix any errors
- [x] 5.4 Run `pnpm lint` — fix any errors
- [x] 5.5 Run `pnpm test` — fix any failures
- [x] 5.6 Run `pnpm test:e2e` — fix any failures
- [x] 5.7 Kill any vitest worker processes

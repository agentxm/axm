> **Orchestration:** The main agent thread MUST NOT execute any tasks directly. Delegate each phase to subagents as directed below. The main agent's role is strictly to orchestrate: launch subagents, verify phase completion, and proceed to the next phase. This directive takes precedence over any apply-phase instructions that say to execute tasks in the main thread — always use subagents for implementation work.

## 1. Core type changes

> **Subagent:** Run this entire phase in a single subagent.

- [x] 1.1 Add `Readiness` type to `workspace/plan.ts` with four-variant discriminated union (`ready`, `skip`, `warn`, `error`)
- [x] 1.2 Replace `expectedResult: OperationResult` with `readiness: Readiness` on `PlannedJobStep`
- [x] 1.3 Remove `expectedResult` from `JobStepResult`, rename `actualResult` to `result`
- [x] 1.4 Re-export `Readiness` from `workspace/index.ts` barrel
- [x] 1.5 Run `pnpm typecheck` — expect failures in downstream consumers (plan builders, display, apply, tests). Confirm the type errors match the audit and no unexpected breakage.

## 2. Apply plan migration

> **Subagent:** Run this entire phase in a single subagent.

- [x] 2.1 Update `apply-plan.test.ts`: change `makeStep` helper to use `readiness` instead of `expectedResult`; update all assertions from `actualResult` to `result`; add test cases for `skip` and `error` readiness promotion
- [x] 2.2 Update `applyStep` in `apply-plan.ts`: dispatch on `readiness.status` (`ready`/`warn` → handler, `skip` → promote as no-op, `error` → promote as error); update `promote` helper to use `result` instead of `expectedResult`/`actualResult`
- [x] 2.3 Run `pnpm typecheck` and fix any issues
- [x] 2.4 Run `pnpm test -- --reporter=verbose packages/cli/src/workspace/apply-plan.test.ts` and fix any failures

## 3. Display plan migration

> **Subagent:** Run this entire phase in a single subagent.

- [x] 3.1 Update `display-plan.test.ts`: replace all `expectedResult` fixtures with `readiness`; replace `actualResult` with `result` in applied-plan fixtures; add test cases for `skip`, `warn`, and `error` readiness display; update summary line assertions
- [x] 3.2 Update `display-plan.ts`: branch rendering on `_tag` — use `readiness` for `PlannedJobStep`, `result` for `JobStepResult`; render ready/skip/warn/error with distinct prefixes (`+`/`-`/`⚠`/`✗`); update summary line to use generic verbs and include readiness counts (omit zero counts)
- [x] 3.3 Run `pnpm typecheck` and fix any issues
- [x] 3.4 Run `pnpm test -- --reporter=verbose packages/cli/src/workspace/display-plan.test.ts` and fix any failures

## 4. Resolve plan readiness gates

> **Subagent:** Run this entire phase in a single subagent.

- [x] 4.1 Update `service.test.ts`: replace `expectedResult` with `readiness` in `testStep` and all plan fixtures; replace `actualResult` assertions with `result`; add test cases for: error readiness blocks execution (preview and default), warn readiness forces confirmation (preview and default), warn + yes still prompts, warn + nonInteractive fails
- [x] 4.2 Update `resolvePlan` in `service.ts`: add readiness scanning before apply; implement error gate (display + fail with `PLAN_HAS_ERRORS`); implement warn gate (display + confirm "Plan has warnings. Continue anyway?"); implement non-interactive warn gate (fail with `PLAN_HAS_WARNINGS`)
- [x] 4.3 Run `pnpm typecheck` and fix any issues
- [x] 4.4 Run `pnpm test -- --reporter=verbose packages/cli/src/workspace/service.test.ts` and fix any failures

## 5. Plan builder migrations

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 5.1, 5.3, 5.5, 5.7, 5.9, 5.11 are independent test-first updates — launch as parallel subagents if desired.

- [x] 5.1 Update `skills/install/plan.test.ts`: replace `expectedResult` assertions with `readiness` (`success` → `ready`, `no-op` → `skip`)
- [x] 5.2 Update `skills/install/plan.ts`: replace `expectedResult` with `readiness` in both step constructions
- [x] 5.3 Update `skills/update/plan.test.ts`: replace `expectedResult` assertions with `readiness`
- [x] 5.4 Update `skills/update/plan.ts`: replace `expectedResult` with `readiness` in `buildInstallStep` and `buildUninstallStep`
- [x] 5.5 Update `packs/install/plan.test.ts`: replace `expectedResult` assertions with `readiness`
- [x] 5.6 Update `packs/install/plan.ts`: replace `expectedResult` with `readiness` in all four step constructions
- [x] 5.7 Update `packs/uninstall/plan.test.ts`: replace `expectedResult` assertions with `readiness`
- [x] 5.8 Update `packs/uninstall/plan.ts`: replace `expectedResult` with `readiness` in all three step constructions
- [x] 5.9 Update `skills/plan-helpers.test.ts`: replace `expectedResult` assertion with `readiness`
- [x] 5.10 Update `skills/plan-helpers.ts`: replace `expectedResult` with `readiness` in `buildSingleStepPlan`
- [x] 5.11 Run `pnpm typecheck` and fix any issues
- [x] 5.12 Run `pnpm test` for all plan builder tests and fix any failures
- [x] 5.13 Run `pnpm lint` and fix any issues

## 6. Extract pack-reference helpers

> **Subagent:** Run this entire phase in a single subagent.

- [x] 6.1 Create `extensions/skills/utils.ts` (or add to existing): extract `getSkillFqn` and `isReferencedByPack` from `extensions/skills/operations/uninstall.ts`; add `getReferencingPacks` variant that returns pack names
- [x] 6.2 Update `extensions/skills/operations/uninstall.ts` to import helpers from the new shared location
- [x] 6.3 Run `pnpm typecheck` and fix any issues
- [x] 6.4 Run `pnpm test -- --reporter=verbose packages/cli/src/extensions/skills` and fix any failures

## 7. Skill uninstall plan builder — pack dependency guard

> **Subagent:** Run this entire phase in a single subagent.

- [x] 7.1 Add `InstalledSkills` type to `skills/uninstall/plan.ts`
- [x] 7.2 Update `skills/uninstall/plan.test.ts`: update existing tests for new `InstalledSkills` param and `readiness` assertions; add test cases for pack-dependent skill (single pack, multiple packs) producing error readiness with message naming packs and suggesting `axm skills disable`
- [x] 7.3 Update `buildSkillUninstallPlan` signature: replace `lockfile: Lockfile` with `installed: InstalledSkills`; implement pack-dependency check producing error readiness
- [x] 7.4 Update `skills/uninstall/handler.ts`: build `InstalledSkills` lookup from `ws.getLockedSkills()` + `ws.getLockedPacks()` using extracted helpers; pass to plan builder
- [x] 7.5 Update `skills/uninstall/handler.test.ts`: update plan builder call expectations for new signature; add test case for handler building InstalledSkills lookup correctly
- [x] 7.6 Run `pnpm typecheck` and fix any issues
- [x] 7.7 Run `pnpm test -- --reporter=verbose packages/cli/src/cli-commands/skills/uninstall/` and fix any failures

## 8. Handler test migrations

> **Subagent:** Run this entire phase in a single subagent.
> **Parallelization:** Tasks 8.1–8.4 are independent — launch as parallel subagents.

- [x] 8.1 Update `skills/install/handler.test.ts`: replace any `expectedResult`/`actualResult` assertions with `readiness`/`result`
- [x] 8.2 Update `skills/update/handler.test.ts`: replace any `expectedResult`/`actualResult` assertions with `readiness`/`result`
- [x] 8.3 Update `packs/install/handler.test.ts`: replace any `expectedResult`/`actualResult` assertions with `readiness`/`result`
- [x] 8.4 Update `packs/uninstall/handler.test.ts`: replace any `expectedResult`/`actualResult` assertions with `readiness`/`result`
- [x] 8.5 Run `pnpm typecheck` and fix any issues
- [x] 8.6 Run `pnpm test` and fix any failures

## 9. Full verification

> **Subagent:** Run this entire phase in a single subagent.

- [x] 9.1 Run `pnpm typecheck` — zero errors
- [x] 9.2 Run `pnpm lint` — zero errors (fix any)
- [x] 9.3 Run `pnpm test` — all unit tests pass
- [x] 9.4 Run `pnpm test:e2e` — all E2E tests pass; update output assertions if plan display format changed
- [x] 9.5 Kill any lingering vitest worker processes

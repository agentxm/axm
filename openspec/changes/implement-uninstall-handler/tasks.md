## 1. Rename types in operations.ts

- [x] 1.1 Rename `RemoveSkillOperation` to `UninstallSkillOperation` and `RemoveSkillArgs` to `UninstallSkillArgs` in `packages/cli/src/cli-commands/skills/operations.ts`. Add optional `agents: ReadonlyArray<string>` field to `UninstallSkillArgs`. Update all imports/references across the codebase.
- [x] 1.2 Run `pnpm typecheck` and fix any errors
- [x] 1.3 Run `pnpm lint` and fix any errors
- [x] 1.4 Run `pnpm test` and fix any failures
- [x] 1.5 Run `pnpm test:e2e` and fix any failures
- [x] 1.6 Kill any vitest worker processes

## 2. Glob expansion

- [x] 2.1 Write tests for `expandGlob` in `packages/cli/src/cli-commands/skills/uninstall/glob.test.ts` covering: wildcard prefix/suffix/middle match, standalone `*`, literal name, zero matches, `?` and `[]` treated as literals, case sensitivity
- [x] 2.2 Implement `expandGlob(pattern: string, skillNames: ReadonlyArray<string>): ReadonlyArray<string>` in `packages/cli/src/cli-commands/skills/uninstall/glob.ts`
- [x] 2.3 Run `pnpm typecheck` and fix any errors
- [x] 2.4 Run `pnpm lint` and fix any errors
- [x] 2.5 Run `pnpm test` and fix any failures
- [x] 2.6 Kill any vitest worker processes

## 3. Uninstall build-plan

- [x] 3.1 Write tests for `buildPlan` in `packages/cli/src/cli-commands/skills/uninstall/build-plan.test.ts` covering: skill in lockfile → success, skill not in lockfile → no-op, empty ops → empty steps, label derivation, plan name/description passthrough
- [x] 3.2 Implement `buildPlan` in `packages/cli/src/cli-commands/skills/uninstall/build-plan.ts` — pure function mirroring install's build-plan but for `UninstallSkillOperation`
- [x] 3.3 Run `pnpm typecheck` and fix any errors
- [x] 3.4 Run `pnpm lint` and fix any errors
- [x] 3.5 Run `pnpm test` and fix any failures
- [x] 3.6 Kill any vitest worker processes

## 4. Uninstall skill operation handler

- [x] 4.1 Write tests for `uninstallSkill` in `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.test.ts` covering: full uninstall (lockfile + disk), not in lockfile but on disk, not installed anywhere, partial uninstall with remaining agents, partial uninstall leaving no agents, missing canonical dir, missing symlinks, sanitized name usage
- [x] 4.2 Implement `uninstallSkill` operation handler in `packages/cli/src/cli-commands/skills/uninstall/uninstall-skill.ts` — remove agent symlinks (concurrent), remove canonical dir, remove lockfile entry. Support partial uninstall via agent filter.
- [x] 4.3 Run `pnpm typecheck` and fix any errors
- [x] 4.4 Run `pnpm lint` and fix any errors
- [x] 4.5 Run `pnpm test` and fix any failures
- [x] 4.6 Kill any vitest worker processes

## 5. Uninstall handler

- [ ] 5.1 Write tests for `handleUninstall` in `packages/cli/src/cli-commands/skills/uninstall/handler.test.ts` covering: full uninstall flow, glob expansion integration, literal name not in lockfile, glob matching no skills shows message, partial uninstall via --agent
- [ ] 5.2 Replace stub in `packages/cli/src/cli-commands/skills/uninstall/handler.ts` with full implementation: load lockfile → expand glob → build ops → build plan → resolvePlan. Update `UninstallArgs` to include `nonInteractive: Option<boolean>`.
- [ ] 5.3 Update `packages/cli/src/cli-commands/skills/uninstall/command.ts` to pass `nonInteractive` and `preview` through to handler args if needed
- [ ] 5.4 Run `pnpm typecheck` and fix any errors
- [ ] 5.5 Run `pnpm lint` and fix any errors
- [ ] 5.6 Run `pnpm test` and fix any failures
- [ ] 5.7 Run `pnpm test:e2e` and fix any failures
- [ ] 5.8 Kill any vitest worker processes

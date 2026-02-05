## 1. Phase 1A: Optional Properties → Option<T> (Core Types)

- [ ] 1.1 Convert optional properties in `settings/settings.ts` to Option<T>
- [ ] 1.2 Verify typecheck passes after settings changes
- [ ] 1.3 Convert optional properties in `lockfile/lockfile.ts` to Option<T>
- [ ] 1.4 Verify typecheck passes after lockfile changes
- [ ] 1.5 Convert optional properties in `workspace/errors.ts` to Option<T>
- [ ] 1.6 Convert optional properties in `workspace/apply.ts` to Option<T>
- [ ] 1.7 Convert optional properties in `workspace/service.ts` to Option<T>
- [ ] 1.8 Verify typecheck passes after workspace changes
- [ ] 1.9 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 1.10 Run `pnpm lint` for all packages, fix any errors
- [ ] 1.11 Run `pnpm test` for all packages, fix any failures
- [ ] 1.12 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 1.13 Kill any vitest worker processes

## 2. Phase 1B: Optional Properties → Option<T> (Extensions & Resolution)

- [ ] 2.1 Convert optional properties in `extensions/skills/types.ts` to Option<T>
- [ ] 2.2 Verify typecheck passes after types changes
- [ ] 2.3 Convert optional properties in `extensions/skills/state/types.ts` to Option<T>
- [ ] 2.4 Verify typecheck passes after state/types changes
- [ ] 2.5 Convert optional properties in `extensions/skills/github-api.ts` to Option<T>
- [ ] 2.6 Convert optional properties in `extensions/skills/git.ts` to Option<T>
- [ ] 2.7 Convert optional properties in `extensions/skills/skill-discovery.ts` to Option<T>
- [ ] 2.8 Verify typecheck passes after extensions changes
- [ ] 2.9 Convert optional properties in `resolution/types.ts` to Option<T>
- [ ] 2.10 Verify typecheck passes after resolution changes
- [ ] 2.11 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 2.12 Run `pnpm lint` for all packages, fix any errors
- [ ] 2.13 Run `pnpm test` for all packages, fix any failures
- [ ] 2.14 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 2.15 Kill any vitest worker processes

## 3. Phase 1C: Optional Properties → Option<T> (Agents, Clack, Handlers)

- [ ] 3.1 Convert optional properties in `agents/types.ts` to Option<T>
- [ ] 3.2 Convert optional properties in `agents/detection.ts` to Option<T>
- [ ] 3.3 Verify typecheck passes after agents changes
- [ ] 3.4 Convert optional properties in `clack-effect/types.ts` to Option<T>
- [ ] 3.5 Convert optional properties in `clack-effect/errors.ts` to Option<T>
- [ ] 3.6 Convert optional properties in `clack-effect/test.ts` to Option<T>
- [ ] 3.7 Verify typecheck passes after clack-effect changes
- [ ] 3.8 Convert optional properties in `cli-commands/skills/install/handler.ts` to Option<T>
- [ ] 3.9 Convert optional properties in `cli-commands/skills/uninstall/handler.ts` to Option<T>
- [ ] 3.10 Convert optional properties in `cli-commands/init/handler.ts` to Option<T>
- [ ] 3.11 Verify typecheck passes after handler changes
- [ ] 3.12 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 3.13 Run `pnpm lint` for all packages, fix any errors
- [ ] 3.14 Run `pnpm test` for all packages, fix any failures
- [ ] 3.15 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 3.16 Kill any vitest worker processes

## 4. Phase 1D: Array Types → Array.Array<T>

- [ ] 4.1 Convert array types in `extensions/skills/types.ts` to Array.Array<T>
- [ ] 4.2 Convert array types in `extensions/skills/state/types.ts` to Array.Array<T>
- [ ] 4.3 Convert array types in `extensions/skills/github-api.ts` to Array.Array<T>
- [ ] 4.4 Convert array types in `clack-effect/test.ts` to Array.Array<T>
- [ ] 4.5 Verify typecheck passes after extensions/clack changes
- [ ] 4.6 Convert array types in `workspace/apply.ts` to Array.Array<T>
- [ ] 4.7 Convert array types in `workspace/ideal-state.ts` to Array.Array<T>
- [ ] 4.8 Verify typecheck passes after workspace changes
- [ ] 4.9 Convert array types in `cli-commands/skills/install/handler.ts` to Array.Array<T>
- [ ] 4.10 Convert array types in `cli-commands/skills/uninstall/handler.ts` to Array.Array<T>
- [ ] 4.11 Convert array types in `cli-commands/init/handler.ts` to Array.Array<T>
- [ ] 4.12 Convert array types in `resolution/resolvers/local-path.ts` to Array.Array<T>
- [ ] 4.13 Verify typecheck passes after remaining changes
- [ ] 4.14 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 4.15 Run `pnpm lint` for all packages, fix any errors
- [ ] 4.16 Run `pnpm test` for all packages, fix any failures
- [ ] 4.17 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 4.18 Kill any vitest worker processes

## 5. Phase 1E: Record Types → Record.Record<K,V>

- [ ] 5.1 Convert Record types in `settings/settings.ts` to Record.Record<K,V>
- [ ] 5.2 Convert Record types in `workspace/load-state.ts` to Record.Record<K,V>
- [ ] 5.3 Convert Record types in `workspace/apply.ts` to Record.Record<K,V>
- [ ] 5.4 Convert Record types in `extensions/skills/types.ts` to Record.Record<K,V>
- [ ] 5.5 Convert Record types in `extensions/skills/state/types.ts` to Record.Record<K,V>
- [ ] 5.6 Verify typecheck passes after Record changes
- [ ] 5.7 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 5.8 Run `pnpm lint` for all packages, fix any errors
- [ ] 5.9 Run `pnpm test` for all packages, fix any failures
- [ ] 5.10 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 5.11 Kill any vitest worker processes

## 6. Phase 2: Remove Re-exports

- [ ] 6.1 Identify all consumers of re-exports from `workspace/index.ts`
- [ ] 6.2 Update consumers to import lockfile items directly from `lockfile/index.js`
- [ ] 6.3 Update consumers to import settings items directly from `settings/index.js`
- [ ] 6.4 Update consumers to import state types directly from `extensions/skills/state/types.js`
- [ ] 6.5 Remove re-exports from `workspace/index.ts`
- [ ] 6.6 Verify typecheck passes after workspace re-export removal
- [ ] 6.7 Identify all consumers of re-exports from `extensions/skills/index.ts`
- [ ] 6.8 Update consumers to import lockfile items directly
- [ ] 6.9 Update consumers to import settings items directly
- [ ] 6.10 Remove re-exports from `extensions/skills/index.ts`
- [ ] 6.11 Verify typecheck passes after extensions re-export removal
- [ ] 6.12 Identify all consumers of re-exports from `cli-commands/skills/display.ts`
- [ ] 6.13 Update consumers to import workspace items directly
- [ ] 6.14 Remove re-exports from `cli-commands/skills/display.ts`
- [ ] 6.15 Verify typecheck passes after display re-export removal
- [ ] 6.16 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 6.17 Run `pnpm lint` for all packages, fix any errors
- [ ] 6.18 Run `pnpm test` for all packages, fix any failures
- [ ] 6.19 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 6.20 Kill any vitest worker processes

## 7. Phase 3A: Fix Throwing Helper

- [ ] 7.1 Add test for `getSourcePath` error case in `workspace/apply.ts`
- [ ] 7.2 Convert `getSourcePath` to return Effect.Effect<string, ApplyError>
- [ ] 7.3 Update callers of `getSourcePath` to handle Effect
- [ ] 7.4 Verify typecheck passes after getSourcePath conversion
- [ ] 7.5 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 7.6 Run `pnpm lint` for all packages, fix any errors
- [ ] 7.7 Run `pnpm test` for all packages, fix any failures
- [ ] 7.8 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 7.9 Kill any vitest worker processes

## 8. Phase 3B: Add Schema Validation

- [ ] 8.1 Add test for invalid YAML parsing in `workspace/load-state.ts`
- [ ] 8.2 Add Schema validation for YAML.parse in `workspace/load-state.ts`
- [ ] 8.3 Verify typecheck passes after load-state Schema validation
- [ ] 8.4 Add test for invalid Settings casts in `workspace/service.ts`
- [ ] 8.5 Add Schema validation for Settings casts in `workspace/service.ts` (line 170)
- [ ] 8.6 Add Schema validation for Settings casts in `workspace/service.ts` (line 280)
- [ ] 8.7 Verify typecheck passes after service.ts Schema validation
- [ ] 8.8 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 8.9 Run `pnpm lint` for all packages, fix any errors
- [ ] 8.10 Run `pnpm test` for all packages, fix any failures
- [ ] 8.11 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 8.12 Kill any vitest worker processes

## 9. Phase 3C: Fix main.ts Error Handling

- [ ] 9.1 Replace Promise .catch() with Effect.catchAllCause in `main.ts`
- [ ] 9.2 Verify typecheck passes after main.ts changes
- [ ] 9.3 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 9.4 Run `pnpm lint` for all packages, fix any errors
- [ ] 9.5 Run `pnpm test` for all packages, fix any failures
- [ ] 9.6 Run `pnpm test:e2e` for relevant tests, fix any failures
- [ ] 9.7 Kill any vitest worker processes

## 10. Phase 4: Final Cleanup and Verification

- [ ] 10.1 Remove redundant `| undefined` on optional properties in handler args
- [ ] 10.2 Verify typecheck passes after cleanup
- [ ] 10.3 Run `pnpm typecheck` for all packages, fix any errors
- [ ] 10.4 Run `pnpm lint:fix` to auto-fix linting issues
- [ ] 10.5 Run `pnpm lint` to verify no remaining issues
- [ ] 10.6 Run `pnpm test` for all packages, verify all tests pass
- [ ] 10.7 Run `pnpm test:e2e` for all e2e tests, verify all pass
- [ ] 10.8 Kill any vitest worker processes
- [ ] 10.9 Final review: verify all CLAUDE.md conventions are followed

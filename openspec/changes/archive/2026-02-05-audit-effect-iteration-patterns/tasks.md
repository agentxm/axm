## 1. Install Handler

- [x] 1.1 Refactor `createBuildIdealDeps.discoverSkills` in `cli-commands/skills/install/handler.ts` (lines 259-300) to use `Effect.forEach` with `{ concurrency: "unbounded" }`
- [x] 1.2 Run `pnpm typecheck` and fix any errors
- [x] 1.3 Run `pnpm lint` and fix any errors
- [x] 1.4 Run `pnpm test` and fix any failures
- [x] 1.5 Run `pnpm test:e2e` and fix any failures
- [x] 1.6 Kill any vitest worker processes

## 2. Workspace Apply

- [x] 2.1 Refactor `copyDirectory` in `workspace/apply.ts` (lines 415-444) to use `Effect.forEach` with `{ concurrency: "unbounded" }`
- [x] 2.2 Refactor `syncToAgents` in `workspace/apply.ts` (lines 482-522) to use `Effect.forEach` with `{ concurrency: "unbounded", discard: true }`
- [x] 2.3 Refactor `removeFromAgents` in `workspace/apply.ts` (lines 536-551) to use `Effect.forEach` with `{ concurrency: "unbounded", discard: true }`
- [x] 2.4 Run `pnpm typecheck` and fix any errors
- [x] 2.5 Run `pnpm lint` and fix any errors
- [x] 2.6 Run `pnpm test` and fix any failures
- [x] 2.7 Run `pnpm test:e2e` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Local Path Resolver

- [x] 3.1 Refactor `scanDirectory` in `resolution/resolvers/local-path.ts` (lines 101-133) to use `Effect.forEach` with `{ concurrency: "unbounded" }`
- [x] 3.2 Run `pnpm typecheck` and fix any errors
- [x] 3.3 Run `pnpm lint` and fix any errors
- [x] 3.4 Run `pnpm test` and fix any failures
- [x] 3.5 Run `pnpm test:e2e` and fix any failures
- [x] 3.6 Kill any vitest worker processes

## 4. Well-Known Sources

- [x] 4.1 Refactor `fetchSkillFiles` in `sources/wellknown/fetch.ts` (lines 116-171) to use `Effect.forEach` with `{ concurrency: "unbounded", discard: true }`
- [x] 4.2 Refactor `fetchSkillFiles` in `extensions/skills/wellknown.ts` (lines 336-391) to use `Effect.forEach` with `{ concurrency: "unbounded", discard: true }`
- [x] 4.3 Run `pnpm typecheck` and fix any errors
- [x] 4.4 Run `pnpm lint` and fix any errors
- [x] 4.5 Run `pnpm test` and fix any failures
- [x] 4.6 Run `pnpm test:e2e` and fix any failures
- [x] 4.7 Kill any vitest worker processes

## 5. Final Verification

- [x] 5.1 Run full test suite (`pnpm test && pnpm test:e2e`) to confirm all refactoring is behavior-preserving
- [x] 5.2 Kill any vitest worker processes

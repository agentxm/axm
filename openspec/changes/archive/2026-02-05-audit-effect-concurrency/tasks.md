# Tasks: audit-effect-concurrency

## 1. Workspace Module Concurrency

- [x] 1.1 Update `ideal-state.ts:436` - change `{ concurrency: "inherit" }` to `{ concurrency: "unbounded" }`
- [x] 1.2 Update `load-state.ts:628` - add `{ concurrency: "unbounded" }` to `Effect.all` for skill loading
- [x] 1.3 Update `load-state.ts:662` - add `{ concurrency: "unbounded" }` to `Effect.all` for current state loading
- [x] 1.4 Run `pnpm typecheck` and fix any errors
- [x] 1.5 Run `pnpm lint` and fix any errors
- [x] 1.6 Run `pnpm test` and fix any failures
- [x] 1.7 Kill any vitest worker processes

## 2. Agent Detection Concurrency

- [x] 2.1 Update `detection.ts:27` - add `{ concurrency: "unbounded" }` to `Effect.all` for codex detection
- [x] 2.2 Run `pnpm typecheck` and fix any errors
- [x] 2.3 Run `pnpm lint` and fix any errors
- [x] 2.4 Run `pnpm test` and fix any failures
- [x] 2.5 Kill any vitest worker processes

## 3. Well-Known Validation Concurrency

- [x] 3.1 Update `wellknown.ts:237` - add `concurrency: "unbounded"` to outer forEach options
- [x] 3.2 Run `pnpm typecheck` and fix any errors
- [x] 3.3 Run `pnpm lint` and fix any errors
- [x] 3.4 Run `pnpm test` and fix any failures
- [x] 3.5 Kill any vitest worker processes

## 4. Final Verification

- [x] 4.1 Run `pnpm test:e2e` and fix any failures
- [x] 4.2 Kill any vitest worker processes

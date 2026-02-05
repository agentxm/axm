# Tasks: audit-effect-concurrency

## 1. Workspace Module Concurrency

- [ ] 1.1 Update `ideal-state.ts:436` - change `{ concurrency: "inherit" }` to `{ concurrency: "unbounded" }`
- [ ] 1.2 Update `load-state.ts:628` - add `{ concurrency: "unbounded" }` to `Effect.all` for skill loading
- [ ] 1.3 Update `load-state.ts:662` - add `{ concurrency: "unbounded" }` to `Effect.all` for current state loading
- [ ] 1.4 Run `pnpm typecheck` and fix any errors
- [ ] 1.5 Run `pnpm lint` and fix any errors
- [ ] 1.6 Run `pnpm test` and fix any failures
- [ ] 1.7 Kill any vitest worker processes

## 2. Agent Detection Concurrency

- [ ] 2.1 Update `detection.ts:27` - add `{ concurrency: "unbounded" }` to `Effect.all` for codex detection
- [ ] 2.2 Run `pnpm typecheck` and fix any errors
- [ ] 2.3 Run `pnpm lint` and fix any errors
- [ ] 2.4 Run `pnpm test` and fix any failures
- [ ] 2.5 Kill any vitest worker processes

## 3. Well-Known Validation Concurrency

- [ ] 3.1 Update `wellknown.ts:237` - add `concurrency: "unbounded"` to outer forEach options
- [ ] 3.2 Run `pnpm typecheck` and fix any errors
- [ ] 3.3 Run `pnpm lint` and fix any errors
- [ ] 3.4 Run `pnpm test` and fix any failures
- [ ] 3.5 Kill any vitest worker processes

## 4. Final Verification

- [ ] 4.1 Run `pnpm test:e2e` and fix any failures
- [ ] 4.2 Kill any vitest worker processes

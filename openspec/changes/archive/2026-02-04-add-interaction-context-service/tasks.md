## 1. Create InteractionContext Service

- [x] 1.1 Create `packages/cli/src/services/interaction-context/` folder structure
- [x] 1.2 Create `types.ts` with `InteractionContextService` interface exposing `p: ClackService`
- [x] 1.3 Create `service.ts` with `InteractionContext` tag and `InteractionContextLive` layer wrapping Clack
- [x] 1.4 Create `index.ts` barrel file exporting public API
- [x] 1.5 Write unit tests for InteractionContext service in `service.test.ts`
- [x] 1.6 Run `pnpm typecheck` and fix any errors
- [x] 1.7 Run `pnpm lint` and fix any errors
- [x] 1.8 Run `pnpm test` and fix any failures
- [x] 1.9 Kill any vitest worker processes

## 2. Update OperationContext

- [x] 2.1 Add `interaction: Option<InteractionContext>` field to `OperationContextConfig`
- [x] 2.2 Update `OperationContext.layer()` to accept optional interaction context
- [x] 2.3 Update `OperationContext.defaultLayer` to use `Option.none()` for interaction
- [x] 2.4 Write/update unit tests for OperationContext with interaction field
- [x] 2.5 Run `pnpm typecheck` and fix any errors
- [x] 2.6 Run `pnpm lint` and fix any errors
- [x] 2.7 Run `pnpm test` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Verification

- [x] 3.1 Run `pnpm test:e2e` and fix any failures
- [x] 3.2 Manual verification: confirm InteractionContext exports are accessible from cli package
- [x] 3.3 Kill any vitest worker processes

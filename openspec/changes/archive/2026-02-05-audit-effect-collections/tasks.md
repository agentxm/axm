## 1. Phase 1: Array Type Signatures

- [x] 1.1 Update `agents/registry.ts` return types (`AgentId[]` → `ReadonlyArray<AgentId>`, `AgentConfig[]` → `ReadonlyArray<AgentConfig>`)
- [x] 1.2 Update `utils/errors.ts` parameter type (`details?: string[]` → `details?: ReadonlyArray<string>`)
- [x] 1.3 Update `e2e/utils.ts` parameter type (`args: string[]` → `args: ReadonlyArray<string>`)
- [x] 1.4 Update `cli-commands/init/command.ts` interface (`agent: string[]` → `agent: ReadonlyArray<string>`)
- [x] 1.5 Update `cli-commands/skills/install/command.ts` interface (`agent: string[]`, `skill: string[]` → `ReadonlyArray<string>`)
- [x] 1.6 Update `cli-commands/skills/uninstall/command.ts` interface (`agent: string[]` → `ReadonlyArray<string>`)
- [x] 1.7 Update `workspace/load-state.ts` interface (`agents: string[]` → `ReadonlyArray<string>`)
- [x] 1.8 Run `pnpm typecheck` and fix any type errors
- [x] 1.9 Run `pnpm lint` and fix any lint errors
- [x] 1.10 Run `pnpm test` and fix any failures
- [x] 1.11 Kill any vitest worker processes

## 2. Phase 2: Replace Option Filter Chains with Array.getSomes

- [x] 2.1 Update `cli-commands/skills/install/handler.ts:382-385` — replace `.map().filter(Option.isSome).map()` with `Array.getSomes`
- [x] 2.2 Update `cli-commands/skills/install/handler.ts:411-415` — same pattern
- [x] 2.3 Update `cli-commands/skills/uninstall/handler.ts:273-278` — same pattern
- [x] 2.4 Update `cli-commands/skills/uninstall/handler.ts:406-409` — same pattern
- [x] 2.5 Run `pnpm typecheck` and fix any type errors
- [x] 2.6 Run `pnpm lint` and fix any lint errors
- [x] 2.7 Run `pnpm test` and fix any failures
- [x] 2.8 Kill any vitest worker processes

## 3. Phase 3: Replace Filter-Map Chains with Array.filterMap

- [x] 3.1 Update `clack-effect/service.ts:152-163` — replace `.map().filter().map()` with `Array.filterMap`
- [x] 3.2 Update `clack-effect/service.ts:191-192` — replace `.map().filter(undefined)` with `Array.filterMap`
- [x] 3.3 Run `pnpm typecheck` and fix any type errors
- [x] 3.4 Run `pnpm lint` and fix any lint errors
- [x] 3.5 Run `pnpm test` and fix any failures
- [x] 3.6 Kill any vitest worker processes

## 4. Phase 4: Replace .find() with Array.findFirst

- [x] 4.1 Update `cli-commands/skills/uninstall/handler.ts:150` — replace `.find()` with `Array.findFirst`
- [x] 4.2 Update `cli-commands/skills/uninstall/handler.ts:270` — replace `.find()` with type guard
- [x] 4.3 Update `workspace/apply.ts:481` — replace `.find()` with `Array.findFirst`
- [x] 4.4 Update `workspace/apply.ts:534` — replace `.find()` with `Array.findFirst`
- [x] 4.5 Update `extensions/skills/github-api.ts:140` — replace `.find()` with `Array.findFirst`
- [x] 4.6 Update `extensions/skills/wellknown.ts:393-394` — replace `.find()` with `Array.findFirst`
- [x] 4.7 Run `pnpm typecheck` and fix any type errors
- [x] 4.8 Run `pnpm lint` and fix any lint errors
- [x] 4.9 Run `pnpm test` and fix any failures
- [x] 4.10 Kill any vitest worker processes

## 5. Phase 5: Replace Unsafe Index Access with Array.head/Array.get

- [x] 5.1 Update `cli-commands/skills/utils.ts:68` — replace `refs[0]` with `Array.head`
- [x] 5.2 Update `workspace/load-state.ts:703` — replace `actualList[0]` with `Array.head`
- [x] 5.3 Update `cli-commands/skills/display.ts:52` — replace `.split(":")[1]` with safe pattern
- [x] 5.4 Update `agents/detection.ts:50` — replace `.split("/")[0]` with safe pattern
- [x] 5.5 Run `pnpm typecheck` and fix any type errors
- [x] 5.6 Run `pnpm lint` and fix any lint errors
- [x] 5.7 Run `pnpm test` and fix any failures
- [x] 5.8 Kill any vitest worker processes

## 6. Phase 6: Fix Double-Call Anti-Pattern

- [x] 6.1 Update `cli-commands/skills/install/handler.ts:388-389` — replace double filter with `Array.partition`
- [x] 6.2 Run `pnpm typecheck` and fix any type errors
- [x] 6.3 Run `pnpm lint` and fix any lint errors
- [x] 6.4 Run `pnpm test` and fix any failures
- [x] 6.5 Kill any vitest worker processes

## 7. Phase 7: Update Remaining Native Methods (Consistency)

- [x] 7.1 Update `workspace/service.ts:148,168` — replace native `.map()` with `Array.map`
- [x] 7.2 Update `cli-commands/skills/install/handler.ts:557-558,622,631` — replace native `.filter()/.map()`
- [x] 7.3 Update `cli-commands/skills/uninstall/handler.ts:359` — replace native `.filter()`
- [x] 7.4 Update `agents/detection.ts:142-149` — replace `.map() + Effect.all() + .filter()` pattern
- [x] 7.5 Update `resolution/resolver.ts:120` — replace array destructuring with `Array.head`/`Array.tail`
- [x] 7.6 Run `pnpm typecheck` and fix any type errors
- [x] 7.7 Run `pnpm lint` and fix any lint errors
- [x] 7.8 Run `pnpm test` and fix any failures
- [x] 7.9 Run `pnpm test:e2e` and fix any failures
- [x] 7.10 Kill any vitest worker processes

## 8. Final Verification

- [x] 8.1 Run full test suite: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
- [x] 8.2 Verify no `Arr` alias imports remain (standardize on `Array` from "effect")
- [x] 8.3 Kill any vitest worker processes

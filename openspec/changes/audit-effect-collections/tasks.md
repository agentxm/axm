## 1. Phase 1: Array Type Signatures

- [ ] 1.1 Update `agents/registry.ts` return types (`AgentId[]` → `Array.Array<AgentId>`, `AgentConfig[]` → `Array.Array<AgentConfig>`)
- [ ] 1.2 Update `utils/errors.ts` parameter type (`details?: string[]` → `details?: Array.Array<string>`)
- [ ] 1.3 Update `e2e/utils.ts` parameter type (`args: string[]` → `args: Array.Array<string>`)
- [ ] 1.4 Update `cli-commands/init/command.ts` interface (`agent: string[]` → `agent: Array.Array<string>`)
- [ ] 1.5 Update `cli-commands/skills/install/command.ts` interface (`agent: string[]`, `skill: string[]`)
- [ ] 1.6 Update `cli-commands/skills/uninstall/command.ts` interface (`agent: string[]`)
- [ ] 1.7 Update `workspace/load-state.ts` interface (`agents: string[]`)
- [ ] 1.8 Run `pnpm typecheck` and fix any type errors
- [ ] 1.9 Run `pnpm lint` and fix any lint errors
- [ ] 1.10 Run `pnpm test` and fix any failures
- [ ] 1.11 Kill any vitest worker processes

## 2. Phase 2: Replace Option Filter Chains with Array.getSomes

- [ ] 2.1 Update `cli-commands/skills/install/handler.ts:382-385` — replace `.map().filter(Option.isSome).map()` with `Array.getSomes`
- [ ] 2.2 Update `cli-commands/skills/install/handler.ts:411-415` — same pattern
- [ ] 2.3 Update `cli-commands/skills/uninstall/handler.ts:273-278` — same pattern
- [ ] 2.4 Update `cli-commands/skills/uninstall/handler.ts:406-409` — same pattern
- [ ] 2.5 Run `pnpm typecheck` and fix any type errors
- [ ] 2.6 Run `pnpm lint` and fix any lint errors
- [ ] 2.7 Run `pnpm test` and fix any failures
- [ ] 2.8 Kill any vitest worker processes

## 3. Phase 3: Replace Filter-Map Chains with Array.filterMap

- [ ] 3.1 Update `clack-effect/service.ts:152-163` — replace `.map().filter().map()` with `Array.filterMap`
- [ ] 3.2 Update `clack-effect/service.ts:191-192` — replace `.map().filter(undefined)` with `Array.filterMap`
- [ ] 3.3 Run `pnpm typecheck` and fix any type errors
- [ ] 3.4 Run `pnpm lint` and fix any lint errors
- [ ] 3.5 Run `pnpm test` and fix any failures
- [ ] 3.6 Kill any vitest worker processes

## 4. Phase 4: Replace .find() with Array.findFirst

- [ ] 4.1 Update `cli-commands/skills/uninstall/handler.ts:150` — replace `.find()` with `Array.findFirst`
- [ ] 4.2 Update `cli-commands/skills/uninstall/handler.ts:270` — replace `.find()` with type guard
- [ ] 4.3 Update `workspace/apply.ts:481` — replace `.find()` with `Array.findFirst`
- [ ] 4.4 Update `workspace/apply.ts:534` — replace `.find()` with `Array.findFirst`
- [ ] 4.5 Update `extensions/skills/github-api.ts:140` — replace `.find()` with `Array.findFirst`
- [ ] 4.6 Update `extensions/skills/wellknown.ts:393-394` — replace `.find()` with `Array.findFirst`
- [ ] 4.7 Run `pnpm typecheck` and fix any type errors
- [ ] 4.8 Run `pnpm lint` and fix any lint errors
- [ ] 4.9 Run `pnpm test` and fix any failures
- [ ] 4.10 Kill any vitest worker processes

## 5. Phase 5: Replace Unsafe Index Access with Array.head/Array.get

- [ ] 5.1 Update `cli-commands/skills/utils.ts:68` — replace `refs[0]` with `Array.head`
- [ ] 5.2 Update `workspace/load-state.ts:703` — replace `actualList[0]` with `Array.head`
- [ ] 5.3 Update `cli-commands/skills/display.ts:52` — replace `.split(":")[1]` with safe pattern
- [ ] 5.4 Update `agents/detection.ts:50` — replace `.split("/")[0]` with safe pattern
- [ ] 5.5 Run `pnpm typecheck` and fix any type errors
- [ ] 5.6 Run `pnpm lint` and fix any lint errors
- [ ] 5.7 Run `pnpm test` and fix any failures
- [ ] 5.8 Kill any vitest worker processes

## 6. Phase 6: Fix Double-Call Anti-Pattern

- [ ] 6.1 Update `cli-commands/skills/install/handler.ts:388-389` — replace double filter with `Array.partition`
- [ ] 6.2 Run `pnpm typecheck` and fix any type errors
- [ ] 6.3 Run `pnpm lint` and fix any lint errors
- [ ] 6.4 Run `pnpm test` and fix any failures
- [ ] 6.5 Kill any vitest worker processes

## 7. Phase 7: Update Remaining Native Methods (Consistency)

- [ ] 7.1 Update `workspace/service.ts:148,168` — replace native `.map()` with `Array.map`
- [ ] 7.2 Update `cli-commands/skills/install/handler.ts:557-558,622,631` — replace native `.filter()/.map()`
- [ ] 7.3 Update `cli-commands/skills/uninstall/handler.ts:359` — replace native `.filter()`
- [ ] 7.4 Update `agents/detection.ts:142-149` — replace `.map() + Effect.all() + .filter()` pattern
- [ ] 7.5 Update `resolution/resolver.ts:120` — replace array destructuring with `Array.head`/`Array.tail`
- [ ] 7.6 Run `pnpm typecheck` and fix any type errors
- [ ] 7.7 Run `pnpm lint` and fix any lint errors
- [ ] 7.8 Run `pnpm test` and fix any failures
- [ ] 7.9 Run `pnpm test:e2e` and fix any failures
- [ ] 7.10 Kill any vitest worker processes

## 8. Final Verification

- [ ] 8.1 Run full test suite: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`
- [ ] 8.2 Verify no `Arr` alias imports remain (standardize on `Array` from "effect")
- [ ] 8.3 Kill any vitest worker processes

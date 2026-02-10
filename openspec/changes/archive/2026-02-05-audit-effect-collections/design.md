## Context

The codebase follows Effect patterns but has inconsistent collection type usage. The `/effect-collections` skill documents conventions that have not been systematically applied. This refactoring aligns existing code with those conventions without changing runtime behavior.

Current state:

- ~15 public signatures use mutable `T[]` instead of `Array.Array<T>`
- ~38 locations use native array methods instead of Effect Array utilities
- Record types already correct (`Record.ReadonlyRecord`)
- Chunk/HashMap correctly absent (no use cases)

## Goals / Non-Goals

**Goals:**

- Standardize array type signatures to use `Array.Array<T>`
- Replace native array method chains with Effect Array utilities
- Fix unsafe index access patterns with Option-returning alternatives
- Maintain all existing tests passing
- Pass typecheck and lint after changes

**Non-Goals:**

- Changing runtime behavior
- Adding new functionality
- Refactoring algorithms or business logic
- Updating test files (tests can use native patterns)
- Converting all native methods (only idiomatic improvements)

## Decisions

### 1. Type Signature Updates

**Decision:** Update public signatures only, leave local variables as-is.

**Rationale:** Local variable types are implementation details. Public signatures (exports, interfaces) define the contract. Changing `const arr: T[] = []` to `Array.Array<T>` adds no value since TypeScript infers correctly.

**Files affected:**

- `agents/registry.ts` — return types
- `utils/errors.ts` — parameter types
- `e2e/utils.ts` — parameter types
- `cli-commands/*/command.ts` — interface properties
- `workspace/load-state.ts` — interface properties

### 2. Effect Array Utility Adoption

**Decision:** Use piped `Array.*` functions from Effect, not the `Arr` alias.

**Rationale:** The codebase mixes `Arr` (alias) and direct `Array` imports. Standardize on `Array` from "effect" for consistency with other Effect modules (`Option`, `Effect`, `Record`).

**Pattern replacements:**

| Before                                            | After                                     |
| ------------------------------------------------- | ----------------------------------------- |
| `.map(f).filter(Option.isSome).map(o => o.value)` | `pipe(arr, Array.map(f), Array.getSomes)` |
| `.map().filter().map()`                           | `pipe(arr, Array.filterMap(...))`         |
| `.find(predicate)`                                | `Array.findFirst(arr, predicate)`         |
| `arr[0]`                                          | `Array.head(arr)`                         |
| `arr[arr.length - 1]`                             | `Array.last(arr)`                         |

### 3. Handling Option Returns

**Decision:** Use `Option.getOrThrow` only where the Option is guaranteed Some by prior logic. Otherwise use `Option.match` or propagate the Option.

**Rationale:** `Array.head`, `Array.findFirst` return `Option`. Converting back to `T | undefined` defeats the purpose. Keep Option where it improves type safety; use `getOrThrow` only in guarded contexts.

**Example:**

```typescript
// Before: unsafe
const ref = refs[0];

// After: safe with Option propagation
const ref = Array.head(refs);
if (Option.isNone(ref)) return Effect.fail(...);
const value = ref.value;
```

### 4. Import Organization

**Decision:** Import `Array` from "effect" (not "effect/Array") alongside other Effect imports.

**Rationale:** Consistent with existing pattern of importing `{ Effect, Option, pipe }` from "effect".

```typescript
import { Array, Effect, Option, pipe } from "effect";
```

### 5. Change Order

**Decision:** Apply changes in dependency order to maintain passing tests throughout.

1. **Phase 1: Type signatures** — Update exported types/interfaces (no runtime change)
2. **Phase 2: Consuming code** — Update call sites to use Effect utilities
3. **Phase 3: Unsafe access** — Replace `arr[0]` patterns with `Array.head`

**Rationale:** Type signature changes may cause downstream type errors. Fixing in order ensures each phase is independently verifiable with `pnpm typecheck`.

## Risks / Trade-offs

**[Risk] Large PR size** → Batch by file/feature area if needed for review. Each phase can be a separate commit.

**[Risk] Import conflicts with native Array** → Effect's `Array` shadows native. Use `globalThis.Array` if native constructor needed (rare).

**[Risk] Option propagation complexity** → Some `.find()` call sites may need restructuring to handle Option. Accept slightly more verbose code for type safety.

**[Trade-off] Consistency vs minimal change** → Chose to update native `.map()`/`.filter()` for consistency even where not strictly necessary. This improves grep-ability and establishes patterns for future code.

## Verification

After each phase:

1. `pnpm typecheck` — no type errors
2. `pnpm lint` — no lint errors
3. `pnpm test` — all tests pass

No migration plan needed — this is a code-only refactoring with no data, config, or API changes.

# axm

Open agent extension manager for skills and more

Use extereme brevity and concision in all AGENTS.md and CLAUDE.md and SKILL.md instructions.

## Values

1. **Simplicity** - Clear, minimal, obvious.
2. **Reliability** - Trustworthy, resilient.
3. **Delight** - Intuitive, helpful, honest, responsive.
4. **Friendliness** - Welcoming, collaborative, open.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode)
- **Standard library**: Effect (concurrency, type safety, error handling, async, observability)
- **Package manager**: pnpm (workspaces)
- **CLI parsing**: yargs
- **CLI UI**: Bombshell (prompts, forms, validation)
- **Testing**: Vitest
- **Linting**: ESLint with @effect/eslint-plugin
- **Formatting**: Prettier

## Commands

| Command          | Purpose                     |
| ---------------- | --------------------------- |
| `pnpm build`     | Build all packages          |
| `pnpm test`      | Run all tests (Vitest)      |
| `pnpm test:e2e`  | Run E2E tests only          |
| `pnpm typecheck` | Type check without emitting |
| `pnpm format`    | Format code and markdown    |
| `pnpm lint`      | Lint with ESLint            |
| `pnpm lint:fix`  | Lint and auto-fix           |

## Code Organization

Group by feature, not by type. Co-locate constants, errors, and types with the components that use them.

- **Single-use** → in the component file
- **Shared within feature** → in a dedicated file in the feature folder (e.g., `errors.ts`)
- **Never** → cross-feature "constants.ts" or "errors.ts" at the root

```typescript
// Good: constant lives with its feature
// settings/settings.ts
export const SETTINGS_FILENAME = "settings.json";

// Good: error shared across feature components
// workspace/errors.ts (used by multiple workspace components)
export class WorkspaceError extends Data.TaggedError("WorkspaceError")<{...}> {}

// Bad: generic constants file far from usage
// src/constants.ts
export const SETTINGS_FILENAME = "settings.json";
export const LOCKFILE_NAME = "axm-lock.yaml";
```

### Project Structure

```
packages/
  cli/              # @axm.sh/cli - CLI and domain logic
    src/
      e2e/          # E2E test utilities and fixtures
        fixtures/
        utils.ts
      commands/     # CLI commands (nested by subcommand)
        <command>/
          <subcommand>/
            handler.ts           # Business logic
            handler.test.ts      # Handler tests
            command.ts           # yargs definition
            command.test.ts      # Command parsing tests
            command.e2e.test.ts  # E2E tests (co-located)
      lockfile/     # Lockfile feature
        lockfile.ts              # Core logic + LOCKFILE_NAME constant
        lockfile.test.ts
        schema.ts                # Lockfile schemas
        errors.ts                # LockfileError (if shared across feature)
        index.ts                 # Barrel: public API
      settings/     # Settings feature
        settings.ts              # Core logic + SETTINGS_FILENAME constant
        schema.ts                # Settings schemas
        index.ts                 # Barrel: public API
      workspace/    # Workspace feature
        workspace.ts             # Core logic
        errors.ts                # WorkspaceError (shared across feature)
        index.ts                 # Barrel: public API
      agents/       # Agent definitions
        agent.ts                 # Agent types and logic
        index.ts
      extensions/   # Extension types
        extension.ts             # Extension types and logic
        index.ts
      resolution/   # Extension resolution
      utils/        # Shared utilities (truly cross-cutting only)
openspec/           # Spec-driven development
  specs/            # Implemented capabilities
  changes/          # Proposed changes
```

Each feature folder is self-contained: logic, constants, errors, schemas, and tests co-located. Only `utils/` holds truly cross-cutting utilities.

### Command Arg Type Naming

- Command arg types (yargs): `<Command>CommandArgs` (e.g. `InstallCommandArgs`)
- Handler arg types (Effect): `<Command>HandlerArgs` (e.g. `InstallHandlerArgs`)
- Handler args use idiomatic Effect types (`Option`, `ReadonlyArray`, etc.) — not raw JS types
- Commands map command args → handler args at the boundary (e.g. `Option.fromNullable(argv.name)`)

### Handlers

Handlers are effectful entry points that wire together business logic:

- Serve as program entry points (CLI commands, API routes)
- Accept parsed input and return Effects
- Require services provided via layers

Example: `handleInit(args: InitArgs)` is the entry point for the `init` command, separate from yargs parsing.

## TypeScript

### Module Exports

One barrel file (`index.ts`) per folder. Each type is exported from exactly one place—no re-exporting across modules.

```typescript
// Good: import from the module that owns it
import { WorkspaceError } from "@/workspace";
import { SettingsError } from "@/settings";

// Bad: re-exporting types from other modules
// src/errors.ts that re-exports WorkspaceError, SettingsError, etc.
import { WorkspaceError } from "@/errors";
```

### Minimize Type Assertions

Avoid `as` casts. Prefer type-safe alternatives:

| Pattern                  | Solution                                     |
| ------------------------ | -------------------------------------------- |
| `"literal" as UnionType` | Use `satisfies` on the object                |
| Mutable optional props   | Spread conditionals `...(x && { x })`        |
| Mock objects             | Cast once at boundary with `as unknown as T` |
| Caught errors            | Use type guards or Effect's Cause utilities  |
| Discriminated unions     | Check `_tag` first, then TS narrows for you  |

**`satisfies` over casting:**

```typescript
// Bad: type assertion
return { type: "local" as SourceType, ... };

// Good: satisfies validates the shape
return { type: "local", ... } satisfies ParsedSource;
```

**Conditional optional properties:**

```typescript
// Bad: mutation with cast
const obj: T = { required };
if (optional) (obj as { opt?: string }).opt = optional;

// Good: spread conditional
const obj: T = { required, ...(optional && { optional }) };
```

**Complex interface mocks (yargs, etc.):**

```typescript
// Acceptable: cast once at boundary, not throughout
const mock = { method: vi.fn().mockReturnThis() };
builder(mock as unknown as ComplexInterface);
```

**Library types that don't narrow (e.g., @clack/prompts):**

```typescript
// Bad: cast after cancel check (TS doesn't narrow)
if (p.isCancel(result)) {
  process.exit(0);
}
const value = result as string;

// Good: assertion function bridges the gap
function assertNotCancel<T>(result: T | symbol): asserts result is T {
  if (typeof result === "symbol") throw new Error("Unexpected cancel");
}
if (p.isCancel(result)) {
  process.exit(0);
}
assertNotCancel(result);
const value = result; // TS knows it's string

// Acceptable: cast with comment when library loses type info (e.g., dynamic config)
// Cast needed: multiselect config loses generic type info due to dynamic construction
const indices = result as number[];
```

**Discriminated unions** — comparing two values of same union type:

```typescript
// Best: use Data.TaggedClass for automatic structural equality
import { Data, Equal } from "effect";

class GitHub extends Data.TaggedClass("GitHub")<{
  owner: string;
  repo: string;
}> {}
class Local extends Data.TaggedClass("Local")<{ path: string }> {}
type Source = GitHub | Local;

Equal.equals(sourceA, sourceB); // structural comparison built-in

// Acceptable: cast with comment when not using Data module
const compare = (a: Source, b: Source): boolean => {
  if (a._tag !== b._tag) return false;
  switch (a._tag) {
    case "GitHub": {
      // Cast needed: TS doesn't correlate a._tag === b._tag check
      const bGH = b as typeof a;
      return a.owner === bGH.owner && a.repo === bGH.repo;
    }
    case "Local":
      return a.path === (b as typeof a).path;
  }
};
```

**Effect type widening:**

```typescript
// Bad: cast the value
Effect.succeed(undefined as Settings | undefined);
Effect.succeed([] as string[]);

// Good: explicit type parameter
Effect.succeed<Settings | undefined>(undefined);
Effect.succeed<string[]>([]);
```

**JSON parsing - always validate:**

```typescript
// Bad: cast without validation
const data = JSON.parse(content) as Config;

// Good: Schema validation
const json = JSON.parse(content) as unknown;
const data =
  yield *
  Schema.decodeUnknown(ConfigSchema)(json).pipe(
    Effect.mapError((e) => new ParseError({ message: e.message })),
  );
```

## Effect

- [ ] Use Effect's collection types in signatures (see /effect-collections skill)
      → `ReadonlyArray<T>` (or `readonly T[]`) for arrays
      → `Record.ReadonlyRecord<K,V>` for string-keyed objects
      → `Chunk` only for repeated concatenation or Streams
      → `HashMap` only for complex keys or value-based equality
- [ ] Prefer `Option<T>` over `T | undefined` or optional properties (`prop?: T`) (see /effect-option skill)
      → Convert at boundaries: `fromNullable` at entry, `getOrNull` at exit
      → Use nullable for interop: external APIs, JSON serialization, DOM
- [ ] No raw Promises or async/await (use Effect.promise to wrap)
- [ ] Errors are typed in the Effect signature
- [ ] Dependencies use services, not direct imports
- [ ] Resources use acquire/release patterns
- [ ] Layers provide dependencies at the edge
- [ ] Use concurrency (Effect.all, Effect.forEach) where parallelization is possible
- [ ] Avoid `for`/`while` loops containing `yield*` — use `Effect.forEach` instead (see below)
- [ ] Wrap Promise-based APIs with Effect conventions (see /effect-wrapping skill)

### Effectful Iteration

**`for` + `yield*` + `push` is a code smell.** When you see this pattern, ask: are these operations independent? If yes, use `Effect.forEach` with concurrency.

```typescript
// BAD: sequential, mutable, misses parallelization
const results: T[] = [];
for (const item of items) {
  const result = yield * processItem(item); // I/O operation
  results.push(result);
}

// GOOD: concurrent, immutable, faster
const results =
  yield * Effect.forEach(items, (item) => processItem(item), { concurrency: "unbounded" });
```

**Exceptions** (keep sequential):

- Early break/return on condition (e.g., stop on first failure)
- Iterations depend on previous results
- Ordered output required (e.g., console logging)

### Type Inference

**Prefer inference over explicit return type annotations.** Effect's covariant `R` parameter enables automatic dependency tracking—explicit annotations can impair this.

```typescript
// Good: let Effect infer return type (dependencies auto-tracked)
const fetchUser = (id: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    const logger = yield* Logger;
    // ...
  });

// Avoid: explicit annotation prevents automatic R tracking
const fetchUser = (id: string): Effect.Effect<User, DbError, Database> =>
  // If you add Logger above, you must manually update this annotation
```

**Avoid tacit (point-free) usage** — breaks inference and can erase generics:

```typescript
// Bad: tacit usage loses type info
const results = yield * Effect.forEach(ids, fetchUser);

// Good: explicit arrow function preserves inference
const results = yield * Effect.forEach(ids, (id) => fetchUser(id));
```

**When explicit annotations help:**

- Public API boundaries (documentation clarity)
- `Effect.async` (TypeScript can't infer callback types)
- Recursive functions (TypeScript requirement)
- Complex service interfaces (for clarity)

### Error Handling Patterns

See /effect-errors skill for comprehensive error modeling guidance.

**Expected errors vs defects:**

- **Expected errors** (E channel): Validation failures, not-found, rate limits — caller can recover
- **Defects**: Bugs, invariant violations — crash the program, no recovery
- Use `Effect.orDie` only when no caller can sensibly recover (e.g., missing config at startup)

**Defining errors with TaggedError:**

- `Data.TaggedError` — internal errors, never serialized, include `cause: unknown`
- `Schema.TaggedError` — API-facing errors, serializable, use `Schema.Defect` for cause

```typescript
// Internal: preserve original error
class DbError extends Data.TaggedError("DbError")<{ cause: unknown }> {}

// API-facing: safe serialization
class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()("UserNotFoundError", {
  id: Schema.String,
}) {}
```

**Never throw in helper functions** — return typed Effect errors:

```typescript
// Bad: throws raw error
const getPath = (source: Source): string => {
  if (source._tag === "Remote") throw new Error("Not supported");
  return source.path;
};

// Good: returns typed Effect
const getPath = (source: Source): Effect.Effect<string, SourceError> =>
  source._tag === "Remote"
    ? Effect.fail(new SourceError({ message: "Not supported" }))
    : Effect.succeed(source.path);
```

Exception: Functions named `unsafe*` or `*OrThrow` may throw intentionally (like `Option.getOrThrow`). Use this pattern sparingly for escape hatches where the caller explicitly opts out of Effect error handling.

**Yielding errors in Effect.gen** — `Data.TaggedError` is directly yieldable:

```typescript
// Preferred: direct yield for conciseness (TaggedError extends YieldableError)
yield * new WorkspaceError({ message: "Not found" });

// Also valid: explicit Effect.fail
yield * Effect.fail(new WorkspaceError({ message: "Not found" }));
```

**Preserve error context** — always include `cause` when wrapping external errors:

```typescript
// Bad: original error lost
Effect.tryPromise({
  try: () => externalLib.call(),
  catch: () => new MyError(), // Where did the real error go?
});

// Good: preserve cause
Effect.tryPromise({
  try: () => externalLib.call(),
  catch: (error) => new MyError({ cause: error }),
});
```

**Convert errors at source** — transform library errors to domain errors immediately, not far from where they occurred.

**Always validate parsed data with Schema:**

```typescript
// Bad: cast without validation
const data = yield * Effect.try({ try: () => YAML.parse(content) as Config });

// Good: Schema validation
const json = yield * Effect.try({ try: () => YAML.parse(content) });
const data =
  yield *
  Schema.decodeUnknown(ConfigSchema)(json).pipe(
    Effect.mapError((e) => new ParseError({ message: e.message })),
  );
```

**Working with Option in arrays** — use Effect's Array functions:

```typescript
import { Array, Option, pipe } from "effect";

// Best: Array.filterMap combines filter + transform
const updated = Array.filterMap(skills, (s) =>
  Option.map(s.locked, (locked) => ({ ...s, version: locked.version })),
);

// Good: Array.getSomes extracts values from Option array
const lockedSkills = Array.getSomes(Array.map(skills, (s) => s.locked));

// Good: Option.match for single values
const result = Option.match(maybeValue, {
  onNone: () => defaultValue,
  onSome: (v) => transform(v),
});
```

**Option.getOrThrow** — escape hatch when you're certain Option is Some:

```typescript
// Acceptable: in tests or when invariant is guaranteed by external logic
const value = Option.getOrThrow(maybeValue); // Throws if None
```

<!-- effect-solutions:start -->

### Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `.reference/effect/` for real implementations (run `effect-solutions setup` first)

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

<!-- effect-solutions:end -->

## Testing

- [ ] Designs prescribe testing for key elements
- [ ] Write tests first to define desired behavior
- [ ] Implement until tests pass
- [ ] Bug fix → regression test first
- [ ] **Unit tests** (`*.test.ts`) for pure functions, handlers, business logic, error paths
- [ ] **E2E tests** (`*.e2e.test.ts`) for user-visible functional behavior
      → Co-located with command handlers, not in separate `e2e/` folder

### Test Organization

- [ ] Co-locate tests with the code they test (`feature.ts` → `feature.test.ts`, same directory)
- [ ] Minimize testing code in separate files/folders — helpers and fixtures live near their tests
- [ ] Test structure mirrors code structure and vice versa
- [ ] E2E tests focus on user-visible functional behavior, not internals
- [ ] Test suite reads as a behavior catalog — names and structure convey what the system does

### Test Quality

- [ ] **Isolated** — Same results regardless of run order
      → Use fresh state per test (temp dirs, mock resets)
- [ ] **Deterministic** — Same result if nothing changes
      → Remove shared mutable state between tests
- [ ] **Behavioral** — Sensitive to behavior changes
      → Test what the code does, not how it's structured
- [ ] **Structure-insensitive** — Refactoring shouldn't break tests
      → Avoid testing implementation details
- [ ] **Specific** — Failure cause obvious
      → One logical assertion per test
- [ ] **Readable** — Comprehensible, motivation clear
      → Use descriptive names and arrange/act/assert structure
- [ ] **Predictive** — Passing means production-ready
      → Test real scenarios, not just happy paths

## Spec-Driven Development

User/API behavior is specified before implementation. Specs define _what_, designs define _how_.

- [ ] `specs.md` — User-facing behavior and API contracts only
      → No technical details, architecture, or implementation guidance
- [ ] `design.md` — Technical approach and implementation guidance
      → Architecture decisions, data structures, algorithms, patterns
- [ ] Always create both `specs.md` and `design.md` for proposals

## Git Workflow

**NEVER commit without explicit user request.** This is a hard rule with no exceptions.

- Do NOT commit after completing work
- Do NOT commit when tests pass
- Do NOT commit as part of a task workflow
- ONLY commit when the user explicitly asks (e.g., "commit", "/commit", "make a commit")

Wait for the user to review changes and decide when to commit.

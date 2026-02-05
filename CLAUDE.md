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

## Testing

- [ ] Designs prescribe testing for key elements
- [ ] Write tests first to define desired behavior
- [ ] Implement until tests pass
- [ ] Bug fix → regression test first
- [ ] **Unit tests** (`*.test.ts`) for pure functions, handlers, business logic, error paths
- [ ] **E2E tests** (`command.e2e.test.ts`) for CLI parsing, file system integration, user-facing behavior
      → Co-located with command handlers, not in separate `e2e/` folder

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

## Effect

- [ ] Use `Array.Array`, `Record.Record`, and `Option.Option` from Effect, not built-in types
- [ ] Prefer `Option<T>` over `T | undefined` or optional properties (`prop?: T`)
- [ ] No raw Promises or async/await (use Effect.promise to wrap)
- [ ] Errors are typed in the Effect signature
- [ ] Dependencies use services, not direct imports
- [ ] Resources use acquire/release patterns
- [ ] Layers provide dependencies at the edge
- [ ] Use concurrency (Effect.all, Effect.forEach) where parallelization is possible
- [ ] Wrap Promise-based APIs with Effect conventions (see /effect-wrapping skill)

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

### Handlers

Handlers are effectful entry points that wire together business logic:

- Serve as program entry points (CLI commands, API routes)
- Accept parsed input and return Effects
- Require services provided via layers

Example: `handleInit(args: InitArgs)` is the entry point for the `init` command, separate from yargs parsing.

### Error Handling Patterns

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
// Both valid: TaggedError extends YieldableError
yield * new WorkspaceError({ message: "Not found" });
yield * Effect.fail(new WorkspaceError({ message: "Not found" }));

// Preferred: explicit Effect.fail for clarity and consistency
yield * Effect.fail(new WorkspaceError({ message: "Not found" }));
```

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

## TypeScript

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

## Project Structure

```
packages/
  cli/              # @agentxm/cli - CLI and domain logic
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
      agents/       # Agent definitions
      extensions/   # Extension type definitions
      lockfile/     # Lockfile parsing and schemas
      resolution/   # Extension resolution
      settings/     # Settings management
      utils/        # Shared utilities
      workspace/    # Workspace state management
openspec/           # Spec-driven development
  specs/            # Implemented capabilities
  changes/          # Proposed changes
```

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

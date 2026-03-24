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
- **Standard library**: Effect v4 (concurrency, type safety, error handling, async, observability)
- **Package manager**: pnpm (workspaces)
- **CLI parsing**: `effect/unstable/cli`
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

## CLI Conventions

### Global Flags

Truly global — applies to every command:

- `--non-interactive` — Suppress all interactive prompts. Uses defaults where available; errors if required input has no default. Auto-accepts confirmations (like `--yes`). Auto-detected when stdin is not a TTY or `CI=true` env var is set.
  - Every prompt must have a flag/env var alternative or a sensible default
  - Must never hang waiting for input — fail fast with a clear message
  - Error messages should tell the user which flag to pass instead
  - Commands should produce the same result as interactive use with the same inputs
  - **Exception**: `--preview` requires explicit `--yes` to auto-apply — without it, preview is display-only (safe CI dry-run)

### Per-Command Flags

Defined as reusable `Flag` definitions in `cli-flags/service.ts`. Commands that need them import and include them in `Command.make()`. They only appear in `--help` for commands that declare them.

- `--yes` (`-y`) — Auto-accept confirmation prompts ("are you sure?"). Does not supply missing input or override errors.
  - Only affects yes/no confirmations, not selection prompts or text input
  - The operation would succeed interactively — this just skips the pause
  - Safe to use in scripts when the user knows what the command will do
  - Does not change what the command does, only whether it asks first
- `--force` (`-f`) — Override constraints that would otherwise cause failure (e.g., conflicting state, version mismatches). Does not imply `--yes` or `--non-interactive` — a user may want to force past a conflict but still be prompted for other input.
  - Without `--force`, the command fails with an error explaining the constraint
  - The error message should suggest `--force` as the override
  - Use for conflict resolution, not for skipping confirmations
  - Warnings are always shown regardless of `--force` — they never block
- `--preview` — Display plan without applying (requires `--yes` or confirmation to apply).

**Severity model:** If important enough to block, it's an error (overridable with `--force`). If not important enough to block, it's a warning (always shown, never blocks).

**Resolution model:** The `nonInteractive` global flag is resolved once into a `CliFlags` Effect service at the `run()` boundary via `makeCliFlagsLayer()`. Per-command flag values (`yes`, `force`, `preview`) are passed through `withCommandRuntime`'s `flags` option. The `nonInteractive` flag follows a resolution chain: explicit `--non-interactive` flag → `CI=true` env var → `!stdin.isTTY`. Both the `Workspace` service and `Input` service depend on `CliFlags` — neither resolves flags independently. Handlers read resolved values from `CliFlags`, never from raw argv.

## Code Organization

Group by feature, not by type. Co-locate constants, types, and schemas with the components that use them.

- **Single-use** → in the component file
- **Shared within feature** → in a dedicated file in the feature folder (e.g., `schema.ts`)
- **Never** → cross-feature "constants.ts" or "types.ts" at the root

```typescript
// Good: constant lives with its feature
// settings/settings.ts
export const SETTINGS_FILENAME = "settings.json";

// Good: schema shared across feature components
// lockfile/schema.ts (used by multiple lockfile components)
export class LockfileSchema extends Schema.Class<LockfileSchema>("LockfileSchema")({...}) {}

// Bad: generic constants file far from usage
// src/constants.ts
export const SETTINGS_FILENAME = "settings.json";
export const LOCKFILE_NAME = "axm-lock.yaml";
```

### Project Structure

```
packages/
  core/             # @axm.sh/core - Shared domain types and schemas
    src/
      unstable/     # All code lives here — package is highly unstable
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
            command.ts           # Parser-agnostic command runner
            command.e2e.test.ts  # CLI contract tests (co-located when useful)
      lockfile/     # Lockfile feature
        lockfile.ts              # Core logic + LOCKFILE_NAME constant
        lockfile.test.ts
        schema.ts                # Lockfile schemas
        index.ts                 # Barrel: public API
      settings/     # Settings feature
        settings.ts              # Core logic + SETTINGS_FILENAME constant
        schema.ts                # Settings schemas
        index.ts                 # Barrel: public API
      workspace/    # Workspace feature
        workspace.ts             # Core logic
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

**`@axm.sh/core` unstable namespace** — All code in the core package lives under `src/unstable/` and is exported via `@axm.sh/core/unstable/*`. This signals that the package API is highly unstable and subject to breaking changes. Never place code directly under `src/` in core — always use the `unstable/` namespace.

### Command Arg Type Naming

- Command arg types (CLI parser): `<Command>CommandArgs` (e.g. `InstallCommandArgs`)
- Handler arg types (Effect): `<Command>HandlerArgs` (e.g. `InstallHandlerArgs`)
- Handler args use idiomatic Effect types (`Option`, `ReadonlyArray`, etc.) — not raw JS types
- Commands map command args → handler args at the boundary (e.g. `Option.fromUndefinedOr(argv.name)`)

### Handlers

Handlers are effectful entry points that wire together business logic:

- Serve as program entry points (CLI commands, API routes)
- Accept parsed input and return Effects
- Require services provided via layers

Example: `handleInit(args: InitArgs)` is the entry point for the `init` command, separate from CLI parsing.

## TypeScript

### Module Exports

One barrel file (`index.ts`) per folder. Each type is exported from exactly one place—no re-exporting across modules.

```typescript
// Good: import from the module that owns it
import { WorkspaceContextService } from "@/workspace";
import { AppError } from "@/app-error";

// Bad: re-exporting types from other modules
// src/types.ts that re-exports WorkspaceContextService, AppError, etc.
import { WorkspaceContextService } from "@/types";
```

### Minimize Type Assertions

Avoid `as` type assertions. Prefer type-safe alternatives:

| Pattern                  | Solution                                       |
| ------------------------ | ---------------------------------------------- |
| `"literal" as UnionType` | Use `satisfies` on the object                  |
| Mutable optional props   | Spread conditionals `...(x && { x })`          |
| Mock objects             | Assert once at boundary with `as unknown as T` |
| Caught errors            | Use type guards or Effect's Cause utilities    |
| Discriminated unions     | Check `_tag` first, then TS narrows for you    |

**`satisfies` over type assertions:**

```typescript
// Bad: type assertion
return { type: "local" as SourceType, ... };

// Good: satisfies validates the shape
return { type: "local", ... } satisfies ParsedSource;
```

**Conditional optional properties:**

```typescript
// Bad: mutation with type assertion
const obj: T = { required };
if (optional) (obj as { opt?: string }).opt = optional;

// Good: spread conditional
const obj: T = { required, ...(optional && { optional }) };
```

**Complex interface mocks (third-party APIs, etc.):**

```typescript
// Acceptable: type assertion once at boundary, not throughout
const mock = { method: vi.fn().mockReturnThis() };
builder(mock as unknown as ComplexInterface);
```

**Library types that don't narrow (e.g., @clack/prompts):**

```typescript
// Bad: type assertion after cancel check (TS doesn't narrow)
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

// Acceptable: type assertion with comment when library loses type info (e.g., dynamic config)
// Assertion needed: multiselect config loses generic type info due to dynamic construction
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

// Acceptable: type assertion with comment when not using Data module
const compare = (a: Source, b: Source): boolean => {
  if (a._tag !== b._tag) return false;
  switch (a._tag) {
    case "GitHub": {
      // Assertion needed: TS doesn't correlate a._tag === b._tag check
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
// Bad: type assertion
Effect.succeed(undefined as Settings | undefined);
Effect.succeed([] as string[]);

// Good: explicit type parameter
Effect.succeed<Settings | undefined>(undefined);
Effect.succeed<string[]>([]);
```

**JSON parsing - always validate:**

```typescript
// Bad: type assertion without validation
const data = JSON.parse(content) as Config;

// Good: Schema validation
const json = JSON.parse(content) as unknown;
const data =
  yield *
  Schema.decodeUnknownEffect(ConfigSchema)(json).pipe(
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
      → Convert at boundaries: `fromUndefinedOr`, `fromNullOr`, or `fromNullishOr` at entry, `getOrNull` / `getOrUndefined` at exit
      → Use nullable for interop: external APIs, JSON serialization, DOM
- [ ] No raw Promises or async/await (use Effect.promise to wrap)
- [ ] Errors are typed in the Effect signature
- [ ] Dependencies use services, not direct imports
- [ ] Resources use acquire/release patterns
- [ ] Layers provide dependencies at the edge
- [ ] Use concurrency (Effect.all, Effect.forEach) where parallelization is possible
- [ ] Avoid `for`/`while` loops containing `yield*` — use `Effect.forEach` instead (see below)
- [ ] Wrap Promise-based APIs with Effect conventions (see /effect-wrapping skill)
- [ ] Use `effect/FileSystem` and `effect/Path` for filesystem and path operations — never `node:fs` or `node:path` in production code (see /effect-filesystem skill)
      → `FileSystem.FileSystem` for all file I/O (read, write, stat, mkdir, symlink)
      → `Path.Path` for all path computation (join, dirname, resolve, relative)
      → Both provided by `NodeServices.layer` from `@effect/platform-node` (already wired in the CLI runtime)
      → v4: platform modules consolidated into `effect` core — import from `effect/FileSystem`, `effect/Path`, not `@effect/platform/...`

### Effect v4 API Changes

This codebase uses **Effect v4**. Key differences from v3 — consult `.reference/effect-smol/` for full migration guides.

**Services** — `Context.Tag` → `ServiceMap.Service`:

```typescript
// v3 (removed)
class Database extends Context.Tag("Database")<Database, Shape>() {}

// v4
class Database extends ServiceMap.Service<Database, Shape>()("Database") {}
```

**Error catching** — renamed for clarity:

| v3 (removed)            | v4                   |
| ----------------------- | -------------------- |
| `Effect.catchAll`       | `Effect.catch`       |
| `Effect.catchAllCause`  | `Effect.catchCause`  |
| `Effect.catchAllDefect` | `Effect.catchDefect` |
| `Effect.catchSome`      | `Effect.catchFilter` |

**Forking** — renamed:

| v3 (removed)        | v4                  |
| ------------------- | ------------------- |
| `Effect.fork`       | `Effect.forkChild`  |
| `Effect.forkDaemon` | `Effect.forkDetach` |

**Yieldable** — `Ref`, `Deferred`, `Fiber` are no longer Effect subtypes. Use explicit methods:

```typescript
// v3: yield* myRef (worked because Ref <: Effect)
// v4: must use explicit method
const value = yield * Ref.get(myRef);
yield * Deferred.await(myDeferred);
const result = yield * Fiber.join(myFiber);
```

**FiberRef** → `ServiceMap.Reference` / `References` module:

```typescript
// v3: FiberRef.currentLogLevel
// v4: References.CurrentLogLevel — yield* to read, provideService to set
```

**Cause** — flattened from recursive tree to `{ reasons: ReadonlyArray<Reason<E>> }`. Iterate `cause.reasons` instead of pattern-matching.

**Layer memoization** — now shared across `Effect.provide()` calls by default. Use `Layer.fresh(layer)` to opt out.

**Imports** — platform modules consolidated into `effect` core:

```typescript
// v3 (removed)
import { FileSystem } from "@effect/platform/FileSystem";
import { Path } from "@effect/platform/Path";
import { NodeContext } from "@effect/platform-node/NodeContext";

// v4
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeServices } from "@effect/platform-node/NodeServices";
```

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

**Single error type: `AppError`** — all expected failures use `AppError`, created at the point of failure by the code with the best context. No domain error types (`SettingsError`, `GitError`, `SourceError`, etc.).

```typescript
// Create AppError where the failure occurs
yield *
  Schema.decodeUnknownEffect(SettingsSchema)(json).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "SETTINGS_PARSE_FAILED",
        what: "Failed to parse settings file",
        details: [e.message],
        howToFix: Option.some("Check settings.json syntax"),
        cause: e,
      }),
    ),
  );
```

**Error codes** — `AREA_REASON` format: `SETTINGS_PARSE_FAILED`, `GIT_CLONE_FAILED`, `REGISTRY_FETCH_FAILED`. Uppercase, greppable, stable across versions.

**Runtime constraint** — `run` only accepts `Effect<A, AppError | PromptCancelled, R>`. Unmapped errors are compile-time failures.

**`PromptCancelled`** — control flow signal (exit 0), not an error. Stays distinct from `AppError`.

**Expected errors vs defects:**

- **Expected errors** (E channel): `AppError` — user-recoverable failures with code, what, details, howToFix
- **Defects**: Bugs, invariant violations — crash the program, no recovery
- Use `Effect.orDie` only when no caller can sensibly recover (e.g., missing config at startup)

**Never throw in helper functions** — return `AppError`:

```typescript
// Bad: throws
const getPath = (source: Source): string => {
  if (source._tag === "Remote") throw new Error("Not supported");
  return source.path;
};

// Good: typed Effect with AppError
const getPath = (source: Source) =>
  source._tag === "Remote"
    ? Effect.fail(
        makeAppError({ code: "SOURCE_INVALID_TYPE", what: "Remote sources have no local path" }),
      )
    : Effect.succeed(source.path);
```

Exception: Functions named `unsafe*` or `*OrThrow` may throw intentionally (like `Option.getOrThrow`). Use this pattern sparingly for escape hatches where the caller explicitly opts out of Effect error handling.

**Yielding errors** — `AppError` is directly yieldable (extends `YieldableError`):

```typescript
yield * makeAppError({ code: "WORKSPACE_NOT_FOUND", what: "Workspace not initialized" });
```

**Preserve error context** — always include `cause`:

```typescript
Effect.tryPromise({
  try: () => externalLib.call(),
  catch: (error) =>
    makeAppError({
      code: "EXTERNAL_CALL_FAILED",
      what: "External operation failed",
      cause: error,
    }),
});
```

**Recovery** — scoped `catch` on sub-expressions (safe because error channel is already narrow):

```typescript
yield * createSymlink(source, target).pipe(Effect.catch(() => copyDirectory(source, target)));
```

**Option for not-found** — return `Option<T>` instead of failing with a not-found error:

```typescript
const settings =
  yield * readSettings(dir).pipe(Effect.map(Option.getOrElse(() => createDefaultSettings())));
```

**Always validate parsed data with Schema:**

```typescript
// Bad: type assertion without validation
const data = yield * Effect.try({ try: () => YAML.parse(content) as Config });

// Good: Schema validation
const json = yield * Effect.try({ try: () => YAML.parse(content) });
const data =
  yield *
  Schema.decodeUnknownEffect(ConfigSchema)(json).pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "CONFIG_PARSE_FAILED",
        what: "Failed to parse configuration",
        details: [e.message],
        cause: e,
      }),
    ),
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

## Findings Presentation

When a review or analysis produces findings, present each as a numbered item with:

1. **Finding** — what was observed
2. **Options** — lettered remediation choices (a, b, c, ...)
3. **Recommendation** — which option to take and why

```
### 1. <Finding title>

<Description of the issue>

  a) <Option A> — <brief description>
  b) <Option B> — <brief description>
  c) <Option C> — <brief description>

**Recommendation:** (b) — <rationale>
```

## Git Workflow

**NEVER commit without explicit user request.** This is a hard rule with no exceptions.

- Do NOT commit after completing work
- Do NOT commit when tests pass
- Do NOT commit as part of a task workflow
- ONLY commit when the user explicitly asks (e.g., "commit", "/commit", "make a commit")

Wait for the user to review changes and decide when to commit.
